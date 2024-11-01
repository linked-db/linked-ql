import { AbstractNode } from './../../AbstractNode.js';
import { Lexer } from '../../Lexer.js';

export class AbstractCDL extends AbstractNode {

    #actions = [];

    [Symbol.iterator]() { return this.#actions[Symbol.iterator](); }

    get length() { return this.#actions.length; }

    actions() { return this.#actions; }

    add(...args) {
        if (typeof args[0] === 'string') {
            const clause = args.shift();
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            const Type = this.constructor.EXPECTED_TYPES.find(t => t.CLAUSE === clause);
            if (!Type) throw new Error(`Unsupported clause: ${clause}`);
            const action = new Type(this, ...args);
            this.#actions = this.$castInputs([action], this.constructor.EXPECTED_TYPES, this.#actions, 'actions');
            if (callback) callback(action);
            else return action;
        } else this.#actions = this.$castInputs(args, this.constructor.EXPECTED_TYPES, this.#actions, 'actions');
        return this;
    }

	static fromJSON(context, json, callback = null) {
		if (!Array.isArray(json?.actions)) return;
		return super.fromJSON(context, json, (instance) => {
            instance.add(...json.actions);
            callback?.(instance);
        });
	}

	jsonfy(options = {}, jsonIn = {}) {
		return super.jsonfy(options, {
			actions: this.#actions.map(action => action.jsonfy(options)),
			...jsonIn
		});
	}
    
    parse(context, expr, parseCallback) {
        const instance = new this(context);
        return instance.add(...Lexer.split(expr, [',']).map(actionExpr => parseCallback(instance, actionExpr.trim(), this.EXPECTED_TYPES)));
    }

    stringify() { return this.actions().join(',\n'); }
}