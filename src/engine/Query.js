
import { _even } from '@webqit/util/obj/index.js';
import Aggregation from './Aggregation.js';
import AbstractCursor2D from './AbstractCursor2D.js';
import DataRow2D from './DataRow2D.js';

export default class Query {

	/**
	 * @constructor
	 */
	constructor(query) {
		this.query = query;
	}

	async confstructor() {
		const query = this.query;
		// -----
		// INITIALIZE DATASOURCES WITH JOIN ALGORITHIMS APPLIED
		const cursor2D = new AbstractCursor2D(
			query.TABLE_REFERENCES.concat(query.JOIN_CLAUSE),
			query.WHERE_CLAUSE
		);
		let dataRow2D, aggregation = [];
		while (dataRow2D = await cursor2D.fetch()) {
			aggregation.push(dataRow2D);
			cursor2D.next();
		}

		// -----
		// BUILD RESPONSE ROWS INTO THE "$$computed" KEY
		const aggrFields = { WIN:[], AGGR:[] };
		this.renderFields(aggregation, query.SELECT_LIST, field => {
			const aggrs = field.getAggrExprs();
			if (!aggrs.length) return true;
			if (aggrs.some(x => x.window)) {
				aggrFields.WIN.push(field);
			} else {
				aggrFields.AGGR.push(field);
			}
		});

		// -----
		// GROUP BY?
		const aggrExprs = query.refs.filter(x instanceof Aggr && !x.window);
		if (query.GROUP_BY_CLAUSE.length || aggrExprs.length) {
			const $aggregation = [];
			this.computeGroupBy(aggregation, query.GROUP_BY_CLAUSE, null, (subAggregation, subsequentDimensions) => {
				if (subsequentDimensions.length/*We're on end nodes*/ && !query.hasFlag('WITH_ROLLUP')) return;
				// Finallize or Rollup
				const isRollup = subsequentDimensions.length && query.hasFlag('WITH_ROLLUP');
				const summaryRow = new DataRow2D(subAggregation[0].$$structure, { isRollup });
				$aggregation.push(summaryRow);
				this.computeAggrFields([summaryRow], subAggregation, aggrFields.AGGR);
				if (!isRollup) return;
				for (let dime of subsequentDimensions) {
					const $dime = dime.stringify().split('.').pop();
					if ($dime in summaryRow.$$computed) {
						summaryRow.$$computed[$dime] = null;
					}
				}
			});
			// Our new aggregation
			aggregation = $aggregation;
		}

		// -----
		// WINDOWING
		const windowExprs = query.refs.filter(x instanceof Aggr && x.window);
		if (query.WINDOWS_CLAUSE || windowExprs.length) {
			for (const windowExpr of windowExprs) {
				let windowSpec = windowExpr;
				if (windowExpr.name) {
					const referencedWindow = query.WINDOWS_CLAUSE.find(win => win.name === windowExpr.name);
					if (!referencedWindow) throw new Error(`Window name "${ windowExpr.name }" is undefined!`);
					windowSpec = Object.assign({}, windowSpec, referencedWindow);
				}
				this.computeGroupBy(aggregation, windowSpec.partitionBy || [], windowSpec.orderBy, subAggregation => {
					this.computeAggrFields(aggregation, subAggregation, aggrFields.WIN);
				});
			}
		}

		// -----
		// ORDER BY AND LIMIT
		if (query.ORDER_BY_CLAUSE) { aggregation = this.computeOrderBy(aggregation, query.ORDER_BY_CLAUSE); }
		if (query.OFFSET_CLAUSE || query.LIMIT_CLAUSE) {
			const limit = query.LIMIT_CLAUSE ? (Array.isArray(query.LIMIT_CLAUSE) ? query.LIMIT_CLAUSE : [query.LIMIT_CLAUSE]).slice() : [];
			const offset = query.OFFSET_CLAUSE || (limit.length === 2 ? limit.shift() : 0);
			aggregation = limit.length ? aggregation.slice(offset, offset + limit[0]) : aggregation.slice(offset);
		}

		// -----
		// FINALIZE
		aggregation = aggregation.map(dataRow2D => dataRow2D.$$computed);
		if (query.hasFlag('DISTINCT')) { aggregation = aggregation.filter(dataRow2D => !aggregation.find(_dataRow2D => _even(dataRow2D, _dataRow2D))); }
		return aggregation;
	}
	
	renderFields(aggregation, fields, deferCallback = null) {
		for (const field of fields) {
			const alias = field.getAlias(), shouldEvalNow = !deferCallback(field);
			for (const dataRow2D of aggregation) {
				const value = shouldEvalNow ? field.eval(dataRow2D) : null;
				dataRow2D.$$computed[alias] = value;
			}
		}
	}
	
	computeAggrFields(aggregation, subAggregation, fields) {
		for (const field of fields) {
			const alias = field.alias, value = field.eval(subAggregation);
			for (const dataRow2D of aggregation) {
				dataRow2D.$$computed[alias] = value;
			}
		}
	}

	computeGroupBy(aggregation, dimensions, order = null, finallizeCallback) {
		const subAggregations = new Map;
		for (const dataRow2D of aggregation) {
			const value = dimensions[0].eval(dataRow2D);
			if (!subAggregations.has(value)) subAggregations.set(value, new Aggregation);
			subAggregations.get(value).add(dataRow2D);
		}
		for (let [ , subAggregation ] of subAggregations) {
			if (order) subAggregation = this.computeOrderBy(subAggregation, order);
			finallizeCallback(subAggregation, dimensions);
			// Drilldown... or call for finallize
			if (dimensions.length > 1) { this.computeGroupBy(subAggregation, dimensions.slice(1), order, finallizeCallback); }
		}
	}

	computeOrderBy(aggregation, dimensions) {
		return aggregation.slice(0).sort((vote1, vote2) => {
			for (const dime of dimensions) {
				// Sort by votes
				// If the first item has a higher number, move it down
				// If the first item has a lower number, move it up
				if (vote1.votes > vote2.votes) return -1;
				if (vote1.votes < vote2.votes) return 1;
			}
		});
	}
}