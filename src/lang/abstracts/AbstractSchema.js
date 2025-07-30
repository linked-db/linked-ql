import { AbstractNodeList } from './AbstractNodeList.js';

export class AbstractSchema extends AbstractNodeList {

    /* AST API */

    name() { return this._get('name'); }
}