import { PathLeft } from './PathLeft.js';
import { GlobalTableRef } from '../refs/GlobalTableRef.js';

export class PathJunction extends PathLeft {
    static get RHS_TYPES() { return [GlobalTableRef]; }

	$capture(requestName, requestSource) {
		if (requestName === 'TABLE_SCHEMA') return this.rhs().schema();
		return super.$capture(requestName, requestSource);
	}

	schema() { return this.rhs().schema(); }
}
