import { AbstractNameableNode } from '../../abstracts/AbstractNameableNode.js';
import { ConstraintCDL } from '../ConstraintCDL.js';

export class AbstractConstraint extends AbstractNameableNode {
    static get TYPE() { return this.NODE_NAME.replace(/TABLE_|COLUMN_|_CONSTRAINT|_CLAUSE/ig, ''); }

	get TYPE() { return this.constructor.TYPE; }

    renderCDL(columnCDL, options) {
        let json = this.jsonfy(options);
        return json;
    }

    generateCDL() {
        const constraintCDL = ConstraintCDL.fromJSON(this, { actions: [] });
        return constraintCDL;
    }

    generateDiff(nodeB, options) {
        return {
            type: this.TYPE,
            ...super.generateDiff(nodeB, options),
        };
    }

    /* -- I/O */

    static fromJSON(context, json, callback = null) {
        if (json?.type !== this.TYPE) return;
        return super.fromJSON(context, json, callback);
    }

	jsonfy(options = {}, jsonIn = {}) {
        return super.jsonfy(options, {
            type: this.TYPE, ...jsonIn
        });
    }

    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !(new RegExp(`^${ this.TYPE === 'AUTO_INCREMENT' ? this.TYPE : this.TYPE.replace('_', '\\s+') }$`, 'i')).test($expr)) return;
        return (new this(context)).name(name);
    }

    stringify() { return this.TYPE === 'AUTO_INCREMENT' ? this.TYPE : `${ this.stringifyName() }${ this.TYPE.replace('_', ' ') }`; }

    /* -- UTILS */

    static parseName(context, expr, asInputDialect = false) {
        const escChar = this.getEscChar(context, asInputDialect);
        const nameRegex = `(?:CONSTRAINT(?:` + `\\s+(\\w+)` + `|` + `\\s+(${ escChar })((?:\\2\\2|[^\\2])+)\\2` + `)\\s+)?`;
        const [ , nameUnscaped, /*esc*/, nameEscaped = '', rest = '' ] = expr.match(new RegExp(`^${ nameRegex }([\\s\\S]+)$`, 'i')) || [];
        return { name: nameUnscaped || this.unesc(escChar, nameEscaped), expr: rest.trim() };
    }

    stringifyName() { return this.$name() ? `CONSTRAINT ${ this.stringifyIdent(this.$name()) } ` : ''; }
}