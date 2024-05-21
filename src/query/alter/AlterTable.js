
import Lexer from '../Lexer.js';
import { _isObject, _isFunction } from '@webqit/util/js/index.js';
import StatementNode from '../abstracts/StatementNode.js';
import CreateTable from '../create/CreateTable.js';
import TableLevelConstraint from '../create/TableLevelConstraint.js';
import ColumnLevelConstraint from '../create/ColumnLevelConstraint.js';
import DataType from '../create/DataType.js';
import Column from '../create/Column.js';
import Index from '../create/Index.js';
import Action from './Action.js';

export default class AlterTable extends StatementNode {

	/**
	 * Instance properties
	 */
	NAME = '';
	BASENAME = '';
	JSON_BEFORE = {};
	ACTIONS = [];
	
	/**
	 * @constructor
	 */
	constructor(context, name, basename = null, jsonBefore = {}) {
		super(context);
		this.NAME = name;
		this.BASENAME = basename;
		this.JSON_BEFORE = jsonBefore;
	}

	/**
	 * Sets the name
	 * 
	 * @param Array|String name
	 * 
	 * @returns Void
	 */
	name(name) {
		const nameParts = Array.isArray(name) ? [...name] : [name];
		this.NAME = nameParts.pop();
		this.BASENAME = nameParts.pop();
		if (nameParts.length) throw new Error(`Idents can be maximum of two parts. Recieved: ${ nameParts.reverse().join('.') }.${ this.BASENAME }.${ this.NAME }`);
	}

	/**
	 * Adds a "RENAME" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns Action
	 */
	renameTo(newName) { return this.build('ACTIONS', [newName], Action, 'renameTo'); }

	/**
	 * Adds a "RELOCATE" action to the instance,
	 * 
	 * @param String newName
	 * 
	 * @returns Action
	 */
	relocateTo(newDb) { return this.build('ACTIONS', [newDb], Action, 'relocateTo'); }

	/**
	 * Adds a "DROP" action to the instance,
	 * 
	 * @param Object argument
	 * 
	 * @returns Action
	 */
	drop(argument) { return this.build('ACTIONS', [argument], Action, 'drop'); }

	/**
	 * Adds a "ADD" action to the instance,
	 * 
	 * @param Object argument
	 * 
	 * @returns this
	 */
	add(argument) { return this.build('ACTIONS', [argument], Action, 'add'); }

	/**
	 * Adds a "ALTER" action to the instance,
	 * 
	 * @param Object reference
	 * 
	 * @returns Action
	 */
	alter(reference, argument) { return this.build('ACTIONS', [reference, argument], Action, 'alter'); }

