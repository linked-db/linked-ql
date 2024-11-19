import { AbstractLevel2Constraint } from './abstracts/AbstractLevel2Constraint.js';
import { AbstractColumnsMixin } from '../abstracts/AbstractColumnsMixin.js';
import { Lexer } from '../../Lexer.js';

export class UniqueKeyConstraint extends AbstractColumnsMixin(AbstractLevel2Constraint) {

    static parse(context, expr, parseCallback) {
        const { name, expr: $expr } = this.parseName(context, expr, true);
        if (!$expr || !/^UNIQUE(\s+KEY)?/i.test($expr)) return;
		const instance = (new this(context)).name(name);
        if (this.checkIsColumn(context)) return instance;
        const [ , columnsExpr ] = Lexer.split(expr, []);
        return instance.columns(this.parseColumns(instance, columnsExpr));
    }

    stringify() {
        return `${ this.stringifyName() }UNIQUE${ !this.isColumnLevel ? this.stringifyColumns() : ''}`;
    }
}