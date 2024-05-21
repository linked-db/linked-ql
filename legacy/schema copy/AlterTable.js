
/**
 * @imports
 */
import Lexer from '@webqit/util/str/Lexer.js';
import { _after } from '@webqit/util/str/index.js';
import { _isObject, _isFunction } from '@webqit/util/js/index.js';
import AlterInterface from './AlterInterface.js';
import CreateTable from './CreateTable.js';
import TableLevelConstraint from './TableLevelConstraint.js';
import ColumnLevelConstraint from './ColumnLevelConstraint.js';
import Index from './Index.js';
import Column from './Column.js';
import DataType from './DataType.js';

/**
 * ---------------------------
 * AlterTable class
 * ---------------------------
 */				

export default class AlterTable extends AlterInterface {
	 
	/**
	 * @inheritdoc
	 */
	constructor(target, actions, params = {}) {
		super();
		this.target = target;
		this.actions = actions;
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
		return {
			target: this.target,
			actions: this.actions.map(action => {
				// ADD
				if (['DROP','ADD'].includes(action.type)) {
					return { ...action, argument: action.argument.toJson() };
				}
				// ALTER
				if (action.type === 'ALTER') {
					return { ...action, action: action.action.map(arg => _isObject(arg) && _isFunction(arg.toJson) ? arg.toJson() : arg) };
				}
				// DROP, RENAME, RELOCATE
				return structuredClone(action);
			}),
		};
	}
	
