import { _last as _arrLast, _from as _arrFrom } from '@webqit/util/arr/index.js';
import { _isObject } from '@webqit/util/js/index.js';

export function parseArgv(argv) {
    let command = argv[2], args = argv.slice(3), keywords = {}, flags = {}, payload = {}, ellipsis;
    if (_arrLast(args) === '...') {
        args.pop();
        ellipsis = true;
    }
    args.forEach(arg => {
        if (arg.indexOf('=') > -1 || arg.startsWith('--')) {
            let target = payload;
            if (arg.startsWith('--')) {
                target = flags;
                arg = arg.substr(2);
            }
            if (arg.indexOf('+=') > -1) {
                arg = arg.split('+=');
                const arg_name = arg[0];
                target[arg_name] = _arrFrom(target[arg_name]);
                target[arg_name].push(arg[1]);
            } else {
                arg = arg.split('=');
                const arg_name = arg[0];
                target[arg_name] = arg.length === 1 || arg[1] === 'true' ? true : (arg[1] === 'false' ? false : arg[1]);
            }
        } else {
            keywords[arg] = true;
        }
    });
    return {
        command,
        keywords,
        payload,
        flags,
        ellipsis,
    }
}

export function $eq(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && (b = b.slice(0).sort())
        && a.slice(0).sort().every((x, i) => $eq(x, b[i]));
    }
    if (_isObject(a) && _isObject(b)) {
        const temp = {};
        return (temp.keys_a = Object.keys(a)).length === (temp.keys_b = Object.keys(b)).length
        && temp.keys_a.reduce((prev, k) => prev && $eq(a[k], b[k]), true);
    }
    if (typeof a === 'string' && typeof b === 'string') {
        return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
}