import { SimpleEmitter } from '../../db/SimpleEmitter.js';

export class AbstractClient extends SimpleEmitter {

    _resolveQueryArgs(...args) {
        let query, options = {};
        if (typeof args[0] === 'object' && args[0] && args[0].query) {
            ({ query, ...options } = args[0]);
        } else {
            query = args.shift();
            if (Array.isArray(args[0])) {
                options.values = args.shift();
            }
            if (typeof args[0] === 'object' && args[0]) {
                options = { ...options, ...args.shift() };
            }
        }
        return [query, options];
    }
}