import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import Lexer from '../../Lexer.js';
import AbstractNode from '../AbstractNode.js';
import Identifier from '../../components/Identifier.js';
import AlterStatement from '../../ddl/alter/AlterStatement.js';
import AbstractLevel2Constraint from './constraints/AbstractLevel2Constraint.js';
import TablePrimaryKey from './constraints/TablePrimaryKey.js';
import TableForeignKey from './constraints/TableForeignKey.js';
import TableUniqueKey from './constraints/TableUniqueKey.js';
import CheckConstraint from './constraints/CheckConstraint.js';
import Column from './Column.js';
import Index from './Index.js';		
import DataType from './DataType.js';

export default class TableSchema extends AbstractNode {

	/**
	 * Instance props.
	 */
	PREFIX;
	$PREFIX;
	COLUMNS = [];
	CONSTRAINTS = [];
	INDEXES = [];

	/**
	 * Other props
	 */
	NODES = new Set;

	static get WRITABLE_PROPS() { return ['PREFIX'].concat(super.WRITABLE_PROPS); }
	static get SUBTREE_PROPS() { return ['COLUMNS', 'CONSTRAINTS', 'INDEXES']; }

	/**
	 * @var Array
	 */
	static CONSTRAINT_TYPES = [TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint];

    /**
     * PRIMARY_KEY
     */
    primaryKey() { return [...this.NODES].find(node => node.TYPE === 'PRIMARY_KEY'); }

    /**
     * FOREIGN_KEY
     */
    foreignKeys() { return [...this.NODES].filter(node => node.TYPE === 'FOREIGN_KEY'); }

    /**
     * UNIQUE_KEY
     */
    uniqueKeys() { return [...this.NODES].filter(node => node.TYPE === 'UNIQUE_KEY'); }

    /**
     * CHECK
     */
    checks() { return [...this.NODES].filter(node => node.TYPE === 'CHECK'); }

	/**
	 * Returns prefix or sets prefix
	 * 
	 * @param Void|String prefix
	 * 
	 * @returns String
	 */
	prefix(prefix) {
		if (!arguments.length) return this[this.smartKey('PREFIX')];
        return (this[this.smartKey('PREFIX', true)] = prefix, this);
	}

	/**
	 * Returns a column or adds a column to the schema,
	 * 
	 * @param String|Column column
	 * 
	 * @returns Any
	 */
	column(column) {
		if (typeof column === 'string') return this.COLUMNS.find(col => this.isSame(col.name(), column, 'ci'));
		return (this.build('COLUMNS', [column], Column), this.COLUMNS[this.COLUMNS.length - 1]);
	}

	/**
	 * Returns a constraint or adds a constraint to the schema,
	 * 
	 * @param String|TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint constraint
	 * 
	 * @returns Any
	 */
	constraint(constraint) {
		if (typeof constraint === 'string') return this.CONSTRAINTS.find(cons => this.isSame(cons.name(), constraint, 'ci'));
		return (this.build('CONSTRAINTS', [constraint], this.constructor.CONSTRAINT_TYPES), this.CONSTRAINTS[this.CONSTRAINTS.length - 1]);
	}

