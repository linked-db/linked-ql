import { AbstractConstraint } from './AbstractConstraint.js';

export class AbstractLevel2Constraint extends AbstractConstraint {

    get constraintLevel() { return 2; }
    get isColumnLevel() { return this.constructor.checkIsColumn(this.contextNode); }

    static checkIsColumn(contextNode) { return contextNode?.constructor?.NODE_NAME === 'COLUMN_SCHEMA'; }

    /* -- I/O */

    static fromJSON(context, json, callback = null) {
        if (json?.type !== this.TYPE) return;
        if (!('name' in json) && context?.params?.dialect !== 'mysql') {
            // Automatically generate a default name for PRIMARY_KEY,FOREIGN_KEY,UNIQUE_KEY,CHECK
            json = { name: `auto_name_${ ( 0 | Math.random() * 9e6 ).toString( 36 ) }`, ...json };
        }
        return super.fromJSON(context, json, callback);
    }

	jsonfy(options = {}, jsonIn = {}) {
        let $json = super.jsonfy(options, jsonIn);
        if (!('name' in $json) && this.params.dialect !== 'mysql') {
            // Key needs to be present
            $json = { name: undefined, ...$json };
        }
		return $json;
	}
}