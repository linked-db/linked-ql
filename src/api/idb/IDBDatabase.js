

import _isObject from '@webqit/util/js/isObject.js';
import _isFunction from '@webqit/util/js/isFunction.js';
import _arrFrom from '@webqit/util/arr/from.js';
import _each from '@webqit/util/obj/each.js';
import AbstractDatabase from '../AbstractDatabase.js';
import IDBStore from './IDBStore.js';

/**
 * ---------------------------
 * IDBDatabase class
 * ---------------------------
 */				

export default class IDBDatabase extends AbstractDatabase {
	
    /**
     * @inheritdoc
     */
    constructor(client, databaseName, $api, params = {}) {
        super(client, databaseName, params);
        this.$api = $api;
        this.$api.onversionchange = () => {
            // We must close the database. This allows the other page to upgrade the database.
            // If you don't do this then the upgrade won't happen until the user closes the tab.
            this.$api.close();
            this.client.userPrompt('A new version of this page is ready. Please reload or close this tab!');
        };
    }

    /**
     * @inheritdoc
     */
     async tables(params = {}) {
        return this.client.applyFilters(_arrFrom(this.$api.objectStoreNames), params);
    }

    /**
     * @inheritdoc
     */
    table(tableName, params = {}) {
        const getStore = _mode => {
            const transaction = this.$api.transaction([tableName], _mode || params.mode);
            // We can worry not about onerror, onabort, oncomplete
            return transaction.objectStore(tableName);
        };
		return new IDBStore(this, tableName, {
            getStore,
        }, params);
    }

    /**
     * CREATE/ALTER/DROP
     */

    /**
     * @inheritdoc
     */
    async createTable(tableName, tableSchema, params = {}) {
        if (_arrFrom(this.$api.objectStoreNames).includes(tableName)) {
            if (params.ifNotExists) return;
            throw new Error(`Store name "${tableName}" already exists!`);
        }
        const storeParams = {};
        // ...with primary key
        var primaryKeyColumn = Object.keys(tableSchema.columns).filter(name => tableSchema.columns[name].primaryKey)[0];
        var autoIncrementColumn = Object.keys(tableSchema.columns).filter(name => tableSchema.columns[name].autoIncrement)[0];
        if (primaryKeyColumn) {
            storeParams.keyPath = primaryKeyColumn;
            if (primaryKeyColumn === autoIncrementColumn) {
                storeParams.autoIncrement = true;
            }
        }
        const store = this.$api.createObjectStore(tableName, storeParams);
        _each(this.diffSchema({}, tableSchema), (changeName, changeDef) => {
            if (changeName === 'primaryKey') return;
            _each(changeDef.add, (prop, def) => {
                this.applyToStore[changeName](store, prop, def);
            });
        });
        this.client.$.schemas[this.name][tableName] = tableSchema;
        return new IDBStore(this, tableName, {
            getStore: () => store,
        }, params);
    }

    /**
     * @inheritdoc
     */
    async alterTable(tableName, newTableSchemaOrCallback, params = {}) {
        const tableSchema = await this.describeTable(tableName);
        let newTableSchema;
        if (_isFunction(newTableSchemaOrCallback)) {
            // Modify existing schema
            newTableSchema = this.cloneSchema(tableSchema);
            await newTableSchemaOrCallback(newTableSchema);
        } else if (_isObject(newTableSchemaOrCallback)) {
            newTableSchema = newTableSchemaOrCallback;
        } else {
            throw new Error('Table/store modification expects only an object (new schema) or a function (callback that recieves existing schema).')
        }
        // ---------
        if (!_arrFrom(this.$api.objectStoreNames).includes(tableName)) {
            if (params.ifExists) return;
            throw new Error(`Store name "${tableName}" does not exist!`);
        }
        // ---------
        const transaction = this.$api.transaction([tableName], 'readwrite');
        const store = transaction.objectStore(tableName);
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
        this.client.$.schemas[this.name][tableName] = newTableSchema;
        return new IDBStore(this, tableName, {
            getStore: () => store,
        }, params);
    }

    /**
     * Describes table.
     * 
     * @param String tableName
     * @param Object params
     * 
     * @return Object
     */
    async describeTable(tableName, params = {}) {
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
        if (_arrFrom(this.$api.objectStoreNames).includes(tableName)) {
            if (params.ifExists) return;
            throw new Error(`Store name "${ tableName }" does not exist!`);
        }
        delete this.client.$.schemas[this.name][tableName];
        return this.$api.deleteObjectStore(tableName);
    }
}

IDBDatabase.prototype.applyToStore = {
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