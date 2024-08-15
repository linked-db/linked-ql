
import Lexer from '../../../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import Identifier from '../../../components/Identifier.js';
import AbstractLevel2Constraint from './AbstractLevel2Constraint.js';

export default class ForeignKey extends AbstractLevel2Constraint {

    /**
	 * Instance properties
	 */
	TARGET_TABLE;
	$TARGET_TABLE;
    TARGET_COLUMNS = [];
	$TARGET_COLUMNS = [];
    MATCH_RULE;
    $MATCH_RULE;
    UPDATE_RULE;
    $UPDATE_RULE;
    DELETE_RULE;
    $DELETE_RULE;

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() {
		return [
			'TARGET_TABLE',
			'TARGET_COLUMNS',
			'MATCH_RULE',
			'UPDATE_RULE',
			'DELETE_RULE',
		].concat(super.WRITABLE_PROPS);
	}
    
	/**
	 * Builds the statement's FROM_LIST
     * 
	 * .targetTable('tbl');
	 * .targetTable(['base', 'tbl']);
	 * 
	 * .targetTable( t => t.name('tbl') );
	 * .targetTable( t => t.name(['base', 'tbl']) );
	 * 
	 * @return this
	 */
	targetTable(table) {
		if (!arguments.length) return this[this.smartKey('TARGET_TABLE')];
        return (this.build(this.smartKey('TARGET_TABLE', true), [table], Identifier, 'name'), this);
    }

	/**
	 * Sets/gets the constraint name,
	 * 
	 * @param Void|String name
	 * 
	 * @returns String
	 */
	targetColumns(columns) {
		if (!arguments.length) return this[this.smartKey('TARGET_COLUMNS')];
		return (this[this.smartKey('TARGET_COLUMNS', true)] = [].concat(columns), this);
	}

	/**
	 * Sets/gets the matchRule,
	 * 
	 * @param Void|String rule
	 * 
	 * @returns String
	 */
	matchRule(rule) {
		if (!arguments.length) return this[this.smartKey('MATCH_RULE')];
        return (this[this.smartKey('MATCH_RULE', true)] = rule, this);
	}

	/**
	 * Sets/gets the updateRule,
	 * 
	 * @param Void|String rule
	 * 
	 * @returns String
	 */
	updateRule(rule) {
		if (!arguments.length) return this[this.smartKey('UPDATE_RULE')];
        return (this[this.smartKey('UPDATE_RULE', true)] = rule, this);
	}

	/**
	 * Sets/gets the deleteRule,
	 * 
	 * @param Void|String rule
	 * 
	 * @returns String
	 */
	deleteRule(rule) {
		if (!arguments.length) return this[this.smartKey('DELETE_RULE')];
        return (this[this.smartKey('DELETE_RULE', true)] = rule, this);
	}

    /**
	 * @inheritdoc
	 */
    diffWith(nodeB) {
        super.diffWith(nodeB)
        if (!this.isSame(nodeB.targetTable(), this.targetTable())) { this.targetTable(nodeB.targetTable()); }
        if (!this.isSame(nodeB.targetColumns(), this.targetColumns())) { this.targetColumns(nodeB.targetColumns()); }
        if (!this.isSame(nodeB.matchRule(), this.matchRule())) { this.matchRule(nodeB.matchRule()); }
        if (!this.isSame(nodeB.updateRule(), this.updateRule())) { this.updateRule(nodeB.updateRule()); }
        if (!this.isSame(nodeB.deleteRule(), this.deleteRule())) { this.deleteRule(nodeB.deleteRule()); }
		return this;
    }

