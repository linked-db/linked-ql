import { AbstractNode } from '../../AbstractNode.js';

export class AbstractAction extends AbstractNode {
    
	static get CLAUSE() { return this.NODE_NAME; }

	#KIND;
	#$KIND;
    
	get CLAUSE() { return this.constructor.CLAUSE; }
	get KIND() { return this.#KIND; }
    get $KIND() { return this.#$KIND || this.KIND; }

    constructor(contextNode, kind = null, $kind = null) {
        super(contextNode);
        this.#KIND = kind;
        this.#$KIND = $kind;
    }

	static fromJSON(context, json, callback = null) {
        if (json.clause && json.clause !== this.CLAUSE) return;
        return super.fromJSON(context, json, (instance) => {
            instance.#KIND = json.kind;
            instance.#$KIND = json.$kind;
            callback?.(instance);
        });
	}

	jsonfy(options = {}, jsonIn = {}) {
        return super.jsonfy(options, {
			clause: this.CLAUSE,
            kind: this.#KIND,
            ...(this.#$KIND ? { $kind: this.#$KIND } : {}),
			...jsonIn
        });
    }
}