import { SubQuery } from '../dql/SubQuery.js';
import { PathRight } from './path/PathRight.js';
import { CaseConstruct } from './logic/CaseConstruct.js';
import { Assertion } from './logic/Assertion.js';
import { Condition } from './logic/Condition.js';
import { JsonPath } from './json/JsonPath.js';
import { JsonAgg } from './json/JsonAgg.js';
import { JsonObjectSpec } from './json/JsonObjectSpec.js';
import { JsonArraySpec } from './json/JsonArraySpec.js';
import { StrJoin } from './types/StrJoin.js';
import { Math } from './operators/Math.js';
import { Aggr } from './functions/Aggr.js';
import { Fn } from './functions/Fn.js';
import { Bool } from './types/Bool.js';
import { Json } from './types/Json.js';
import { Str } from './types/Str.js';
import { Num } from './types/Num.js';
import { TypeCast } from './types/TypeCast.js';
import { ColumnRef } from './refs/ColumnRef.js';
import { Literal } from './Literal.js';
import { Binding } from './Binding.js';
import { Parens } from './Parens.js';
import { RowSpec } from '../dml/clauses/RowSpec.js';
import { RowSpecClause } from '../dml/clauses/RowSpecClause.js';
import { ValuesSubClause } from '../dml/clauses/ValuesSubClause.js';
import { ForeignBinding } from './ForeignBinding.js';

export const Exprs = [
	SubQuery,
	// Expr
	CaseConstruct,
	// Operators
	StrJoin,
	Condition,
	PathRight,
	JsonPath,
	Assertion, // Must come after PathRight
	Math, // Must come after Assertion
	// Non-operators
	RowSpec, // Must come before Parens
	Parens,
	RowSpecClause,
	ValuesSubClause,
	JsonAgg,
	TypeCast, // After anything with operators, but before function types; think CAST(c as text) vs CAST()
	Aggr,
	Fn,
	Bool,
	Json,
	Num,
	Str,
	// Non-primitives
	JsonArraySpec,
	JsonObjectSpec,
	// Other
	Binding,
	ForeignBinding,
	// When not all above
	ColumnRef,
	// Lastly
	Literal,
];
