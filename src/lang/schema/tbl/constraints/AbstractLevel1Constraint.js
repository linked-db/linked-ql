import { _unwrap, _fromCamel } from '@webqit/util/str/index.js';
import AbstractNode from '../../AbstractNode.js';

export default class AbstractConstraint extends AbstractNode {

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['TYPE'].concat(super.WRITABLE_PROPS); }

    /**
	 * @var String
	 */
    static get TYPE() { return _fromCamel(this.name.replace(/TABLE|COLUMN|CONSTRAINT|CLAUSE/ig, ''), '_').toUpperCase(); }

    /**
	 * @var String
	 */
	get TYPE() { return this.constructor.TYPE; }

	toJSON(json = {}) { return super.toJSON({ type: this.TYPE, ...json }); }

    static fromJSON(context, json, callback = null) {
        if (json?.type !== this.TYPE) return;
        return super.fromJSON(context, json, callback);
    }

    /**
     * @returns String
     */
    stringify() { return this.TYPE === 'AUTO_INCREMENT' ? this.TYPE : `${ this.stringifyName() }${ this.TYPE.replace('_', ' ') }`; }

    /**
     * @returns Object
     */
    static parse(context, expr) {
        let { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !(new RegExp(`^${ this.TYPE === 'AUTO_INCREMENT' ? this.TYPE : this.TYPE.replace('_', '\\s+') }$`, 'i')).test($expr)) return;
        return (new this(context)).name(name);
    }

    /**
     * @returns Object
     */
    stringifyName() { return this.name() ? `CONSTRAINT ${ this.autoEsc(this.name()) } ` : ''; }

    /**
     * @returns Object
     */
    static parseName(context, expr, asInputDialect = false) {
        const escChar = this.getEscChar(context, asInputDialect);
        const nameRegex = `(?:CONSTRAINT(?:` + `\\s+(\\w+)` + `|` + `\\s+(${ escChar })((?:\\2\\2|[^\\2])+)\\2` + `)\\s+)?`;
        const [ , nameUnscaped, /*esc*/, nameEscaped, rest = '' ] = expr.match(new RegExp(`^${ nameRegex }([\\s\\S]+)$`, 'i')) || [];
        return { name: nameUnscaped || this.autoUnesc(context, nameEscaped), expr: rest.trim() };
    }
}