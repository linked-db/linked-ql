import { SimpleEmitter } from './SimpleEmitter.js';
import { ExprEngine } from './ExprEngine.js';

const oldIdSymbol = Symbol.for('oldId');

export class FromEngine extends SimpleEmitter {

    constructor({ fromItems, joinClauses, tableSchemas = {} }, options = {}) {
        super();

        this.fromItems = fromItems;
        this.joinClauses = joinClauses;
        this.tableSchemas = tableSchemas;

        this.options = options;
        this.hashFn = this.options.hashFn || JSON.stringify;

        this.exprEngine = new ExprEngine(this.options);

        this.tables = {};
        this.compositeIds = new Map;
        this.pendingOperations = [];

        this._normalize();
    }

    _normalize() {
        this.aliasOrder = [];             // [{ value, value_cs, delim }]
        this.aliasToTable = new Map;      // alias_cs -> table_cs
        this.tableToAliases = new Map;    // table_cs -> Set(alias_cs)
        this.normalizedJoins = new Map;   // rightAlias_cs -> joinClause

        this.pkMap = new Map;             // table_cs -> [pkColumn]
        this.pkSelectors = new Map;       // table_cs -> fn(row) => rowId

        // Helper to register an alias and setup related structures
        const acquireTable = (exprNode, aliasNode) => {
            const tableJson = {
                value: exprNode.value,
                value_cs: exprNode.delim ? exprNode.value : exprNode.value.toLowerCase(),
                delim: exprNode.delim
            };
            const aliasJson = aliasNode
                ? {
                    value: aliasNode.value,
                    value_cs: aliasNode.delim ? aliasNode.value : aliasNode.value.toLowerCase(),
                    delim: aliasNode.delim
                }
                : { ...tableJson };

            this.aliasOrder.push(aliasJson);
            this.aliasToTable.set(aliasJson.value_cs, tableJson.value_cs);

            if (!this.tableToAliases.has(tableJson.value_cs)) {
                this.tableToAliases.set(tableJson.value_cs, new Set);
            }
            this.tableToAliases.get(tableJson.value_cs).add(aliasJson.value_cs);

            // pk selector
            if (!this.pkSelectors.has(aliasJson.value_cs)) {

                const pkHint = [].concat(this.tableSchemas[tableJson.value_cs] && this.tableSchemas[tableJson.value_cs].primaryKey || []);
                this.pkMap.set(tableJson.value_cs, pkHint);

                if (Array.isArray(pkHint) && pkHint.length) {
                    this.pkSelectors.set(aliasJson.value_cs, (r, oldIds = false) => {
                        if (!r) return `${aliasJson.value_cs}:null`;
                        if (oldIds && r[oldIdSymbol]) {
                            return `${aliasJson.value_cs}:${r[oldIdSymbol]}`;
                        }
                        return `${aliasJson.value_cs}:${pkHint.map((c) => String(r[c] ?? '')).join('+')}`;
                    });
                } else {
                    const hashFn = this.hashFn;
                    this.pkSelectors.set(aliasJson.value_cs, (r, oldIds = false) => {
                        if (!r) return `${aliasJson.value_cs}:null`;
                        if (oldIds && r[oldIdSymbol]) {
                            return `${aliasJson.value_cs}:${r[oldIdSymbol]}`;
                        }
                        if (r.id !== undefined && r.id !== null) {
                            return `${aliasJson.value_cs}:${String(r.id)}`;
                        }
                        return `${aliasJson.value_cs}:${hashFn(r)}`;
                    });
                }
            }

            return [aliasJson, tableJson];
        };

        // 1) register FROM items (base)
        [
            { value_cs: this.baseTableAlias },
            { value_cs: this.baseTableName }
        ] = acquireTable(this.fromItems[0].expr, this.fromItems[0].alias);

        // 2) normalize JOINs & allocate indexes (single pass)
        for (let jc of this.fromItems.slice(1).concat(this.joinClauses)) {
            jc = { ...jc }; // clone

            // left alias is last registered alias
            const leftAliasJson = this.aliasOrder[this.aliasOrder.length - 1]; // Must come before the next line
            const [rightAliasJson, rightTableJson] = acquireTable(jc.expr, jc.alias);

            const leftAlias_cs = leftAliasJson.value_cs;
            const rightAlias_cs = rightAliasJson.value_cs;

            // CROSS -> ON true
            if (jc.nodeName !== 'JOIN_CLAUSE' || (jc.join_type || '').toUpperCase() === 'CROSS') {
                jc.join_type = 'CROSS';
                jc.condition_clause = { nodeName: 'ON_CLAUSE', expr: { nodeName: 'BOOLEAN_LITERAL', value: true } };
            }

            // USING -> ON
            if (jc.condition_clause?.nodeName === 'USING_CLAUSE') {
                const cols = Array.isArray(jc.condition_clause.column?.entries)
                    ? jc.condition_clause.column.entries
                    : [jc.condition_clause.column];
                let expr = null;
                for (const col of cols) {
                    const cond = {
                        nodeName: 'BINARY_EXPR',
                        operator: '=',
                        left: { nodeName: 'COLUMN_REF1', qualifier: { nodeName: 'TABLE_REF1', value: leftAliasJson.value }, value: col.value, delim: col.delim },
                        right: { nodeName: 'COLUMN_REF1', qualifier: { nodeName: 'TABLE_REF1', value: rightAliasJson.value }, value: col.value, delim: col.delim }
                    };
                    expr = expr ? { nodeName: 'BINARY_EXPR', operator: 'AND', left: expr, right: cond } : cond;
                }
                jc.condition_clause = { nodeName: 'ON_CLAUSE', expr };
            }

            // NATURAL -> ON
            if (jc.natural_kw) {
                const lhsTable = this.aliasToTable.get(leftAlias_cs);
                const rhsTable = rightTableJson.value_cs;

                const lhsCols = this.tableSchemas[lhsTable]?.columns || [];
                const rhsCols = this.tableSchemas[rhsTable]?.columns || [];

                const common = lhsCols.filter((c) => rhsCols.includes(c));
                let expr = null;
                for (const col of common) {
                    const cond = {
                        nodeName: 'BINARY_EXPR',
                        operator: '=',
                        left: { nodeName: 'COLUMN_REF1', qualifier: { nodeName: 'TABLE_REF1', value: leftAliasJson.value }, value: col },
                        right: { nodeName: 'COLUMN_REF1', qualifier: { nodeName: 'TABLE_REF1', value: rightAliasJson.value }, value: col }
                    };
                    expr = expr ? { nodeName: 'BINARY_EXPR', operator: 'AND', left: expr, right: cond } : cond;
                }
                jc.condition_clause = { nodeName: 'ON_CLAUSE', expr };
            }

            // annotate canonical left/right alias cs on jc
            this.normalizedJoins.set(rightAlias_cs, { ...jc, leftAlias_cs });
        }
    }

