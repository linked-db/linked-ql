
import Lexer from '../../../Lexer.js';
import { _unwrap } from '@webqit/util/str/index.js';
import AbstractLevel1Constraint from './AbstractLevel1Constraint.js';

export default class AbstractLevel2Constraint extends AbstractLevel1Constraint {

    /**
	 * @inheritdoc
	 */
    columns() { return !('COLUMNS' in this) ? [this.CONTEXT.name()] : []; }

	/**
	 * @inheritdoc
	 */
	toJson() {
        let json = { type: this.TYPE, ...super.toJson(), };
        if (!('name' in json)) {
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
        if (!('name' in json)) {
            // Automatically generate a default name for PRIMARY_KEY,FOREIGN_KEY,UNIQUE_KEY,CHECK
            json = { ...json, name: `auto_name_${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }` };
        }
        return super.fromJson(context, json, callback);
    }

    static parseColumns(context, columnsExpr, asInputDialect = false)  {
        return Lexer.split(_unwrap(columnsExpr, '(', ')'), [',']).map(columnExpr => {
            return this.parseIdent(context, columnExpr.trim(), asInputDialect)[0];
        });
    }
}