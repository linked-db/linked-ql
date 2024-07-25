
	
	/**
	 * @inheritdoc
	 */
	async function delete_(database, params = {}) {

		// --------------------
		// RESOLVE DELETION SOURCES AND TARGETS
		// --------------------
		var targetTableNames,
			mainTable = this.exprs.TABLE_REFERENCES;
		if (this.exprs.DELETE_LIST.length) {
			targetTableNames = this.exprs.DELETE_LIST.map(t => t.endsWith('.*') ? _before(t, '.*') : t);
		} else if (this.exprs.USING_CLAUSE) {
			targetTableNames = _arrFrom(this.exprs.TABLE_REFERENCES, false).map(t => t.getAlias());
			mainTable = this.exprs.USING_CLAUSE;
		} else {
			// IMPORTANT: only first table in here
			targetTableNames = [(_isArray(mainTable) ? mainTable[0] : mainTable).getAlias()];
		}

		// --------------------
		// INITIALIZE DATASOURCES WITH JOIN ALGORITHIMS APPLIED
		// --------------------
		var _params = {...params};
		_params.mode = 'readwrite';
		this.base = this.getBase(database, _params, _arrFrom(mainTable, false));

		// --------------------
		// Finds named tables
		// --------------------
		var targetTables = {},
			deletionIDs = {},
			tables = await Promise.all(this.base.joins.concat(this.base.main));
		targetTableNames.forEach(alias => {
			targetTables[alias] = tables.filter(table => (table.params.alias || table.name) === alias)[0];
			if (!targetTables[alias]) throw new Error('"' + alias + '" in table list is not found in main query.');
		});

		// --------------------
		// Mine IDs
		// --------------------
		var rowComposition;
		while(rowComposition = await this.base.fetch()) {
			targetTableNames.forEach(alias => {
				if (!deletionIDs[alias]) {
					deletionIDs[alias] = [];
				}
				var rowID = _arrFrom(targetTables[alias].def.schema.primaryKey).map(key => rowComposition[alias][key]);
				if (!deletionIDs[alias].filter(_rowID => _all(_rowID, (id, i) => id === rowID[i])).length) {
					deletionIDs[alias].push(rowID);
				}
			});
		}

		// --------------------
		// Delete now
		// --------------------
		var result = await Promise.all(targetTableNames.map(async alias => {
			if (deletionIDs[alias].length) {
				var affectedRows = await targetTables[alias].deleteAll(deletionIDs[alias]);
				return {[alias]: affectedRows};
			}
		}));
		return result.reduce((result, currentResult) => ({...result, ...currentResult}), {});
	}

	async function insert(context, params = {}) {
		var _params = {...params};
		_params.mode = 'readwrite';
		var tableBase = await this.INTO_CLAUSE.eval(context, _params);
		var tableSchema = tableBase.def.schema;
		// ---------------------------
		var values = this.VALUES_LIST;
		var insertType = this.INSERT_TYPE.toUpperCase();
		var forceAutoIncrement = insertType === 'TABLE';
		if (insertType === 'SET') {
			var columns = values.map(assignment => assignment.reference.name);
			values = [values.map(assignment => assignment.val.eval({}, params))];
		} else {
			var columns = this.COLUMNS_LIST || (tableSchema.columns ? Object.keys(tableSchema.columns) : []);
			if (insertType === 'SELECT') {
				try {
					values = (await values.eval(context, params)).map(row => Object.values(row));
				} catch(e) {
					throw new Error('["' + values.stringify() + '" in SELECT clause]: ' + e.message);
				}
			} else if (insertType === 'VALUES') {
				values = values.map(row => row.map(val => val.eval({}, params)));
			} else {
				throw new Error('Invalid insert statement "' + this + '"!');
			}
		}
		columns = columns.map(c => c + '');

		var duplicateKeyCallback = this.UPDATE_CLAUSE ? newRow => {
			var _params = {...params};
			_params.strictMode = false;
			this.UPDATE_CLAUSE.forEach(assignment => assignment.eval({$: newRow}, _params));
			return true
		} : (this.IGNORE ? () => false : null);
		var keys = await tableBase.addAll(values, columns, duplicateKeyCallback, forceAutoIncrement);

		return {
			[tableBase.name]: keys,
		};
	}