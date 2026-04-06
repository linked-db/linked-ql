import { registry } from '../../lang/registry.js';
import { SchemaInference as BaseSchemaInference } from '../../lang/SchemaInference.js';
import { SQLParser } from '../../lang/SQLParser.js';

export class FlashSchemaInference extends BaseSchemaInference {

    #storageEngine;
    #parser;
    get storageEngine() { return this.#storageEngine; }

    constructor({ storageEngine, ...options }) {
        super(options);
        this.#storageEngine = storageEngine;
        this.#parser = new SQLParser({ dialect: this.dialect });
    }

    async showCreate(selector, { structured = false, tx = null } = {}) {
        const resultSchemasJson = new Map;

        await this.#storageEngine._resolveRelationSelector(selector, async (tx, nsName, tblName) => {
            const tblDef = tx.showTable({ namespace: nsName, name: tblName }, { schema: true, ifExists: true });
            if (!tblDef) return;
            const tableSchema = await this.#parser.tableDef_to_tableAST(tblDef);

            const _nsName = structured ? nsName : '*';
            if (!resultSchemasJson.has(_nsName)) {
                resultSchemasJson.set(_nsName, {
                    nodeName: registry.NamespaceSchema.NODE_NAME,
                    name: { nodeName: registry.NamespaceIdent.NODE_NAME, value: _nsName },
                    entries: [],
                });
            }

            resultSchemasJson.get(_nsName).entries.push(tableSchema);
        }, { handlerMode: 'async', tx });

        const resultSchemas = [...resultSchemasJson.values()].map((nsSchemaJson) => registry.NamespaceSchema.fromJSON(nsSchemaJson, { assert: true, dialect: this.dialect }));
        if (structured) return resultSchemas;
        return resultSchemas[0]?.entries() || [];
    }
}