	/**
	 * @inheritdoc
	 */
	toJson() {
		return {
			name: this.NAME,
			basename: this.BASENAME,
			jsonBefore: this.JSON_BEFORE,
			actions: this.ACTIONS.map(action => action.toJson()),
			flags: this.FLAGS,
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, json) {
		if (typeof json?.name !== 'string' || !Array.isArray(json.actions)) return;
		const instance = (new this(context, json.name, json.basename, json.jsonBefore)).withFlag(...(json.flags || []));
		for (const action of json.actions) {
			instance.ACTIONS.push(Action.fromJson(instance, action));
		}
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		if (!this.ACTIONS.length) return '';
		const stmts0 = [], stmts1 = [];
		for (const action of this.ACTIONS) {
			// RENAME TO...
			if (action.TYPE === 'RENAME') {
				stmts0.push(`RENAME TO ${ this.autoEsc(action.ARGUMENT) }`);
				continue;
			}
			// RELOCATE TO...
			if (action.TYPE === 'RELOCATE') {
				stmts0.push(`SET SCHEMA ${ this.autoEsc(action.ARGUMENT) }`);
				continue;
			}
			// DROP
			if (action.TYPE === 'DROP') {
				const ifExists = action.hasFlag('IF_EXISTS');
				const $flags = (action.FLAGS?.join(' ') || '').match(/RESTRICT|CASCADE/i) || [];
				const nodeKind = action.ARGUMENT instanceof TableLevelConstraint ? 'CONSTRAINT' : (action.ARGUMENT instanceof Index ? 'INDEX' : 'COLUMN');
				if (this.params.dialect === 'mysql' && nodeKind === 'CONSTRAINT' && action.ARGUMENT.CONSTRAINT_NAME === 'PRIMARY') {
					stmts1.push(`DROP PRIMARY KEY`);
				} else {
					const nameKey = nodeKind === 'CONSTRAINT' ? 'CONSTRAINT_NAME' : (nodeKind === 'INDEX' ? 'INDEX_NAME' : 'NAME');
					stmts1.push(`DROP ${ this.params.dialect === 'mysql' && nodeKind === 'CONSTRAINT' && action.ARGUMENT.TYPE/* being a table-level constraint */ === 'FOREIGN_KEY' ? 'FOREIGN KEY' : nodeKind }${ ifExists ? ' IF EXISTS' : '' } ${ this.autoEsc(action.ARGUMENT[nameKey]) }${ $flags.length ? ` ${ $flags[0] }` : '' }`);
				}
				continue;
			}
			// ADD
			if (action.TYPE === 'ADD') {
				const ifNotExists = action.hasFlag('IF_NOT_EXISTS');
				const [ , first, afterCol ] = /(FIRST)|AFTER\s+(\w+)/i.exec(action.FLAGS?.join(' ') || '') || [];
				stmts1.push(`ADD ${ action.ARGUMENT instanceof Column ? `COLUMN ` : '' }${ ifNotExists ? 'IF NOT EXISTS ' : '' }${ action.ARGUMENT }${ first ? ' FIRST' : (afterCol ? ` AFTER ${ afterCol.toLowerCase() }` : '') }`);
				if (this.params.dialect === 'mysql' && action.ARGUMENT instanceof Column) {
					const constraint = action.ARGUMENT.CONSTRAINTS.find(c => c.TYPE === 'FOREIGN_KEY');
					if (constraint) stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(constraint, action.ARGUMENT.NAME) }`);
				}
				continue;
			}
			// ALTER
			if (action.TYPE === 'ALTER') {
				// Handle columns specially
				const { REFERENCE:reference, ARGUMENT:subAction } = action;
				// RENAME
				if (subAction.TYPE === 'RENAME') {
					stmts1.push(`RENAME ${ reference.kind } ${ this.autoEsc(reference.name) } TO ${ this.autoEsc(subAction.ARGUMENT) }`);
					continue;
				}
				if (reference.kind === 'COLUMN') {
					const asTableLevelConstraint = () => {								
						if (subAction.TYPE === 'ADD') {
							stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(subAction.ARGUMENT, reference.name) }`);
						} else {
							let dropStatement = dropTarget => `DROP CONSTRAINT ${ this.autoEsc(dropTarget.CONSTRAINT_NAME) }`;
							if (this.params.dialect === 'mysql' && ['PRIMARY_KEY', 'FOREIGN_KEY'].includes(dropTarget.TYPE)) {
								dropStatement = dropTarget => dropTarget.TYPE === 'PRIMARY_KEY' ? `DROP PRIMARY KEY` : `DROP FOREIGN KEY ${ this.autoEsc(dropTarget.CONSTRAINT_NAME) }`;
							}
							if (subAction.TYPE === 'DROP') {
								stmts1.push(dropStatement(subAction.ARGUMENT));
							} else if (subAction.TYPE === 'SET') {
								stmts1.push(dropStatement({ TYPE: subAction.ARGUMENT.TYPE, CONSTRAINT_NAME: reference.name })); // We process DROP first, then ADD
								stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(subAction.ARGUMENT, reference.name) }`);
							}
						}
					};
					const asLiterals = () => {
						stmts1.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } ${ subAction.TYPE } ${ subAction.ARGUMENT }`);
					};
					if (this.params.dialect === 'mysql') {
						if (subAction.ARGUMENT instanceof ColumnLevelConstraint) {
							if (subAction.ARGUMENT.TYPE === 'DEFAULT') {
								stmts1.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } ${ subAction.TYPE === 'DROP' ? 'DROP' : 'SET' } ${ subAction.ARGUMENT }`);
							} else if (['PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE'].includes(subAction.ARGUMENT.TYPE)) {
								asTableLevelConstraint();
							} else {
								asLiterals();
							}
						} else {
							asLiterals();
						}
					} else {
						if (subAction.ARGUMENT instanceof DataType) {
							stmts1.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } SET DATA TYPE ${ subAction.ARGUMENT }`);
						} else if (subAction.ARGUMENT instanceof ColumnLevelConstraint) {
							if (['IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT_NULL'].includes(subAction.ARGUMENT.TYPE)) {
								if (subAction.TYPE === 'DROP' || (subAction.ARGUMENT.TYPE === 'IDENTITY' && subAction.TYPE === 'SET')) {
									stmts1.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } DROP ${ subAction.ARGUMENT.TYPE.replace(/_/, ' ') }${ subAction.TYPE === 'DROP' && ['IDENTITY', 'EXPRESSION'].includes(subAction.ARGUMENT.TYPE) && action.FLAGS?.includes('IF_EXISTS') ? ` IF EXISTS` : '' }`);
								}
								if (['ADD', 'SET'].includes(subAction.TYPE) && subAction.ARGUMENT.TYPE !== 'EXPRESSION'/* Can't add a generated expression to a column after definition */) {
									stmts1.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } ${ subAction.ARGUMENT.TYPE === 'IDENTITY' ? 'ADD' : 'SET' } ${ subAction.ARGUMENT }`);
								}
							} else if (['PRIMARY_KEY', 'FOREIGN_KEY', 'UNIQUE', 'CHECK'].includes(subAction.ARGUMENT.TYPE)) {
								asTableLevelConstraint();
							} else {
								asLiterals();
							}
						} else {
							asLiterals();
						}
					}
					continue;
				}
				if (typeof subAction.ARGUMENT === 'string') {
					stmts1.push(`ALTER ${ reference.kind } ${ this.autoEsc(reference.name) } ${ subAction.ARGUMENT }`);
					continue;
				}
				// From constraints diffing
				let dropStatement = `DROP ${ reference.kind } ${ this.autoEsc(reference.name) }`;
				if (this.params.dialect === 'mysql' && ['PRIMARY_KEY', 'FOREIGN_KEY'].includes(subAction.ARGUMENT.TYPE/* being a table-level constraint */)) {
					dropStatement = subAction.ARGUMENT.TYPE === 'PRIMARY_KEY' ? `DROP PRIMARY KEY` : `DROP FOREIGN KEY ${ this.autoEsc(reference.name) }`;
				}
				stmts1.push(dropStatement, `ADD ${ subAction.ARGUMENT }`);
				continue;
			}
		}
		return `ALTER TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([this.BASENAME, this.NAME].filter(s => s)).join('.') }\n\t${ [...stmts1, ...stmts0].join(',\n\t') }`;
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, ifExists, rest ] = /^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const [ namePart, bodyPart ] = Lexer.split(rest, ['\\s+'], { useRegex: true, limit: 1 });
		const [tblName, dbName] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!tblName) return;
		const instance = new this(context, tblName, dbName || context/*Database*/?.name);
		if (ifExists) instance.withFlag('IF_EXISTS');
		// ----------
		const regex = name => new RegExp(`${ this[ name ].source }`, 'i');
		const stmts = Lexer.split(bodyPart, [',']).map(s => s.trim());
		for (const stmt of stmts) {
			// RENAME ... TO ...
			const [ renameMatch, nodeKind_a, nodeNameUnescaped_a, /*esc*/, nodeNameEscaped_a, newNodeNameUnescaped_a, /*esc*/, newNodeNameEscaped_a ] = regex('renameRe').exec(stmt) || [];
			if (renameMatch) {
				const nodeName = nodeNameUnescaped_a || this.autoUnesc(instance, nodeNameEscaped_a);
				const newNodeName = newNodeNameUnescaped_a || this.autoUnesc(instance, newNodeNameEscaped_a);
				if (nodeName) {
					const nodeKind = /KEY|INDEX/i.test(nodeKind_a) ? 'INDEX' : nodeKind_a.toUpperCase();
					const reference = { kind: nodeKind, name: nodeName };
					instance.alter(reference, a => a.renameTo(newNodeName));
				} else {
					instance.renameTo(newNodeName);
				}
				continue;
			}
			// RELOCATE ... TO ...
			const [ relocateMatch, newSchemaUnescaped, /*esc*/, newSchemaEscaped ] = regex('relocateRe').exec(stmt) || [];
			if (relocateMatch) {
				instance.relocateTo(newSchemaUnescaped || this.autoUnesc(instance, newSchemaEscaped));
				continue;
			}
			// DROP
			const [ dropMatch, nodeKind_b = 'COLUMN', ifExists_b/* postgresql-specific */, nodeNameUnescaped_b, /*esc*/, nodeNameEscaped_b, flags_b/* postgresql-specific */ ] = regex('dropRe').exec(stmt) || [];
			if (dropMatch) {
				const nodeKind = /CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|CHECK/i.test(nodeKind_b) ? 'CONSTRAINT' : (/INDEX|KEY/i.test(nodeKind_b) ? 'INDEX' : 'COLUMN');
				const nodeName = nodeNameUnescaped_b || this.autoUnesc(instance, nodeNameEscaped_b) || nodeKind_b.trim().replace(/\s+KEY/i, '').toUpperCase()/* when, in mysql, it's just: drop PRIMARY KEY */;
				const argument = nodeKind === 'CONSTRAINT' ? new TableLevelConstraint(instance, nodeName, nodeKind_b.trim().toUpperCase(), []/*columns*/, null) : (
					nodeKind === 'INDEX' ? new Index(instance, nodeName, nodeKind_b.trim().toUpperCase(), []/*columns*/) : new Column(instance, nodeName, null, [])
				);
				const flags = [ifExists_b, flags_b].filter(s => s).map(s => s.trim().replace(/\s+/g, '_').toUpperCase());
				instance.drop(argument).withFlag(...flags);
				continue;
			}
			// ADD
			const [ addMatch, columnKeyword_c, ifColumnNotExists_c, spec_c ] = regex('addRe').exec(stmt) || [];
			if (addMatch) {
				const [ , $spec, $flags ] = spec_c.match(/([\s\S]+)\s+(FIRST|AFTER\s+.+)$/i) || [ , spec_c ];
				const argument = parseCallback(instance, $spec.trim(), columnKeyword_c ? [Column] : [TableLevelConstraint,Index,Column]); // Note that Column must come last
				const flags = [ifColumnNotExists_c, $flags].filter(s => s).map(s => s.trim().replace(/\s+/g, '_').toUpperCase());
				instance.add(argument).withFlag(...flags);
				continue;
			}
			// ALTER
			const [ alterMatch, nodeKind_d, nodeNameUnescaped_d, /*esc*/, nodeNameEscaped_d, subAction_d = '', argument_d = '', ifNodeExits_d, constraintOrIndexAttr_d ] = regex('alterRe').exec(stmt) || [];
			if (alterMatch) {
				const nodeName = nodeNameUnescaped_d || this.autoUnesc(instance, nodeNameEscaped_d);
				const nodeKind = /CONSTRAINT|CHECK/i.test(nodeKind_d) ? 'CONSTRAINT' : (/INDEX|KEY/i.test(nodeKind_d) ? 'INDEX' : 'COLUMN');
				let subAction = subAction_d.toUpperCase() || 'SET', flags = ifNodeExits_d ? ['IF_EXISTS'] : [], $ = {};
				let argumentNew;
				// Is column data type?
				if (subAction.endsWith('TYPE')) {
					argumentNew = parseCallback(instance, argument_d, [DataType]);
					subAction = 'SET';
				}
				// Is column constraint?
				else if ($.argument = parseCallback(instance, argument_d, [ColumnLevelConstraint], { assert: false })) {
					argumentNew = $.argument;
				}
				// Is SET|DROP|ADD flag?
				else if (subAction_d/*NOTE: original*/) {
					argumentNew = argument_d;
				}
				// Is just flag?
				else {
					argumentNew = constraintOrIndexAttr_d;
				}
				// Push
				const reference = { kind: nodeKind, name: nodeName };
				instance.alter(reference, a => a[subAction.toLowerCase()](argumentNew)).withFlag(...flags);
				continue;
			}
			throw new SyntaxError(stmt);
		}
		return instance;
	}

	static fromDiffing(context, jsonA, jsonB, flags = []) {
		if (!jsonA?.name) throw new Error(`Could not assertain table1 name or table1 name invalid.`);
		if (!jsonB?.name) throw new Error(`Could not assertain table2 name or table2 name invalid.`);
		const instance = (new this(context, jsonA.name, jsonA.basename, jsonA)).withFlag(...flags);
		// RENAME TO...
		if (jsonB.name !== jsonA.name) {
			instance.renameTo(jsonB.name);
		}
		// RELOCATE ... TO ...
		if (jsonB.basename !== jsonA.basename) {
			instance.relocateTo(jsonB.basename);
		}
		// DIFF STRUCTURE
		for (const listName of ['columns', 'constraints', 'indexes']) {
			const nameKey = listName === 'constraints' ? 'constraintName' : (listName === 'indexes' ? 'indexName' : 'name');
			const nodeKind = listName === 'constraints' ? 'CONSTRAINT' : (listName === 'indexes' ? 'INDEX' : 'COLUMN');
			const NodeClass = nodeKind === 'CONSTRAINT' ? TableLevelConstraint : (nodeKind === 'INDEX' ? Index : Column);
			const [ namesA, namesB, namesAll ] = makeSets(jsonA[listName], jsonB[listName], nameKey);
			// --------
			for (const nodeName of namesAll) {
				const nodeA = jsonA[listName].find(node => node[nameKey] === nodeName);
				const nodeB = jsonB[listName].find(node => (`$${ nameKey }` in node ? node[`$${ nameKey }`] : node[nameKey]) === nodeName);
				const reference = { kind: nodeKind, name: nodeName };
				if (namesA.has(nodeName) && !namesB.has(nodeName)) {
					// DROP
					instance.drop(NodeClass.fromJson(instance, nodeA));
				} else if (!namesA.has(nodeName) && namesB.has(nodeName)) {
					// ADD
					instance.add(NodeClass.fromJson(instance, nodeB));
				} else if (namesA.has(nodeName) && namesB.has(nodeName)) {
					// ALTER
					if (nodeKind === 'COLUMN') {
						const [ propsA, propsB, propsAll ] = makeSets(nodeA, nodeB);
						for (const property of propsAll) {
							const createArg = node => {
								const attrEquivalent = ColumnLevelConstraint.attrEquivalents[property];
								if (attrEquivalent) {
									const { constraintName, ...detail } = node[property];
									return ColumnLevelConstraint.fromJson(instance, { constraintName, type: attrEquivalent, detail });
								}
								throw new Error(`Unkown attribute: ${ property }.`);
							};
							if ((propsA.has(property) && nodeA[property]) && (!propsB.has(property) || !nodeB[property])) {
								// Drop
								instance.alter(reference, a => a.drop(createArg(nodeA)));
							} else if ((!propsA.has(property) || !nodeA[property]) && (propsB.has(property) && nodeB[property])) {
								// Add
								instance.alter(reference, a => a.add(createArg(nodeB)));
							} else if (propsA.has(property) && propsB.has(property) && !isSame(nodeA[property], nodeB[property])) {
								// Rename/alter
								if (property === 'name') {
									// Column rename
									instance.alter(reference, a => a.renameTo(nodeB[property]));
								} else if (property === 'type') {
									// Change data type
									instance.alter(reference, a => a.set(DataType.fromJson(instance, nodeB[property])));
								} else {
									instance.alter(reference, a => a.set(createArg(nodeB)));
								}
							}
						}
					} else if (!isSame(nodeA, nodeB)) {
						// Alter constraint/index
						instance.alter(reference, a => a.set(NodeClass.fromJson(instance, nodeB)));
					}
				}
			}
		}
		return instance;
	}

	/**
	 * @inheritdoc
	 */
	static fromDiffing2d(context, jsonsA, jsonsB, flags = []) {
		const nameKey = 'name';
		const actions = [], [ namesA, namesB, namesAll ] = makeSets(jsonsA, jsonsB, nameKey);
		for (const nodeName of namesAll) {
			if (namesA.has(nodeName) && !namesB.has(nodeName)) {
				// DROP
				actions.push({ type: 'DROP', argument: nodeName });
			} else if (!namesA.has(nodeName) && namesB.has(nodeName)) {
				// ADD
				const nodeB = jsonsB.find(tblSchema => (`$${ nameKey }` in tblSchema ? tblSchema[`$${ nameKey }`] : tblSchema[nameKey]) === nodeName);
				actions.push({ type: 'ADD', argument: CreateTable.fromJson(context, nodeB, flags) });
			} else if (namesA.has(nodeName) && namesB.has(nodeName)) {
				// ALTER
				const nodeA = jsonsA.find(tblSchema => tblSchema[nameKey] === nodeName);
				const nodeB = jsonsB.find(tblSchema => ( tblSchema[`$${ nameKey }`] || tblSchema[nameKey]) === nodeName);
				const tblAlterInstance = this.fromDiffing(context, nodeA, nodeB, flags);
				if (tblAlterInstance.ACTIONS.length) {
					actions.push({ type: 'ALTER', argument: tblAlterInstance });
				}
			}
		}
		return actions;
	}

    /**
	 * @property RegExp
	 */
	static renameRe = /^RENAME\s+(?:(?:(COLUMN|CONSTRAINT|INDEX|KEY)\s+)?(?:(\w+)|([`"])((?:\3\3|[^\3])+)\3)\s+)?(?:TO|AS)\s+(?:(\w+)|([`"])([^\6]+)\6)$/;
	static relocateRe = /^SET\s+SCHEMA\s+(?:(\w+)|([`"])((?:\2\2|[^\3])+)\2)$/;
	static dropRe = /^DROP\s+(COLUMN\s+|CONSTRAINT\s+|PRIMARY\s+KEY|FOREIGN\s+KEY\s+|CHECK\s+|INDEX\s+|KEY\s+)?(IF\s+EXISTS\s+)?(?:(\w+)|([`"])((?:\4\4|[^\3])+)\4)?(?:\s+(RESTRICT|CASCADE))?$/;
	static addRe = /^ADD\s+(COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/;
	static alterRe = /^ALTER\s+(?:(COLUMN|CONSTRAINT|CHECK|INDEX|KEY)\s+)?(?:(\w+)|([`"])((?:\3\3|[^\3])+?)\3)\s+(?:(ADD|DROP|(?:SET\s+DATA\s+)?TYPE|SET)\s+(.+)(IF\s+EXISTS)?$|(VISIBLE|(?:NOT\s+)?INVISIBLE|NOT\s+ENFORCED|ENFORCED|DEFERRABLE|NOT\s+DEFERRABLE|INITIALLY\s+DEFERRED|INITIALLY\s+IMMEDIATE))/;
}

function makeSets(a, b, nameKey) {
	if (Array.isArray(a)) {
		a = a.map(x => x[nameKey]);
		b = b.map(x => `$${ nameKey }` in x ? x[`$${ nameKey }`] : x[nameKey]);
	} else {
		a = Object.keys(a);
		b = Object.keys(b).filter(s => !s.startsWith('$'));
	}
	a = new Set(a);
	b = new Set(b);
	const ab = new Set([ ...a, ...b ]);
	return [ a, b, ab ];
}

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