import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { AbstractNode } from '../src/lang/abstracts/AbstractNode.js';
import { registry } from '../src/lang/registry.js';
import '../src/lang/index.js';
use(chaiAsPromised);

class DummyNode1 extends AbstractNode {
    static get syntaxRules() {
        return [
            { as: 'prop1', type: 'identifier' },
            { as: 'prop2', type: 'number_literal', optional: true },
        ];
    }
}
registry.DummyNode1 = DummyNode1;

class DummyNode2 extends AbstractNode {
    static get syntaxRules() {
        return [
            {
                syntax: [
                    { as: 'field1', type: 'identifier' },
                    { as: 'condition', type: 'operator', value: ['IS', 'IS NOT'] },
                    { as: 'field2', type: 'null_literal', value: 'NULL' },
                ]
            },
            {
                dialect: 'postgres',
                syntax: [
                    { as: 'source', type: 'identifier' },
                    { as: 'alias', type: 'identifier', optional: true },
                    { as: 'cols', type: 'brace_block' }
                ],
            }
        ];
    }
}
registry.DummyNode2 = DummyNode2;

class DummyNode3 extends AbstractNode {
    static get syntaxRules() {
        return [
            { as: 'name', type: 'identifier' },
            { as: 'value', type: 'string_literal', optional: true },
            { as: 'operator', type: 'operator', value: ['+', '-'], optional: true }, // Make optional
            {
                optional: true, // Make this whole block optional
                syntax: [
                    { as: 'left', type: 'identifier' },
                    { as: 'op', type: 'operator', value: '=', optional: true },
                    {
                        syntaxes: [
                            { as: 'right', type: 'number_literal', value: 'eee' },
                            { as: 'right', type: 'number_literal' },
                            { as: 'right', type: 'number_literal', optional: true },
                        ]
                    },
                ]
            },
            {
                dialect: 'mysql',
                syntax: [
                    { as: 'items1', type: 'DummyNode3', arity: Infinity, optional: true, },
                    { as: 'items2', type: 'DummyNode3', arity: { min: 2, max: 4 }, optional: true, },
                ],
            }
        ];
    }
}
registry.DummyNode3 = DummyNode3;

const jsonfySchemaSet = (schemaSet) => [...schemaSet].map((sch) => Object.fromEntries(sch));

describe('AbstractNode schema compilation, hydration & jsonfication - DummyNode2 (level 1 complexity)', () => {
    it('should compile correct schema', () => {
        const schemaSet = DummyNode1.compileASTSchemaFromSyntaxRules();
        const expected = [{
            prop1: { rulePath: 'DUMMY_NODE1.0<prop1>', type: 'identifier' },
            prop2: {
                rulePath: 'DUMMY_NODE1.1<prop2>',
                type: 'number_literal',
                optional: true
            }
        }];
        expect(jsonfySchemaSet(schemaSet)).to.deep.eq(expected);
    });

    it('should hydrate and jsonfy fully populated JSON', () => {
        const json = { prop1: 'id', prop2: '42' };
        const node = DummyNode1.fromJSON(json);
        expect(node.jsonfy()).to.deep.eq({
            nodeName: 'DUMMY_NODE1',
            ...json
        });
    });

    it('should hydrate and jsonfy JSON with omitted optional fields', () => {
        const json = { prop1: 'id' };
        const node = DummyNode1.fromJSON(json);
        expect(node.jsonfy()).to.deep.eq({
            nodeName: 'DUMMY_NODE1',
            prop1: 'id',
            prop2: undefined
        });
    });

});

