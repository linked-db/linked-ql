
# The Linked QL API


## The `DatabaseSchemaAPI` API

*DatabaseSchemaAPI* is the programmatic interface to `DatabaseSchemaSpec` *(in [schema.json](https://github.com/linked-db/linked-ql#schemajson))*. This object is obtained via [`client.alterDatabase()`](#clientalterdatabase)'s callback function.

*DatabaseSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`databaseSchemaApi.name()`](#databaseschemaapiname)
+ [`databaseSchemaApi.table()`](#databaseschemaapitable)

    *Inherited:*

+ [`abstractSchemaApi.toJSON()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

### `databaseSchemaApi.name()`:

<details><summary>
Set or get the database name. <i>(Overrides <code><a href="#abstractschemaapiname">abstractSchemaApi.name()</a></code>.)</i>
<pre><code>databaseSchemaApi.name(name?: string): this</code></pre></summary>

⚙️ Spec:

+ `name` (string, *optional*): when provided, sets the database name. When ommitted, gets the database name returned.
+ Return value: `Identifier` - the current database name, or `this` - the `databaseSchemaApi` instance.

⚽️ Usage:

Rename the database:

```js
const savepoint = await client.alterDatabase('database_1', databaseSchemaApi => {
    // Inspect existing name
    console.log(databaseSchemaApi.name().toJSON()); // database_1
    // Rename
    databaseSchemaApi.name('new_database_1');
}, { description: 'Renaming for testing purposes' });
```

</details>

### `databaseSchemaApi.table()`:

<details><summary>
Add a table to the database or get an existing one.
<pre><code>databaseSchemaApi.table(tableNameOrJson: string | TableSchemaSpec): TableSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `tableNameOrJson` (string | [`TableSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson)): when a string, the name of a table to get. When an object, an object that defines a new table to create.
+ Return value: [`TableSchemaAPI`](#the-tableschemaapi-api) - the table schema requested or the one just added.

⚽️ Usage:

```js
const savepoint = await client.alterDatabase('database_1', databaseSchemaApi => {
    // Drop existing table_1
    databaseSchemaApi.table('table_1').drop();
    // Add table_2
    databaseSchemaApi.table({
        name: 'table_2',
        columns: [],
    });
}, { description: 'Altering for testing purposes' });
```

</details>

------------

## The `TableSchemaAPI` API

*TableSchemaAPI* is the programmatic interface to `TableSchemaSpec` *(in [schema.json](https://github.com/linked-db/linked-ql#schemajson))*. This object is obtained via [`databaseSchemaApi.table()`](#databaseschemaapitable) and [`database.alterTable()`](#databasealtertable)'s callback function.

*TableSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`tableSchemaApi.name()`](#tableschemaapiname)
+ [`tableSchemaApi.column()`](#tableschemaapicolumn)
+ [`tableSchemaApi.primaryKey()`](#tableschemaapiprimarykey)
+ [`tableSchemaApi.constraint()`](#tableschemaapiconstraint)
+ [`tableSchemaApi.index()`](#tableschemaapiindex)

    *Inherited:*

+ [`abstractSchemaApi.toJSON()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

### `tableSchemaApi.name()`:

<details><summary>
Set or get the table name. <i>(Overrides <code><a href="#abstractschemaapiname">abstractSchemaApi.name()</a></code>.)</i>
<pre><code>tableSchemaApi.name(name?: string | string[]): this</code></pre></summary>

⚙️ Spec:

+ `name` (string | string[], *optional*): when provided, sets the table name. Accepts a two-part array for a fully-qualified table name. When ommitted, gets the table name returned.
+ Return value: `Identifier` - the current table name, or `this` - the `tableSchemaApi` instance.

⚽️ Usage:

Rename the table:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Inspect existing name
    console.log(tableSchemaApi.name().toJSON()); // table_1
    // Rename
    tableSchemaApi.name('new_table_1');
}, { description: 'Renaming for testing purposes' });
```

Rename the table - fully-qualified:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.name(['database_1', 'new_table_1']);
}, { description: 'Renaming for testing purposes' });
```

Change the qualifier - moving the table to a different database:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.name(['database_4', 'new_table_1']);
}, { description: 'Renaming for testing purposes' });
```

</details>

### `tableSchemaApi.column()`:

<details><summary>
Add a column to the table or get an existing one.
<pre><code>tableSchemaApi.column(columnNameOrJson: string | ColumnSchemaSpec): ColumnSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `columnNameOrJson` (string | [`ColumnSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson)): when a string, the name of a column to get. When an object, an object that defines a new column to create.
+ Return value: [`ColumnSchemaAPI`](#the-columnschemaapi-api) - the column requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing column_1 and modify its type attribute
    tableSchemaApi.column('column_1').type('int');
    // Add column_2
    tableSchemaApi.column({
        name: 'column_2',
        type: ['varchar', 50],
    });
}, { description: 'Altering for testing purposes' });
```

</details>

### `tableSchemaApi.primaryKey()`:

<details><summary>
Add a Primary Key constraint to the table or get the existing one. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS">PRIMARY KEY</a></code> constraint.)</i>
<pre><code>tableSchemaApi.primaryKey(constraintJson?: TablePrimaryKeySchemaSpec): TablePrimaryKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`TablePrimaryKeySchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new Primary Key to create, specifying the intended Primary Key column(s), and optionally, a constraint name. When ommitted, gets the `PRIMARY_KEY` instance on the table returned if exists.
+ Return value: [`TablePrimaryKeySchemaAPI`](#table-constraint-schema-apis) - the existing `PRIMARY_KEY` instance requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // See if there's one set and undo that
    if (!tableSchemaApi.primaryKey()) {
        // Add a Primary Key constraint on columns 2 and 3
        tableSchemaApi.primaryKey({ columns: ['column_2', 'column_3'] });
    }
}, { description: 'Altering for testing purposes' });
```

</details>

### `tableSchemaApi.constraint()`:

<details><summary>
Add a Primary Key, Foreign Key, Unique Key, or Check constraint to the table or get an existing one. (Provides a unified way to set/get table constraints.)
<pre><code>tableSchemaApi.constraint(constraintNameOrJson: string | TableConstraintSchemaType): TableConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintNameOrJson` (string | [`TableConstraintSchemaType`](https://github.com/linked-db/linked-ql#schemajson)): when a string, the name of a constraint to get. When an object, an object that defines a new constraint to create.
+ Return value: [`TableConstraintSchemaAPI`](#table-constraint-schema-apis) - the constraint requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing constraint_1 and modify its columns list
    tableSchemaApi.constraint('constraint_1').columns(['id', 'bio']);
    // Add constraint_2
    tableSchemaApi.constraint({
        type: 'PRIMARY_KEY',
        name: 'constraint_2',
        columns: ['id'],
    });
}, { description: 'Altering for testing purposes' });
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Add an anonymous constraint
const constraint = tableSchemaApi.constraint({
    type: 'PRIMARY_KEY',
    columns: ['id'],
});
// Inspect is auto-generated name
console.log(constraint.name()); // auto_name_25kjd
```

</details>

### `tableSchemaApi.index()`:

<details><summary>
Add a Fulltext or Spartial Index to the table or get an existing one.
<pre><code>tableSchemaApi.index(indexNameOrJson: string | IndexSchemaSpec): IndexSchema</code></pre></summary>

⚙️ Spec:

+ `indexNameOrJson` (string | [`IndexSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson)): when a string, the name of an index to get. When an object, an object that defines a new index to create.
+ Return value: [`IndexSchema`](#the-indexschema-api) - the index requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Obtain existing index_1 and modify its columns list
    tableSchemaApi.index('index_1').columns(['id', 'bio']);
    // Add index_2
    tableSchemaApi.index({
        type: 'FULLTEXT',
        name: 'index_2',
        columns: ['id'],
    });
}, { description: 'Altering for testing purposes' });
```

Note that when an index name is ommitted, one is automatically generated for you:

```js
// Add an anonymous index
const index = tableSchemaApi.index({
    type: 'FULLTEXT',
    columns: ['id'],
});
// Inspect is auto-generated name
console.log(index.name()); // auto_name_4gkbc
```

</details>

------------

## Table Constraint Schema APIs

The getter/setter APIs to the various table-level constraints.

```ts
type TableConstraintSchemaAPI = TablePrimaryKeySchemaAPI | TableForeignKeySchemaAPI | TableUniqueKeySchemaAPI | TableCheckConstraintSchemaAPI
```

<details><summary>See details</summary>

```ts
interface TablePrimaryKeySchemaAPI extends PrimaryKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`PrimaryKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableForeignKeySchemaAPI extends ForeignKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`ForeignKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableUniqueKeySchemaAPI extends UniqueKeySchemaAPI {
    // Set/get the constraint columns
    columns(value?: string[]): Array;
}
```

> *Jump to [`UniqueKeySchemaAPI`](#column-constraint-schema-apis)*

```ts
interface TableCheckConstraintSchemaAPI extends CheckConstraintSchemaAPI {
    // Get the constraint columns
    columns(): Array;
}
```

> *Jump to [`CheckConstraintSchemaAPI`](#column-constraint-schema-apis)*

</details>

------------

## The `ColumnSchemaAPI` API

*ColumnSchemaAPI* is the programmatic interface to `ColumnSchemaSpec` *(in [schema.json](https://github.com/linked-db/linked-ql#schemajson))*. This object is obtained via [`tableSchemaApi.column()`](#tableschemaapicolumn).

*ColumnSchemaAPI inherits from [`AbstractSchemaAPI`](#the-abstractschemaapi-api).*

<details><summary>See content</summary>

+ [`columnSchemaApi.type()`](#columnschemaapitype)
+ [`columnSchemaApi.primaryKey()`](#columnschemaapiprimarykey)
+ [`columnSchemaApi.foreignKey()`](#columnschemaapiforeignkey)
+ [`columnSchemaApi.uniqueKey()`](#columnschemaapiuniquekey)
+ [`columnSchemaApi.check()`](#columnschemaapicheck)
+ [`columnSchemaApi.default()`](#columnschemaapidefault)
+ [`columnSchemaApi.expression()`](#columnschemaapiexpression)
+ [`columnSchemaApi.identity()`](#columnschemaapiidentity)
+ [`columnSchemaApi.notNull()`](#columnschemaapinotnull)
+ [`columnSchemaApi.null()`](#columnschemaapinull)
+ [`columnSchemaApi.autoIncrement()`](#columnschemaapiautoincrement)
+ [`columnSchemaApi.onUpdate()`](#columnschemaapionupdate)
+ [`columnSchemaApi.constraint()`](#columnschemaapiconstraint)

    *Inherited:*

+ [`abstractSchemaApi.name()`](#abstractschemaapiname)
+ [`abstractSchemaApi.toJSON()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

### `columnSchemaApi.type()`:

<details><summary>
Set the column type or get the current value.
<pre><code>tableSchemaApi.type(typeJson?: string | string[]): ColumnTypeSchema</code></pre></summary>

⚙️ Spec:

+ `typeJson` (string | string[], *optional*): when provided, sets the column type. Accepts a two-part array for a fully-qualified type. When ommitted, gets the current column type returned.
+ Return value:`ColumnTypeSchema` - the current column type, or `this` - the `columnSchemaApi` instance.

⚽️ Usage:

Obtain a column and change its type:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // New type
    tableSchemaApi.column('column_1').type(['varchar', 255]);
    // Current type as JSON
    console.log(tableSchemaApi.column('column_1').type().toJSON()); // ['varchar', 255]
    // Current type as SQL
    console.log(tableSchemaApi.column('column_1').type().toString()); // varchar(255)
}, { description: 'Altering for testing purposes' });
```

</details>

### `columnSchemaApi.primaryKey()`:

<details><summary>
Designate the column as Primary Key for the table or get the column's current <code>PRIMARY_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS">PRIMARY KEY</a></code> constraint.)</i>
<pre><code>columnSchemaApi.primaryKey(constraintToggleOrJson?: boolean | PrimaryKeySchemaSpec): PrimaryKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`PrimaryKeySchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when a boolean, toggles the designation of the column as Primary Key for the table. When an object, an object that specifies a constraint name. When ommitted, gets the column's `PRIMARY_KEY` instance returned if exists.
+ Return value: [`PrimaryKeySchemaAPI`](#column-constraint-schema-apis) - the existing `PRIMARY_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').primaryKey()) {
        // Add a Primary Key constraint on column_1
        tableSchemaApi.column('column_1').primaryKey(true);
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').primaryKey().name()); // auto_name_25kjd
```

</details>

### `columnSchemaApi.foreignKey()`:

<details><summary>
Add the <code>FOREIGN_KEY</code> constraint type to the column or get the column's current <code>FOREIGN_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK">FOREIGN KEY</a></code> constraint.)</i>
<pre><code>columnSchemaApi.foreignKey(constraintJson?: ForeignKeySchemaSpec): ForeignKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`ForeignKeySchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new Foreign Key to create, specifying, among other things, the target table and target columns, and optionally, a constraint name. When ommitted, gets the column's `FOREIGN_KEY` instance returned if exists.
+ Return value: [`ForeignKeySchemaAPI`](#column-constraint-schema-apis) - the existing `FOREIGN_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').foreignKey()) {
        // Add a Foreign Key constraint on column_1
        tableSchemaApi.column('column_1').foreignKey({
            targetTable: 'table_2',
            targetColumns: ['id'],
            updateRule: 'CASCADE',
        });
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').foreignKey().name()); // auto_name_25kjd
```

</details>

### `columnSchemaApi.uniqueKey()`:

<details><summary>
Add the <code>UNIQUE_KEY</code> constraint type to the column or get the column's current <code>UNIQUE_KEY</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS">UNIQUE</a></code> constraint.)</i>
<pre><code>columnSchemaApi.uniqueKey(constraintToggleOrJson?: boolean | UniqueKeySchemaSpec): UniqueKeySchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`UniqueKeySchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when a boolean, toggles the existence of the `UNIQUE_KEY` constraint on the column. When an object, an object that defines a new constraint to create, specifying a constraint name. When ommitted, gets the column's `UNIQUE_KEY` instance returned if exists.
+ Return value: [`UniqueKeySchemaAPI`](#column-constraint-schema-apis) - the existing `UNIQUE_KEY` instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').uniqueKey()) {
        // Add a Unique Key constraint on column_1
        tableSchemaApi.column('column_1').uniqueKey(true);
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').uniqueKey().name()); // auto_name_25kjd
```

</details>

### `columnSchemaApi.check()`:

<details><summary>
Add the <code>CHECK</code> constraint type to the column or get the column's current <code>CHECK</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html">CHECK</a></code> constraint.)</i>
<pre><code>columnSchemaApi.check(constraintJson?: CheckConstaintSpec): CheckConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`CheckConstraintSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `CHECK` constraint instance returned if exists.
+ Return value: [`CheckConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `CHECK` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').check()) {
        // Add a Check constraint on column_1
        tableSchemaApi.column('column_1').check({ expr: 'column_1 IS NOT NULL' });
    }
});
```

Note that when a constraint name is ommitted, one is automatically generated for you:

```js
// Inspect the auto-generated name
console.log(tableSchemaApi.column('column_1').check().name()); // auto_name_25kjd
```

</details>

### `columnSchemaApi.default()`:

<details><summary>
Add the <code>DEFAULT</code> constraint type to the column or get the column's current <code>DEFAULT</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-default.html">DEFAULT</a></code> constraint.)</i>
<pre><code>columnSchemaApi.default(constraintJson?: DefaultConstraintSchemaSpec): DefaultConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`DefaultConstraintSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `DEFAULT` constraint instance returned if exists.
+ Return value: [`DefaultConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `DEFAULT` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').default()) {
        // Add a Default constraint on column_1
        tableSchemaApi.column('column_1').default({ expr: 'now()' });
    }
});
```

</details>

### `columnSchemaApi.expression()`:

<details><summary>
Add the <code>EXPRESSION</code> constraint type to the column or get the column's current <code>EXPRESSION</code> instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-generated-columns.html">GENERATED COLUMN</a></code> type.)</i>
<pre><code>columnSchemaApi.expression(constraintJson?: ExpressionConstraintSchemaSpec): ExpressionConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintJson` ([`ExpressionConstraintSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression, and, optionally, a constraint name. When ommitted, gets the column's `EXPRESSION` constraint instance returned if exists.
+ Return value: [`ExpressionConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `EXPRESSION` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').expression()) {
        // Add an Expression constraint on column_1
        tableSchemaApi.column('column_1').expression({ expr: 'column_1 * 2', stored: true });
    }
});
```

</details>

### `columnSchemaApi.identity()`:

<details><summary>
Add the <code>IDENTITY</code> constraint type to the column or get the column's current <code>IDENTITY</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/17/ddl-identity-columns.html">IDENTITY COLUMN</a></code> type.)</i>
<pre><code>columnSchemaApi.identity(constraintToggleOrJson?: boolean | IdentityConstraintSchemaSpec): IdentityConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggleOrJson` (boolean | [`IdentityConstraintSchemaSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when boolean, toggles the existence of the `IDENTITY` constraint on the column. When an object, an object that defines a new constraint to create, specifying an `always` rule. When ommitted, gets the column's `IDENTITY` constraint instance returned if exists.
+ Return value: [`IdentityConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `IDENTITY` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').identity()) {
        // Add an Identity constraint on column_1
        tableSchemaApi.column('column_1').identity({ always: false });
    }
});
```

</details>

### `columnSchemaApi.notNull()`:

<details><summary>
Add the <code>NOT_NULL</code> constraint type to the column or get the column's current <code>NOT_NULL</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-NOT-NULL">NOT NULL</a></code> constraint.)</i>
<pre><code>columnSchemaApi.notNull(constraintToggle?: boolean): NotNullConstraintSchemaAPIBuilder</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `NOT_NULL` constraint on the column. When ommitted, gets the column's `NOT_NULL` constraint instance returned if exists.
+ Return value: [`NotNullConstraintSchemaAPIBuilder`](#column-constraint-schema-apis) - the existing `NOT_NULL` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').notNull()) {
        // Add an notNull constraint on column_1
        tableSchemaApi.column('column_1').notNull(true);
    }
});
```

</details>

### `columnSchemaApi.null()`:

<details><summary>
Add the <code>NULL</code> constraint type to the column or get the column's current <code>NULL</code> constraint instance. <i>(Translates to the SQL <code><a href="https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-NOT-NULL">NULL</a></code> constraint.)</i>
<pre><code>columnSchemaApi.null(constraintToggle?: boolean): NullConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `NULL` constraint on the column. When ommitted, gets the column's `NULL` constraint instance returned if exists.
+ Return value: [`NullConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `NULL` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').null()) {
        // Add an null constraint on column_1
        tableSchemaApi.column('column_1').null(true);
    }
});
```

</details>

### `columnSchemaApi.autoIncrement()`:

<details><summary>
Add the <code>AUTO_INCREMENT</code> constraint type to the column or get the column's current <code>AUTO_INCREMENT</code> constraint instance. <i>(Translates to the MySQL-specific <code><a href="https://dev.mysql.com/doc/refman/8.4/en/example-auto-increment.html">AUTO_INCREMENT</a></code> constraint.)</i>
<pre><code>columnSchemaApi.autoIncrement(constraintToggle?: boolean): AutoIncrementConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` (boolean, *optional*): when provided, toggles the existence of the `AUTO_INCREMENT` constraint on the column. When ommitted, gets the column's `AUTO_INCREMENT` constraint instance returned if exists.
+ Return value: [`AutoIncrementConstraintSchemaAPI`](#column-constraint-schema-apis) - the existing `AUTO_INCREMENT` constraint instance on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaAPI => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').autoIncrement()) {
        // Add an autoIncrement constraint on column_1
        tableSchemaApi.column('column_1').autoIncrement(true);
    }
});
```

</details>

### `columnSchemaApi.onUpdate()`:

<details><summary>
Add the <code>ON_UPDATE</code> clause to the column or get the column's current <code>ON_UPDATE</code> constraint instance. <i>(Translates to the MySQL-specific <code><a href="https://dev.mysql.com/doc/refman/8.4/en/timestamp-initialization.html">ON UPDATE</a></code> clause for timestamp/datetime columns.)</i>
<pre><code>columnSchemaApi.onUpdate(constraintToggle?: OnUpdateClauseSpec): OnUpdateClauseSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintToggle` ([`OnUpdateClauseSpec`](https://github.com/linked-db/linked-ql#schemajson), *optional*): when provided, an object that defines a new constraint to create, specifying the intended SQL expression. When ommitted, gets the `ON_UPDATE` clause returned if exists.
+ Return value: [`OnUpdateClauseSchemaAPI`](#column-constraint-schema-apis) - the existing `ON_UPDATE` clause on the column or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Be sure that this doesn't already exist on column_1
    if (!tableSchemaApi.column('column_1').onUpdate()) {
        // Add an autoIncrement constraint on column_1
        tableSchemaApi.column('column_1').onUpdate('CURRENT_TIMESTAMP');
    }
});
```

</details>

### `columnSchemaApi.constraint()`:

<details><summary>
Add a Primary Key, Foreign Key, Unique Key, Check, or other constraint, to the column or get an existing one. (Provides a unified way to set/get column constraints.)
<pre><code>columnSchemaApi.constraint(constraintType: string, constraintToggleOrJson?: boolean | object): ColumnConstraintSchemaAPI</code></pre>
<pre><code>columnSchemaApi.constraint(constraintJson: ColumnConstraintSchemaType): ColumnConstraintSchemaAPI</code></pre></summary>

⚙️ Spec:

+ `constraintType` (string): One of `PRIMARY_KEY`, `FOREIGN_KEY`, `UNIQUE_KEY`, `CHECK`, `DEFAULT`, `EXPRESSION`, `NOT_NULL`, `NULL`, `IDENTITY`, `AUTO_INCREMENT`, `ON_UPDATE`. When provided as only argument, gets the existing constraint on the column returned. When in conjucntion with `constraintToggleOrJson`, gets the constraint added to the column.
+ `constraintToggleOrJson` (boolean | ColumnConstraintSchemaType, *optional*): as explained for `constraintToggle`/`constraintJson` in the individual constraint sections above.
+ `constraintJson` (ColumnConstraintSchemaType):  as explained for `constraintJson` in the individual constraint sections above.
+ Return value: [`ColumnConstraintSchemaAPI`](#column-constraint-schema-apis) - the constraint requested or the one just added.

⚽️ Usage:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    const col1 = tableSchemaApi.column('column_1');
    // See if we already have a PRIMARY_KEY constraint on the column. Create one if not
    if (!col1.constraint('PRIMARY_KEY')) {
        // Add PRIMARY_KEY
        col1.constraint('PRIMARY_KEY', true);
        // Or: col1.constraint({ type: 'PRIMARY_KEY' });
    }
});
```

</details>

------------

## Column Constraint Schema APIs

The getter/setter APIs to the various column-level constraints.

```ts
type ColumnConstraintSchemaAPI = PrimaryKeySchemaAPI | ForeignKeySchemaAPI | UniqueKeySchemaAPI | CheckConstraintSchemaAPI | DefaultConstraintSchemaAPI | ExpressionConstraintSchemaAPI | IdentityConstraintSchemaAPI | NotNullConstraintSchemaAPI | NullConstraintSchemaAPI | AutoIncrementConstraintSchemaAPI | OnUpdateClauseSchemaAPI
```

<details><summary>See details</summary>

```ts
interface PrimaryKeySchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface ForeignKeySchemaAPI extends AbstractSchemaAPI {
    // Set/get the target table
    targetTable(value?: string | string[]): Identifier;
    // Set/get the target columns
    targetColumns(value?: string[]): Array;
    // Set/get the match rule
    matchRule(value?: string): string;
    // Set/get the update rule
    updateRule(value?: string | { rule: string, columns: string[] }): string | { rule: string, columns: string[] };
    // Set/get the delete rule
    deleteRule(value?: string | { rule: string, columns: string[] }): string | { rule: string, columns: string[] };
}
```

```ts
interface UniqueKeySchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface CheckConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

```ts
interface DefaultConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

```ts
interface ExpressionConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
    // Set/get the "stored" false
    stored(value?: boolean): boolean;
}
```

```ts
interface IdentityConstraintSchemaAPI extends AbstractSchemaAPI {
    // Set/get the "always" rule
    always(value?: boolean): boolean;
}
```

```ts
interface NotNullConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface NullConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface AutoIncrementConstraintSchemaAPI extends AbstractSchemaAPI {}
```

```ts
interface OnUpdateClauseSchemaAPI extends AbstractSchemaAPI {
    // Set/get the SQL expression
    expr(value?: string): string;
}
```

> *Jump to [`AbstractSchemaAPI`](#the-abstractschemaapi-api)*

</details>

------------

## The `AbstractSchemaAPI` API

*AbstractSchema* is a base class inheritted by all Schema APIs - e.g. [`DatabaseSchemaAPI`](#the-databaseschemaapi-api), [`TableSchemaAPI`](#the-tableschemaapi-api), [`ColumnSchemaAPI`](#the-columnschemaapi-api).

<details><summary>See content</summary>

+ [`abstractSchemaApi.name()`](#abstractschemaapiname)
+ [`abstractSchemaApi.toJSON()`](#abstractschemaapitojson)
+ [`abstractSchemaApi.toString()`](#abstractschemaapitostring)
+ [`abstractSchemaApi.keep()`](#abstractschemaapikeep)
+ [`abstractSchemaApi.drop()`](#abstractschemaapidrop)

</details>

### `abstractSchemaApi.name()`:

<details><summary>
Set or get the name the schema instance.
<pre><code>instance.name(value?: string): string | this</code></pre></summary>

⚙️ Spec:

+ `value` (string, *optional*): when provided, the name of the schema instance. When ommitted, returns the current name.
+ Return value: `string` - the current name, or `this` - the schema instance.

⚽️ Usage:

Set or get the name of a [`ColumnSchemaAPI`](#the-columnschemaapi-api) instance:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    // Get the name
    console.log(tableSchemaApi.column('column_1').name()); // column_1
    // Rename
    tableSchemaApi.column('column_2').name('new_column_2');
});
```

</details>

### `abstractSchemaApi.toJSON()`:

<details><summary>
Render the Schema instance to a JSON object.
<pre><code>instance.toJSON(): object</code></pre></summary>

⚙️ Spec:

+ Return value: an object corresponding to the instance's JSON equivalent in [`schema.json`](https://github.com/linked-db/linked-ql#schemajson).

⚽️ Usage:

Render a [`TableSchemaAPI`](#the-tableschemaapi-api) to JSON:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_1').primaryKey(true); // Designate existing column "column_1" as primary key
    tableSchemaApi.column('column_2'); // Drop index_2

    // Now inspect what you've done so far
    console.log(tableSchemaApi.toJSON());
});
```

</details>

### `abstractSchemaApi.toString()`:

<details><summary>
Render the Schema instance to SQL.
<pre><code>instance.toString(): string</code></pre></summary>

⚙️ Spec:

+ Return value: an SQL representation of the instance.

⚽️ Usage:

Render a [`TableSchemaAPI`](#the-tableschemaapi-api) to SQL:

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_1').primaryKey(true); // Designate existing column "column_1" as primary key
    tableSchemaApi.column('column_2'); // Drop index_2

    // Now inspect what you've done so far
    console.log(tableSchemaApi.toString());
});
```

</details>

### `abstractSchemaApi.keep()`:

<details><summary>
Specify whether to keep or drop the schema instance, or get the current <i>keep</i> status.
<pre><code>instance.keep(toggle?: boolean): this</code></pre></summary>

⚙️ Spec:

+ `toggle` (boolean, *optional*): when provided, toggles the *keep* status of the schema. When ommitted returns the current *keep* status of the schema.
+ Return value: `boolean` - the current status, or `this` - the schema instance.

⚽️ Usage:

Drop a [`Column`](#the-columnschemaapi-api):

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_2').keep(false);
});
```

</details>

### `abstractSchemaApi.drop()`:

<details><summary>
Set the schema instance to the <code>keep === false</code> state.
<pre><code>instance.drop(): this</code></pre></summary>

⚙️ Spec:

+ Return value: `this` - the schema instance.

⚽️ Usage:

Drop a [`Column`](#the-columnschemaapi-api):

```js
const savepoint = await database.alterTable('table_1', tableSchemaApi => {
    tableSchemaApi.column('column_2').drop();
});
```

</details>

------------
