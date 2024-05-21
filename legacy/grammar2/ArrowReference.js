
/**
 * @imports
 */
import _mixin from '@webqit/util/js/mixin.js';
import _before from '@webqit/util/str/before.js';
import _after from '@webqit/util/str/after.js';
import _isString from '@webqit/util/js/isString.js';
import _isObject from '@webqit/util/js/isObject.js';
import _objFirst from '@webqit/util/obj/first.js';
import ArrowReferenceInterface from './ArrowReferenceInterface.js';

/**
 * ---------------------------
 * ArrowReference class
 * ---------------------------
 */				
export default class ArrowReference extends ArrowReferenceInterface {

	/**
	 * Gets the immediate target in a reference path.
	 * 
	 * @param {Object} schema1
	 * @param {Object} dbClient
	 * 
	 * @return {Object}
	 */
	async process(schema1, dbClient = null) {
		var reference = this.interpreted ? this.interpreted.toString() : this.toString();
		return await ArrowReference.process(schema1, reference.replace(/`/g, ''), dbClient);
	}

	/**
	 * @inheritdoc
	 */
	static async parse(expr, parseCallback, params = {}) {
		if (this.isReference(expr)) {
			var parse = await super.parse(expr, parseCallback, params);
			if (parse) { parse.backticks = true; }
			return parse;
		}
	}

	// ------------------------

	/**
	 * Tells if a column is a reference.
	 *
	 * @param {String} str
	 *
	 * @return bool
	 */
	static isReference(str) {
		return str.indexOf(this.arrLeft) > -1 || str.indexOf(this.arrRight) > -1;
	}
	
	/**
	 * Tells if a path is an outgoing reference in direction.
	 *
	 * @param {String} reference
	 *
	 * @return bool
	 */
	static isOutgoing(reference) {
		return reference.indexOf(this.arrRight) > -1 && _before(reference, this.arrRight).indexOf(this.arrLeft) === -1;
	}
	
	/**
	 * Tells if a path is an incoming reference in direction.
	 *
	 * @param {String} reference
	 *
	 * @return bool
	 */
	static isIncoming(reference) {
		return reference.indexOf(this.arrLeft) > -1 && _before(reference, this.arrLeft).indexOf(this.arrRight) === -1;
	}
	
	/**
	 * Returns the relationshipPath in reverse direction.
	 *
	 * @param {String} reference
	 *
	 * @return string
	 */
	static reverse(reference) {
		return reference.replace(new RegExp(this.arrRight, 'g'), '|' + this.arrRight + '|').replace(new RegExp(this.arrLeft, 'g'), '|' + this.arrLeft + '|')
			.split('|').map(str => str === this.arrRight ? this.arrLeft : (str === this.arrLeft ? this.arrRight : str)).reverse().join('');
	}

	/**
	 * Gets the immediate target in a reference path.
	 * 
	 * @param {Object} schema1 
	 * @param {String} reference 
	 * @param {Object} dbClient 
	 * 
	 * @return {Object}
	 */
    static async process(schema1, reference, dbClient = null) {
		var schema2,
			SCHEMAS = (schema1 ? await dbClient.getDatabaseSchema(schema1.databaseName) : await dbClient.getDatabaseSchema()) || {columns: {}};
		if (this.isIncoming(reference)) {
			// reference === actingKey<-...
			var actingKey = _before(reference, this.arrLeft),
				sourceTable = _after(reference, this.arrLeft);
			if (actingKey.indexOf('.') > 0) {
				if (!schema1) {
					// schema1 that's explicitly given takes precedence
					// as the "context" given in reference might be only an alias
					schema1 = SCHEMAS[_before(actingKey, '.')];
				}
				actingKey = _after(actingKey, '.');
			}
			// --------------------------
			if (this.isIncoming(sourceTable)) {
				// reference === actingKey<-actingKey2<-table->?...
				schema2 = (await this.process(null, sourceTable/* as new reference */, dbClient)).a.table;
				var select = sourceTable;
			} else {
				// reference === actingKey<-table->?...
				var _sourceTable = _before(sourceTable, this.arrRight)
					select = _after(sourceTable, this.arrRight);
				if (!(schema2 = SCHEMAS[_sourceTable])) {
					throw new Error('[' + reference + ']: The implied table "' + _sourceTable + '" is not defined.');
				}
			}
			if (!schema1) {
				// --------------------------
				// Now get schema1 from schema2
				// --------------------------
				var referencedEntity;
				if (!schema2.columns[actingKey] || !(referencedEntity = schema2.columns[actingKey].referencedEntity)) {
					throw new Error('[' + reference + ']: The "' + schema2.name + '" table does not define the implied foreign key "' + actingKey + '".');
				}
				schema1 = SCHEMAS[referencedEntity.table];
			}
			return {
				a: {table: schema1, actingKey: schema1.primaryKey,},
				b: {table: schema2, actingKey, select,},
			};
		}

		// --------------------------
		// reference === foreignKey->...
		// --------------------------
		var foreignKey = _before(reference, this.arrRight)
			select = _after(reference, this.arrRight);
		if (foreignKey.indexOf('.') > 0) {
			if (!schema1) {
				// schema1 that's explicitly given takes precedence
				// as the "context" given in reference might be only an alias
				schema1 = SCHEMAS[_before(foreignKey, '.')];
			}
			foreignKey = _after(foreignKey, '.');
		} else {
			schema1 = _objFirst(SCHEMAS);
		}
		// --------------------------
		// Now get schema2 from schema1
		// --------------------------
		var referencedEntity;
		if (!schema1.columns[foreignKey] || !(referencedEntity = schema1.columns[foreignKey].referencedEntity)) {
			throw new Error('[' + schema1.name + this.arrRight + reference + ']: The "' + schema1.name + '" table does not define the implied foreign key "' + foreignKey + '".');
		}
		schema2 = SCHEMAS[referencedEntity.table];
		return {
			a: {table: schema1, actingKey: foreignKey,},
			b: {table: schema2, actingKey: schema2.primaryKey, select,},
		};
	}
}

/**
 * @var string
 */
ArrowReference.arrRight = '~>';
ArrowReference.arrLeft = '<~';