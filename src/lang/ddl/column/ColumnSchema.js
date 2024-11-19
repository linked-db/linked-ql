import { Lexer } from '../../Lexer.js';
import { _toCamel, _fromCamel } from '@webqit/util/str/index.js';
import { GlobalTableRef } from '../../expr/refs/GlobalTableRef.js';
import { AbstractNode } from '../../AbstractNode.js';
import { AbstractConstraint } from '../constraints/abstracts/AbstractConstraint.js';
import { AbstractPrefixableNameableNode } from '../abstracts/AbstractPrefixableNameableNode.js'
import { AbstractLevel2Constraint } from '../constraints/abstracts/AbstractLevel2Constraint.js';
import { AutoIncrementConstraint } from '../constraints/AutoIncrementConstraint.js';
import { ExpressionConstraint } from '../constraints/ExpressionConstraint.js';
import { IdentityConstraint } from '../constraints/IdentityConstraint.js';
import { DefaultConstraint } from '../constraints/DefaultConstraint.js';
import { NotNullConstraint } from '../constraints/NotNullConstraint.js';
import { CheckConstraint } from '../constraints/CheckConstraint.js';
import { OnUpdateClause } from '../constraints/OnUpdateClause.js';
import { NullConstraint } from '../constraints/NullConstraint.js';
import { PrimaryKeyConstraint } from '../constraints/PrimaryKeyConstraint.js';
import { ForeignKeyConstraint } from '../constraints/ForeignKeyConstraint.js';
import { UniqueKeyConstraint } from '../constraints/UniqueKeyConstraint.js';
import { ColumnCDL } from './ColumnCDL.js';
import { DataType } from './DataType.js';
import { _isObject } from '@webqit/util/js/index.js';

export class ColumnSchema extends AbstractPrefixableNameableNode {
    static get CONSTRAINT_TYPES() { return [AutoIncrementConstraint,IdentityConstraint,ExpressionConstraint,DefaultConstraint,NotNullConstraint,NullConstraint,OnUpdateClause,PrimaryKeyConstraint,ForeignKeyConstraint,UniqueKeyConstraint,CheckConstraint]; }
    static get PREFIX_TYPE() { return [GlobalTableRef]; }

    #type;
    #$type;
    #constraints = [];

	type(value) {
        if (!arguments.length) return this.#type;
        if (this.$diffTagHydrate()) {
			this.#$type = this.$castInputs([value], DataType, this.#$type, '$type');
		} else this.#type = this.$castInputs([value], DataType, this.#type, 'type');
        return this;
    }

