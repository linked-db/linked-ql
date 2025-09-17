import { AbstractNode } from './AbstractNode.js';

export class AbstractNodeList extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() { return []; }

    // API

    get length() { return (this._get('entries') || []).length; }

    [Symbol.iterator]() { return (this._get('entries') || [])[Symbol.iterator](); }

    ['entries']() { return (this._get('entries') || []).slice(0); }

    delete(index) { return this._delete('entries', index); }

    get(index) { return this._get('entries', index); }

    set(index, value) { return this._set('entries', index, value); }

    has(index) { return this._has('entries', index); }

    add(...args) { return this._add('entries', ...args); }
}