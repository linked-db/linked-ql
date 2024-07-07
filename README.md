# Linked QL

_**JOINS are a difficult thing to comprehend in any query any day.** That's why you suck hard at relational queries and want an ORM. **And schema management is cursed pretty much on any database!** That's why you resent it any day._

We're writing this little piece to change that!

Linked QL is a DB query client that simplfies how you interact with, and manage, your database: let's you write smarter queries (using new syntax sugars, [introducing Magic Paths](#introducing-magic-paths)) and smarter schema management code (using new magic wand features, [introducing Auto-Versioning](#introducing-auto-versioning))!

Linked QL is usable over your DB of choice - from the server-side Postgres and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object!

Jump to sections and features:

+ [Basic Usage](#basic-usage)
+ [Magic Paths](#introducing-magic-paths)
+ [Auto-Versioning](#introducing-auto-versioning)
+ [API](#api)

## Basic Usage

Install Linked QL:

```cmd
npm install @linked-db/linked-ql
```

Obtain the Linked QL client for your target database:

1. For SQL databases, install the regular SQL client you use for your DB. (Typically, `pg` for Postgres, `mysql2` for MySQL databases.)

    Given a Postgres DB, install the `pg` client:

    ```cmd
    npm install pg
    ```

    Use Linked QL as a wrapper over that:

    ```js
    // Import pg and LinkedQl
    import pg from 'pg';
    import LinkedQl from '@linked-db/linked-ql/sql';

    // Connect pg
    const pgClient = new pg.Client({
        host: 'localhost',
        port: 5432,
    });
    await pgClient.connect();

    // Use LinkedQl as a wrapper over that
    const client = new LinkedQl(pgClient, { dialect: 'postgres' });
    ```
    
2. For the client-side *IndexedDB*, import and instantiate the *IDB* client.
    
    ```js
    // Import IDB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql/idb';
    
    // Create an instance.
    const client = new LinkedQl;
    ```
    
3. To work with Linked QL's in-memory object storage, import and instantiate the *ODB* client.

    ```js
    // Import ODB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql';
    
    // Create an instance.
    const LinkedQlClient = new LinkedQl;
    ```

All `client` instances above implement the same interface:

```js
client.query('SELECT fname, lname FROM users WHERE role = $1', { params: ['admin'] }).then(result => {
    console.log(result);
});
```

```js
const result = await client.query('SELECT fname, lname FROM users WHERE role = $1', { params: ['admin'] });
console.log(result);
```

Other APIs are covered just ahead in the [API](#api) section.

## Introducing Magic Paths

*Express relationships graphically.* Meet the magic path operators, a syntax extension to SQL, that let you connect to columns on other tables without writing a JOIN. Linked QL uses heuristics on your DB structure to figure out the details and the relevant JOINs.

Where you normally would write...

```sql
-- Regular SQL
SELECT title, users.fname AS author_name FROM posts
LEFT JOIN users ON users.id = posts.author
```

Linked QL lets you draw a path to express the relationship:

```sql
-- Linked QL
SELECT title, author ~> fname AS author_name FROM posts
```

Here's another instance showing an example schema and a typical query each:

```sql
-- The users table
CREATE TABLE users (
    id int primary key generated always as identity,
    title varchar,
    name varchar,
    role int references roles (id),
    created_time timestamp
);
-- The books table
CREATE TABLE books (
    id int primary key generated always as identity,
    title varchar,
    content varchar,
    author int references users (id),
    created_time timestamp
);
```

```sql
-- Regular SQL
SELECT book.id, book.title, content, book.created_time, user.id AS author_id, user.title AS author_title, user.name AS author_name 
FROM books AS book LEFT JOIN users AS user ON user.id = book.author
```

```sql
-- Linked QL
SELECT id, title, content, created_time, author ~> id, author ~> title, author ~> name 
FROM books
```

PRO: *Whole namespacing exercise is now eliminated; 70% less code; all with zero upfront setup!*

Additionally, paths can be multi-level:

```sql
-- Linked QL
SELECT * FROM books
WHERE author ~> role ~> name = 'admin'
```

and they can also be used to express incoming references:

```sql
-- Linked QL
SELECT * FROM users
WHERE author <~ books ~> title = 'Beauty and the Beast'
```

> DOCS coming soon.

## Introducing Auto-Versioning

*Create, Drop, Alter schemas without needing to worry about schema versioning.* Linked QL automatically adds auto-versioning capabilities to your database. Meet Schema Savepoints and Rollbacks.

Where you normally would maintain a history of schema files (i.e. migration files) within your application, with a naming convention that, among other things, must carry a sense of *versioning*...

```js
app
 ├── migrations
  ├── 20240523_1759_create_users_table_and_drop_accounts_table.sql
  ├── 20240523_1760_add_last_login_to_users_table_and_add_index_on_order_status_table.sql
  ├── ...
```

Linked QL lets you just alter your DB however you may, this time, with automatic savepoints happening within your DB as you go:

```js
// Alter schema
await client.query('CREATE TABLE users (...)', {
    savepointDesc: 'Create users table',
});
```

```js
// Inspect the automatic savepoint created for you
const savepoint = await client.database('public').savepoint();
console.log(savepoint.savepoint_desc); // Create users table
```

PRO: *DB versioning concerns are now taken out of the client application - to the DB itself; all with zero upfront setup!*

Now, when it's time to rollback? A magic wand button:

```js
// Rollback all associated changes
await savepoint.rollback();
```

and you can go many levels back:

```js
// Rollback to a point in time
let savepoint;
while(savepoint = await client.database('public').savepoint()) {
    await savepoint.rollback();
    if (savepoint.id === '...') break;
}
```

and you can "redo" a rollback; i.e. roll forward:

```js
let savepoint = await client.database('public').savepoint({ direction: 'forward' });
await savepoint.rollback();
```

> DOCS coming soon.

## API

*Coming soon.*
<!--

1. The `client.query()` method lets you run any SQL query on your database.

    ```js
    // Run a query
    client.query('SELECT fname, lname FROM users').then(result => {
        console.log(result);
    });
    ```

2. Other methods give us a programmatic way to manipulate or query the database. (Docs coming soon.)
    1. The `client.createDatabase()` and `client.createDatabaseIfNotExists()` methods. (Returning a `Database` instance (`database`).)
    2. The `client.dropDatabase()` and `client.dropDatabaseIfExists()` methods.
    3. The `client.databases()` method - for listing databases, and the `client.database(name)` method - for obtaining a `Database` instance (`database`).
    4. The `database.createTable()`, `database.alterTable()`, and `database.dropTable()` methods.
    5. The `database.tables()` method - for listing tables, the `database.table(name)` method - for obtaining a `Table` instance (`table`).
    6. The `table.getAll()` method - for listing entries, the `table.get(id)` method - for obtaining an entry, the `table.count()` method - for count.
    7. The `table.addAll()` and `table.add()` methods.
    8. The `table.putAll()` and `table.put()` methods.
    9. The `table.deleteAll()` and `table.delete()` methods.

[Learn more about the API](../learn/the-api). (DOCS coming soon.)

## What About Relationships? - The Language

Objective SQL is a superset of the same familiar, powerful SQL language you know...

```sql
SELECT post_title, users.fname AS author_name FROM posts
LEFT JOIN users ON users.id = posts.author_id;
```

...with an object-oriented syntax for relationships, built into the language...

```sql
SELECT post_title, author_id->fname AS author_name FROM posts;
```

...and that's SQL without the query complexity!

[Learn more about the language](../learn/the-language) and see just what's possible with the *arrow* syntax. (DOCS coming soon.)

## Documentation
[Objective SQL Documentions](https://webqit.io/tooling/objective-sql)
-->

## TODO

There's a lot here:

+ Write detailed docs.
+ Upgrade support for MySQL.
+ Implement support for IndexedDB and in-mem.
+ Write detailed tests.

> Much of that could happen sooner with your support! If you'd like to help out, please consider a [sponsorship](https://github.com/sponsors/ox-harris). PRs are also always welcome.

## Issues

To report bugs or request features, please submit an issue to this repository.

## License

MIT.

<!--
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
-->
