
import CaseConstruct from './case/CaseConstruct.js';
import Identifier from './Identifier.js';
import Condition from './Condition.js';
import Assertion from './Assertion.js';
import TypeCast from './TypeCast.js';
import Parens from './Parens.js';
import Path from './Path.js';
import Math from './Math.js';
import Aggr from './Aggr.js';
import Func from './Func.js';
import Json from './json/Json.js';
import JsonPath from './json/JsonPath.js';
import StrJoin from './str/StrJoin.js';
import Str from './str/Str.js';
import Num from './Num.js';
import Literal from './Literal.js';
import Placeholder from './Placeholder.js';

export default class Expr {

	/**
	 * Cast an input to a node
	 */
	static cast(context, json, Types = this.Types) {
		if (typeof json === 'function') {
			if (Types.length === 1) {
				const instance = new Types[0](context);
				json(instance);
				return instance;
			}
			let instance;
			const router = methodName => (...args) => {
				const $instance = Types.reduce((prev, Type) => prev || (Type.factoryMethods ? (typeof Type.factoryMethods[methodName] === 'function' && Type.factoryMethods[methodName](context, ...args)) : (typeof Type.prototype[methodName] === 'function' && new Type(context))), null);
				if (!$instance) throw new Error(`Unknown method: ${ methodName }()`);
				instance = $instance;
				if ($instance[methodName]) return $instance[methodName](...args); // Foward the call
				for (const f of args) f($instance); // It's just magic method mode
			};
			json(new Proxy({}, { get: (t, name) => router(name) }));
			return instance;
		}
		return this.fromJSON(context, json, Types);
	}

	/**
	 * @inheritdoc
	 */
	static fromJSON(context, arg, Types = this.Types) {
		const instance = Types.find(t => arg instanceof t) ? arg : Types.reduce((prev, Type) => prev || Type.fromJSON(context, arg), null);
		if (!instance) throw new Error(``);
		return instance;
	}
	
	/**
	 * @inheritdoc
	 */
	static parse(context, expr, parseCallback) { return parseCallback(context, expr, this.Types); }

	/**
	 * @property Array
	 */
	static get Types() {
		return [
			Parens,
			CaseConstruct,
			StrJoin,
			Condition,
			Path, // Must come before Assertion; think: ~> vs >
			JsonPath, // ...
			Assertion,
			Math,
			TypeCast, // After anything with operators, but before function types; think CAST(c as text) vs CAST()
			Aggr,
			Func,
			Json,
			Num,
			Str,
			Placeholder,
			Identifier,
			Literal,
		];
	}
}