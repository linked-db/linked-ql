
import Identifier from '../Identifier.js';
import CaseConstruct from '../case/CaseConstruct.js';
import Condition from '../Condition.js';
import Assertion from '../Assertion.js';
import TypeCast from '../TypeCast.js';
import Parens from '../Parens.js';
import Path from '../Path.js';
import Math from '../Math.js';
import Aggr from '../Aggr.js';
import Func from '../Func.js';
import Json from '../json/Json.js';
import JsonPath from '../json/JsonPath.js';
import Str from '../str/Str.js';
import StrJoin from '../str/StrJoin.js';
import Num from '../Num.js';
import Prim from '../Prim.js';
import Placeholder from '../Placeholder.js';

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
				const $instance = Types.reduce((prev, Type) => prev || (Type.factoryMethods ? (methodName in Type.factoryMethods && Type.factoryMethods[methodName](context, ...args)) : (methodName in Type.prototype && new Type(context))), null);
				if (!$instance) throw new Error(`Unknow method: ${ methodName }()`);
				instance = $instance;
				if ($instance[methodName]) return $instance[methodName](...args); // Foward the call
				for (const f of args) f($instance); // It's just magic method mode
			};
			json(new Proxy({}, { get: (t, name) => router(name) }));
			return instance;
		}
		return this.fromJson(context, json, Types);
	}

	/**
	 * @inheritdoc
	 */
	static fromJson(context, arg, Types = this.Types) {
		const instance = Types.reduce((prev, Type) => prev || (arg instanceof Type ? arg : Type.fromJson(context, arg)), null);
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
			Str,
			Num,
			Prim,
			Placeholder,
			Identifier,
		];
	}
}