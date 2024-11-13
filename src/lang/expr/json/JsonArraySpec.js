import { Exprs } from '../grammar.js';
import { AbstractSugar } from '../../AbstractSugar.js';
import { AbstractNodeList } from '../abstracts/AbstractNodeList.js';
import { Fn } from '../functions/Fn.js';

export class JsonArraySpec extends AbstractSugar(AbstractNodeList) {   
    static get EXPECTED_TYPES() { return Exprs; }
    static get TAGS() { return ['[', ']']; }
	static get DESUGARS_TO() { return [Fn]; }

	static get expose() {
		return {
			items: (context, ...entries) => this.fromJSON(context, { entries }),
		};
	}

    jsonfy(options = {}, jsonIn = {}, reducer = null) {
        if (!options.deSugar) return super.jsonfy(options, jsonIn, reducer);
        return {
            nodeName: Fn.NODE_NAME,
            name: this.params.dialect === 'mysql' ? 'JSON_ARRAY' : 'JSON_BUILD_ARRAY',
            args: this.entries().map(e => e.jsonfy(options)),
            originalSugar: this.stringify(),
        };
    }
}