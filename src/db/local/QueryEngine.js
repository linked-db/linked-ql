import { ExprEngine } from './ExprEngine.js';
export const GROUP_SYMBOL = Symbol.for('group');

export class QueryEngine {
    #storageEngine;
    #exprEngine;
    #options;

    constructor(storageEngine, options = {}) {
        this.#storageEngine = storageEngine;
        this.#options = options;
        this.#exprEngine = new ExprEngine(this.#options);
    }

    // ---------------- top-level query (async generator) ----------------
    async *query(ast) {
        // 1. FROM -> composites
        let stream = this.evaluateFromClause(ast.from_clause, ast.join_clauses);

        // 2. WHERE
        if (ast.where_clause) stream = this.evaluateWhereClause(ast.where_clause, stream);

        // 3. GROUPING / aggregates
        const hasGroup = !!(ast.group_clause?.entries?.length);
        const hasAggInSelect = this._selectHasAggregate(ast.select_clause);

        if (hasGroup) {
            // evaluateGroupByClause returns composites (representatives) already filtered by HAVING if provided
            stream = this.evaluateGroupByClause(ast.group_clause, stream, ast.having_clause);
        } else if (!hasGroup && hasAggInSelect) {
            // global-group: aggregate without GROUP BY -> single representative composite with GROUP_SYMBOL
            stream = this.evaluateGlobalGroup(stream);
        }

        // 4. SELECT (projection) -- always works on compositeRecords
        stream = this.evaluateSelectClause(ast.select_clause, stream);

        // 5. ORDER BY (materialize) then LIMIT
        if (ast.order_clause?.length) stream = this.evaluateOrderByClause(ast.order_clause, stream);
        if (ast.limit_clause) stream = this.evaluateLimitClause(ast.limit_clause, stream);

        yield* stream;
    }

    // ---------------- FROM + JOIN ----------------
    async evaluateFromClause(fromClause, joinClauses = []) {
        if (!fromClause?.entries?.length) return (async function* () { yield {}; })();
        return await this.evaluateFromItems(fromClause.entries, joinClauses || []);
    }

    async *evaluateFromItem(fromItem) {
        // Derived query
        if (fromItem.expr?.nodeName === 'DERIVED_QUERY') {
            const alias = fromItem.alias?.value || '(subquery)';
            for await (const subRow of this.query(fromItem.expr.expr)) {
                yield { [alias]: subRow };
            }
            return;
        }

        // Table scan
        const tableName = fromItem.expr.value;
        const alias = fromItem.alias?.value || tableName;
        for await (const row of this.#storageEngine.scan(tableName)) {
            yield { [alias]: row }; // composite, no GROUP_SYMBOL
        }
    }

    async evaluateFromItems(fromEntries, joinClauses = []) {
        // combine base from entries then join clauses in order
        const allItems = [...fromEntries, ...(joinClauses || [])];
        // start with first item
        let leftStream = this.evaluateFromItem(allItems[0]);

        // progressively join subsequent items
        for (let idx = 1; idx < allItems.length; idx++) {
            const rightItem = allItems[idx];

            // buffer right side composites
            const rightBuffer = [];
            for await (const rc of this.evaluateFromItem(rightItem)) {
                rightBuffer.push(rc); // rc is composite { alias: row }
            }

            const joinType = rightItem.join_type || (fromEntries.includes(rightItem) ? 'CROSS' : 'INNER');
            const joinCondition = rightItem.condition_clause?.expr || null;

            leftStream = this.evaluateJoin(leftStream, rightBuffer, joinType, joinCondition);
        }

        return leftStream;
    }

    // nested-loop join; leftStream yields composites; rightBuffer is array of composites
    async *evaluateJoin(leftStream, rightBuffer, joinType = 'INNER', joinCondition = null) {
        const matchedRightIndexes = new Set();
        const leftAliasSet = new Set(); // collect left aliases to potentially null-fill right-only outputs

        for await (const leftComp of leftStream) {
            // capture left aliases seen so we can null-fill for right-only outputs if desired
            for (const k of Object.keys(leftComp)) leftAliasSet.add(k);

            let leftMatched = false;

            for (let ri = 0; ri < rightBuffer.length; ri++) {
                const rightComp = rightBuffer[ri];
                const merged = { ...leftComp, ...rightComp }; // composite merge via spreads

                let ok = true;
                if (joinCondition) ok = this.#exprEngine.evaluate(joinCondition, merged);

                if (ok) {
                    yield merged;                  // matched composite
                    leftMatched = true;
                    matchedRightIndexes.add(ri);
                }
            }

            // LEFT/FULL: if left had no match, emit left with right aliases null-filled
            if (!leftMatched && (joinType === 'LEFT' || joinType === 'FULL')) {
                // fill nulls for right aliases based on sample rightBuffer element keys
                const nullMerged = { ...leftComp };
                if (rightBuffer.length > 0) {
                    const sampleRight = rightBuffer[0];
                    for (const rk of Object.keys(sampleRight)) nullMerged[rk] = null;
                }
                yield nullMerged;
            }
        }

        // RIGHT/FULL: emit right-side rows that were never matched, optionally null-fill left aliases
        if (joinType === 'RIGHT' || joinType === 'FULL') {
            for (let ri = 0; ri < rightBuffer.length; ri++) {
                if (!matchedRightIndexes.has(ri)) {
                    const rightComp = rightBuffer[ri];
                    const out = { ...rightComp };
                    // optional: fill left aliases with null (if you want strict shape)
                    for (const lk of leftAliasSet) {
                        if (!(lk in out)) out[lk] = null;
                    }
                    yield out;
                }
            }
        }
    }