	/**
	 * @inheritdoc
	 */
	toJSON() {
		return {
            // Requireds
            targetTable: this.TARGET_TABLE.toJSON(),
			...(this.$TARGET_TABLE ? { $targetTable: this.$TARGET_TABLE.toJSON() } : {}),
            targetColumns: this.TARGET_COLUMNS,
			...(this.$TARGET_COLUMNS.length ? { $targetColumns: this.$TARGET_COLUMNS } : {}),
            // Optionals
			...(this.MATCH_RULE ? { matchRule: this.MATCH_RULE } : {}),
			...(this.$MATCH_RULE ? { $matchRule: this.$MATCH_RULE } : {}),
            ...(this.UPDATE_RULE ? { updateRule: this.UPDATE_RULE } : {}),
			...(this.$UPDATE_RULE ? { $updateRule: this.$UPDATE_RULE } : {}),
            ...(this.DELETE_RULE ? { deleteRule: this.DELETE_RULE } : {}),
			...(this.$DELETE_RULE ? { $deleteRule: this.$DELETE_RULE } : {}),
            // Name & keep
            ...super.toJSON(),
		};
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, json, callback = null) {
		if (!json?.targetTable || !json.targetColumns?.length) return;
		return super.fromJSON(context, json, () => {
			const instance = callback ? callback() : new this(context);
			instance.hardSet(() => instance.targetTable(json.targetTable));
			instance.hardSet(() => instance.targetColumns(json.targetColumns));
			instance.hardSet(() => instance.matchRule(json.matchRule));
			instance.hardSet(() => instance.updateRule(json.updateRule));
			instance.hardSet(() => instance.deleteRule(json.deleteRule));
			instance.hardSet(json.$targetTable, val => instance.targetTable(val));
			instance.hardSet(json.$targetColumns, val => instance.targetColumns(val));
			instance.hardSet(json.$matchRule, val => instance.matchRule(val));
			instance.hardSet(json.$updateRule, val => instance.updateRule(val));
			instance.hardSet(json.$deleteRule, val => instance.deleteRule(val));
			return instance;
		});
	}

    /**
     * @returns String
     */
    stringify() {
		let targetTable = this.targetTable();
		if (!targetTable.BASENAME) {
			const namespace = this.$trace('get:name:database');
			targetTable = targetTable.clone().name([namespace,targetTable.NAME]);
		}
        let sql = `${ this.stringifyName() }REFERENCES ${ targetTable } (${ this.autoEsc(this.targetColumns()).join(', ') })`;
        const serializeReferentialRule = rule => typeof rule === 'object' && rule ? `${ rule.rule } (${ rule.columns.join(', ') })` : rule;
        if (this.matchRule()) { sql += ` MATCH ${ this.matchRule() }`; }
        if (this.updateRule()) { sql += ` ON UPDATE ${ serializeReferentialRule(this.updateRule()) }`; }
        if (this.deleteRule()) { sql += ` ON DELETE ${ serializeReferentialRule(this.deleteRule()) }`; }
        return sql;
    }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !($expr = $expr.match(/^REFERENCES\s+([\s\S]+)$/i)?.[1])) return;
        const [ table_maybeQualified, cols, opts = '' ] = Lexer.split($expr, []);
        const [table, basename] = this.parseIdent(context, table_maybeQualified.trim(), true);
        const targetColumns = Lexer.split(_unwrap(cols, '(', ')'), [',']).map(col => this.parseIdent(context, col.trim(), true)[0]);
        const matchReferentialRule = (str, type) => {
            if (type === 'MATCH') return str.match(/MATCH\s+(\w+)/i)?.[1];
            const referentialActionRe = /(NO\s+ACTION|RESTRICT|CASCADE|(SET\s+NULL|SET\s+DEFAULT)(?:\s+\(([^\)]+)\))?)/;
            const [ , keyword1, keyword2, keyword2Columns ] = str.match(new RegExp(`ON\\s+${ type }\\s+${ referentialActionRe.source }`, 'i')) || [];
            return keyword2 ? (!keyword2Columns ? keyword2 : { rule: keyword2, columns: keyword2Columns.split(',').map(s => s.trim()) }) : keyword1;
        };
        return (new this(context))
			.name(name)
            .targetTable(basename ? [basename, table] : table)
            .targetColumns(targetColumns)
            .matchRule(matchReferentialRule(opts, 'MATCH'))
            .updateRule(matchReferentialRule(opts, 'UPDATE'))
            .deleteRule(matchReferentialRule(opts, 'DELETE'));
    }
}