    push(tableName, row) {
        if (!this.tableToAliases.has(tableName)) return;
        this.pendingOperations.push({ kind: 'push', tableName, row });
    }

    patch(tableName, row) {
        if (!this.tableToAliases.has(tableName)) return;
        this.pendingOperations.push({ kind: 'patch', tableName, row });
    }

    delete(tableName, row) {
        if (!this.tableToAliases.has(tableName)) return;
        this.pendingOperations.push({ kind: 'delete', tableName, row });
    }

    compute() {

        while (this.pendingOperations.length > 0) {
            const { kind, tableName, row } = this.pendingOperations.shift();

            if (!this.tables[tableName]) {
                this.tables[tableName] = new Map;
            }
            const table = this.tables[tableName];
            const pkColumn = this.pkMap.get(tableName).join('|');

            switch (kind) {
                case 'push':
                    table.set(pkColumn, row);
                    break;
                case 'patch':
                    table.set(pkColumn, { ...(table.get(pkColumn) || {}), ...row });
                    break;
                case 'delete':
                    table.delete(pkColumn);
                    break;
            }
        }

        const newCompositeRows = this._createComposites();

        const newCompositeIds = new Set(newCompositeRows.keys());
        const oldCompositeIds = new Set(this.compositeIds.values());
        const allCompositeIds = new Set([
            ...oldCompositeIds,
            ...newCompositeIds
        ]);

        const aliasesLength = this.aliasOrder.length;

        const findPartialMatch = (oldCId) => {
            const oldCId_split = oldCId.split('|');

            top: for (const newCId of newCompositeIds) {
                const newCId_split = newCId.split('|');

                let matched = true;
                let nullMatched_o = false;
                let nullMatched_n = false;
                for (let i = 0; i < aliasesLength; i++) {

                    if (oldCId_split[i].endsWith(':null')) {
                        if (nullMatched_o) return; // Multiple slots in old
                        nullMatched_o = true;
                    }
                    if (newCId_split[i].endsWith(':null')) {
                        if (nullMatched_n) continue top; // Multiple slots in new
                        nullMatched_n = true;
                    }

                    matched = matched && (oldCId_split[i] === newCId_split[i] || nullMatched_o || nullMatched_n);
                }

                if (matched) return newCId;
            }
        };

        for (const cId of allCompositeIds) {
            if (oldCompositeIds.has(cId)) {
                // Exact match
                if (newCompositeIds.has(cId)) {
                    this.emit('data', { kind: 'patch', oldCompositeId: cId, compositeId: newCompositeRows.get(cId)[0], compositeRow: newCompositeRows.get(cId)[1] });
                    newCompositeIds.delete(cId); // IMPORTANT
                    continue;
                }
                const newCId = findPartialMatch(cId);
                const oldCId_slot = [...oldCompositeIds].indexOf(cId);
                if (newCId) {
                    // Exact match
                    this.emit('data', { kind: 'patch', oldCompositeId: cId, compositeId: newCompositeRows.get(newCId)[0], compositeRow: newCompositeRows.get(newCId)[1] });
                    newCompositeIds.delete(newCId); // IMPORTANT
                    this.compositeIds.set(oldCId_slot, newCId);
                } else {
                    // Obsolete
                    this.emit('data', { kind: 'delete', oldCompositeId: cId });
                    this.compositeIds.delete(oldCId_slot);
                }
            } else if (newCompositeIds.has(cId)) {
                // All new
                this.emit('data', { kind: 'push', compositeId: cId, compositeRow: newCompositeRows.get(cId)[1] });
                this.compositeIds.set(this.compositeIds.size, cId);
            }
        }
    }

