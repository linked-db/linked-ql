import { AbstractStmt } from '../lang/abstracts/AbstractStmt.js';
import { SchemaInference } from '../lang/SchemaInference.js';
import { AbstractClient } from './abstracts/AbstractClient.js';
import { AbstractDriver } from './abstracts/AbstractDriver.js';
import { RealtimeDriver } from './realtime/RealtimeDriver.js';
import { LocalDriver } from './local/LocalDriver.js';
import { normalizeQueryArgs } from './abstracts/util.js';
import { registry } from '../lang/registry.js';
import { Script } from '../lang/Script.js';

export class Client extends AbstractClient {

    #dbDriver;
    #realtimeDriver;
    #schemaInference;

    constructor(dbDriver) {
        super();
        if (!(dbDriver instanceof AbstractDriver)) {
            throw new TypeError('driver must be an instance of AbstractDriver');
        }
        if (dbDriver instanceof RealtimeDriver) {
            throw new Error(`driver cannot be an instance of RealtimeDriver`);
        }
        this.#dbDriver = new LocalDriver(dbDriver);
        this.#realtimeDriver = new RealtimeDriver(this.#dbDriver);
        this.#schemaInference = new SchemaInference({ driver: this.#dbDriver });
    }

    async query(...args) {
        let [query, options] = normalizeQueryArgs(...args);
        // Parsing...
        if (typeof query === 'string') {
            query = await Script.parse(query, { dialect: this.#dbDriver.dialect });
        } else if (!(query instanceof Script) && !(query instanceof AbstractStmt)) {
            throw new TypeError('query must be a string or an instance of Script | AbstractStmt');
        }
        if (query instanceof Script && query.length === 1) {
            query = query.entries()[0];
        }
        // Pre-validate live query request...
        if (options.live && !(query instanceof registry.BasicSelectStmt)) {
            throw new Error('Only SELECT statements are supported in live mode');
        }
        // Schema inference...
        const schemaSelector = {};
        query.walkTree((v) => {
            if (!(v instanceof registry.TableRef2)
                && !(v instanceof registry.TableRef1)) {
                return v;
            }
            const schemaName = v.qualifier()?._get('delim')
                ? v.qualifier().value()
                : v.qualifier()?.value().toLowerCase() || '*';
            const tableName = v._get('delim')
                ? v.value()
                : v.value().toLowerCase();
            if (!(schemaName in schemaSelector)) {
                schemaSelector[schemaName] = [];
            }
            if (!schemaSelector[schemaName].includes(tableName)) {
                schemaSelector[schemaName].push(tableName);
            }
        });
        await this.#schemaInference.provide(schemaSelector);
        // DeSugaring...
        query = query.deSugar(true, {}, null, this.#schemaInference);
        // Realtime query?
        if (options.live) {
            return await this.#realtimeDriver.query(query, options);
        }
        return await this.#dbDriver.query(query, options);
    }
}