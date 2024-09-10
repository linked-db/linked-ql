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
	toJSON(json = {}) {
        let $json = super.toJSON(json);
        if (!('name' in $json) && this.params.dialect !== 'mysql') {
            // Key needs to be present
            $json = { name: undefined, ...$json };
        }
		return $json;
	}

    /**
	 * @inheritdoc
	 */
    static fromJSON(context, json, callback = null) {
        if (json?.type !== this.TYPE) return;
        if (!('name' in json) && context?.params?.dialect !== 'mysql') {
            // Automatically generate a default name for PRIMARY_KEY,FOREIGN_KEY,UNIQUE_KEY,CHECK
            json = { name: `auto_name_${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`, ...json };
        }
        return super.fromJSON(context, json, callback);
    }

    static parseColumns(context, columnsExpr, asInputDialect = false)  {
        return Lexer.split(_unwrap(columnsExpr, '(', ')'), [',']).map(columnExpr => {
            return this.parseIdent(context, columnExpr.trim(), asInputDialect)[0];
        });
    }
}