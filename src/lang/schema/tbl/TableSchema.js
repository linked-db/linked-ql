
import Lexer from '../../Lexer.js';
import { _unwrap, _wrapped } from '@webqit/util/str/index.js';
import AbstractSchema from '../AbstractSchema.js';
import Identifier from '../../componets/Identifier.js';
import AlterStatement from '../../ddl/alter/AlterStatement.js';
import AbstractLevel2Constraint from './constraints/AbstractLevel2Constraint.js';
import TablePrimaryKey from './constraints/TablePrimaryKey.js';
import ColumnForeignKey from './constraints/ColumnForeignKey.js';
import TableForeignKey from './constraints/TableForeignKey.js';
import TableUniqueKey from './constraints/TableUniqueKey.js';
import CheckConstraint from './constraints/CheckConstraint.js';
import Column from './Column.js';
import Index from './Index.js';		
import DataType from './DataType.js';

export default class TableSchema extends AbstractSchema {

	/**
	 * Instance props.
	 */
	COLUMNS = [];
	CONSTRAINTS = [];
	INDEXES = [];

	/**
	 * Other props
	 */
	NODES = new Set;

	/**
	 * @inheritdoc
	 */
	static get WRITABLE_PROPS() { return ['BASENAME'].concat(super.WRITABLE_PROPS); }
	static get SUBTREE_PROPS() { return ['COLUMNS', 'CONSTRAINTS', 'INDEXES']; }

	/**
	 * @var Array
	 */
	static CONSTRAINT_TYPES = [TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint];

    /**
	 * @inheritdoc
	 */
    $trace(request, ...args) {
		if (request === 'get:schema:table') return this;
		if (request === 'get:name:table') return this.NAME.NAME;
		if (request === 'get:name:database' && this.NAME.BASENAME) return this.NAME.BASENAME;
		if (request === 'event:connected'
		&& [Column,AbstractLevel2Constraint,Index].some(x => args[0] instanceof x)) {
			this.NODES.add(args[0]);
		}
		return super.$trace(request, ...args);
	}

    /**
     * PRIMARY_KEY
     */
    primaryKey() { return this.NODES.find(node => node.TYPE === 'PRIMARY_KEY'); }

	/**
	 * Returns a column or adds a column to the schema,
	 * 
	 * @param String|Column column
	 * 
	 * @returns Any
	 */
	column(column) {
		if (typeof column === 'string') return this.COLUMNS.find(col => this.isSame(col.name(), column, 'ci'));
		return (this.build('COLUMNS', [column], Column), this);
	}

