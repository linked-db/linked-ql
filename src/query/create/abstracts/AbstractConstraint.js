
import { _unwrap } from '@webqit/util/str/index.js';
import Lexer from '../../Lexer.js';
import Node from '../../abstracts/Node.js';

export default class AbstractConstraint extends Node {

    /**
     * @returns Object
     */
    stringifyName() { return this.CONSTRAINT_NAME ? `CONSTRAINT ${ this.autoEsc(this.CONSTRAINT_NAME) }` : ''; }

    /**
     * @returns Object
     */
    stringifyReference() {
        const basename = this.DETAIL.basename || this.BASENAME;
        const serializeReferentialRule = rule => typeof rule === 'object' && rule ? `${ rule.rule } (${ rule.columns.join(',') })` : rule;
        let sql = `${ this.autoEsc([basename, this.DETAIL.table].filter(s => s)).join('.') } (${
            this.autoEsc(this.DETAIL.columns).join(',')
        })`;
        if (this.DETAIL.matchRule) { sql += ` MATCH ${ this.DETAIL.matchRule }`; }
        if (this.DETAIL.updateRule) { sql += ` ON UPDATE ${ serializeReferentialRule(this.DETAIL.updateRule) }`; }
        if (this.DETAIL.deleteRule) { sql += ` ON DELETE ${ serializeReferentialRule(this.DETAIL.deleteRule) }`; }
        return sql;
    }

    /**
     * @returns Object
     */
    stringifyCheck() { return `(${ this.DETAIL.expr })`; }

    /**
     * @returns Object
     */
    static parseName(context, expr, asInputDialect = false) {
        const escChar = this.getEscChar(context, asInputDialect);
        const nameRegex = `(?:CONSTRAINT(?:` + `\\s+(\\w+)` + `|` + `\\s+(${ escChar })((?:\\2\\2|[^\\2])+)\\2` + `)\\s+)?`;
        const [ , nameUnscaped, /*esc*/, nameEscaped, rest = '' ] = expr.match(new RegExp(`^${ nameRegex }([\\s\\S]+)$`, 'i')) || [];
        return { constraintName: nameUnscaped || this.autoUnesc(context, nameEscaped), expr: rest.trim() };
    }

    /**
     * @returns Object
     */
    static parseReference(context, expr) {
        const [ table_maybeQualified, cols, opts = '' ] = Lexer.split(expr, []);
        const [table, basename] = this.parseIdent(context, table_maybeQualified.trim(), true);
        const columns = Lexer.split(_unwrap(cols, '(', ')'), [',']).map(col => this.parseIdent(context, col.trim(), true)[0]);
        const matchReferentialRule = (str, type) => {
            if (type === 'MATCH') return str.match(/MATCH\s+(\w+)/i)?.[1];
            const referentialActionRe = /(NO\s+ACTION|RESTRICT|CASCADE|(SET\s+NULL|SET\s+DEFAULT)(?:\s+\(([^\)]+)\))?)/;
            const [ , keyword1, keyword2, keyword2Columns ] = str.match(new RegExp(`ON\\s+${ type }\\s+${ referentialActionRe.source }`, 'i')) || [];
            return keyword2 ? (!keyword2Columns ? keyword2 : { rule: keyword2, columns: keyword2Columns.split(',').map(s => s.trim()) }) : keyword1;
        };
        return {
            basename,
            table,
            columns,
            matchRule: matchReferentialRule(opts, 'MATCH'),
            updateRule: matchReferentialRule(opts, 'UPDATE'),
            deleteRule: matchReferentialRule(opts, 'DELETE'),
        };
    }

    /**
     * @returns Object
     */
    static parseCheck(expr) {
        const [ , $expr, opts = '' ] = Lexer.split(expr, []);
		return { expr: _unwrap($expr, '(', ')') };
    }
}