	/**
	 * Returns a constraint or adds a constraint to the schema,
	 * 
	 * @param String|Index index
	 * 
	 * @returns Any
	 */
	index(index) {
		if (typeof index === 'string') return this.INDEXES.find(idx => this.isSame(idx.name(), index, 'ci'));
		return (this.build('INDEXES', [index], Index), this.INDEXES[this.INDEXES - 1]);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param Table nodeB
	 * 
	 * @returns this
	 */
	diffWith(nodeB) {
		// DIFF NAME & KEEP
		super.diffWith(nodeB);
        if (!this.isSame(nodeB.prefix(), this.prefix(), 'ci')) this.prefix(nodeB.prefix());
		// DIFF STRUCTURE
		const getNode = (instance, name) => [...instance.NODES].find(node => this.isSame(node.NAME, name, 'ci'));
		const getNames = instance => {
			return [...instance.NODES].reduce(([names, unnamed], node) => {
				if (![Column,AbstractLevel2Constraint,Index].some(x => node instanceof x)) return [names, unnamed];
				if (!node.NAME) return [names, unnamed.add(node)];
				return [names.add(node.NAME), unnamed];
			}, [new Set, new Set]);
		};
		const [ namesA ] = getNames(this);
		const [ namesB, unnamedB ] = getNames(nodeB);
		const addNode = subNodeB => {
			if (subNodeB instanceof AbstractLevel2Constraint) {
				if (subNodeB.CONTEXT instanceof Column) {
					const columnName = subNodeB.CONTEXT.NAME;
					// Is the column also a new column? Ignore
					// (Note that we're asking namesA as that's the originals before fresh additions)
					if (!namesA.has(columnName)) return;
					getNode(this, columnName).constraint(subNodeB.toJSON());
				} else this.constraint(subNodeB.toJSON());
			} else if (subNodeB instanceof Index) this.index(subNodeB.toJSON());
			else this.column(subNodeB.toJSON());
		};
		for (const name of new Set([...namesA, ...namesB])) {
			const nodeA = getNode(this, name);
			const subNodeB = getNode(nodeB, name);
			if (namesA.has(name) && !namesB.has(name)) {
				nodeA.keep(false);
			} else if (!namesA.has(name)) {
				addNode(subNodeB);
			} else {
				nodeA.diffWith(subNodeB);
			}
		}
		for (const subNodeB of unnamedB) addNode(subNodeB);
		return this;
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param AlterStatement altInstance
	 * 
	 * @returns this
	 */
	alterWith(altInstance) {
		const getNode = (reference, ifExists = false) => {
			const node = [...this.NODES].find(node => {
				return (reference.kind === 'COLUMN' ? node instanceof Column : (reference.kind === 'CONSTRAINT' ? node instanceof AbstractLevel2Constraint : node.TYPE === reference.kind/* constraint or index */))
				&& (!reference.name ? reference.kind === 'PRIMARY_KEY'/* mysql only */ : this.isSame(node.NAME, reference.name, 'ci'))
			});
			if (!node && !ifExists) throw new Error(`${ reference.kind }${ reference.name ? ` "${ reference.name }"` : '' } does not exist.`);
			return node;
		}
		for (const action of altInstance.ACTIONS) {
			if (action.CLAUSE === 'RENAME') {
				if (action.KIND) {
					getNode({ kind: action.KIND, name: action.ident().name() }).name(action.argument().name());
				} else {
					this.name(action.argument().name());
					this.prefix(action.argument().prefix());
				}
			} else if (action.CLAUSE === 'SET') {
				if (action.KIND === 'SCHEMA') {
					this.prefix(action.argument());
				}
			} else if (action.CLAUSE === 'ADD') {
				if (action.argument() instanceof AbstractLevel2Constraint) {
					if (action.argument().columns().length === 1) {
						getNode({ kind: 'COLUMN', name: action.argument().columns()[0] }).constraint(action.argument().toJSON());
					} else this.constraint(action.argument().toJSON());
				} else if (action.argument() instanceof Index) {
					this.index(action.argument().toJSON());
				} else if (!action.hasFlag('IF_NOT_EXISTS') || !getNode({ kind: 'COLUMN', name: action.argument().name() }, true)) {
					this.column(action.argument().toJSON());
				}
			} else if (action.CLAUSE === 'DROP') {
				const node = getNode({ kind: action.KIND, name: action.ident().name() }, action.hasFlag('IF_EXISTS'));
				node?.keep(false);
			} else if (['CHANGE', 'MODIFY'].includes(action.CLAUSE)) {
				const node = action.CLAUSE === 'CHANGE' ? getNode({ kind: 'COLUMN', name: action.ident().name() }) : getNode({ kind: 'COLUMN', name: action.argument().name() });
				node.diffWith(action.argument());
			} else if (action.CLAUSE === 'ALTER') {
				const node = getNode({ kind: action.KIND, name: action.ident().name() }, action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				const subAction = action.argument();
				if (subAction.CLAUSE === 'ADD') {
					if (subAction.argument().TYPE === 'EXPRESSION') throw new Error(`Cannot add EXPRESSION constraint after column creation.`);
					const existing = node.constraint(subAction.argument().TYPE);
					if (existing) throw new Error(`Constraint ${ subAction.argument().TYPE } already exists on ${ node.name() }.`);
					node.constraint(subAction.argument());
				} else if (subAction.CLAUSE === 'DROP') {
					const existing = node.constraint(subAction.KIND);
					if (existing) existing.keep(false);
					else if (['IDENTITY','EXPRESSION'].includes(subAction.KIND) && !subAction.hasFlag('IF_EXISTS')) {
						throw new Error(`Cannot drop ${ subAction.KIND }; does not exist.`);
					}
				} else if (subAction.CLAUSE === 'SET') {
					if (subAction.argument() instanceof DataType) {
						node.type(subAction.argument().toJSON());
					} else if (['DEFAULT', 'ON_UPDATE'].includes(subAction.KIND)) {
						node.constraint(subAction.KIND, subAction.argument());
					} else if (['NOT_NULL', 'NULL', 'AUTO_INCREMENT'].includes(subAction.KIND)) {
						node.constraint(subAction.KIND, true);
					} else if (subAction.KIND === 'IDENTITY') {
						const existing = node.identity();
						if (!existing) throw new Error(`Cannot modify IDENTITY constraint on ${ node.name() }; does not exist.`);
						existing.always(/^ALWAYS$/i.test(subAction.argument()));
					}
				}
			}
		}
		return this;
	}

	getAlt() {
		const instance = AlterStatement.fromJSON(this.CONTEXT, {
			kind: 'TABLE',
			ident: [this.PREFIX,this.NAME], // Explicit old name important
			actions: []
		});
		if (this.$NAME && this.NAME) {
			if (!this.isSame(this.$NAME, this.NAME, 'ci')) {
				instance.rename(null, null, this.$NAME);
			}
			if (this.$PREFIX && !this.isSame(this.$PREFIX, this.PREFIX, 'ci')) {
				instance.set('SCHEMA', this.$PREFIX);
			}
		}
		const constraintDirty = (cons, includingName = false) => (cons.keep() !== true || ['$EXPR','$ALWAYS','$TARGET_TABLE','$TARGET_COLUMNS','$MATCH_RULE','$UPDATE_RULE','$DELETE_RULE'].concat(includingName ? '$NAME' : []).some(k => /*exists*/k in cons && /*not empty*/(Array.isArray(cons[k]) ? cons[k].length : ![undefined, null].includes(cons[k])) && /*different*/!this.isSame(cons[k.slice(1)], cons[k], 'ci')));
		for (const col of this.COLUMNS) {
			// DROP COLUMN?
			if (col.keep() === false) {
				instance.drop('COLUMN', col.NAME);
				continue;
			}
			// ADD COLUMN?
			if (col.keep() !== true) {
				instance.add('COLUMN', col.clone());
				continue;
			}
			// ALTER COLUMN?
			if (col.keep() === true) {
				if (this.params.dialect === 'mysql') {
					// // Column name or type changed, or these attrs changed? Use MySQL CHANGE clause?
					if ((col.$TYPE && !this.isSame(col.$TYPE.toJSON(), col.TYPE.toJSON(), 'ci'))
					|| (col.CONSTRAINTS.some(cons => ['EXPRESSION', 'NOT_NULL', 'NULL', 'AUTO_INCREMENT', 'ON_UPDATE'].includes(cons.TYPE) && constraintDirty(cons, true)))) {
						const columnClone = col.clone();
						columnClone.CONSTRAINTS = columnClone.CONSTRAINTS.filter(cons => !(cons instanceof AbstractLevel2Constraint));
						instance.modify('COLUMN', columnClone);
					} else {
						// Add/set default
						const consDefault = col.CONSTRAINTS.find(cons => cons.TYPE === 'DEFAULT' && constraintDirty(cons, true));
						if (consDefault) {
							instance.alter('COLUMN', col.NAME, q => {
								if (consDefault.keep() === false) q.drop('DEFAULT');
								else a.set('DEFAULT', consDefault.expr());
							});
						}
						// Column rename? Must come last!!!
						if (col.$NAME && !this.isSame(col.$NAME, col.NAME, 'ci')) {
							instance.rename('COLUMN', col.NAME, col.$NAME);
						}
					}
				} else {
					// Column type change?
					if (col.$TYPE && !this.isSame(col.$TYPE.toJSON(), col.TYPE.toJSON(), 'ci')) {
						instance.alter('COLUMN', col.NAME, { clause: 'SET', kind: 'DATA_TYPE', argument: DataType.fromJSON(col, col.$TYPE.toJSON()) });
					}
					// Constraints level1 changed?
					const constraintsLevel1 = col.CONSTRAINTS.filter(cons => !(cons instanceof AbstractLevel2Constraint) && constraintDirty(cons, true));
					for (const cons of constraintsLevel1) {
						instance.alter('COLUMN', col.NAME, (() => {
							if (cons.keep() === false) return { clause: 'DROP', kind: cons.TYPE };
							else if (cons.TYPE === 'EXPRESSION') throw new Error('EXPRESSION constraints cannot be added or modified after column creation.');
							else if (cons.TYPE === 'IDENTITY') return !cons.keep() ? { clause: 'ADD', argument: cons.clone() } : { clause: 'SET', kind: 'IDENTITY', argument: cons.always() ? 'ALWAYS' : true };
							else if (['DEFAULT'/*, 'ON_UPDATE'*//*useless in postgres*/].includes(cons.TYPE)) return { clause: 'SET', kind: cons.TYPE, argument: cons.expr() };
							else if (['NOT_NULL'/*, 'NULL'*//*pretty useless in both languages*/].includes(cons.TYPE)) return { clause: 'SET', kind: cons.TYPE };
						})());
					}
					// Column rename? Must come last!!!
					if (col.$NAME && !this.isSame(col.$NAME, col.NAME, 'ci')) {
						instance.rename('COLUMN', col.NAME, col.$NAME);
					}
				}
				// Constraints level2 changed?
				const constraintsLevel2 = col.CONSTRAINTS.filter(cons => cons instanceof AbstractLevel2Constraint);
				for (const cons of constraintsLevel2) {
					if (constraintDirty(cons)) {
						if ([true, false].includes(cons.keep())) instance.drop(cons.TYPE, cons.NAME);
						if (cons.keep() !== false) {
							const columnName = col.$trace('get:TABLE_SCHEMA').altsCascaded ? col.name() : col.NAME;
							const tableCons = this.constructor.CONSTRAINT_TYPES.find(Type => Type.TYPE === cons.TYPE).fromJSON(cons.CONTEXT, { ...cons.toJSON(), columns: [columnName] });
							instance.add(tableCons.TYPE, tableCons);
						}
					} else if (cons.keep() === true && cons.$NAME && !this.isSame(cons.$NAME, cons.NAME, 'ci')) {
						instance.rename('CONSTRAINT', cons.NAME, cons.$NAME);
					}
				}
			}
		}
		const tableLevlConstraintDirty = cons => constraintDirty(cons) || (cons.$COLUMNS?.length && !this.isSame(cons.$COLUMNS, cons.COLUMNS, 'ci'));
		for (const cons of this.CONSTRAINTS) {
			if (tableLevlConstraintDirty(cons)) {
				if ([true, false].includes(cons.keep())) instance.drop(cons.TYPE, cons.NAME);
				if (cons.keep() !== false) instance.add(cons.TYPE, cons.clone());
			} else if (cons.keep() === true && cons.$NAME && !this.isSame(cons.$NAME, cons.NAME, 'ci')) {
				instance.rename('CONSTRAINT', cons.NAME, cons.$NAME);
			}
		}
		return instance;
	}

	toJSON() {
		return super.toJSON({
			...(this.PREFIX ? { prefix: this.PREFIX } : {}),
			...(this.$PREFIX ? { $prefix: this.$PREFIX } : {}),
            columns: this.COLUMNS.map(column => column.toJSON()),
            constraints: this.CONSTRAINTS.map(constraint => constraint.toJSON()),
            indexes: this.INDEXES.map(index => index.toJSON()),
        });
    }

	static fromJSON(context, json) {
		if (!Array.isArray(json?.columns) || ['constraints', 'indexes'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJSON(context, json, () => {
			const instance = new this(context);
			instance.hardSet(() => instance.prefix(json.prefix));
			instance.hardSet(json.$prefix, val => instance.prefix(val));
			for (const col of json.columns) instance.column(col);
			for (const cons of (json.constraints || [])) instance.constraint(cons);
			for (const idx of (json.indexes || [])) instance.index(idx);
			return instance;
		});
	}
	
	stringify() {
		const defs = [ this.COLUMNS.map(col => col.stringify()).join(',\n\t') ];
		const constraints = this.CONSTRAINTS.slice(0);
		const indexes = this.INDEXES.slice(0);
		if (this.params.dialect === 'mysql') {
			constraints.push(...this.COLUMNS.reduce((constraints, col) => {
				const constraint = col.foreignKey();
				if (constraint) return constraints.concat(TableForeignKey.fromJSON(this, { ...constraint.toJSON(), columns: [col.name()] }));
				return constraints;
			}, []));
		}
		if (constraints.length) { defs.push(constraints.map(cnst => cnst.stringify()).join(',\n\t')); }
		if (indexes.length) { defs.push(indexes.map(ndx => ndx.stringify()).join(',\n\t')); }
		const ident = Identifier.fromJSON(this, [this.prefix(), this.name()]);
		if (!ident.prefix()) ident.prefix(this.$trace('get:DATABASE_NAME'));
		return `${ ident } (\n\t${ defs.join(',\n\t') }\n)`;
	}
	
	static parse(context, expr, parseCallback) {
		const [ namePart, bodyPart, ...rest ] = Lexer.split(expr, [], { limit: 2 });
		if (!namePart || !_wrapped(bodyPart || '', '(', ')')) return;
		const instance = new this(context);
		const ident = parseCallback(instance, namePart.trim(), [Identifier]);
		instance.name(ident.name());
		instance.prefix(ident.prefix());
		const defs = Lexer.split(_unwrap(bodyPart, '(', ')'), [',']).map(def => {
			return parseCallback(instance, def.trim(), [TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint,Index,Column]); // Note that Column must come last
		});
		for (const def of defs) {
			if (def instanceof Column) instance.column(def);
			else if (def instanceof Index) instance.index(def);
			else instance.constraint(def);
		}
		return instance;
	}

    $trace(request, ...args) {
		if (request === 'get:TABLE_SCHEMA') return this;
		if (request === 'get:TABLE_NAME') return this.NAME/*IMPORTANT: OLD NAME*/;
		if (request === 'get:DATABASE_NAME' && this.prefix()) return this.PREFIX/*IMPORTANT: OLD NAME*/;
		if (['event:CONNECTED', 'event:DISCONNECTED'].includes(request) && [Column,AbstractLevel2Constraint,Index].some(x => args[0] instanceof x)) {
			if (request === 'event:DISCONNECTED') this.NODES.delete(args[0]);
			else this.NODES.add(args[0]);
		}
		return super.$trace(request, ...args);
	}
}