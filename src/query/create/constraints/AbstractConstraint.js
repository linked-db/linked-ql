
import Lexer from '../../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import AbstractNode from '../abstracts/AbstractNode.js';

export default class AbstractConstraint extends AbstractNode {

    /**
     * @var Array
     */
    static get WRITABLE_PROPS() { return ['TYPE'].concat(super.WRITABLE_PROPS); }

	/**
	 * @inheritdoc
	 */
	toJson() {
        let json = { type: this.TYPE, ...super.toJson(), };
        if (!('name' in json) && ['PRIMARY_KEY','FOREIGN_KEY','UNIQUE_KEY','CHECK'].includes(json.type)) {
            // Key needs to be present
            json = { ...json, name: undefined };
        }
		return json;
	}

    /**
	 * @inheritdoc
	 */
    static fromJson(context, json, callback = null) {
        if (json?.type !== this.TYPE) return;
        if (!('name' in json) && ['PRIMARY_KEY','FOREIGN_KEY','UNIQUE_KEY','CHECK'].includes(json.type)) {
            // Automatically generate a default name for PRIMARY_KEY,FOREIGN_KEY,UNIQUE_KEY,CHECK
            json = { ...json, name: `auto_name_${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }` };
        }
        return super.fromJson(context, json, callback);
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

    static parseColumns(context, columnsExpr, asInputDialect = false)  {
        return Lexer.split(_unwrap(columnsExpr, '(', ')'), [',']).map(columnExpr => {
            return this.parseIdent(context, columnExpr.trim(), asInputDialect)[0];
        });
    }
}