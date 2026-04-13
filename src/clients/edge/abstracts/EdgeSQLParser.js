import { SQLParser } from '../../../lang/SQLParser.js';

export class EdgeSQLParser extends SQLParser {

    #edgeClient;

    constructor({ edgeClient, ...options }) {
        super(options);
        this.#edgeClient = edgeClient;
    }

    async parse(query, options = {}) {
        if (options.preferRemote) {
            return await this.#edgeClient._parse(query, options);
        }
        return await super.parse(query, options);
    }
}