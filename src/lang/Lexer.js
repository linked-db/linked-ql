import $Lexer from '@webqit/util/str/Lexer.js';

export class Lexer extends $Lexer {
    static $blocks = [...$Lexer.$blocks, [new RegExp(`^CASE `, 'i'), new RegExp(`^ END`, 'i')]];
}