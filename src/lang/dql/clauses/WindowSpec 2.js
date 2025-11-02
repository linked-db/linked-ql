import { AbstractNode } from '../../abstracts/AbstractNode.js';

export class WindowSpec extends AbstractNode {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return {
            type: 'paren_block',
            syntax: [
                { type: 'WindowRef', as: 'super_window', optional: true },
                { type: 'PartitionByClause', as: 'partition_by_clause', optional: true, autoIndent: true },
                { type: 'OrderByClause', as: 'order_by_clause', optional: true, autoIndent: true },
                { type: 'WindowFrameSpec', as: 'frame_spec', optional: true, autoIndent: true },
            ],
            autoIndent: true,
            autoIndentAdjust: -1
        };
    }

    /* AST API */

    superWindow() { return this._get('super_window'); }

    partitionByClause() { return this._get('partition_by_clause'); }

    orderByClause() { return this._get('order_by_clause'); }

    frameSpec() { return this._get('frame_spec'); }
}