describe('AbstractNode schema compilation, hydration & jsonfication - DummyNode2 (level 2 complexity)', () => {
    describe('with dialect: postgres', () => {
        it('should compile schema for postgres dialect', () => {
            const schemaSet = DummyNode2.compileASTSchemaFromSyntaxRules({ dialect: 'postgres' });
            const expected = [{
                field1: { rulePath: 'DUMMY_NODE2.0.syntax.0<field1>', type: 'identifier' },
                condition: {
                    rulePath: 'DUMMY_NODE2.0.syntax.1<condition>',
                    type: 'operator',
                    value: ['IS', 'IS NOT']
                },
                field2: {
                    rulePath: 'DUMMY_NODE2.0.syntax.2<field2>',
                    type: 'null_literal',
                    value: 'NULL'
                },
                source: { rulePath: 'DUMMY_NODE2.1.syntax.0<source>', type: 'identifier' },
                alias: {
                    rulePath: 'DUMMY_NODE2.1.syntax.1<alias>',
                    type: 'identifier',
                    optional: true
                },
                cols: { rulePath: 'DUMMY_NODE2.1.syntax.2<cols>', type: 'brace_block' }
            }];
            expect(jsonfySchemaSet(schemaSet)).to.deep.eq(expected);
        });

        it('should hydrate and jsonfy alt-syntax with all fields', () => {
            const json = {
                field1: 'value1',
                condition: 'IS',
                field2: 'NULL',
                source: 'users',
                alias: 'u',
                cols: []
            };
            const node = DummyNode2.fromJSON(json, { dialect: 'postgres' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE2',
                ...json
            });
        });

        it('should hydrate and jsonfy alt-syntax with omitted optional alias', () => {
            const json = {
                field1: 'value1',
                condition: 'IS NOT',
                field2: 'NULL',
                source: 'users',
                cols: []
            };
            const node = DummyNode2.fromJSON(json, { dialect: 'postgres' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE2',
                ...json,
                alias: undefined
            });
        });
    });

    describe('with dialect: mysql', () => {
        it('should compile schema for mysql dialect', () => {
            const schemaSet = DummyNode2.compileASTSchemaFromSyntaxRules({ dialect: 'mysql' });
            const expected = [{
                field1: { rulePath: 'DUMMY_NODE2.0.syntax.0<field1>', type: 'identifier' },
                condition: {
                    rulePath: 'DUMMY_NODE2.0.syntax.1<condition>',
                    type: 'operator',
                    value: ['IS', 'IS NOT']
                },
                field2: {
                    rulePath: 'DUMMY_NODE2.0.syntax.2<field2>',
                    type: 'null_literal',
                    value: 'NULL'
                }
            }];
            expect(jsonfySchemaSet(schemaSet)).to.deep.eq(expected);
        });

        it('should hydrate and jsonfy alt-syntax with all fields', () => {
            const json = {
                field1: 'value1',
                condition: 'IS',
                field2: 'NULL'
            };
            const node = DummyNode2.fromJSON(json, { dialect: 'mysql' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE2',
                ...json
            });
        });

        it('should hydrate and jsonfy alt-syntax with omitted optional alias', () => {
            const json = {
                field1: 'value1',
                condition: 'IS NOT',
                field2: 'NULL'
            };
            const node = DummyNode2.fromJSON(json, { dialect: 'mysql' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE2',
                ...json
            });
        });
    });

});