	/**
	 * Returns a constraint or adds a constraint to the schema,
	 * 
	 * @param String|TablePrimaryKey,TableForeignKey,TableUniqueKey,CheckConstraint constraint
	 * 
	 * @returns Any
	 */
	constraint(constraint) {
		if (typeof constraint === 'string') return this.NODES.find(node => node instanceof AbstractLevel1Constraint && this.isSame(node.name(), constraint, 'ci'));
		return (this.build('CONSTRAINTS', [constraint], this.constructor.CONSTRAINT_TYPES), this);
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
		return (this.build('INDEXES', [index], Index), this);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param Table nodeB
	 * 
	 * @returns this
	 */
	diffWith(nodeB) {
		// NAME and BASENAME
		super.diffWith(nodeB);
		// DIFF STRUCTURE
		const getNode = (instance, name) => [...instance.NODES].find(node => node.NAME === name);
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
					getNode(this, columnName).constraint(subNodeB.toJson());
				} else this.constraint(subNodeB.toJson());
			} else if (subNodeB instanceof Index) this.index(subNodeB.toJson());
			else this.column(subNodeB.toJson());
		};
		for (const name of new Set([...namesA, ...namesB])) {
			const nodeA = getNode(this, name);
			const subNodeB = getNode(nodeB, name);
			if (namesA.has(name) && !namesB.has(name)) {
				nodeA.drop();
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
			const node = this.NODES.find(node => {
				return (reference.kind === 'COLUMN' ? node instanceof Column : (reference.kind === 'CONSTRAINT' ? node instanceof AbstractLevel2Constraint : node.TYPE === reference.kind/* constraint or index */))
				&& (!reference.name ? reference.kind === 'PRIMARY_KEY'/* mysql only */ : this.isSame(node.NAME, reference.name, 'ci'))
			});
			if (!node && !ifExists) throw new Error(`${ reference.kind }${ reference.name ? ` "${ reference.name }"` : '' } does not exist.`);
			return node;
		}
		for (const action of altInstance.ACTIONS) {
			if (action.CLAUSE === 'RENAME') {
				if (action.KIND) {
					getNode({ kind: action.KIND, name: action.name() }).name(action.argument());
				} else this.name([this.name().BASENAME,action.argument()]);
			} else if (action.CLAUSE === 'ADD') {
				if (action.argument() instanceof AbstractLevel2Constraint) {
					if (action.argument().columns().length === 1) {
						getNode({ kind: 'COLUMN', name: action.argument().columns()[0] }).constraint(action.argument().toJson());
					} else this.constraint(action.argument().toJson());
				} else if (action.argument() instanceof Index) {
					this.index(action.argument().toJson());
				} else if (!action.hasFlag('IF_NOT_EXISTS') || !getNode({ kind: 'COLUMN', name: action.argument().name() }, true)) {
					this.column(action.argument().toJson());
				}
			} else if (action.CLAUSE === 'DROP') {
				const node = getNode(action.toJson(), action.hasFlag('IF_EXISTS'));
				node?.drop();
			} else if (action.CLAUSE === 'SET') {
				if (action.KIND === 'SCHEMA') {
					this.name([action.argument(),this.name().NAME]);
				}
			} else if (['CHANGE', 'MODIFY'].includes(action.CLAUSE)) {
				const node = action.CLAUSE === 'CHANGE' ? getNode({ kind: 'COLUMN', name: action.name() }) : getNode({ kind: 'COLUMN', name: action.argument().name() });
				node.diffWith(action.argument());
			} else if (action.CLAUSE === 'ALTER') {
				const node = getNode({ kind: action.KIND, name: action.name() }, action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				const subAction = action.argument();
				if (subAction.CLAUSE === 'ADD') {
					if (subAction.argument().TYPE === 'EXPRESSION') throw new Error(`Cannot add EXPRESSION constraint after column creation.`);
					const existing = node.constraint(subAction.argument().TYPE);
					if (existing) throw new Error(`Constraint ${ subAction.argument().TYPE } already exists on ${ node.name() }.`);
					node.constraint(subAction.argument());
				} else if (subAction.CLAUSE === 'DROP') {
					const existing = node.constraint(subAction.KIND);
					if (existing) existing.drop();
					else if (['IDENTITY','EXPRESSION'].includes(subAction.KIND) && !subAction.hasFlag('IF_EXISTS')) {
						throw new Error(`Cannot drop ${ subAction.KIND }; does not exist.`);
					}
				} else if (subAction.CLAUSE === 'SET') {
					if (subAction.argument() instanceof DataType) {
						node.type(subAction.argument().toJson());
					} else if (subAction.KIND === 'DEFAULT') {
						node.constraint(subAction.KIND, subAction.argument());
					} else if (subAction.KIND === 'NOT_NULL') {
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

	/**
	 * @inheritdoc
	 */
	getAlt() {
		const instance = AlterStatement.fromJson(this.CONTEXT, {
			kind: 'TABLE',
			name: this.NAME.toJson(), // Explicit old name important
			actions: []
		});
		if (this.$NAME && this.NAME) {
			if (!this.isSame(this.$NAME.NAME, this.NAME.NAME, 'ci')) {
				instance.rename(null, null, this.$NAME.NAME);
			}
			if (this.$NAME.BASENAME && !this.isSame(this.$NAME.BASENAME, this.NAME.BASENAME, 'ci')) {
				instance.set('SCHEMA', this.$NAME.BASENAME);
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
					if ((col.$TYPE && !this.isSame(col.$TYPE.toJson(), col.TYPE.toJson(), 'ci'))
					|| (col.CONSTRAINTS.some(cons => ['EXPRESSION', 'NOT_NULL', 'AUTO_INCREMENT'].includes(cons.TYPE) && constraintDirty(cons, true)))) {
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
					if (col.$TYPE && !this.isSame(col.$TYPE.toJson(), col.TYPE.toJson(), 'ci')) {
						instance.alter('COLUMN', col.NAME, { clause: 'SET', kind: 'DATA_TYPE', argument: DataType.fromJson(col, col.$TYPE.toJson()) });
					}
					// Constraints level1 changed?
					const constraintsLevel1 = col.CONSTRAINTS.filter(cons => !(cons instanceof AbstractLevel2Constraint) && constraintDirty(cons, true));
					for (const cons of constraintsLevel1) {
						instance.alter('COLUMN', col.NAME, (() => {
							if (cons.keep() === false) return { clause: 'DROP', kind: cons.TYPE };
							else if (cons.TYPE === 'EXPRESSION') throw new Error('EXPRESSION constraints cannot be added or modified after column creation.');
							else if (cons.TYPE === 'IDENTITY') return !cons.keep() ? { clause: 'ADD', argument: cons.clone() } : { clause: 'SET', kind: 'IDENTITY', argument: cons.always() ? 'ALWAYS' : true };
							else if (cons.TYPE === 'DEFAULT') return { clause: 'SET', kind: 'DEFAULT', argument: cons.expr() };
							else if (cons.TYPE === 'NOT_NULL') return { clause: 'SET', kind: 'NOT_NULL' };
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
							const columnName = col.$trace('get:schema:table').altsCascaded ? col.name() : col.NAME;
							const tableCons = this.constructor.CONSTRAINT_TYPES.find(Type => Type.TYPE === cons.TYPE).fromJson(cons.CONTEXT, { ...cons.toJson(), columns: [columnName] });
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

	/**
	 * @inheritdoc
	 */
	cascadeAlt() {
		// Normalize subtree "keep" flags
		this.keep(this.keep(), 'auto');
		const getAltType = node => node.dropped() ? 'DOWN' : (node.$NAME && !this.isSame(node.$NAME, node.NAME, 'ci') ? 'RENAME' : null);
		// We've been dropped or renamed?
		const altType = getAltType(this);
		if (altType) {
			// TODO: Check with all tables and call updateTableReferences() on them
		}
		// A column in here was dropped or renamed?
		for (const col of this.COLUMNS) {
			const altType = getAltType(col);
			if (!altType) continue;
			// Check with our own references to columns
			for (const cons of this.CONSTRAINTS) {
				if (cons instanceof CheckConstraint) continue;
				const targetList = cons.$COLUMNS.length ? cons.$COLUMNS : cons.COLUMNS;
				const index = targetList.indexOf(col.NAME);
				if (index > -1) {
					if (altType === 'DOWN') targetList.splice(index, 1);
					else if (altType === 'RENAME') targetList[index] = col.$NAME;
				};
			}
			// TODO: Check with all tables and call updateColumnReferences() on them
		}
		this.altsCascaded = true;
		return this;
	}

	/**
	 * @inheritdoc
	 */
	updateDatabaseReferences(db, altType) {
		// A database was dropped or renamed. We check with our own references to databases
		for (const node of this.NODES) {
			if (!(node instanceof ColumnForeignKey)) continue;
			if (node.targetTable().basename() !== db.NAME) continue;
			if (altType === 'DOWN') node.drop();
			else if (altType === 'RENAME') node.targetTable().basename(db.$NAME);
		}
	}

	/**
	 * @inheritdoc
	 */
	updateTableReferences(tbl, altType) {
		// A table was dropped or renamed. We check with our own references to tables
		for (const node of this.NODES) {
			if (!(node instanceof ColumnForeignKey)) continue;
			if (node.targetTable().basename() && tbl.basename() && node.targetTable().basename() !== tbl.basename()) continue;
			if (node.targetTable().name() === tbl.NAME) {
				if (altType === 'DOWN') node.drop();
				else if (altType === 'RENAME') node.targetTable().name(tbl.$NAME);
			};
		}
	}

	/**
	 * @inheritdoc
	 */
	updateColumnReferences(col, altType) {
		// A column somewhere was dropped or renamed. We check with our own references to columns
		for (const node of this.NODES) {
			if (!(node instanceof ColumnForeignKey)) continue;
			if (node.targetTable().basename() && col.$trace('get:name:database') && node.targetTable().basename() !== col.$trace('get:name:database')) continue;
			if (node.targetTable().name() !== col.$trace('get:table:name')) continue;
			const targetList = cons.$TARGET_COLUMNS.length ? cons.$TARGET_COLUMNS : cons.TARGET_COLUMNS;
			const index = targetList.indexOf(col.NAME);
			if (index > -1) {
				if (altType === 'DOWN') targetList.splice(index, 1);
				else if (altType === 'RENAME') targetList[index] = col.$NAME;
			};
		}
	}

	/**
	 * @inheritdoc
	 */
	toJson() {
        return {
            columns: this.COLUMNS.map(column => column.toJson()),
            constraints: this.CONSTRAINTS.map(constraint => constraint.toJson()),
            indexes: this.INDEXES.map(index => index.toJson()),
			...super.toJson(),
        }
    }

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (!Array.isArray(json?.columns) || ['constraints', 'indexes'].some(key => key in json && !Array.isArray(json[key]))) return;
		return super.fromJson(context, json, () => {
			const instance = new this(context);
			for (const col of json.columns) instance.column(col);
			for (const cons of (json.constraints || [])) instance.constraint(cons);
			for (const idx of (json.indexes || [])) instance.index(idx);
			return instance;
		});
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const defs = [ this.COLUMNS.map(col => col.stringify()).join(',\n\t') ];
		const constraints = this.CONSTRAINTS.slice(0);
		const indexes = this.INDEXES.slice(0);
		if (this.params.dialect === 'mysql') {
			constraints.push(...this.COLUMNS.reduce((constraints, col) => {
				const constraint = col.foreignKey();
				if (constraint) return constraints.concat(TableForeignKey.fromJson(this, constraint.toJson()).columns([col.name()]));
				return constraints;
			}, []));
		}
		if (constraints.length) { defs.push(constraints.map(cnst => cnst.stringify()).join(',\n\t')); }
		if (indexes.length) { defs.push(indexes.map(ndx => ndx.stringify()).join(',\n\t')); }
		let name = this.name();
		if (!name.BASENAME) {
			const namespace = this.$trace('get:name:database');
			name = name.clone().name([namespace,name.NAME]);
		}
		return `${ name } (\n\t${ defs.join(',\n\t') }\n)`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ namePart, bodyPart, ...rest ] = Lexer.split(expr, [], { limit: 2 });
		if (!namePart || !_wrapped(bodyPart || '', '(', ')')) return;
		const instance = new this(context);
		instance.name(parseCallback(instance, namePart.trim(), [Identifier]));
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
}