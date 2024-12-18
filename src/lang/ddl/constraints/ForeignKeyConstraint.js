import { _unwrap } from '@webqit/util/str/index.js';
import { _intersect } from '@webqit/util/arr/index.js';
import { AbstractColumnsMixin } from '../abstracts/AbstractColumnsMixin.js';
import { AbstractLevel2Constraint } from './abstracts/AbstractLevel2Constraint.js';
import { GlobalTableRef } from '../../expr/refs/GlobalTableRef.js';
import { RootCDL } from '../RootCDL.js';
import { Lexer } from '../../Lexer.js';

export class ForeignKeyConstraint extends AbstractColumnsMixin(AbstractLevel2Constraint) {
    
	#targetTable;
	#$targetTable;
	#targetColumns = [];
    #$targetColumns = [];
	#matchRule;
	#$matchRule;
	#updateRule;
	#$updateRule;
	#deleteRule;
	#$deleteRule;

	targetTable(table) {
        if (!arguments.length) return this.#targetTable;
        if (this.$diffTagHydrate()) {
			this.#$targetTable = this.$castInputs([table], GlobalTableRef, this.#$targetTable, 'target_table');
		} else this.#targetTable = this.$castInputs([table], GlobalTableRef, this.#targetTable, 'target_table');
		return this;
    }