	$type() { return this.#$type || this.#type; }

    autoIncrement(...args) { return this.constraint('AUTO_INCREMENT', ...args); }

    identity(...args) { return this.constraint('IDENTITY', ...args); }

    expression(...args) { return this.constraint('EXPRESSION', ...args); }

    default(...args) { return this.constraint('DEFAULT', ...args); }

    notNull(...args) { return this.constraint('NOT_NULL', ...args); }

    null(...args) { return this.constraint('NULL', ...args); }

    onUpdate(...args) { return this.constraint('ON_UPDATE', ...args); }

    primaryKey(...args) { return this.constraint('PRIMARY_KEY', ...args); }

    foreignKey(...args) { return this.constraint('FOREIGN_KEY', ...args); }

    uniqueKey(...args) { return this.constraint('UNIQUE_KEY', ...args); }

    check(...args) { return this.constraint('CHECK', ...args); }

	/* -- SUBTREE I/O */

    constraint(arg1, ...args) {
        if (typeof arg1 === 'string') {
            const existing = this.#constraints.find((cons) => cons.TYPE === arg1);
            if (!args.length) return existing;
            if (args[0] === false) {
                this.#constraints = this.#constraints.filter((c) => c !== existing);
                existing?.bubble('DISCONNECTED');
                return this;
            }
            arg1 = { type: arg1, ...(['CHECK', 'DEFAULT', 'EXPRESSION', 'ON_UPDATE'].includes(arg1) && !(_isObject(args[0]) && args[0].expr) ? { expr: args[0] } : (typeof args[0] === 'object' ? args[0] : {})) };
        }
        this.#constraints = this.$castInputs([arg1], this.constructor.CONSTRAINT_TYPES, this.#constraints, 'constraint', null, (existing) => {
			return this.#constraints.find((cons) => cons.TYPE === existing.TYPE);
		});
        return this;
    }

	/* -- TRAVERSALS */

	constraints(asInstances = true, level = 0) {
		const constraints = !level ? this.#constraints : this.#constraints.filter(node => (node instanceof AbstractLevel2Constraint) === (level === 2));
		return !asInstances ? constraints.map(c => c.TYPE) : constraints;
	}

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		const dirtyCheck = super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties(['type'])
		);
		if (!deeply) return dirtyCheck;
		return dirtyCheck.concat(['constraints'].filter((key) => {
			return this[key]().some(node => node.dirtyCheck(deeply).length);
		}));
	}

    renderCDL(columnCDL, options) {
        let json = this.jsonfy(options);
        for (const cd of columnCDL) {
            if (cd.CLAUSE === 'ADD') {
                if (cd.$KIND === 'IDENTITY') {
                    json = this.diffMergeJsons(json, { identity: { always: cd.argument().always(), ...(options.diff !== false ? { status: 'new' } : {}) } });
                }
            } else if (cd.CLAUSE === 'SET') {
                if (cd.KIND === 'DATA_TYPE') {
                    json = this.diffMergeJsons(json, { type: cd.argument().jsonfy(options) });
                } else if (cd.$KIND === 'IDENTITY') {
                    json = this.diffMergeJsons(json, { identity: { always: cd.argument().always() } });
                } else if (cd.$KIND === 'EXPRESSION') {
                    json = this.diffMergeJsons(json, { expression: { expr: cd.argument().expr().jsonfy(options) } });
                } else if (cd.$KIND === 'DEFAULT') {
                    json = this.diffMergeJsons(json, { default: { expr: cd.argument().expr().jsonfy(options) } });
                }
            } else if (cd.CLAUSE === 'DROP') {
                json = options.diff === false ? json : this.diffMergeJsons(json, { [cd.$KIND.toLowerCase()]: { status: 'obsolete' } });
            }
        }
        return json;
    }

    generateCDL(options = {}) {
        const columnCDL = ColumnCDL.fromJSON(this, { actions: [] });
        if (this.#$type && !this.$eq(this.#$type, this.#type, 'ci')) {
            columnCDL.add('SET', 'DATA_TYPE', (cd) => cd.argument(this.#$type.jsonfy(options)));
        }
        for (const cons of this.#constraints) {
            if (cons.constraintLevel === 2) continue;
            if (cons.status() === 'obsolete') {
                columnCDL.add('DROP', cons.TYPE);
            } else if (cons.status() === 'new') {
                columnCDL.add('ADD', cons.TYPE, (cd) => cd.argument(cons.jsonfy({ ...options, diff: false })));
            } else {
                const dirtyCheck = cons.dirtyCheck();
                if (!dirtyCheck.length) continue;
                columnCDL.add('SET', 'CONSTRAINT', cons.TYPE, (cd) => cd.argument(cons.jsonfy({ ...options, diff: false })));
            }
        }
        return columnCDL;
    }

    generateDiff(nodeB, options) {
		const attributesDiff = this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			type: this.$type()?.jsonfy(options)
		}, {
			type: nodeB.$type()?.jsonfy(options)
		}, options);
        const constraintsDiff = this.flattenConstraintJsons(this.diffMergeTrees(
            new Map(this.#constraints.map(cons => [cons.TYPE, cons])),
            new Map(nodeB.constraints().map(cons => [cons.TYPE, cons])),
            (a, b) => a.generateDiff(b, options)
        ), options);
        return { ...attributesDiff, ...constraintsDiff };
    }

    /* -- UTILS */

    flattenConstraintJsons(constraints) {
        let json = {};
        for (const cons of constraints) {
            const { type, ...rest } = cons;
            const attrName = _toCamel(type.toLowerCase().replace('_', ' '));
            json = { ...json, [ attrName ]: !Object.keys(rest).filter((k) => rest[k] !== undefined ).length ? true : rest };
        }
        return json;
    }

    static unflattenConstraintJsons(json) {
        return Object.entries(json).map(([type, body]) => {
            const $throw = (subKey) => {
                throw new Error(`Invalid ${subKey ? `or missing attribute "${subKey}"` : 'format'} for constraint "${ type }"`);
            };
            type = _fromCamel((type + ''), '_').toUpperCase();
            body = body === true ? {} : (body === false ? { status: 'obsolete' } : body);
            // Validation
            if (['CHECK', 'EXPRESSION', 'DEFAULT', 'ON_UPDATE'].includes(type)) {
                if (!_isObject(body) || !body.expr) body = { expr: body };
            } else if (type === 'FOREIGN_KEY') {
                if (!GlobalTableRef.fromJSON({}, body?.targetTable)) $throw('targetTable');
                if (!Array.isArray(body?.targetColumns)) $throw('targetColumns');
            } else if (!['PRIMARY_KEY', 'UNIQUE_KEY', 'IDENTITY', 'NOT_NULL', 'NULL', 'AUTO_INCREMENT'].includes(type)) {
                throw new Error(`Unknown attribute or constraint: ${type}`);
            } else if (!_isObject(body)) $throw();
            return { type, ...body };
        });
    }

    /* -- I/O */

	static fromJSON(context, json, callback = null) {
        const { nodeName, name, $name, prefix, $prefix, type, $type, status, CDLIgnoreList, ...constraints } = json;
        if (!DataType.fromJSON({}, type)) return;
        return super.fromJSON(context, json, (instance) => {
            instance.type(type);
            instance.$diffTagHydrate($type, ($type) => instance.type($type));
            for (const cons of this.unflattenConstraintJsons(constraints)) {
                instance.constraint(cons);
            }
            callback?.(instance);
        });
	}
	
	jsonfy(options = {}, jsonIn = {}, reducer = null) {
        const constraints = this.#constraints.reduce((aggr, entry, i) => {
            if (reducer) {
                const result = reducer(entry, i);
                if (!result) return aggr;
                if (![entry, true].includes(result)) {
                    if (result instanceof AbstractNode) throw new Error(`A JSON object not a node instance expected from reducer`);
                    return aggr.concat(result);
                }
            }
            return aggr.concat(entry.jsonfy(options) || []);
        }, []);
        return super.jsonfy(options, {
            type: this.#type?.jsonfy(options),
            ...(this.#$type ? { $type: this.#$type.jsonfy(options) } : {}),
            ...this.flattenConstraintJsons(constraints),
            ...jsonIn
        });
    }
	
	static parse(context, expr, parseCallback) {
		const [ namePart, bodyPart ] = Lexer.split(expr, ['\\s+'], { useRegex: true, limit: 1 });
        const [name] = this.parseIdent(context, namePart.trim());
        if (!name) return;
        const instance = (new this(context)).name(name);
        // Parse into "type" and constraints
        const qualifier = '(CONSTRAINT\\s+.+?\\s+)?';
        const regexes = [
            { test: `${ qualifier }(PRIMARY[ ]+KEY|NOT[ ]+NULL|GENERATED|REFERENCES|UNIQUE(?:[ ]+KEY)?|CHECK|AUTO_INCREMENT)` },
            { backtest: '^(?!.*\\s+(NOT|SET)\\s+$)', test: `${ qualifier }NULL` },
            { backtest: '^(?!.*\\s+BY\\s+$)', test: `${ qualifier }DEFAULT` },
            { backtest: '^(?!.*\\s+REFERENCES\\s+)', test: `ON\\s+UPDATE` },
        ];
        const [ columnType, ...tokens ] = Lexer.split(bodyPart, regexes, { useRegex:'i', preserveDelims: true });
        // Type
        instance.type(parseCallback(instance, columnType.trim(), [DataType]));
        // Constraints
        for (const constraint of tokens) {
            const cons = parseCallback(instance, constraint, this.CONSTRAINT_TYPES);
            instance.constraint(cons);
        }
        return instance;
    }

	stringify() {
        let constraints = this.#constraints;
        if (this.params.dialect === 'mysql') { constraints = constraints.filter(c => c.TYPE !== 'FOREIGN_KEY'); }
        return `${ this.stringifyIdent(this.$name()) } ${ this.$type() }${ constraints.length ? ` ${ constraints.join(' ') }` : '' }`;
    }
}