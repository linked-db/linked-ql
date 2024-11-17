import { AlterTable } from '../lang/ddl/database/actions/AlterTable.js';
import { CreateTable } from '../lang/ddl/database/actions/CreateTable.js';
import { DropTable } from '../lang/ddl/database/actions/DropTable.js';
import { RenameTable } from '../lang/ddl/database/actions/RenameTable.js';
import { GlobalDatabaseRef } from '../lang/expr/refs/GlobalDatabaseRef.js';

export class AbstractDatabase {

    constructor(client, dbName, params = {}) {
        Object.defineProperty(this, '$', { value: { client, name: dbName, params } });
    }

    get client() { return this.$.client; }

    get name() { return this.$.name; }

    get ident() { return GlobalDatabaseRef.fromJSON(this, this.name); }

    get params() { return Object.assign({}, this.client.params, this.$.params); }

    async savepoint(params = {}) { return (await this.client.getSavepoints({ ...params, selector: this.name }))[0]; }

    async version() { return (await this.savepoint())?.versionTag() || 0; }

    async schema(tblSelector = '*') { return (await this.client.schema([{ name: this.name, tables: [].concat(tblSelector) }])).database(this.name); }

    async createTable(createSpec, params = {}) {
        if (typeof createSpec === 'string') { createSpec = { name: createSpec, columns: [] }; }
        const query = CreateTable.fromJSON(this, { kind: params.kind, argument: createSpec });
        query.argument().prefix(this.name);
        if (params.ifNotExists) query.withFlag('IF_NOT_EXISTS');
        if (params.returning) query.returning(params.returning);
        const returnValue = await this.client.execQuery(query, params);
        if (returnValue === true) return this.table(query.argument().name());
        return returnValue;
    }

    async renameTable(tblName, tblToName, params = {}) {
        const query = RenameTable.fromJSON(this, { kind: params.kind, reference: tblName, argument: tblToName });
        if (!query) throw new Error(`renameTable() called with invalid arguments.`);
        query.reference().prefix(this.name);
        if (params.returning) query.returning(params.returning);
        const returnValue = await this.client.execQuery(query, params);
        if (returnValue === true) return this.table(tblToName);
        return returnValue;
    }

    async alterTable(tblName, callback, params = {}) {
        if (typeof callback !== 'function') throw new Error(`alterTable() called with invalid arguments.`);
        return await this.client.withSchema(async () => {
            // -- Compose an query from request
            const tblSchema = await this.table(tblName).schema();
            if (!tblSchema) throw new Error(`Table "${tblName}" does not exist.`);
            const tblSchemaEditable = tblSchema.clone();
            await callback(tblSchemaEditable.$nameLock(true));
            const tableCDL = tblSchema.diffWith(tblSchemaEditable).generateCDL({ cascadeRule: params.cascadeRule, existsChecks: params.existsChecks });
            if (!tableCDL.length) return;
            const query = AlterTable.fromJSON(this, { kind: params.kind, reference: tblSchema.name(), argument: tableCDL });
            query.reference().prefix(this.name);
            if (params.ifExists) query.withFlag('IF_EXISTS');
            if (params.returning) query.returning(params.returning);
            const returnValue = await this.client.execQuery(query, params);
            if (returnValue === true) return this.table(this.client.extractPostExecName(query));
            return returnValue;
        });
    }

    async dropTable(tblName, params = {}) {
        const query = DropTable.fromJSON(this, { kind: params.kind, reference: tblName });
        if (!query) throw new Error(`dropTable() called with invalid arguments.`);
        query.reference().prefix(this.name);
        if (params.ifExists) query.withFlag('IF_EXISTS');
        if (params.restrict) query.withFlag('RESTRICT');
        else if (params.cascade) query.withFlag('CASCADE');
        if (params.returning) query.returning(params.returning);
        return this.client.execQuery(query, params);
    }

    async hasTable(name) {
        return (await this.tables()).includes(name);
    }

    async tables() {
        return (await this.schema()).tables(false);
    }

    table(name, params = {}) { return new this.constructor.Table(this, ...arguments); }

    $capture(requestName, requestSource) {
        return this.client.$capture(requestName, requestSource);
    }
}