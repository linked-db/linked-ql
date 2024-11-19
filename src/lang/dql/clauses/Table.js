import { SubQuery } from '../SubQuery.js';
import { AbstractAliasableExpr } from '../../expr/abstracts/AbstractAliasableExpr.js';
import { GlobalTableRef } from '../../expr/refs/GlobalTableRef.js';

export class Table extends AbstractAliasableExpr {
	static get EXPECTED_TYPES() { return [GlobalTableRef,SubQuery]; }
}