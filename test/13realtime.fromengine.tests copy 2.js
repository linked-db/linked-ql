import { expect } from 'chai';
import { FromEngine } from '../src/realtime/engine/FromEngine.js';
import { collectEvents } from './12realtime.basics.tests.js';

// --- Helpers to build AST nodes as per spec ---
const row = (id, data) => ({ id, ...data });

const fromItem = (name, alias) => ({
    nodeName: 'FROM_ITEM',
    lateral_kw: false,
    expr: { nodeName: 'TABLE_REF1', value: name },
    alias: { nodeName: 'FROM_ITEM_ALIAS', value: alias }
});

const columnRef = (tableAlias, columnName) => ({
    nodeName: 'COLUMN_REF1',
    value: columnName,
    qualifier: { nodeName: 'TABLE_REF1', value: tableAlias }
});

const onClause = (leftTable, leftCol, rightTable, rightCol) => ({
    nodeName: 'ON_CLAUSE',
    expr: {
        nodeName: 'BINARY_EXPR',
        left: columnRef(leftTable, leftCol),
        operator: '=',
        right: columnRef(rightTable, rightCol)
    }
});

const usingClause = (cols) => ({
    nodeName: 'USING_CLAUSE',
    column: Array.isArray(cols) ? { entries: cols.map(c => ({ value: c })) } : { value: cols }
});

const joinClause = (type, rightTable, rightAlias, condition) => ({
    nodeName: 'JOIN_CLAUSE',
    expr: { nodeName: 'TABLE_REF1', value: rightTable },
    alias: { nodeName: 'FROM_ITEM_ALIAS', value: rightAlias },
    join_type: type,
    outer_kw: ['LEFT', 'RIGHT', 'FULL'].includes(type),
    condition_clause: condition
});

// --- Test Data ---
const testData = {
    users: [row(1, { name: 'Alice', common_id: 1 }), row(2, { name: 'Bob', common_id: 2 })],
    orders: [row(1, { user_id: 1, item: 'A', common_id: 1 }), row(102, { user_id: 2, item: 'B', common_id: 2 }), row(103, { user_id: 3, item: 'C', common_id: 3 })],
};

const tableSchema = (tableName) => {
    return {
        primaryKey: 'id',
        columns: Object.keys(testData[tableName][0]),
    };
};

