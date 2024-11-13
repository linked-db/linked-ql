import { AbstractSugar } from '../../AbstractSugar.js';
import { AbstractNodeList } from '../abstracts/AbstractNodeList.js';
import { Property } from './Property.js';
import { Str } from '../types/Str.js';
import { Fn } from '../functions/Fn.js';

export class JsonObjectSpec extends AbstractSugar(AbstractNodeList) {  
    static get EXPECTED_TYPES() { return [Property]; }
    static get TAGS() { return ['{', '}']; }
	static get DESUGARS_TO() { return [Fn]; }

	static get expose() {
		return {
			fields: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}

    jsonfy(options = {}, jsonIn = {}, reducer = null) {
        if (!options.deSugar) return super.jsonfy(options, jsonIn, reducer);
        return {
            nodeName: Fn.NODE_NAME,
            name: this.params.dialect === 'mysql' ? 'JSON_OBJECT' : 'JSON_BUILD_OBJECT',
            args: this.entries().reduce((args, property) => {
                const key = { nodeName: Str.NODE_NAME, value: property.alias(true) };
                const value = property.expr().jsonfy(options);
                return args.concat(key, value);
            }, []),
        };
    }
}