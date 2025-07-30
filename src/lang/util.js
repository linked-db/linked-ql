import { _isObject } from '@webqit/util/js/index.js';

export function _eq(a, b, cs = false, ignoreList = null) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && (b = b.slice(0).sort())
            && a.slice(0).sort().every((x, i) => _eq(x, b[i], cs, ignoreList));
    }
    if (typeof a?.jsonfy === 'function') a = a.jsonfy();
    if (typeof b?.jsonfy === 'function') b = b.jsonfy();
    if (_isObject(a) && _isObject(b)) {
        const temp = {
            indexs_a: Object.keys(a),
            indexs_b: Object.keys(b),
        };
        if (ignoreList?.length) {
            const $ignoreList = [].concat(ignoreList);
            temp.indexs_a = temp.indexs_a.filter((k) => !$ignoreList.includes(k));
            temp.indexs_b = temp.indexs_b.filter((k) => !$ignoreList.includes(k));
        }
        return temp.indexs_a.length === temp.indexs_b.length
            && temp.indexs_a.reduce((prev, k) => prev && _eq(a[k], b[k], cs, ignoreList), true);
    }
    if (typeof a === 'string' && typeof b === 'string' && cs === false) {
        return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
}

export function _toCapsSnake(str) {
    // Handle cases like "myVariableName" -> "my_Variable_Name"
    // This regex looks for a lowercase letter or digit followed by an uppercase letter.
    // It inserts an underscore between them.
    let result = str.replace(/([a-z0-9])([A-Z])/g, '$1_$2');

    // Handle cases like "HTMLParser" -> "HTML_Parser" or "APICall" -> "API_Call"
    // This regex looks for an uppercase letter followed by another uppercase letter
    // which is then followed by a lowercase letter. This targets the transition
    // from an acronym to a new word.
    // Example: In "HTMLParser", it matches 'L' and then 'P' (uppercase) followed by 'a' (lowercase).
    // It inserts an underscore between the first uppercase letter and the second.
    result = result.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');

    // Convert the entire string to uppercase.
    return result.toUpperCase();
}