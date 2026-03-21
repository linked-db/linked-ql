import { SQLParser as BaseSQLParser } from '../../lang/SQLParser.js';

export class SQLParser extends BaseSQLParser {

    #client;

    constructor({ client, ...options }) {
        super(options);
        this.#client = client;
    }

    async parse(query, options = {}) {
        if (options.preferRemote) {
            return await this.#client._parse(query, options);
        }
        return await super.parse(query, options);
    }
}