import { _isObject } from '@webqit/util/js/index.js';
import { _intersect } from '@webqit/util/arr/index.js';
import { _beforeLast, _afterLast } from '@webqit/util/str/index.js';
import Identifier from '../../components/Identifier.js';
import Literal from '../../components/Literal.js';
import Str from '../../components/str/Str.js';
import ColumnsList from './ColumnsList.js';
import ValuesList from './ValuesList.js';

export default Class => class extends Class {

    /**
     * @returns Bool
     */
    get dimensional() { return false; }

    /**
     * @returns Node
     */
    async resolveDimensions(inPlace = false) {
        if (!inPlace) return await this.clone().resolveDimensions(true);
        // ----
        const action = this.constructor.name === 'UpdateStatement' ? 'update' : (this.onConflict() ? 'upsert' : 'insert');
        const rootSchema = await this.client.structure({ depth: 2, inSearchPathOrder: true });
        const tblName = this.$trace('get:TABLE_NAME');
        const dbName = this.$trace('get:DATABASE_NAME') || rootSchema.findPath(tblName, true);
        const tblSchema = rootSchema.database(dbName).table(tblName);
		const lhsTablePK = getPrimaryKey(tblSchema);
		const columnsDef = Object.fromEntries(tblSchema.COLUMNS.map(c => [c.name(), c]));
		const relations = { dependencies: new Map, dependents: new Map };
        const offload = (rowOffset, lhsTableFK, valEntry) => {
            if (columnsDef[lhsTableFK]?.foreignKey() && [Literal].some(x => valEntry instanceof x) && _isObject(valEntry.INPUT)) {
                const fkDef = columnsDef[lhsTableFK].foreignKey();
                const rhsTableName = fkDef.targetTable();
                const rhsTablePK = fkDef.targetColumns()[0];
                if (!relations.dependencies.has(rhsTableName)) relations.dependencies.set(rhsTableName, new Map);
                relations.dependencies.get(rhsTableName).set([rowOffset, lhsTableFK, rhsTablePK], valEntry);
                return;
            }
            if (lhsTableFK.includes(':') && !columnsDef[lhsTableFK] && [Literal].some(x => valEntry instanceof x) && Array.isArray(valEntry.INPUT)) {
                const [ rhsTableName, rhsTableFK ] = [ _beforeLast(lhsTableFK, ':'), _afterLast(lhsTableFK, ':') ];
                if (!relations.dependents.has(rhsTableName)) relations.dependents.set(rhsTableName, new Map);
                relations.dependents.get(rhsTableName).set([rowOffset, lhsTablePK, rhsTableFK], valEntry);
                return true;
            }
            if (!columnsDef[lhsTableFK]) {
                const targetIdent = Identifier.fromJSON(this, [ dbName, tblName ]);
                throw new Error(`Unknown column name ${ targetIdent }."${ lhsTableFK }"`);
            }
        };
        // ----
        if (this.set())/*Both Insert & Update*/ {
            this.set().filterInplace((target_s, value_s, colOffset) => {
                if (target_s instanceof ColumnsList) {
                    if (value_s instanceof ValuesList) {
                        return value_s.filterInplace((subValEntry, subColOffset) => {
                            const lhsTableFK = target_s.getEntry(subColOffset).name().toLowerCase();
                            const offloaded = offload(0, lhsTableFK, subValEntry);
                            if (offloaded) target_s.removeEntry(subColOffset);
                            return !offloaded;
                        }).length;
                    }
                    return true;
                }
                const lhsTableFK = target_s.name().toLowerCase();
                return !offload(0, lhsTableFK, value_s);
            });
        } else if (this.columns?.() && this.values().length) {
            this.values().forEach((rowEntry, rowOffset) => rowEntry.filterInplace((valEntry, colOffset) => {
                const lhsTableFK = this.columns().getEntry(colOffset).name().toLowerCase();
                const offloaded = offload(rowOffset, lhsTableFK, valEntry);
                if (offloaded) this.columns().removeEntry(colOffset);
                return !offloaded;
            }));
        }
        // Hook for dependencies
		const preHook = async () => {
			for (const [ rhsTableName, catalog ] of relations.dependencies) {
				const catalogStructure = [...catalog.keys()];
				const rhsPayload = [...catalog.values()];
				const rhsReturns = await this.client.database(dbName).table(rhsTableName)[action](rhsPayload.map(node => node.INPUT), { experimentalRecursive: true, returning: catalogStructure[0][2]/*rhsTablePK*/ });
				catalogStructure.forEach(([ /*rowOffset*/, /*lhsTableFK*/, rhsTablePK ], mapKey_PayloadOffset) => {
					// Apply PK value from dimension row to base row
                    const returnValue = (pkValue => typeof pkValue === 'number' ? pkValue : Str.fromJSON(this, pkValue))(rhsReturns[mapKey_PayloadOffset][rhsTablePK]);
					rhsPayload[mapKey_PayloadOffset].literal(returnValue);
				});
			}
		};
		// Hook for dependents
        const originalReturning = this.returning().slice();
        const originalReturningFor = key => originalReturning.find(field => [key,'*'].includes(field.expr().name?.()));
		const postHook = async lhsReturns => {
			for (const [ rhsTableName, catalog ] of relations.dependents) {
				const catalogStructure = [...catalog.keys()];
				const rhsPayloadMap = [...catalog.values()];
				const rhsPayload = [];
                let rhsReturningAll;
				catalogStructure.forEach(([ rowOffset, lhsTablePK, rhsTableFK ], mapKey_PayloadListOffset) => {
					// Apply PK value from base row to every row in dimension paylaod and flatten payload
					rhsPayloadMap[mapKey_PayloadListOffset].INPUT.forEach(row => rhsPayload.push({ ...row, [rhsTableFK]: lhsReturns[rowOffset][lhsTablePK] }));
					// Keep coordinates of flattened
                    const originalLhsFk = `${ rhsTableName }:${ rhsTableFK }`;
					if (originalReturningFor(originalLhsFk)) {
                        rhsReturningAll = true;
						const payloadOffsetLen = rhsPayloadMap[mapKey_PayloadListOffset].INPUT.length, payloadOffsetStart = rhsPayload.length - payloadOffsetLen;
						lhsReturns[rowOffset][originalLhsFk] = rhsReturns => rhsReturns.slice(payloadOffsetStart, payloadOffsetStart + payloadOffsetLen);
					}
				});
				// Save payload (flattened)
				const rhsReturns = await this.client.database(dbName).table(rhsTableName)[action](rhsPayload, { experimentalRecursive: true, returning: rhsReturningAll && '*' });
				// Return list should now map to original field
				if (rhsReturningAll) {
					lhsReturns.forEach(row => Object.keys(row).forEach(key => {
						if (typeof row[key] === 'function') row[key] = row[key](rhsReturns);
					}));
				}
			}
			// Is caller expecting a returning list???
			if (!originalReturning.length) return lhsReturns.length;
			if (!originalReturningFor(lhsTablePK)) {
				lhsReturns = lhsReturns.map(row => { const { [lhsTablePK]: _, ...$row } = row; return $row; });
			}
			return lhsReturns;
		};
		// Our final columns, values, modifiers:
		if (relations.dependents.size && !originalReturningFor(lhsTablePK)) {
            // We need this PK column and will exclude it from final return list afterward
			this.RETURNING_LIST.push(Identifier.fromJSON(this, lhsTablePK));
		}
		return [ this, preHook, postHook ];
    }

    $trace(request, ...args) {
		if (['event:CONNECTED', 'event:DISCONNECTED'].includes(request)) {
			if (request === 'event:DISCONNECTED');
			else if (request === 'event:CONNECTED');
		}
		return super.$trace(request, ...args);
	}
}

const getPrimaryKey = tblSchema => {
	const primaryKey = tblSchema.primaryKey()?.columns()[0];
	if (!primaryKey) throw new Error(`Cannot resolve primary key name for implied record.`);
	return primaryKey;
};