describe('AbstractNode schema compilation, hydration & jsonfication - DummyNode2 (level 3 complexity)', () => {
    describe('with dialect: postgres', () => {
        it('should compile a complex AST schema from simple syntax rules, "ignoring" additional MySQL-specific rules', () => {
            const schemaSet = DummyNode3.compileASTSchemaFromSyntaxRules({ dialect: 'postgres' });
            expect(schemaSet).to.be.instanceOf(Set).with.lengthOf(2);
            const [schema1, schema2] = jsonfySchemaSet(schemaSet);
            expect(schema1).to.not.haveOwnProperty('items1');
            expect(schema2).to.not.haveOwnProperty('items1');
            expect(schema1.right).to.include({ value: 'eee' });
            expect(schema2.right).to.not.haveOwnProperty('value');
            expect(schema1).to.deep.eq({
                name: { rulePath: 'DUMMY_NODE3.0<name>', type: 'identifier' },
                value: {
                    rulePath: 'DUMMY_NODE3.1<value>',
                    type: 'string_literal',
                    optional: true
                },
                operator: {
                    rulePath: 'DUMMY_NODE3.2<operator>',
                    type: 'operator',
                    value: ['+', '-'],
                    optional: true
                },
                left: {
                    rulePath: 'DUMMY_NODE3.3.syntax.0<left>',
                    type: 'identifier',
                    optional: true
                },
                op: {
                    rulePath: 'DUMMY_NODE3.3.syntax.1<op>',
                    type: 'operator',
                    value: '=',
                    optional: true
                },
                right: {
                    rulePath: 'DUMMY_NODE3.3.syntax.2.syntaxes.0.<right>',
                    type: 'number_literal',
                    value: 'eee',
                    optional: true,
                    dependencies: ['left']
                }
            });
            expect(schema2).to.deep.eq({
                name: { rulePath: 'DUMMY_NODE3.0<name>', type: 'identifier' },
                value: {
                    rulePath: 'DUMMY_NODE3.1<value>',
                    type: 'string_literal',
                    optional: true
                },
                operator: {
                    rulePath: 'DUMMY_NODE3.2<operator>',
                    type: 'operator',
                    value: ['+', '-'],
                    optional: true,
                },
                left: {
                    rulePath: 'DUMMY_NODE3.3.syntax.0<left>',
                    type: 'identifier',
                    optional: true
                },
                op: {
                    rulePath: 'DUMMY_NODE3.3.syntax.1<op>',
                    type: 'operator',
                    value: '=',
                    optional: true
                },
                right: {
                    rulePath: 'DUMMY_NODE3.3.syntax.2.syntaxes.1.<right>',
                    type: 'number_literal',
                    optional: true,
                    dependencies: ['left']
                }
            });
        });

        it('should hydrate and jsonfy full input with all "optionals" provided', () => {
            const json = {
                name: 'a',
                value: 'hello',
                operator: '+',
                left: 'b',
                op: '=',
                right: '123'
            };
            const node = DummyNode3.fromJSON(json, { dialect: 'postgres' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE3',
                ...json
            });
        });

        it('should hydrate and jsonfy minimal valid input (ommitting "optionals")', () => {
            const json = {
                name: 'a',
                operator: '+',
            };
            const node = DummyNode3.fromJSON(json, { dialect: 'postgres' });
            expect(node.jsonfy()).to.deep.eq({
                nodeName: 'DUMMY_NODE3',
                name: 'a',
                value: undefined,
                operator: '+',
                left: undefined,
                op: undefined,
                right: undefined
            });
        });

        it('should FAIL to hydrate and jsonfy if "requireds" are ommitted, or "unknowns" provided', () => {
            const jsons = [{ operator: '+' }, { name: 'a', extra: 'foo' }];
            for (const json of jsons) {
                const node = DummyNode3.fromJSON(json, { dialect: 'postgres' });
                expect(node).to.be.undefined;
            }
            for (const json of jsons) {
                const node = () => DummyNode3.fromJSON({ nodeName: 'DUMMY_NODE3', ...json }, { dialect: 'postgres' });
                expect(node).to.throw;
            }
        });
    });

    describe('with dialect: mysql', () => {
        it('should compile a complex AST schema from simple syntax rules, "honouring" additional MySQL-specific rules', () => {
            const schemaSet = DummyNode3.compileASTSchemaFromSyntaxRules({ dialect: 'mysql' });
            expect(schemaSet).to.be.instanceOf(Set).with.lengthOf(2);
            const [schema1, schema2] = jsonfySchemaSet(schemaSet);
            expect(schema1.right).to.include({ value: 'eee' });
            expect(schema2.right).to.not.haveOwnProperty('value');
            expect(schema1).to.deep.eq({
                name: { rulePath: 'DUMMY_NODE3.0<name>', type: 'identifier' },
                value: {
                    rulePath: 'DUMMY_NODE3.1<value>',
                    type: 'string_literal',
                    optional: true
                },
                operator: {
                    rulePath: 'DUMMY_NODE3.2<operator>',
                    type: 'operator',
                    value: ['+', '-'],
                    optional: true,
                },
                left: {
                    rulePath: 'DUMMY_NODE3.3.syntax.0<left>',
                    type: 'identifier',
                    optional: true
                },
                op: {
                    rulePath: 'DUMMY_NODE3.3.syntax.1<op>',
                    type: 'operator',
                    value: '=',
                    optional: true
                },
                right: {
                    rulePath: 'DUMMY_NODE3.3.syntax.2.syntaxes.0.<right>',
                    type: 'number_literal',
                    value: 'eee',
                    optional: true,
                    dependencies: ['left']
                },
                items1: {
                    rulePath: 'DUMMY_NODE3.4.syntax.0<items1>',
                    type: 'DummyNode3',
                    arity: Infinity,
                    optional: true,
                },
                items2: {
                    rulePath: 'DUMMY_NODE3.4.syntax.1<items2>',
                    type: 'DummyNode3',
                    arity: { min: 2, max: 4 },
                    optional: true,
                }
            });
            expect(schema2).to.deep.eq({
                name: { rulePath: 'DUMMY_NODE3.0<name>', type: 'identifier' },
                value: {
                    rulePath: 'DUMMY_NODE3.1<value>',
                    type: 'string_literal',
                    optional: true
                },
                operator: {
                    rulePath: 'DUMMY_NODE3.2<operator>',
                    type: 'operator',
                    value: ['+', '-'],
                    optional: true,
                },
                left: {
                    rulePath: 'DUMMY_NODE3.3.syntax.0<left>',
                    type: 'identifier',
                    optional: true
                },
                op: {
                    rulePath: 'DUMMY_NODE3.3.syntax.1<op>',
                    type: 'operator',
                    value: '=',
                    optional: true
                },
                right: {
                    rulePath: 'DUMMY_NODE3.3.syntax.2.syntaxes.1.<right>',
                    type: 'number_literal',
                    optional: true,
                    dependencies: ['left']
                },
                items1: {
                    rulePath: 'DUMMY_NODE3.4.syntax.0<items1>',
                    type: 'DummyNode3',
                    arity: Infinity,
                    optional: true,
                },
                items2: {
                    rulePath: 'DUMMY_NODE3.4.syntax.1<items2>',
                    type: 'DummyNode3',
                    arity: { min: 2, max: 4 },
                    optional: true,
                }
            });

        });

        it('should include "items1" only for mysql dialect', () => {
            const mysqlJson = {
                name: 'a',
                operator: '-',
                items1: [
                    {
                        name: 'b',
                        operator: '+',
                    }
                ],
                items2: [
                    {
                        name: 'b',
                        operator: '+'
                    },
                    {
                        name: 'b',
                        operator: '+'
                    }
                ]
            };
            const node = DummyNode3.fromJSON(mysqlJson, { dialect: 'mysql' });
            const output = node.jsonfy();
            expect(output.nodeName).to.equal('DUMMY_NODE3');
            expect(output.items1).to.have.lengthOf(1);
            expect(output.items2).to.have.lengthOf(2);
        });

        it('should FAIL to hydrate and jsonfy if "requireds" are ommitted, or "arity" constraints failed', () => {
            const jsons = [{ operator: '+' }, { name: 'a', items2: [] }];
            for (const json of jsons) {
                const node = DummyNode3.fromJSON(json, { dialect: 'mysql' });
                expect(node).to.be.undefined;
            }
            for (const json of jsons) {
                const node = () => DummyNode3.fromJSON({ nodeName: 'DUMMY_NODE3', ...json }, { dialect: 'mysql' });
                expect(node).to.throw;
            }
        });
    });
});
