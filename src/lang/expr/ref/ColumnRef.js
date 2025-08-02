import { IdentifierPath } from '../../expr/ref/IdentifierPath.js';
import { registry } from '../../registry.js';

export class ColumnRef extends IdentifierPath {

    /* SYNTAX RULES */

    static get _objectKind() { return 'Column'; }

    static get _qualifierType() { return ['TableAbstractionRef'/* must come first being primary */, 'LQBackRefConstructor']; }

    static get syntaxRules() {
        return this.buildSyntaxRules({
            syntaxes: [
                { type: 'identifier', as: '.' },
                { type: 'operator', as: '.', value: '*' },
            ],
            autoSpacing: false
        });
    }

    static get syntaxPriority() { return 51; } // above LQBackRefConstructor

    /* DESUGARING API */

    inGroupByOrOrderByContext() {
        return this.climbTree((parentNode, up) => {
            if (parentNode instanceof registry.SelectStmt) return false;
            if (parentNode instanceof registry.GroupByClause) return parentNode;
            if (parentNode instanceof registry.OrderByClause) return parentNode;
            return up();
        });
    }

    selectSchema(filter = null, linkedDb = null) {
        if (!this.qualifier() && this.inGroupByOrOrderByContext()) {

            const name = this.value();
            const cs = this._has('delim');
            const resultSchemas = [];

            let statementNode = this.statementNode;
            const selectElements = statementNode.selectList();
            for (const selectElement of selectElements) {

                const outputName = selectElement.alias() || selectElement.expr();

                if (name && !this.identifiesAs(outputName, cs)) continue;
                const schema = selectElement.expr().deriveSchema?.(linkedDb);
                if (!schema || filter && !filter(schema)) continue;

                const clonedRenamed = schema.clone({ renameTo: registry.ColumnIdent.fromJSON({ value: outputName.value() }) });

                resultSchemas.push(clonedRenamed);
            }

            if (resultSchemas.length) {
                return resultSchemas;
            }
        }
        return super.selectSchema(filter, linkedDb);
    }

    /* DESUGARING API */

    jsonfy(options = {}, transformCallback = null, linkedDb = null) {
        if ((options.deSugar || options.fullyQualified) && this.value() === '*') {
            options = { deSugar: false, fullyQualified: false };
        }
        if ((options.deSugar || options.fullyQualified) && !this.qualifier() && this.inGroupByOrOrderByContext() && this.statementNode) {
            options = { deSugar: false, fullyQualified: false };
        }
        return super.jsonfy(options, transformCallback, linkedDb);
    }
}