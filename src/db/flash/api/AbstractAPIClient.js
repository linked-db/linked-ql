import { normalizeQueryArgs } from '../../abstracts/util.js';
import { AbstractClient } from '../../abstracts/AbstractClient.js';
import { registry } from '../../../lang/registry.js';

export class AbstractAPIClient extends AbstractClient {

    async parse(requestSpec, { alias = null, dynamicWhereMode = false, ...options } = {}) {
    }

    async resolve(request, options = {}) {
    }

    async request(...args) {
        const [_request, options] = normalizeQueryArgs(...args);
        const request = await this.parse(_request, options);
        return await this._request(request, options);
    }

    async stream(...args) {
        const [_request, options] = normalizeQueryArgs(...args);
        const request = await this.parse(_request, options);
        return await this._stream(request, options);
    }

    async showCreate(selector, structured = false) {
        return await this._showCreate(selector, structured);
    }
}