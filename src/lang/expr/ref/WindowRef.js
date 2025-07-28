import { Identifier } from './Identifier.js';

export class WindowRef extends Identifier {
    
    /* SYNTAX RULES */

    static get syntaxPriority() { return -1; }
}