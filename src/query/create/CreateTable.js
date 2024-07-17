
import Lexer from '../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import AlterTable from '../alter/AlterTable.js';
import AbstractStatementNode from './abstracts/AbstractStatementNode.js';
import AbstractConstraint from './constraints/AbstractConstraint.js';
import ForeignKey1 from './constraints/ForeignKey1.js';
import PrimaryKey2 from './constraints/PrimaryKey2.js';
import ForeignKey2 from './constraints/ForeignKey2.js';
import UniqueKey2 from './constraints/UniqueKey2.js';
import Check from './constraints/Check.js';
import Column from './Column.js';
import Index from './Index.js';		

export default class CreateTable extends AbstractStatementNode {

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
	static CONSTRAINT_TYPES = [PrimaryKey2,ForeignKey2,UniqueKey2,Check];

    /**
	 * @inheritdoc
	 */
    connectedNodeCallback(node) {
		if ([Column, AbstractConstraint, Index].some(x => node instanceof x)) this.NODES.add(node);
	}

    /**
     * PRIMARY_KEY
     */
    primaryKey() {
		return this.CONSTRAINTS.find(cons => cons.TYPE === 'PRIMARY_KEY') 
		|| this.COLUMNS.reduce((pk, col) => pk || col.primaryKey(), null);
 	}

	/**
	 * Returns a column or adds a column to the schema,
	 * 
	 * @param String|Column column
	 * 
	 * @returns Any
	 */
	column(column) {
		if (typeof column === 'string') return this.COLUMNS.find(col => col.name() === column);
		return (this.build('COLUMNS', [column], Column), this);
	}

	/**
	 * Returns a constraint or adds a constraint to the schema,
	 * 
	 * @param String|PrimaryKey2,ForeignKey2,UniqueKey2,Check constraint
	 * 
	 * @returns Any
	 */
	constraint(constraint) {
		if (typeof constraint === 'string') return this.CONSTRAINTS.find(cons => cons.name() === constraint);
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
		if (typeof index === 'string') return this.INDEXES.find(idx => idx.name() === index);
		return (this.build('INDEXES', [index], Index), this);
	}