    // ---------------- WHERE ----------------
    async *evaluateWhereClause(whereClause, upstream) {
        for await (const comp of upstream) {
            if (this.#exprEngine.evaluate(whereClause.expr, comp)) yield comp;
        }
    }

    // ---------------- GROUP BY (yields compositeRecords, with GROUP_SYMBOL attached; applies HAVING if provided)
    evaluateGroupByClause(groupClause, upstream, havingClause = null) {
        const self = this;
        return (async function* () {
            const groups = new Map(); // key -> array of compositeRecords

            for await (const comp of upstream) {
                // compute grouping key (use exprEngine)
                const keyParts = [];
                for (let i = 0; i < groupClause.entries.length; i++) {
                    keyParts.push(self.#exprEngine.evaluate(groupClause.entries[i], comp));
                }
                const key = JSON.stringify(keyParts);

                if (!groups.has(key)) groups.set(key, []);
                const group = groups.get(key);

                // attach group reference then push (single-shot)
                comp[GROUP_SYMBOL] = group;
                group.push(comp);
            }

            // finalize groups: apply HAVING if present, yield representative compositeRecords
            for (const group of groups.values()) {
                if (group.length === 0) continue;
                const rep = group[0]; // representative composite
                // rep already has rep[GROUP_SYMBOL] = group
                if (havingClause) {
                    if (self.#exprEngine.evaluate(havingClause.expr, rep)) yield rep;
                } else {
                    yield rep;
                }
            }
        })();
    }

    // ---------------- Global-group (for aggregates without GROUP BY) -> yields one rep composite with GROUP_SYMBOL
    evaluateGlobalGroup(upstream) {
        const self = this;
        return (async function* () {
            const members = [];
            for await (const comp of upstream) members.push(comp);

            // attach group array to members
            for (let i = 0; i < members.length; i++) members[i][GROUP_SYMBOL] = members;

            // representative: first member or empty composite
            const rep = members[0] ? { ...members[0] } : {};
            rep[GROUP_SYMBOL] = members;
            yield rep;
        })();
    }

    // ---------------- SELECT ----------------
    async *evaluateSelectClause(selectClause, upstream) {
        // default SELECT *: flatten alias -> row mappings
        if (!selectClause?.entries?.length) {
            return upstream;
        }

        for await (const comp of upstream) {
            const projected = {};
            for (let i = 0; i < selectClause.entries.length; i++) {
                const item = selectClause.entries[i];
                const alias = item.alias?.value || this._exprToAlias(item.expr);
                // ExprEngine.evaluate should check comp[GROUP_SYMBOL] when encountering aggregates
                projected[alias] = this.#exprEngine.evaluate(item.expr, comp);
            }
            yield projected;
        }
    }

    // ---------------- ORDER BY (materialize) ----------------
    async *evaluateOrderByClause(orderClause, upstream) {
        const rows = [];
        for await (const r of upstream) rows.push(r);

        rows.sort((a, b) => {
            for (let i = 0; i < orderClause.length; i++) {
                const clause = orderClause[i];
                const av = this.#exprEngine.evaluate(clause.expr, a);
                const bv = this.#exprEngine.evaluate(clause.expr, b);
                if (av < bv) return clause.direction === 'DESC' ? 1 : -1;
                if (av > bv) return clause.direction === 'DESC' ? -1 : 1;
            }
            return 0;
        });

        for (let i = 0; i < rows.length; i++) yield rows[i];
    }

    // ---------------- LIMIT ----------------
    async *evaluateLimitClause(limitClause, upstream) {
        const limit = limitClause.limit;
        const offset = limitClause.offset || 0;
        let idx = 0, yielded = 0;
        for await (const r of upstream) {
            if (idx++ < offset) continue;
            if (yielded++ >= limit) break;
            yield r;
        }
    }

    // ---------------- helpers ----------------
    _exprToAlias(expr) {
        return expr.alias?.value || expr.expr?.value || expr.value || JSON.stringify(expr).slice(0, 32);
    }

    _selectHasAggregate(selectClause) {
        if (!selectClause?.entries?.length) return false;
        for (let i = 0; i < selectClause.entries.length; i++) {
            if (this._exprContainsAggregate(selectClause.entries[i].expr)) return true;
        }
        return false;
    }

    _exprContainsAggregate(expr) {
        if (!expr || typeof expr !== 'object') return false;
        if (expr.nodeName === 'AGGR_CALL_EXPR') {
            return true;
        }
        if (expr.arguments && Array.isArray(expr.arguments)) {
            for (let i = 0; i < expr.arguments.length; i++) {
                if (this._exprContainsAggregate(expr.arguments[i])) return true;
            }
        }
        if (expr.left && this._exprContainsAggregate(expr.left)) return true;
        if (expr.right && this._exprContainsAggregate(expr.right)) return true;
        if (expr.expr && this._exprContainsAggregate(expr.expr)) return true;
        return false;
    }
}
