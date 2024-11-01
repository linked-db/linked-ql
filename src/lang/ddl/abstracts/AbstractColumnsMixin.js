import { _unwrap } from '@webqit/util/str/index.js';
import { _intersect } from '@webqit/util/arr/index.js';
import { Lexer } from '../../Lexer.js';

export const AbstractColumnsMixin = Class => class extends Class {

    #columns = [];
    #$columns = [];

    columns(columns) {
        if (this.isColumnLevel) {
            if (arguments.length) throw new Error(`The "columns" attributes for column-level constraints is implicit.`);
            return [this.contextNode.name()];
        }
        if (!arguments.length) return this.#columns;
        if (!Array.isArray(columns) || !columns.length) throw new Error(`Columns list must be a non-empty array`);
        if (this.$diffTagHydrate()) {
            this.#$columns = columns;
        } else this.#columns = columns;
        return this;
    }

    $columns() { return this.#$columns.length ? this.#$columns : this.columns(); }

    /* -- TRANSFORMS */

    dirtyCheck(deeply = false) {
        return super.dirtyCheck(deeply).concat(
            this.dirtyCheckProperties(['columns'])
        );
    }

    generateDiff(nodeB, options) {
        if (this.isColumnLevel) return super.generateDiff(nodeB, options);
        return this.diffMergeJsons({
            ...super.generateDiff(nodeB, options),
            columns: this.$columns(),
        }, {
            columns: nodeB.$columns(),
        }, options);
    }

    resolveColumnReferences(cols, actions, requireCascadeDirective = false) {
        return cols.reduce((cc, c) => {
            const transforms = actions.filter(a => ['DROP', 'RENAME'].includes(a.CLAUSE) && a.KIND === 'COLUMN' && a.reference().identifiesAs(c)).reduce((aa, a) => a.CLAUSE === 'DROP' ? [a].concat(aa) : aa.concat(a), []);
            if (!transforms.length) return cc.concat(c);
            if (transforms[0].CLAUSE === 'DROP') {
                if (!transforms[0].hasFlag('CASCADE') && requireCascadeDirective) throw new Error(`Cannot drop column ${transforms[0].reference()} because other objects depend on it.`);
                return cc;
            }
            if (transforms[0].CLAUSE === 'RENAME') return cc.concat(transforms[0].argument().name());
        }, []);
    }

    /* -- I/O */

    static fromJSON(context, json, callback = null) {
        if (!this.checkIsColumn(context) && !Array.isArray(json.columns)) return;
        return super.fromJSON(context, json, (instance) => {
            if (!this.checkIsColumn(context) && Array.isArray(json.columns)) instance.columns(json.columns);
            if (!this.checkIsColumn(context)) instance.$diffTagHydrate(json.$columns, ($columns) => instance.columns($columns));
            callback?.(instance);
        });
    }

    jsonfy(options = {}, jsonIn = {}) {
        if (this.isColumnLevel && !options.withColumns) return super.jsonfy(options, jsonIn);
        let json = super.jsonfy(options, this.diffMergeJsons({
            columns: this.columns()/* IMPORTANT; options.withColumns */.slice(),
            ...jsonIn
        }, {
            columns: this.#$columns.slice(),
        }, options));
        if (!options.tableCDL) return json;
        const columns = this.resolveColumnReferences(json.columns, options.tableCDL.actions());
        if (columns.length !== json.columns.length) {
            // A column was dropped
            if (!options.diff) return;
            return { ...json, status: 'obsolete' };
        }
        if (_intersect(columns, json.columns).length !== json.columns.length) {
            // A column was renamed
            json = this.diffMergeJsons(json, { columns }, options);
            if (options.diff !== false) {
                if (!json.CDLIgnoreList) json.CDLIgnoreList = [];
                json.CDLIgnoreList.push('columns');
            }
        }
        return json;
    }

    /* -- UTILS */

    static parseColumns(context, columnsExpr, asInputDialect = true) {
        return Lexer.split(_unwrap(columnsExpr, '(', ')'), [',']).map(columnExpr => {
            return this.parseIdent(context, columnExpr.trim(), false, asInputDialect)[0];
        });
    }

    stringifyColumns() { return ` (${this.$columns().map(c => this.stringifyIdent(c)).join(', ')})`; }
}