	/**
	 * @inheritdoc
	 */
	toString() { return this.stringify(); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		if (!this.actions.length) return '';
		const stmts0 = [], stmts1 = [];
		for (const action of this.actions) {
			// RENAME
			if (action.type === 'RENAME') {
				if (!action.reference) { stmts0.push(`RENAME TO ${ action.argument }`); }
				else { stmts1.push(`RENAME ${ action.reference.type } ${ action.reference.name } TO ${ action.argument }`); }
				continue;
			}
			// RELOCATE
			if (action.type === 'RELOCATE') {
				stmts0.push(`SET SCHEMA ${ action.argument }`);
				continue;
			}
			// DROP
			if (action.type === 'DROP') {
				const ifExists = action.flags?.includes('IF EXISTS');
				const $flags = (action.flags?.join(' ') || '').match(/RESTRICT|CASCADE/i) || [];
				const nodeType = action.argument instanceof TableLevelConstraint ? 'CONSTRAINT' : (action.argument instanceof Index ? 'INDEX' : 'COLUMN');
				if (this.params.dialect === 'mysql' && nodeType === 'CONSTRAINT' && action.argument.constraintName === 'PRIMARY') {
					stmts1.push(`DROP PRIMARY KEY`);
				} else {
					const nameKey = nodeType === 'CONSTRAINT' ? 'constraintName' : (nodeType === 'INDEX' ? 'indexName' : 'name');
					stmts1.push(`DROP ${ this.params.dialect === 'mysql' && nodeType === 'CONSTRAINT' && action.argument.type/* being a table-level constraint */ === 'FOREIGN KEY' ? 'FOREIGN KEY' : nodeType }${ ifExists ? ' IF EXISTS' : '' } ${ action.argument[nameKey] }${ $flags.length ? ` ${ $flags[0] }` : '' }`);
				}
				continue;
			}
			// ADD
			if (action.type === 'ADD') {
				const ifNotExists = action.flags?.includes('IF NOT EXISTS');
				const [ , first, afterCol ] = /(FIRST)|AFTER[ ]+(\w+)/i.exec(action.flags?.join(' ') || '') || [];
				stmts1.push(`ADD ${ action.argument instanceof Column ? `COLUMN ` : '' }${ ifNotExists ? 'IF NOT EXISTS ' : '' }${ action.argument }${ first ? ' FIRST' : (afterCol ? ` AFTER ${ afterCol.toLowerCase() }` : '') }`);
				if (this.params.dialect === 'mysql' && action.argument instanceof Column) {
					const constraint = action.argument.constraints.find(c => c.attribute === 'REFERENCES');
					if (constraint) stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(constraint, action.argument.name) }`);
				}
				continue;
			}
			// ALTER
			if (action.type === 'ALTER') {
				// Handle columns specially
				if (action.reference.type === 'COLUMN') {
					const [ subAction, ...args ] = action.action;
					const asTableLevelConstraint = () => {								
						if (subAction === 'ADD') {
							stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(args[0], action.reference.name) }`);
						} else {
							let dropStatement = dropTarget => `DROP CONSTRAINT ${ dropTarget.constraintName }`;
							if (this.params.dialect === 'mysql' && ['PRIMARY KEY', 'REFERENCES'].includes(dropTarget.attribute)) {
								dropStatement = dropTarget => dropTarget.attribute === 'PRIMARY KEY' ? `DROP PRIMARY KEY` : `DROP FOREIGN KEY ${ dropTarget.constraintName }`;
							}
							if (subAction === 'DROP') {
								stmts1.push(dropStatement(args[0]));
							} else if (subAction === 'SET') {
								if (args[1]?.constraintName) { stmts1.push(dropStatement(args[1])); } // We process DROP first, then ADD
								stmts1.push(`ADD ${ TableLevelConstraint.fromColumnLevelConstraint(args[0], action.reference.name) }`);
							}
						}
					};
					const asLiterals = () => {
						stmts1.push(`ALTER COLUMN ${ action.reference.name } ${ subAction } ${ args[0] }`);
					};
					if (this.params.dialect === 'mysql') {
						if (args[0] instanceof ColumnLevelConstraint) {
							if (args[0].attribute === 'DEFAULT') {
								stmts1.push(`ALTER COLUMN ${ action.reference.name } ${ subAction === 'DROP' ? 'DROP' : 'SET' } ${ args[0] }`);
							} else if (['PRIMARY KEY', 'REFERENCES', 'UNIQUE'].includes(args[0].attribute)) {
								asTableLevelConstraint();
							} else {
								asLiterals();
							}
						} else {
							asLiterals();
						}
					} else {
						if (args[0] instanceof DataType) {
							stmts1.push(`ALTER COLUMN ${ action.reference.name } SET DATA TYPE ${ args[0] }`);
						} else if (args[0] instanceof ColumnLevelConstraint) {
							if (['IDENTITY', 'EXPRESSION', 'DEFAULT', 'NOT NULL'].includes(args[0].attribute)) {
								if (subAction === 'DROP' || (args[0].attribute === 'IDENTITY' && subAction === 'SET')) {
									stmts1.push(`ALTER COLUMN ${ action.reference.name } DROP ${ args[0].attribute }${ subAction === 'DROP' && ['IDENTITY', 'EXPRESSION'].includes(args[0].attribute) && action.flags?.includes('IF EXISTS') ? ` IF EXISTS` : '' }`);
								}
								if (['ADD', 'SET'].includes(subAction) && args[0].attribute !== 'EXPRESSION'/* Can't add a generated expression to a column after definition */) {
									stmts1.push(`ALTER COLUMN ${ action.reference.name } ${ args[0].attribute === 'IDENTITY' ? 'ADD' : 'SET' } ${ args[0] }`);
								}
							} else if (['PRIMARY KEY', 'REFERENCES', 'UNIQUE', 'CHECK'].includes(args[0].attribute)) {
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
				const [ subAction, argument ] = action.action;
				if (typeof argument === 'string') {
					stmts1.push(`ALTER ${ action.reference.type } ${ action.reference.name } ${ argument }`);
					continue;
				}
				// From constraints diffing
				let dropStatement = `DROP ${ action.reference.type } ${ action.reference.name }`;
				if (this.params.dialect === 'mysql' && ['PRIMARY KEY', 'FOREIGN KEY'].includes(argument.type/* being a table-level constraint */)) {
					dropStatement = argument.attribute === 'PRIMARY KEY' ? `DROP PRIMARY KEY` : `DROP FOREIGN KEY ${ action.reference.name }`;
				}
				stmts1.push(dropStatement, `ADD ${ argument }`);
				continue;
			}
		}
		return `ALTER TABLE${ this.params.ifExists ? ' IF EXISTS' : '' } ${ this.target.database ? `${ this.target.database }.` : `` }${ this.target.name }\n\t${ [...stmts1, ...stmts0].join(',\n\t') }`;
	}

	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		const [ match, ifExists, dbName, tblName ] = /ALTER[ ]+TABLE[ ]+(IF[ ]+EXISTS[ ]+)?(?:(\w+)\.)?(\w+)/i.exec(expr) || [];
		if (!tblName) return;
		const $params = { database: dbName, ...params };
		const regex = name => new RegExp(`${ this[ name ].source }`, 'i');
		// ----------
		const actions = [], stmts = Lexer.split(_after(expr, match), [',']).map(s => s.trim());
		for (const stmt of stmts) {
			// RENAME ... TO ...
			const [ renameMatch, nodeType_a, nodeName_a, newName_a ] = regex('renameRe').exec(stmt) || [];
			if (renameMatch) {
				if (nodeName_a) {
					const nodeType = /KEY|INDEX/i.test(nodeType_a) ? 'INDEX' : nodeType_a.toUpperCase();
					actions.push({
						type: 'RENAME',
						reference: { type: nodeType, name: nodeName_a },
						argument: newName_a,
					});
				} else {
					actions.push({
						type: 'RENAME',
						argument: newName_a,
					});
				}
				continue;
			}
			// RELOCATE ... TO ...
			const [ relocateMatch, newSchema ] = regex('relocateRe').exec(stmt) || [];
			if (relocateMatch) {
				actions.push({
					type: 'RELOCATE',
					argument: newSchema,
				});
				continue;
			}
			// DROP
			const [ dropMatch, nodeType_b = 'COLUMN', ifExists_b/* postgresql-specific */, nodeName_b, flags_b/* postgresql-specific */ ] = regex('dropRe').exec(stmt) || [];
			if (dropMatch) {
				const nodeType = /CONSTRAINT|PRIMARY[ ]+KEY|FOREIGN[ ]+KEY|CHECK/i.test(nodeType_b) ? 'CONSTRAINT' : (/INDEX|KEY/i.test(nodeType_b) ? 'INDEX' : 'COLUMN');
				const nodeName = nodeName_b || nodeType_b.trim().replace(/[ ]+KEY/i, '').toUpperCase()/* when, in mysql, it's just: drop PRIMARY KEY */;
				const argument = nodeType === 'CONSTRAINT' ? new TableLevelConstraint(nodeName, nodeType_b.trim().toUpperCase(), []/*columns*/, null, $params) : (
					nodeType === 'INDEX' ? new Index(nodeName, nodeType_b.trim().toUpperCase(), []/*columns*/, $params) : new Column(nodeName, null, [], $params)
				);
				const flags = [ifExists_b, flags_b].filter(s => s).map(s => s.trim().replace(/\s+/g, ' ').toUpperCase());
				actions.push({
					type: 'DROP',
					argument,
					flags,
				});
				continue;
			}
			// ADD
			const [ addMatch, columnKeyword_c, ifColumnNotExists_c, spec_c ] = regex('addRe').exec(stmt) || [];
			if (addMatch) {
				const [ , $spec, $flags ] = spec_c.match(/(.+)[ ]+(FIRST|AFTER[ ]+\w+)$/i) || [ , spec_c ];
				const argument = await parseCallback($spec.trim(), columnKeyword_c ? [Column] : [TableLevelConstraint, Index, Column], $params); // Note that Column must come last
				const flags = [ifColumnNotExists_c, $flags].filter(s => s).map(s => s.trim().replace(/\s+/g, ' ').toUpperCase());
				actions.push({
					type: 'ADD',
					argument,
					flags,
				});
				continue;
			}
			// ALTER
			const [ alterMatch, nodeType_d, nodeName_d, subAction_d = '', argument_d = '', ifNodeExits_d, constraintOrIndexAttr_d ] = regex('alterRe').exec(stmt) || [];
			if (alterMatch) {
				const nodeType = /CONSTRAINT|CHECK/i.test(nodeType_d) ? 'CONSTRAINT' : (/INDEX|KEY/i.test(nodeType_d) ? 'INDEX' : 'COLUMN');
				const subAction = subAction_d.toUpperCase(), flags = ifNodeExits_d ? ['IF EXISTS'] : [], $ = {};
				let alterAction;
				// Is column data type?
				if (subAction.endsWith('TYPE')) {
					alterAction = ['SET', await parseCallback(argument_d, [DataType], $params)];
				}
				// Is column constraint?
				else if ($.argument = await parseCallback(argument_d, [ColumnLevelConstraint], {...$params, assert: false})) {
					alterAction = [subAction, $.argument];
				}
				// Is SET|DROP|ADD flag?
				else if (subAction) {
					alterAction = [subAction, argument_d];
				}
				// Is just flag?
				else {
					alterAction = ['SET', constraintOrIndexAttr_d];
				}
				// Push
				actions.push({
					type: 'ALTER',
					reference: { type: nodeType, name: nodeName_d },
					action: alterAction,
					flags,
				});
			}
		}
		if (ifExists) { params = { ...params, ifExists: true }; };
		const target = { name: tblName, database: dbName };
		return new this(target, actions, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(json, params = {}) {
		if (!json.target.name || !json.target.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain table name or table name invalid.`);
		const $params = { ...params, database: json.target.database || params.database };
		const actions = json.actions.map(action => {
			// DROP/ADD
			if (['DROP','ADD'].includes(action.type)) {
				const argument = [TableLevelConstraint,Index,Column].reduce((prev, Class) => prev || Class.fromJson(action.argument, $params), null);
				return { ...action, argument };
			}
			// ALTER
			if (action.type === 'ALTER') {
				// Handle columns specially
				if (action.reference.type === 'COLUMN') {
					const [subAction, ...args] = action.action;
					const $args = args.map(arg => [ColumnLevelConstraint,DataType].reduce((prev, Class) => prev || Class.fromJson(arg, $params), null) || arg);
					return { ...action, action: [subAction, ...$args] };
				}
				// Handle other
				const [subAction, ...args] = action.action;
				const Class = action.reference.type === 'CONSTRAINT' ? TableLevelConstraint : Index;
				return { ...action, action: [subAction, ...args.map(arg => Class.fromJson(arg, $params) || arg)] };
			}
			// RENAME, RELOCATE
			return structuredClone(action);
		});
		return new this(json.target, actions, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromDiffing(jsonA, jsonB, params = {}) {
		if (!jsonA.name || !jsonA.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain table1 name or table1 name invalid.`);
		if (!jsonB.name || !jsonB.name.match(/[a-zA-Z]+/i)) throw new Error(`Could not assertain table2 name or table2 name invalid.`);
		const $params = { ...params, database: jsonA.database || jsonB.database || params.database };
		// --------
		const actions = [];
		// RENAME ... TO ...
		if (jsonB.name !== jsonA.name) {
			actions.push({
				type: 'RENAME',
				argument: jsonB.name,
			});
		}
		// RELOCATE ... TO ...
		if (jsonB.database !== jsonA.database) {
			actions.push({
				type: 'RELOCATE',
				argument: jsonB.database,
			});
		}
		// DIFF STRUCTURE
		for (const listName of ['columns', 'constraints', 'indexes']) {
			const nameKey = listName === 'constraints' ? 'constraintName' : (listName === 'indexes' ? 'indexName' : 'name');
			const nodeType = listName === 'constraints' ? 'CONSTRAINT' : (listName === 'indexes' ? 'INDEX' : 'COLUMN');
			const [ namesA, namesB, namesAll ] = this.makeSets(jsonA[listName], jsonB[listName], nameKey);
			// --------
			for (const nodeName of namesAll) {
				const nodeA = jsonA[listName].find(node => node[nameKey] === nodeName);
				const nodeB = jsonB[listName].find(node => (`$${ nameKey }` in node ? node[`$${ nameKey }`] : node[nameKey]) === nodeName);
				const EntryClass = nodeType === 'CONSTRAINT' ? TableLevelConstraint : (nodeType === 'INDEX' ? Index : Column);
				if (namesA.has(nodeName) && !namesB.has(nodeName)) {
					// DROP
					actions.push({
						type: 'DROP',
						argument: EntryClass.fromJson(nodeA, $params),
					});
				} else if (!namesA.has(nodeName) && namesB.has(nodeName)) {
					// ADD
					actions.push({
						type: 'ADD',
						argument: EntryClass.fromJson(nodeB, $params),
					});
				} else if (namesA.has(nodeName) && namesB.has(nodeName)) {
					// ALTER
					if (nodeType === 'COLUMN') {
						const [ propsA, propsB, propsAll ] = this.makeSets(nodeA, nodeB);
						for (const property of propsAll) {
							const createArg = node => {
								const attrEquivalent = ColumnLevelConstraint.attrEquivalents[property];
								if (attrEquivalent) {
									const { constraintName, ...detail } = node[property];
									return ColumnLevelConstraint.fromJson({ constraintName, attribute: attrEquivalent, detail }, $params);
								}
								return { attribute: property, value: node[property] };
							};
							if ((propsA.has(property) && nodeA[property]) && (!propsB.has(property) || !nodeB[property])) {
								// Drop
								actions.push({
									type: 'ALTER',
									reference: { type: nodeType, name: nodeName },
									action: [ 'DROP', createArg(nodeA) ],
								});
							} else if ((!propsA.has(property) || !nodeA[property]) && (propsB.has(property) && nodeB[property])) {
								// Add
								actions.push({
									type: 'ALTER',
									reference: { type: nodeType, name: nodeName },
									action: [ 'ADD', createArg(nodeB) ],
								});
							} else if (propsA.has(property) && propsB.has(property) && !this.isSame(nodeA[property], nodeB[property])) {
								// Rename/alter
								if (property === 'name') {
									// Column rename
									actions.push({
										type: 'RENAME',
										reference: { type: nodeType, name: nodeName },
										argument: nodeB[property],
									});
								} else if (property === 'type') {
									// Change data type
									actions.push({
										type: 'ALTER',
										reference: { type: nodeType, name: nodeName },
										action: [ 'SET', DataType.fromJson(nodeB[property], $params) ],
									});
								} else {
									actions.push({
										type: 'ALTER',
										reference: { type: nodeType, name: nodeName },
										action: [ 'SET', createArg(nodeB), createArg(nodeA) ],
									});
								}
							}
						}
					} else if (!this.isSame(nodeA, nodeB)) {
						// Alter constraint/index
						const EntryClass = nodeType === 'CONSTRAINT' ? TableLevelConstraint : Index;
						actions.push({
							type: 'ALTER',
							reference: { type: nodeType, name: nodeName },
							action: [ 'SET', EntryClass.fromJson(nodeB, $params), EntryClass.fromJson(nodeA, $params) ],
						});
					}
				}
			}
		}
		return new this(jsonA, actions, params);
	}

	/**
	 * @inheritdoc
	 */
	static fromDiffing2d(jsonsA, jsonsB, params = {}) {
		const nameKey = 'name';
		const actions = [], [ namesA, namesB, namesAll ] = this.makeSets(jsonsA, jsonsB, nameKey);
		for (const nodeName of namesAll) {
			if (namesA.has(nodeName) && !namesB.has(nodeName)) {
				// DROP
				actions.push({ type: 'DROP', argument: nodeName });
			} else if (!namesA.has(nodeName) && namesB.has(nodeName)) {
				// ADD
				const nodeB = jsonsB.find(tblSchema => (`$${ nameKey }` in tblSchema ? tblSchema[`$${ nameKey }`] : tblSchema[nameKey]) === nodeName);
				actions.push({ type: 'ADD', argument: CreateTable.fromJson(nodeB, params) });
			} else if (namesA.has(nodeName) && namesB.has(nodeName)) {
				// ALTER
				const nodeA = jsonsA.find(tblSchema => tblSchema[nameKey] === nodeName);
				const nodeB = jsonsB.find(tblSchema => ( tblSchema[`$${ nameKey }`] || tblSchema[nameKey]) === nodeName);
				const tblAltInstance = this.fromDiffing(nodeA, nodeB, params);
				if (tblAltInstance.actions.length) {
					actions.push({ type: 'ALTER', argument: tblAltInstance });
				}
			}
		}
		return actions;
	}

    /**
	 * @property RegExp
	 */
	static renameRe = /^RENAME[ ]+(?:(?:(COLUMN|CONSTRAINT|INDEX|KEY)[ ]+)?(\w+)[ ]+)?(?:TO|AS)[ ]+(\w+)/;
	static relocateRe = /^SET[ ]+SCHEMA[ ]+(\w+)$/;
	static addRe = /^ADD[ ]+(COLUMN[ ]+)?(IF[ ]+NOT[ ]+EXISTS[ ]+)?(.+)$/;
	static dropRe = /^DROP[ ]+(COLUMN[ ]+|CONSTRAINT[ ]+|PRIMARY[ ]+KEY|FOREIGN[ ]+KEY[ ]+|CHECK[ ]+|INDEX[ ]+|KEY[ ]+)?(IF[ ]+EXISTS[ ]+)?(\w+)?(?:[ ]+(RESTRICT|CASCADE))?/;
	static alterRe = /^ALTER[ ]+(?:(COLUMN|CONSTRAINT|CHECK|INDEX|KEY)[ ]+)?(\w+)[ ]+(?:(ADD|DROP|(?:SET(?:[ ]+DATA[ ]+)?)?(?:TYPE)?)[ ]+(.+)(IF[ ]+EXISTS)?$|(VISIBLE|(?:NOT[ ]+)?INVISIBLE|NOT[ ]+ENFORCED|ENFORCED|DEFERRABLE|NOT[ ]+DEFERRABLE|INITIALLY[ ]+DEFERRED|INITIALLY[ ]+IMMEDIATE))/;
}