	/**
	 * Apply changes to this schema.
	 * 
	 * @param AlterTable altInstance
	 * 
	 * @returns this
	 */
	alterWith(altInstance) {
		// -----
		const getNode = (reference, ifExists = false) => {
			const node = this.NODES.find(node => {
				return (reference.kind === 'COLUMN' ? node instanceof Column : (reference.kind === 'CONSTRAINT' ? node instanceof AbstractConstraint : node.TYPE === reference.kind/* constraint or index */))
				&& (!reference.name ? reference.kind === 'PRIMARY_KEY'/* mysql only */ : node.NAME === reference.name)
			});
			if (!node && !ifExists) throw new Error(`${ reference.kind }${ reference.name ? ` "${ reference.name }"` : '' } does not exist.`);
			return node;
		}
		// -----
		for (const action of altInstance.ACTIONS) {
			if (action.TYPE === 'RENAME') {
				this.name(action.ARGUMENT);
			} else if (action.TYPE === 'MOVE') {
				this.basename(action.ARGUMENT);
			} else if (action.TYPE === 'DROP') {
				const node = getNode(action.ARGUMENT, action.hasFlag('IF_EXISTS'));
				node?.drop();
			} else if (action.TYPE === 'NEW') {
				if (action.ARGUMENT instanceof AbstractConstraint) {
					if (action.ARGUMENT.COLUMNS.length === 1) {
						getNode({ kind: 'COLUMN', name: action.ARGUMENT.COLUMNS[0] }).constraint(action.ARGUMENT.TYPE, action.ARGUMENT.toJson());
					} else this.constraint(action.ARGUMENT.toJson());
				} else if (action.ARGUMENT instanceof Index) {
					this.index(action.ARGUMENT.toJson());
				} else if (!action.hasFlag('IF_NOT_EXISTS') || !getNode({ kind: 'COLUMN', name: action.ARGUMENT.NAME }, true)) {
					this.column(action.ARGUMENT.toJson());
				}
			} else if (action.TYPE === 'CHANGE') {
				const node = getNode(action.REFERENCE);
				if (action.ARGUMENT.name() !== node.name()) node.hardSet(action.ARGUMENT.name(), val => node.name(val));
				node.hardSet(action.ARGUMENT.type().toJson(), val => node.type(val));
				for (const cons of action.ARGUMENT.CONSTRAINTS.filter(cons => !['PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK'].includes(cons.TYPE))) {
					const existing = node.constraint(cons.TYPE);
					if (existing) {
						existing.detail(cons.DETAIL);
					} else node.constraint(cons.toJson());
				}
			} else if (action.TYPE === 'ALTER') {
				const { REFERENCE: reference, ARGUMENT: subAction } = action;
				const node = getNode(reference, action.hasFlag('IF_EXISTS'));
				if (!node) continue;
				if (subAction.TYPE === 'RENAME') {
					node.name(subAction.ARGUMENT);
				} else if (subAction.TYPE === 'SET' && subAction.ARGUMENT instanceof DataType) {
					node.type(subAction.ARGUMENT.toJson());
				} else if (Column.CONSTRAINT_TYPES.some(Type => subAction.ARGUMENT instanceof Type)) {
					const existing = node.constraint(subAction.ARGUMENT.TYPE);
					if (subAction.ARGUMENT.TYPE === 'IDENTITY') {
						if (subAction.TYPE === 'SET' && !existing) throw new Error(`IDENTITY constraint has not been created in ${ node.NAME }`);
						if (subAction.TYPE === 'NEW' && existing) throw new Error(`IDENTITY constraint already exists in ${ node.NAME }`);
					} else if (subAction.ARGUMENT.TYPE === 'EXPRESSION' && subAction.TYPE !== 'DROP') {
						throw new Error(`Cannot add EXPRESSION constraint after column creation`);
					}
					if (existing) {
						existing.detail(subAction.ARGUMENT.DETAIL);
					} else node.constraint(subAction.ARGUMENT.toJson());
				} else if (subAction.TYPE === 'DROP' && ['IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT_NULL'].includes(subAction.ARGUMENT)) {
					const existing = node.constraint(subAction.ARGUMENT);
					if (existing) existing.drop();
					else if(!action.hasFlag('IF_EXISTS')/* Postgres IDENTITY|EXPRESSION */) throw new Error(`Cannot drop ${ subAction.ARGUMENT }; does not exist.`);
				} else if (['CONSTRAINT','INDEX'].includes(reference.kind)) ;
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	getAlt() {
		const instance = (new AlterTable(this.CONTEXT)).name(this.NAME).basename(this.BASENAME);
		if (this.$NAME && this.NAME && this.$NAME !== this.NAME) {
			instance.addRename(this.$NAME);
		}
		if (this.$BASENAME && this.BASENAME && this.$BASENAME !== this.BASENAME) {
			instance.addMove(this.$BASENAME);
		}
		const constraintDirty = (cons, includingName = false) => (cons.keep() !== true || ['$EXPR','$ALWAYS','$TARGET_TABLE','$TARGET_COLUMNS','$MATCH_RULE','$UPDATE_RULE','$DELETE_RULE'].concat(includingName ? '$NAME' : []).some(k => /*exists*/k in cons && /*not empty*/(Array.isArray(cons[k]) ? cons[k].length : ![undefined, null].includes(cons[k])) && /*different*/!isSame(cons[k.slice(1)], cons[k])));
		for (const col of this.COLUMNS) {
			const columnRef = { kind: 'COLUMN', name: col.NAME };
			if (col.keep() === true) {
				if (this.params.dialect === 'mysql') {
					// // Column name or type changed, or these attrs changed? Use MySQL CHANGE clause?
					if ((col.$TYPE && !isSame(col.$TYPE.toJson(), col.TYPE.toJson()))
					|| (col.CONSTRAINTS.some(cons => ['AUTO_INCREMENT', 'EXPRESSION', 'NOT_NULL'].includes(cons.TYPE) && constraintDirty(cons, true)))) {
						const columnClone = col.clone();
						columnClone.CONSTRAINTS = columnClone.CONSTRAINTS.filter(cons => ['AUTO_INCREMENT', 'EXPRESSION', 'NOT_NULL', 'DEFAULT'].includes(cons.TYPE));
						instance.addChange(columnRef, columnClone);
					} else {
						const consDefault = col.CONSTRAINTS.find(cons => cons.TYPE === 'DEFAULT' && constraintDirty(cons, true));
						if (consDefault) instance.addAlt(columnRef, a => consDefault.keep() === false ? a.drop(consDefault.TYPE) : a.set(consDefault));
						// Column rename? Must come last!!!
						if (col.$NAME && col.$NAME !== col.NAME) {
							instance.addAlt({ kind: 'COLUMN', name: col.NAME }, a => a.rename(col.$NAME) );
						}
					}
				} else {
					// Column type change?
					if (col.$TYPE && !isSame(col.$TYPE.toJson(), col.TYPE.toJson())) {
						instance.addAlt(columnRef, a => a.set(col.$TYPE) );
					}
					// Constraints level1 changed?
					const constraints1 = col.CONSTRAINTS.filter(cons => ['IDENTITY', 'EXPRESSION', 'NOT_NULL', 'DEFAULT'].includes(cons.TYPE) && constraintDirty(cons, true));
					for (const cons of constraints1) {
						if (cons.keep() === true && cons.TYPE === 'IDENTITY') instance.addAlt(columnRef, a => a.drop('IDENTITY'));
						if (cons.keep() !== false && cons.TYPE === 'EXPRESSION') throw new Error('EXPRESSION constraints cannot be added or modified after column creation.');
						instance.addAlt(columnRef, a => cons.keep() === false ? a.drop(cons.TYPE) : a[cons.TYPE === 'IDENTITY' ? 'new' : 'set'](cons));
					}
					// Column rename? Must come last!!!
					if (col.$NAME && col.$NAME !== col.NAME) {
						instance.addAlt({ kind: 'COLUMN', name: col.NAME }, a => a.rename(col.$NAME) );
					}
				}
				// Constraints level2 changed?
				const constraints2 = col.CONSTRAINTS.filter(cons => ['PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE_KEY', 'CHECK'].includes(cons.TYPE));
				for (const cons of constraints2) {
					if (constraintDirty(cons)) {
						if ([true, false].includes(cons.keep())) instance.addDrop({ kind: cons.TYPE, name: cons.NAME });
						if (cons.keep() !== false) instance.addNew(CreateTable.CONSTRAINT_TYPES.find(Type => Type.TYPE === cons.TYPE).fromJson(instance, { ...cons.toJson(), columns: [col.statementNode.altsCascaded ? col.name() : col.NAME] }));
					} else if (cons.keep() === true && cons.$NAME && cons.$NAME !== cons.NAME) {
						instance.addAlt({ kind: 'CONSTRAINT', name: cons.NAME }, a => a.rename(cons.$NAME) );
					}
				}
				continue;
			}
			// DROP COLUMN?
			if (col.keep() === false) {
				instance.addDrop(columnRef);
				continue;
			}
			// ADD COLUMN
			instance.addNew(Column.fromJson(instance, col.toJson()));
		}
		const tableLevlConstraintDirty = cons => constraintDirty(cons) || (cons.$COLUMNS?.length && !isSame(cons.$COLUMNS, cons.COLUMNS));
		for (const cons of this.CONSTRAINTS) {
			if (tableLevlConstraintDirty(cons)) {
				if ([true, false].includes(cons.keep())) instance.addDrop({ kind: cons.TYPE, name: cons.NAME });
				if (cons.keep() !== false) instance.addNew(CreateTable.CONSTRAINT_TYPES.find(Type => Type.TYPE === cons.TYPE).fromJson(instance, cons.toJson()));
			} else if (cons.keep() === true && cons.$NAME && cons.$NAME !== cons.NAME) {
				instance.addAlt({ kind: 'CONSTRAINT', name: cons.NAME }, a => a.rename(cons.$NAME) );
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
		const getAltType = node => node.dropped() ? 'DOWN' : (node.$NAME && node.$NAME !== node.NAME ? 'RENAME' : null);
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
				if (cons instanceof Check) continue;
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
			if (!(node instanceof ForeignKey1)) continue;
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
			if (!(node instanceof ForeignKey1)) continue;
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
			if (!(node instanceof ForeignKey1)) continue;
			if (node.targetTable().basename() && col.statementNode/* tbl */.basename() && node.targetTable().basename() !== col.statementNode/* tbl */.basename()) continue;
			if (node.targetTable().name() !== col.statementNode/* tbl */.name()) continue;
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
				if (constraint) return constraints.concat(ForeignKey2.fromJson(this, constraint.toJson()).columns([col.name()]));
				return constraints;
			}, []));
		}
		if (constraints.length) { defs.push(constraints.map(cnst => cnst.stringify()).join(',\n\t')); }
		if (indexes.length) { defs.push(indexes.map(ndx => ndx.stringify()).join(',\n\t')); }
		const basename = this.basename() || (this.CONTEXT instanceof this.constructor.Node ? this.CONTEXT.NAME/* DB won't have actually been renamed */ : this.CONTEXT?.name);
		return `CREATE TABLE${ this.hasFlag('IF_NOT_EXISTS') ? ' IF NOT EXISTS' : '' } ${ this.autoEsc([basename, this.name()].filter(s => s)).join('.') } (\n\t${ defs.join(',\n\t') }\n)`;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, ifNotExists, rest ] = /^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const [ namePart, bodyPart ] = Lexer.split(rest, [], { limit: 2 });
		const [tblName, dbName] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!tblName) return;
		const instance = (new this(context))
			.name(tblName)
			.basename(dbName);
		if (ifNotExists) instance.withFlag('IF_NOT_EXISTS');
		const defs = Lexer.split(_unwrap(bodyPart, '(', ')'), [',']).map(def => {
			return parseCallback(instance, def.trim(), [PrimaryKey2,ForeignKey2,UniqueKey2,Check,Index,Column]); // Note that Column must come last
		});
		for (const def of defs) {
			if (def instanceof Column) instance.column(def);
			else if (def instanceof Index) instance.index(def);
			else instance.constraint(def);
		}
		return instance;
	}
}

/**
 * 
 * @param Any a 
 * @param Any b 
 * @returns 
 */
function isSame(a, b) {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
		const $b = b.slice(0).sort();
		return a.slice(0).sort().every((x, i) => isSame(x, $b[i]));
	}
	const temp = {};
	if (typeof a === 'object' && a && typeof b === 'object' && b && (temp.keys_a = Object.keys(a)).length === (temp.keys_b = Object.keys(b)).length) {
		return temp.keys_a.reduce((prev, k) => prev && isSame(a[k], b[k]), true);
	}
	return false;
}