    _getCompositeId(compositeRow, oldIds = false) {
        const sortedAliases = Object.keys(compositeRow)//.sort()
            .map((a) => this.pkSelectors.get(a)(compositeRow[a], oldIds));
        return sortedAliases.join('|');
    }

    _createComposites() {
        let rowsAsComposites = this.tables[this.baseTableName] ? Array.from(this.tables[this.baseTableName].values()).map(row => ({
            [this.baseTableAlias]: row,
        })) : [];

        for (const [ownAlias_cs, joinClause] of this.normalizedJoins.entries()) {
            const newComposites = [];

            const leftAlias = joinClause.leftAlias_cs;
            const leftTableName = this.aliasToTable.get(leftAlias);
            const leftRows = this.tables[leftTableName] ? Array.from(this.tables[leftTableName].values()) : [];

            const rightAlias = ownAlias_cs;
            const rightTableName = this.aliasToTable.get(ownAlias_cs);
            const rightRows = this.tables[rightTableName] ? Array.from(this.tables[rightTableName].values()) : [];

            const joinCondition = (leftRows.length > 0 && rightRows.length > 0) ? joinClause.condition_clause : null;

            switch (joinClause.join_type) {
                case 'INNER':
                    for (const lComposite of rowsAsComposites) {
                        for (const rRow of rightRows) {
                            const compositeRow = { ...lComposite, [rightAlias]: rRow };
                            if (!joinCondition || this.exprEngine.evaluate(joinCondition, compositeRow)) {
                                newComposites.push(compositeRow);
                            }
                        }
                    }
                    break;
                case 'LEFT':
                    for (const lComposite of rowsAsComposites) {
                        let hasMatch = false;
                        for (const rRow of rightRows) {
                            const compositeRow = { ...lComposite, [rightAlias]: rRow };
                            if (!joinCondition || this.exprEngine.evaluate(joinCondition, compositeRow)) {
                                newComposites.push(compositeRow);
                                // Stats
                                hasMatch = true;
                            }
                        }
                        if (!hasMatch) {
                            newComposites.push({ ...lComposite, [rightAlias]: null });
                        }
                    }
                    break;
                case 'RIGHT':
                    const matchedRightRows = new Set;
                    for (const lComposite of rowsAsComposites) {
                        for (const rRow of rightRows) {
                            const compositeRow = { ...lComposite, [rightAlias]: rRow };
                            if (!joinCondition || this.exprEngine.evaluate(joinCondition, compositeRow)) {
                                newComposites.push(compositeRow);
                                // Stats
                                matchedRightRows.add(rRow);
                            }
                        }
                    }
                    for (const rRow of rightRows) {
                        if (!matchedRightRows.has(rRow)) {
                            newComposites.push({ [leftAlias]: null, [rightAlias]: rRow });
                        }
                    }
                    break;
                case 'FULL':
                    const matchedLefts = new Set;
                    const matchedRights = new Set;
                    for (const lComposite of rowsAsComposites) {
                        for (const rRow of rightRows) {
                            const compositeRow = { ...lComposite, [rightAlias]: rRow };
                            if (!joinCondition || this.exprEngine.evaluate(joinCondition, compositeRow)) {
                                newComposites.push(compositeRow);
                                // Stats
                                matchedLefts.add(lComposite[leftAlias]);
                                matchedRights.add(compositeRow[rightAlias]);
                            }
                        }
                    }
                    for (const lComposite of rowsAsComposites) {
                        if (!matchedLefts.has(lComposite[leftAlias])) {
                            newComposites.push({ ...lComposite, [rightAlias]: null });
                        }
                    }
                    for (const rRow of rightRows) {
                        if (!matchedRights.has(rRow)) {
                            newComposites.push({ [leftAlias]: null, [rightAlias]: rRow });
                        }
                    }
                    break;
                case 'CROSS':
                    for (const lComposite of rowsAsComposites) {
                        for (const rRow of rightRows) {
                            const compositeRow = { ...lComposite, [rightAlias]: rRow };
                            newComposites.push(compositeRow);
                        }
                    }
                    break;
            }
            rowsAsComposites = newComposites;
        }

        const result = new Map(rowsAsComposites.map((c) => [
            this._getCompositeId(c, true),
            [this._getCompositeId(c), c]
        ]));
        return result;
    }
}