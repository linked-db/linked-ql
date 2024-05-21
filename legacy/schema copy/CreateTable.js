
/**
 * @imports
 */
import Lexer from '@webqit/util/str/Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import CreateInterface from './CreateInterface.js';
import TableLevelConstraint from './TableLevelConstraint.js';
import Index from './Index.js';
import Column from './Column.js';

/**
 * ---------------------------
 * CreateTable class
 * ---------------------------
 */				

export default class CreateTable extends CreateInterface {
	 
	/**
	 * @inheritdoc
	 */
	constructor(name, database, columns, constraints, indexes, params = {}) {
		super();
		this.name = name;
		this.database = database;
		this.columns = columns;
		this.constraints = constraints;
		this.indexes = indexes;
		this.params = params;
	}
	
	/**
	 * @inheritdoc
	 */
	async eval() {}

	/**
	 * @inheritdoc
	 */
	toJson() {
        const json = {
            name: this.name,
			database: this.database,
            columns: this.columns.map(column => column.toJson()),
            constraints: this.constraints.map(constraint => constraint.toJson()),
            indexes: this.indexes.map(index => index.toJson())
        }
        return json;
    }
	
	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		const defs = [ this.columns.map(col => col.stringify()).join(',\n\t') ];
		const constraints = this.constraints.slice(0);
		if (this.params.dialect === 'mysql') {
			constraints.push(...this.columns.reduce((constraints, col) => {
				const constraint = col.constraints.find(c => c.attribute === 'REFERENCES');
				if (constraint) return constraints.concat(TableLevelConstraint.fromColumnLevelConstraint(constraint, col.name));
				return constraints;
			}, []));
		}
		if (constraints.length) { defs.push(constraints.map(cnst => cnst.stringify()).join(',\n\t')); }
		if (this.indexes.length) { defs.push(this.indexes.map(ndx => ndx.stringify()).join(',\n\t')); }
		return `CREATE TABLE${ this.params.ifNotExists ? ' IF NOT EXISTS' : '' } ${ this.database ? `${ this.database }.` : `` }${ this.name } (\n\t${ defs.join(',\n\t') }\n)`;
	}
	
	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		if (expr.trim().substr(0, 6).toLowerCase() !== 'create') return;
		const [ create, body, other ] = Lexer.split(expr, [], { limit: 2 });
		const [ , ifNotExists, dbName, tblName ] = /CREATE[ ]+TABLE[ ]+(IF[ ]+NOT[ ]+EXISTS[ ]+)?(?:(\w+)\.)?(\w+)/i.exec(create) || [];
		if (!tblName) return;
		const defs = await Promise.all(Lexer.split(_unwrap(body, '(', ')'), [',']).map(def => {
			return parseCallback(def.trim(), [TableLevelConstraint, Index, Column], { database: dbName, ...params }); // Note that Column must come last
		}));
		const [ columns, constraints, indexes ] = defs.reduce(([columns, constraints, indexes], def) => {
			if (def instanceof TableLevelConstraint) return [columns, constraints.concat(def), indexes];
			if (def instanceof Index) return [columns, constraints, indexes.concat(def)];
			return [columns.concat(def), constraints, indexes];
		}, [[], [], []]);
		if (ifNotExists) { params = { ...params, ifNotExists: true }; }
		return new this(tblName, dbName, columns, constraints, indexes, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.name || !json.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain table name or table name invalid.`);
		// Lists
		const $params = { database: json.database, ...params };
		const columns = json.columns.map(column => Column.fromJson(column, $params));
		const constraints = json.constraints?.map(constraint => TableLevelConstraint.fromJson(constraint, $params)) || [];
		const indexes = json.indexes?.map(index => Index.fromJson(index, $params)) || [];
		// Instance
		return new this(json.name, json.database || params.database, columns, constraints, indexes, params);
	}
	
	/**
	 * @inheritdoc
	 */
	static cloneSchema(json) {
		const jsonClone = structuredClone(json);
		// ----------------
		const rebase = (obj, key) => {
			const value = obj[key];
			Object.defineProperty(obj, `$${ key }`, { get: () => value, configurable: true });
		};
		rebase(jsonClone, 'name');
		for (const column of jsonClone.columns || []) {
			for (const type of ['primaryKey', 'references', 'uniqueKey', 'check']) { column[type] && rebase(column[type], 'constraintName'); }
			rebase(column, 'name');
		}
		for (const constraint of jsonClone.constraints || []) { rebase(constraint, 'constraintName'); }
		for (const index of jsonClone.indexes || []) { rebase(index, 'indexName'); }
		// ----------------
		const redefine = (obj, key, nameKey) => {
			const arr = obj[key];
			Object.defineProperty(obj, key, { get() { return arr; } });
			Object.defineProperties(arr, {
				get: { value: name => arr.find(x => x[nameKey] === name), configurable: true },
				has: { value: name => arr.get(name) ? true : false, configurable: true },
				delete: { value: name => arr.splice(arr.findIndex(x => x[nameKey] === name), 1), configurable: true },
			});
		};
		redefine(jsonClone, 'columns', 'name');
		redefine(jsonClone, 'constraints', 'constraintName');
		redefine(jsonClone, 'indexes', 'indexName');
		// ----------------
		return jsonClone;
	}

}