// --- Test Suites ---
describe('FromEngine Core Functionality', () => {

    describe('INNER JOIN', () => {
        let engine, eventsCollector;
        const joinCondition = onClause('u', 'id', 'o', 'user_id');
        beforeEach(() => {
            engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('INNER', 'orders', 'o', joinCondition)]
            });
            eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
        });

        it('should emit a single push when a matching row is pushed', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: testData.users[0], o: testData.orders[0] });
        });

        it('should emit a patch when a joined row is updated', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            const patchedUser = { ...testData.users[0], name: 'Alice P.' };
            engine.patch('users', patchedUser);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow.u.name).to.equal('Alice P.');
        });

        it('should emit a delete when a joined row is removed', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.delete('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('delete');
        });
    });

    describe('LEFT JOIN', () => {
        let engine, eventsCollector;
        const joinCondition = onClause('u', 'id', 'o', 'user_id');
        beforeEach(() => {
            engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('LEFT', 'orders', 'o', joinCondition)]
            });
            eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
        });

        it('should emit a push with null padding when a left-side row is pushed', () => {
            engine.push('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: testData.users[0], o: null });
        });

        it('should patch a null-padded row when a matching right-side row is pushed', () => {
            engine.push('users', testData.users[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.push('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: testData.users[0], o: testData.orders[0] });
        });

        it('should patch a row back to null padding when a matching right-side row is deleted', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.delete('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: testData.users[0], o: null });
        });
    });

    describe('RIGHT JOIN', () => {
        let engine, eventsCollector;
        const joinCondition = onClause('u', 'id', 'o', 'user_id');
        beforeEach(() => {
            engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('RIGHT', 'orders', 'o', joinCondition)]
            });
            eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
        });

        it('should emit a push with null padding when a right-side row is pushed', () => {
            engine.push('orders', testData.orders[2]); // Orphan order
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: null, o: testData.orders[2] });
        });

        it('should patch a null-padded row when a matching left-side row is pushed', () => {
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.push('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: testData.users[0], o: testData.orders[0] });
        });

        it('should patch a row back to null padding when a matching left-side row is deleted', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.delete('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({ u: null, o: testData.orders[0] });
        });

        it('should emit a delete when a right-side row is removed', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.delete('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('delete');
        });
    });
    
    describe('FULL JOIN', () => {
        let engine, eventsCollector;
        const joinCondition = onClause('u', 'id', 'o', 'user_id');
        beforeEach(() => {
            engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('FULL', 'orders', 'o', joinCondition)]
            });
            eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
        });

        it('should push a null-padded row for a left-side push', () => {
            engine.push('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow.o).to.be.null;
        });

        it('should push a null-padded row for a right-side push', () => {
            engine.push('orders', testData.orders[2]);
            engine.compute();
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow.u).to.be.null;
        });

        it('should patch to a full join when a match is pushed', () => {
            engine.push('users', testData.users[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.push('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow.u).to.not.be.null;
            expect(eventsCollector.events[0].compositeRow.o).to.not.be.null;
        });

        it('should patch to null padding when a joined row is deleted', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.delete('users', testData.users[0]);
            engine.compute();
            expect(eventsCollector.events[0].kind).to.equal('patch');
            expect(eventsCollector.events[0].compositeRow.u).to.be.null;
        });
    });

    describe('CROSS JOIN', () => {
        let engine, eventsCollector;
        beforeEach(() => {
            engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('CROSS', 'orders', 'o')],
            });
            eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
        });
        
        it('should emit a new composite row for every existing row when a new row is pushed', () => {
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.push('orders', testData.orders[1]);
            engine.compute();
            eventsCollector.events.length = 0;
            engine.push('users', testData.users[1]);
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(2); // 2 new rows for the new user
        });
    });

    describe('Special Joins (NATURAL/USING)', () => {
        it('should handle NATURAL JOIN by inferring common column `common_id`', () => {
            const engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [{
                    nodeName: 'JOIN_CLAUSE',
                    expr: { nodeName: 'TABLE_REF1', value: 'orders' },
                    alias: { nodeName: 'FROM_ITEM_ALIAS', value: 'o' },
                    natural_kw: true,
                    join_type: 'INNER'
                }],
                tableSchemas: {
                    users: tableSchema('users'),
                    orders: tableSchema('orders'),
                },
            });
            const eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
            engine.push('users', testData.users[0]);
            engine.push('orders', testData.orders[0]);
            engine.compute();
            expect(eventsCollector.events[0].compositeRow.u.common_id).to.equal(eventsCollector.events[0].compositeRow.o.common_id);
        });

        it('should handle multi-column USING JOIN on `id` and `common_id`', () => {
            const engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [joinClause('INNER', 'orders', 'o', usingClause(['id', 'common_id']))]
            });
            const eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
            // Simulate data where 'id' and 'common_id' match
            engine.push('users', { id: 1, common_id: 1, name: 'Alice' });
            engine.push('orders', { id: 1, common_id: 1, user_id: 1 });
            engine.compute();
            expect(eventsCollector.events).to.have.lengthOf(1);
        });
    });

    describe('Multi-Table Joins', () => {
        it('should correctly handle a 3-table INNER JOIN', () => {
            const engine = new FromEngine({
                fromItems: [fromItem('users', 'u')],
                joinClauses: [
                    joinClause('INNER', 'orders', 'o', onClause('u', 'id', 'o', 'user_id')),
                    joinClause('INNER', 'payments', 'p', onClause('o', 'id', 'p', 'order_id'))
                ]
            });
            const eventsCollector = collectEvents();
            engine.on('data', eventsCollector.listener);
            
            engine.push('users', { id: 1, name: 'Alice' });
            engine.push('orders', { id: 101, user_id: 1 });
            engine.push('payments', { id: 201, order_id: 101 });
            engine.compute();
            
            expect(eventsCollector.events).to.have.lengthOf(1);
            expect(eventsCollector.events[0].kind).to.equal('push');
            expect(eventsCollector.events[0].compositeRow).to.deep.include({
                u: { id: 1, name: 'Alice' },
                o: { id: 101, user_id: 1 },
                p: { id: 201, order_id: 101 }
            });
        });
    });
});