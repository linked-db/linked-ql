
import Lexer from '../Lexer.js';
import Action from './Action.js';
import AbstractStatementNode from './abstracts/AbstractStatementNode.js';
import CreateTable from '../create/CreateTable.js';
import DataType from '../create/DataType.js';
import Column from '../create/Column.js';
import Index from '../create/Index.js';

export default class AlterTable extends AbstractStatementNode {

	/**
	 * Adds a "CHANGE" action to the instance.
	 * 
	 * @param Object reference
	 * @param Column argument
	 * 
	 * @returns Action
	 */
	addChange(reference, argument) { return this.build('ACTIONS', [reference, argument], Action, 'change'); }
	
	/**
	 * @inheritdoc
	 */
	stringify() {
		if (!this.ACTIONS.length) return '';
		let stmts = [], rename0, move0;
		for (const action of this.ACTIONS) {
			// RENAME TO...
			if (action.TYPE === 'RENAME') {
				rename0 = `RENAME TO ${ this.autoEsc(action.ARGUMENT) }`;
				continue;
			}
			// MOVE TO...
			if (action.TYPE === 'MOVE') {
				move0 = `SET SCHEMA ${ this.autoEsc(action.ARGUMENT) }`;
				continue;
			}
			// DROP
			if (action.TYPE === 'DROP') {
				// All flags are postgres'
				const ifExists = action.hasFlag('IF_EXISTS');
				const restrictOrCascadeFlag = action.getFlag('RESTRICT') || action.getFlag('CASCADE');
				if (this.params.dialect === 'mysql' && ['PRIMARY_KEY', 'FOREIGN_KEY'].includes(action.ARGUMENT.kind)) {
					if (action.ARGUMENT.kind === 'PRIMARY_KEY') stmts.push(`DROP PRIMARY KEY`);
					else stmts.push(`DROP FOREIGN KEY ${ this.autoEsc(action.ARGUMENT.name) }`);
				} else stmts.push(`DROP ${ action.ARGUMENT.kind === 'COLUMN' ? 'COLUMN' : 'CONSTRAINT' }${ ifExists ? ' IF EXISTS' : '' } ${ this.autoEsc(action.ARGUMENT.name) }${ restrictOrCascadeFlag ? ` ${ restrictOrCascadeFlag }` : '' }`);
				continue;
			}
			// ADD
			if (action.TYPE === 'NEW') {
				const ifNotExists = action.hasFlag('IF_NOT_EXISTS');
				const firstFlag = action.hasFlag('FIRST');
				const afterFlag = action.getFlag('AFTER')?.replace('AFTER:', '');
				stmts.push(`ADD ${ action.ARGUMENT instanceof Column ? `COLUMN ` : '' }${ ifNotExists ? `IF NOT EXISTS ` : '' }${ action.ARGUMENT }${ firstFlag ? ` FIRST` : (afterFlag ? ` AFTER ${ this.autoEsc([afterFlag]) }` : '') }`);
				if (this.params.dialect === 'mysql' && action.ARGUMENT instanceof Column) {
					const constraint = action.ARGUMENT.foreignKey();
					if (constraint) stmts.push(`ADD ${ ForeignKey2.fromJson(instance, constraint.toJson()).columns([action.ARGUMENT.name()]) }`);
				}
				continue;
			}
			// CHANGE
			if (action.TYPE === 'CHANGE') {
				const firstFlag = action.hasFlag('FIRST');
				const afterFlag = action.getFlag('AFTER')?.replace('AFTER:', '');
				stmts.push(`CHANGE COLUMN ${ this.autoEsc(action.REFERENCE.name) } ${ action.ARGUMENT }${ firstFlag ? ` FIRST` : (afterFlag ? ` AFTER ${ this.autoEsc([afterFlag]) }` : '') }`);
				continue;
			}
			// ALTER
			if (action.TYPE === 'ALTER') {
				const { REFERENCE: reference, ARGUMENT: subAction } = action;
				// RENAME
				if (subAction.TYPE === 'RENAME') {
					stmts.push(`RENAME ${ reference.kind } ${ this.autoEsc(reference.name) } TO ${ this.autoEsc(subAction.ARGUMENT) }`);
					continue;
				}
				// Typically: SET TYPE // SET|DROP IDENTITY|EXPRESSION|DEFAULT|NOT_NULL
				if (subAction.TYPE === 'SET' && subAction.ARGUMENT instanceof DataType) {
					stmts.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } SET DATA TYPE ${ subAction.ARGUMENT }`);
				} else if (subAction.TYPE === 'DROP') {
					const ifExists = ['IDENTITY', 'EXPRESSION'].includes(subAction.ARGUMENT) && action.hasFlag('IF_EXISTS');
					stmts.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } DROP ${ subAction.ARGUMENT.replace(/_/, ' ') }${ ifExists ? ` IF EXISTS` : '' }`);
				} else if (reference.kind === 'COLUMN') {
					const verb = subAction.ARGUMENT.TYPE === 'IDENTITY' ? 'ADD' : 'SET';
					stmts.push(`ALTER COLUMN ${ this.autoEsc(reference.name) } ${ verb } ${ subAction.ARGUMENT }`);
				}
				// Constraints section
				if (['CONSTRAINT','INDEX'].includes(reference.kind)) {
					stmts.push(`ALTER ${ reference.kind } ${ this.autoEsc(reference.name) } ${ subAction.ARGUMENT }`);
				}
			}
		}
		let renames = [];
		if (this.params.dialect !== 'mysql') {
			[ stmts, renames ] = stmts.reduce(([stmts, renames], stmt) => {
				if (stmt.startsWith('RENAME')) return [stmts, renames.concat(stmt)];
				return [stmts.concat(stmt), renames];
			}, [[], []]);
		}
		const sql = [];
		const basename = this.BASENAME || (this.CONTEXT instanceof this.constructor.Node ? this.CONTEXT.NAME/* DB won't have actually been renamed */ : this.CONTEXT?.name);
		if (stmts.length) sql.push(`ALTER TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([basename, this.NAME].filter(s => s)).join('.') }\n\t${ stmts.join(',\n\t') }`);
		for (const stmt of renames) sql.push(`ALTER TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([basename, this.NAME].filter(s => s)).join('.') }\n\t${ stmt }`);
		if (rename0) sql.push(`ALTER TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([basename, this.NAME].filter(s => s)).join('.') }\n\t${ rename0 }`);
		if (move0) sql.push(`ALTER TABLE${ this.hasFlag('IF_EXISTS') ? ' IF EXISTS' : '' } ${ this.autoEsc([basename, rename0 ? this.ACTIONS.find(action => action.TYPE === 'RENAME').ARGUMENT : this.NAME].filter(s => s)).join('.') }\n\t${ move0 }`);
		return sql.join(';\n');
	}

	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) {
		const [ match, ifExists, rest ] = /^ALTER\s+TABLE\s+(IF\s+EXISTS\s+)?([\s\S]+)$/i.exec(expr.trim()) || [];
		if (!match) return;
		const [ namePart, bodyPart ] = Lexer.split(rest, ['\\s+'], { useRegex: true, limit: 1 });
		const [ tblName, dbName ] = this.parseIdent(context, namePart.trim(), true) || [];
		if (!tblName) return;
		const instance = (new this(context))
			.name(tblName)
			.basename(dbName);
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
					instance.addAlt(reference, a => a.rename(newNodeName));
				} else {
					instance.addRename(newNodeName);
				}
				continue;
			}
			// MOVE ... TO ...
			const [ moveMatch, newSchemaUnescaped, /*esc*/, newSchemaEscaped ] = regex('moveRe').exec(stmt) || [];
			if (moveMatch) {
				instance.addMove(newSchemaUnescaped || this.autoUnesc(instance, newSchemaEscaped));
				continue;
			}
			// DROP
			const [ dropMatch, nodeKind_b = 'COLUMN', ifExists_b/* postgresql-specific */, nodeNameUnescaped_b, /*esc*/, nodeNameEscaped_b, flags_b/* postgresql-specific */ ] = regex('dropRe').exec(stmt) || [];
			if (dropMatch) {
				const nodeName = nodeNameUnescaped_b || this.autoUnesc(instance, nodeNameEscaped_b) || nodeKind_b.trim().replace(/\s+KEY/i, '').toUpperCase()/* when, in mysql, it's just: drop PRIMARY KEY */;
				const flags = [ifExists_b, flags_b].filter(s => s).map(s => s.trim().replace(/\s+/g, '_').toUpperCase());
				instance.addDrop({ kind: nodeKind_b.trim().replace(/\s+/g, '_').toUpperCase(), name: nodeName }).withFlag(...flags);
				continue;
			}
			// ADD
			const [ addMatch, columnKeyword_c, ifColumnNotExists_c, spec_c ] = regex('addRe').exec(stmt) || [];
			if (addMatch) {
				const [ , $spec, $first, $afterRef ] = spec_c.match(/([\s\S]+)\s+(?:(FIRST)|AFTER\s+(.+))$/i) || [ , spec_c ];
				const argument = parseCallback(instance, $spec.trim(), columnKeyword_c ? [Column] : [...CreateTable.CONSTRAINT_TYPES,Index,Column]); // Note that Column must come last
				const flags = [ifColumnNotExists_c, $first].filter(s => s).map(s => s.trim().replace(/\s+/g, '_').toUpperCase()).concat($afterRef ? `AFTER:${ $afterRef }` : []);
				instance.addNew(argument).withFlag(...flags);
				continue;
			}
			// CHANGE
			const [ changeMatch, verb_d, nodeNameUnescaped_d, /*esc*/, nodeNameEscaped_d, spec_d ] = regex('changeRe').exec(stmt) || [];
			if (changeMatch) {
				const nodeName = nodeNameUnescaped_d || this.autoUnesc(instance, nodeNameEscaped_d);
				const [ , $spec, $first, $afterRef ] = spec_d.match(/([\s\S]+)\s+(?:(FIRST)|AFTER\s+(.+))$/i) || [ , spec_d ];
				const argument = parseCallback(instance, /MODIFY/i.test(verb_d) ? `${ nodeName } ${ $spec }` : $spec, [Column]);
				const flags = [ifColumnNotExists_c, $first].filter(s => s).map(s => s.trim().replace(/\s+/g, '_').toUpperCase()).concat($afterRef ? `AFTER:${ $afterRef }` : []);
				instance.addChange({ kind: 'COLUMN', name: nodeName }, argument).withFlag(...flags);
				continue;
			}
			// ALTER
			const [ alterMatch, nodeKind_e, nodeNameUnescaped_e, /*esc*/, nodeNameEscaped_e, subAction_e = '', argument_e = '', ifNodeExits_e, constraintOrIndexAttr_e ] = regex('alterRe').exec(stmt) || [];
			if (alterMatch) {
				const nodeName = nodeNameUnescaped_e || this.autoUnesc(instance, nodeNameEscaped_e);
				const nodeKind = /CONSTRAINT|CHECK/i.test(nodeKind_e) ? 'CONSTRAINT' : (/INDEX|KEY/i.test(nodeKind_e) ? 'INDEX' : 'COLUMN');
				let argumentNew, subAction = subAction_e.toUpperCase() || 'SET', flags = ifNodeExits_e ? ['IF_EXISTS'] : [], $ = {};
				if (subAction === 'DROP') {
					argumentNew = argument_e;
				} else if (subAction.endsWith('TYPE')) {
					argumentNew = parseCallback(instance, argument_e, [DataType]);
					subAction = 'SET';
				} else if ($.argument = parseCallback(instance, argument_e, Column.CONSTRAINT_TYPES, { assert: false })) {
					argumentNew = $.argument;
				} else if (subAction_e/*NOTE: original*/) {
					argumentNew = argument_e;
				} else {
					argumentNew = constraintOrIndexAttr_e;
				}
				const reference = { kind: nodeKind, name: nodeName };
				instance.addAlt(reference, a => a[subAction.toLowerCase()](argumentNew)).withFlag(...flags);
				continue;
			}
			throw new SyntaxError(stmt);
		}
		return instance;
	}

    /**
	 * @property RegExp
	 */
	static renameRe = /^RENAME\s+(?:(?:(COLUMN|CONSTRAINT|INDEX|KEY)\s+)?(?:(\w+)|([`"])((?:\3\3|[^\3])+)\3)\s+)?(?:TO|AS)\s+(?:(\w+)|([`"])((?:\6\6|[^\6])+)\6)$/;
	static moveRe = /^SET\s+SCHEMA\s+(?:(\w+)|([`"])((?:\2\2|[^\2])+)\2)$/;
	static dropRe = /^DROP\s+(COLUMN\s+|CONSTRAINT\s+|PRIMARY\s+KEY|FOREIGN\s+KEY\s+|CHECK\s+|INDEX\s+|KEY\s+)?(IF\s+EXISTS\s+)?(?:(\w+)|([`"])((?:\4\4|[^\3])+)\4)?(?:\s+(RESTRICT|CASCADE))?$/;
	static addRe = /^ADD\s+(COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/;
	static changeRe = /^(CHANGE|MODIFY)\s+COLUMN\s+(?:(\w+)|([`"])((?:\3\3|[^\3])+?)\3)\s+([\s\S]+)$/;
	static alterRe = /^ALTER\s+(?:(COLUMN|CONSTRAINT|CHECK|INDEX|KEY)\s+)?(?:(\w+)|([`"])((?:\3\3|[^\3])+?)\3)\s+(?:(ADD|DROP|(?:SET\s+DATA\s+)?TYPE|SET)\s+(.+)(IF\s+EXISTS)?$|(VISIBLE|(?:NOT\s+)?INVISIBLE|NOT\s+ENFORCED|ENFORCED|DEFERRABLE|NOT\s+DEFERRABLE|INITIALLY\s+DEFERRED|INITIALLY\s+IMMEDIATE))/;
}