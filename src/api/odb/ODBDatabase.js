

import _isObject from '@webqit/util/js/isObject.js';
import _isFunction from '@webqit/util/js/isFunction.js';
import _each from '@webqit/util/obj/each.js';
import AbstractDatabase from '../AbstractDatabase.js';
import ODBStore from './ODBStore.js';

/**
 * ---------------------------
 * ODBDatabase class
 * ---------------------------
 */				

export default class ODBDatabase extends AbstractDatabase {
    
    /**
     * @inheritdoc
     */
    async tables(params = {}) {
        return this.client.applyFilters(Object.keys(this.def.schemas), params);
    }

    /**
     * @inheritdoc
     */
    table(tableName, params = {}) {
        return new ODBStore(this, tableName, {
            data: this.def.data[tableName],
        }, params);
    }

    /**
     * CREATE/ALTER/DROP
     */

    /**
     * @inheritdoc
     */
    async createTable(tableName, tableSchema, params = {}) {
        if ((await this.tables()).includes(tableName)) {
            if (params.ifNotExists) return;
            throw new Error(`Store name "${ tableName }" already exists!`);
        }
        this.def.schemas[tableName] = tableSchema;
        this.def.data[tableName] = [];
        return new ODBStore(this, tableName, {
            data: this.def.data[tableName],
        });
    }

    /**
     * @inheritdoc
     */
    async alterTable(tableName, newTableSchemaOrCallback, params = {}) {

        var tableSchema = await this.describeTable(tableName),
            newTableSchema;
        if (_isFunction(newTableSchemaOrCallback)) {
            // Modify existing schema
            newTableSchema = this.cloneSchema(tableSchema);
            await newTableSchemaOrCallback(newTableSchema);
        } else if (_isObject(callback)) {
            newTableSchema = newTableSchemaOrCallback;
        } else {
            throw new Error('Table/store modification expects only an object (new schema) or a function (callback that recieves existing schema).')
        }

        if (!(await this.tables()).includes(tableName)) {
            if (params.ifExists) return;
            throw new Error(`Store name "${ tableName }" does not exist!`);
        }

        var store = this.def.data[tableName];
        _each(this.diffSchema(tableSchema, newTableSchema), (changeName, changeDef) => {
            if (changeName !== 'renamedColumns') {
                // "primaryKey", "columns", "foreignKeys", "indexes", "jsonColumns"
                _each(changeDef.add, (prop, def) => {
                    this.applyToStore[changeName](store, prop, def, 'add');
                });
                _each(changeDef.alter, (prop, changes) => {
                    this.applyToStore[changeName](store, prop, changes.current, 'alter');
                });
                _each(changeDef.drop, (prop, oldDef) => {
                    this.applyToStore[changeName](store, prop, oldDef, 'drop');
                });
            } else {
                // "renamedColumns" actually comes last from source...
                // and really should
                _each(changeDef, (oldName, newName) => {
                    this.applyToStore[changeName](store, oldName, newName);
                });
            }
        });

        return new ODBStore(this, tableName, {
            data: store,
        }, {});

    }

    /**
     * Describes table.
     * 
     * @param String tableName
     * @param Object params
     * 
     * @return Object
     */
    async describeTable(tableName) {
        return this.client.$.schemas[this.name][tableName];
    }

    /**
     * Drops table.
     * 
     * @param String tableName
     * @param Object params
     * 
     * @return Bool
     */
    async dropTable(tableName, params = {}) {
        if (!(await this.tables()).includes(tableName)) {
            if (params.ifExists) return;
            throw new Error(`Store name "${ tableName }" does not exist!`);
        }
        delete this.def.schemas[tableName];
        delete this.def.data[tableName];
    }
}

ODBDatabase.prototype.applyToStore = {
    primaryKey: (store, columnName, def, delta) => {},

    columns: (store, columnName, def, delta) => {},

    foreignKeys: (store, columnName, def, delta) => {},

    indexes: (store, alias, def, delta) => {
        if (delta === 'drop') {
            store.deleteIndex(alias);
            return;
        }
        if (delta === 'alter' && store.indexNames.contains(alias)) {
            store.deleteIndex(alias);
        }
        store.createIndex(alias, def.keyPath, {unique: def.type === 'unique'});
    },

    jsonColumns: (store, alias, columnName, delta) => {},

    renamedColumns: (store, columnName, newColumnName) => {
        return 'ALTER COLUMN `' + columnName + '` RENAME TO `' + newColumnName + '`';
    },
};