    $targetTable() { return this.#$targetTable || this.targetTable(); }

	targetColumns(columns) {
        if (!arguments.length) return this.#targetColumns;
        if (!Array.isArray(columns) || !columns.length) throw new Error(`Columns list must be a non-empty array`);
        if (this.$diffTagHydrate()) {
			this.#$targetColumns = columns;
		} else this.#targetColumns = columns;
		return this;
    }

    $targetColumns() { return this.#$targetColumns.length ? this.#$targetColumns : this.targetColumns(); }

	matchRule(rule) {
        if (!arguments.length) return this.#matchRule;
        if (this.$diffTagHydrate()) {
			this.#$matchRule = rule;
		} else this.#matchRule = rule;
		return this;
    }

    $matchRule() { return this.#$matchRule || this.matchRule(); }

	updateRule(rule) {
        if (!arguments.length) return this.#updateRule;
        if (this.$diffTagHydrate()) {
			this.#$updateRule = rule;
		} else this.#updateRule = rule;
		return this;
    }

    $updateRule() { return this.#$updateRule || this.updateRule(); }

	deleteRule(rule) {
        if (!arguments.length) return this.#deleteRule;
        if (this.$diffTagHydrate()) {
			this.#$deleteRule = rule;
		} else this.#deleteRule = rule;
		return this;
    }

    $deleteRule() { return this.#$deleteRule || this.deleteRule(); }

	/* -- TRANSFORMS */

	dirtyCheck(deeply = false) {
		return super.dirtyCheck(deeply).concat(
			this.dirtyCheckProperties([
                'targetTable',
                'targetColumns',
                'matchRule',
                'updateRule',
                'deleteRule'
            ])
		);
	}

    generateDiff(nodeB, options) {
		return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
			targetTable: this.$targetTable()?.jsonfy(options),
			targetColumns: this.$targetColumns().slice(),
			matchRule: this.$matchRule(),
			updateRule: this.$updateRule(),
			deleteRule: this.$deleteRule(),
		}, {
			targetTable: nodeB.$targetTable()?.jsonfy(options),
			targetColumns: nodeB.$targetColumns().slice(),
			matchRule: nodeB.$matchRule(),
			updateRule: nodeB.$updateRule(),
			deleteRule: nodeB.$deleteRule(),
		}, options);
    }

    /* -- I/O */

	static fromJSON(context, json, callback = null) {
        if (!Array.isArray(json?.targetColumns)) return;
        return super.fromJSON(context, json, (instance) => {
            instance.targetTable(json.targetTable);
            instance.$diffTagHydrate(json.$targetTable, ($targetTable) => instance.targetTable($targetTable));
			instance.targetColumns(json.targetColumns);
            instance.$diffTagHydrate(json.$targetColumns, ($targetColumns) => instance.targetColumns($targetColumns));
			if (json.matchRule) instance.matchRule(json.matchRule);
            instance.$diffTagHydrate(json.$matchRule, ($matchRule) => instance.matchRule($matchRule));
			if (json.updateRule) instance.updateRule(json.updateRule);
            instance.$diffTagHydrate(json.$updateRule, ($updateRule) => instance.updateRule($updateRule));
			if (json.deleteRule) instance.deleteRule(json.deleteRule);
            instance.$diffTagHydrate(json.$deleteRule, ($deleteRule) => instance.deleteRule($deleteRule));
            callback?.(instance);
        });
	}

	jsonfy(options = {}, jsonIn = {}) {
		let json = super.jsonfy(options, this.diffMergeJsons({
            targetTable: this.#targetTable?.jsonfy(options),
            targetColumns: this.#targetColumns.slice(),
            ...(this.#matchRule ? { matchRule: this.#matchRule } : {}),
            ...(this.#updateRule ? { updateRule: this.#updateRule } : {}),
            ...(this.#deleteRule ? { deleteRule: this.#deleteRule } : {}),
			...jsonIn
        }, {
            targetTable: this.#$targetTable?.jsonfy(options),
            targetColumns: this.#$targetColumns.slice(),
            matchRule: this.#$matchRule,
            updateRule: this.#$updateRule,
            deleteRule: this.#$deleteRule,
		}, options));
        if (!(options.rootCDL instanceof RootCDL)) return json;
        if (!json) return; // AbstractColumnsMixin's return value can be undefined when options.tableCDL contains a matching dropped column
        // Handle gloabl changes
        const temp = { columnMutes: [], dropped: false };
        const handleDrop = (cd) => {
            if (cd && !cd.hasFlag('CASCADE')) throw new Error(`Cannot drop ${cd.KIND} ${cd.reference()} because other objects depend on it.`);
            temp.dropped = true;
            if (options.diff) {
                json = { ...json, status: 'obsolete' };
            }
        };
        const updateTargetPrefix = (argument) => {
            const $argument = argument.jsonfy(options);
            json = this.diffMergeJsons(json, { targetTable: { ...json.targetTable, prefix: $argument } }, options);
            if (options.diff !== false) {
                if (!json.CDLIgnoreList) json.CDLIgnoreList = [];
                json.CDLIgnoreList.push('targetTable');
            }
        };
        const updateTargetName = (argument) => {
            const $argument = argument.jsonfy(options);
            json = this.diffMergeJsons(json, { targetTable: { ...json.targetTable, ...$argument } }, options);
            if (options.diff !== false) {
                if (!json.CDLIgnoreList) json.CDLIgnoreList = [];
                json.CDLIgnoreList.push('targetTable');
            }
        };
        const updateTargetColumns = () => {
            const targetColumns = this.resolveColumnReferences(json.targetColumns, temp.columnMutes, true);
            if (targetColumns.length !== json.targetColumns.length) {
                // A column was dropped
                handleDrop();
            } else if (_intersect(targetColumns, json.targetColumns).length !== json.targetColumns.length) {
                // A column was renamed
                json = this.diffMergeJsons(json, { targetColumns }, options);
                if (options.diff !== false) {
                    if (!json.CDLIgnoreList) json.CDLIgnoreList = [];
                    json.CDLIgnoreList.push('targetColumns');
                }
            }
        }
        const matchPrefix = (reference) => reference?.identifiesAs(this.$targetTable().prefix(true));
        const matchName = (reference) => reference?.identifiesAs(this.$targetTable().name());
        const scanTableCDL = (tableCDL) => {
            for (const cd of tableCDL) {
                if (cd.CLAUSE === 'RENAME') {
                    if (!cd.KIND) updateTargetName(cd.argument());              // RENAME TBL
                    else if (cd.KIND === 'COLUMN') temp.columnMutes.push(cd);   // RENAME COL
                } else if (cd.CLAUSE === 'SET') {
                    if (cd.KIND === 'SCHEMA') updateTargetPrefix(cd.argument());// RELOCATE TBL
                } else if (cd.CLAUSE === 'DROP') {
                    if (cd.KIND === 'COLUMN') temp.columnMutes.push(cd);        // DROP COL
                }
            }
        };
        const scanDatabaseCDL = (databaseCDL) => {
            for (const cd of databaseCDL) {
                if (cd.CLAUSE === 'RENAME') {
                    if (!cd.KIND) updateTargetPrefix(cd.argument());            // RENAME DB
                    else if (matchName(cd.reference())) updateTargetName(cd.argument());    // RENAME TBL
                } else if (!matchName(cd.reference?.())) continue;
                if (cd.CLAUSE === 'ALTER') scanTableCDL(cd.argument());         // ALTER TBL
                else if (cd.CLAUSE === 'DROP') handleDrop(cd);                  // DROP TBL
            }
        };
        const scanRootCDL = (rootCDL) => {
            for (const cd of rootCDL) {
                if (!matchPrefix(cd.reference?.())) continue;
                if (cd.CLAUSE === 'RENAME') updateTargetPrefix(cd.argument());  // RENAME DB
                else if (cd.CLAUSE === 'ALTER') scanDatabaseCDL(cd.argument()); // ALTER DB
                else if (cd.CLAUSE === 'DROP') handleDrop(cd);                  // DROP DB
            }
        };
        scanRootCDL(options.rootCDL);
        updateTargetColumns();
        if (temp.dropped && !options.diff) return;// Physically drop
        return json;
	}

    static parse(context, expr, parseCallback) {
        let { name, expr: $expr = '' } = this.parseName(context, expr, true);
		let instance;
		if (this.checkIsColumn(context)) {
			if (!($expr = $expr.match(/^REFERENCES\s+([\s\S]+)$/i)?.[1])) return;
			instance = new this(context);
		} else {
			if (!/^FOREIGN\s+KEY/i.test($expr)) return;
			instance = new this(context);
			const [ , columnsExpr, ...rest ] = Lexer.split($expr, []);
			instance.columns(this.parseColumns(context, columnsExpr));
			$expr = rest.join('').trim().match(/^REFERENCES\s+([\s\S]+)$/i)?.[1];
		}
        const [ table_maybeQualified, cols, opts = '' ] = Lexer.split($expr, []);
        const targetTable = parseCallback(instance, table_maybeQualified.trim(), [GlobalTableRef]);
        const targetColumns = Lexer.split(_unwrap(cols, '(', ')'), [',']).map(col => this.parseIdent(context, col.trim())[0]);
        const matchReferentialRule = (str, type) => {
            if (type === 'MATCH') return str.match(/MATCH\s+(\w+)/i)?.[1];
            const referentialActionRe = /(NO\s+ACTION|RESTRICT|CASCADE|(SET\s+NULL|SET\s+DEFAULT)(?:\s+\(([^\)]+)\))?)/;
            const [ , keyword1, keyword2, keyword2Columns ] = str.match(new RegExp(`ON\\s+${ type }\\s+${ referentialActionRe.source }`, 'i')) || [];
            return keyword2 ? (!keyword2Columns ? keyword2 : { rule: keyword2, targetColumns: keyword2Columns.split(',').map(s => s.trim()) }) : keyword1;
        };
        return instance
			.name(name)
            .targetTable(targetTable)
            .targetColumns(targetColumns)
            .matchRule(matchReferentialRule(opts, 'MATCH'))
            .updateRule(matchReferentialRule(opts, 'UPDATE'))
            .deleteRule(matchReferentialRule(opts, 'DELETE'));
    }

    stringify() {
		let sql = !this.isColumnLevel
			? `${ this.stringifyName() }FOREIGN KEY${ this.stringifyColumns() } `
			: this.stringifyName();
		sql += `REFERENCES ${ this.$targetTable() } (${ this.$targetColumns().map(c => this.stringifyIdent(c)).join(', ') })`;
        const serializeReferentialRule = rule => typeof rule === 'object' && rule ? `${ rule.rule } (${ rule.targetColumns.join(', ') })` : rule;
        if (this.$matchRule()) { sql += ` MATCH ${ this.$matchRule() }`; }
        if (this.$updateRule()) { sql += ` ON UPDATE ${ serializeReferentialRule(this.$updateRule()) }`; }
        if (this.$deleteRule()) { sql += ` ON DELETE ${ serializeReferentialRule(this.$deleteRule()) }`; }
        return sql;
    }
}