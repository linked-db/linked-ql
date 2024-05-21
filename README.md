# Objective SQL

<!-- BADGES/ -->

<span class="badge-npmversion"><a href="https://npmjs.org/package/@webqit/objective-sql" title="View this project on NPM"><img src="https://img.shields.io/npm/v/@webqit/objective-sql.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://npmjs.org/package/@webqit/objective-sql" title="View this project on NPM"><img src="https://img.shields.io/npm/dm/@webqit/objective-sql.svg" alt="NPM downloads" /></a></span>
<a href='https://coveralls.io/github/webqit/objective-sql?branch=master'><img src='https://coveralls.io/repos/github/webqit/objective-sql/badge.svg?branch=master' alt='Coverage Status' /></a>
<span class="badge-patreon"><a href="https://patreon.com/ox_harris" title="Donate to this project using Patreon"><img src="https://img.shields.io/badge/patreon-donate-yellow.svg" alt="Patreon donate button" /></a></span>

<!-- /BADGES -->

The object-oriented, adaptive SQL client for modern apps - query anything from the plain JSON object, to the client-side IndexedDB, to the server-side DB.

## Overview

Objective SQL is a query client that wraps powerful concepts in a simple, succint API.

1. It lets you query different types of databases using one consistent syntax and API.
    1. Both SQL databases (like MySQL, PostgreSQL) and client-side, non-SQL databases (like [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)).
    2. One syntax and API to rule them all!
2. It implements a superset of the SQL language that lets you access relationships without constructing JOINS.
    1. Goodbye query complexity!
    2. Goodbye ORMs!

Take a one-minute overview of Objective SQL.

## Basic Usage

Obtain an Objective SQL query client for your target database:

1. For SQL databases, import and instantiate the *SQL* language driver. (You'll pass in the name of an appropriate database connection driver that works for your database.)

    ```js
    // Import SQL
    import { SQL } from '@webqit/objective-sql';
    
    // Using the 'mysql2' connector (npm install mysql2)
    const connectionDriver = 'mysql2';
    const connectionParams = {
	    host: '127.0.0.1',
	    user: 'root',
	    password: '',
    };

    // Create an instance by calling .connect().
    const client = SQL.connect(connectionDriver, connectionParams);
    
    // Or by using the 'new' keyword.
    const client = new SQL(connectionDriver, connectionParams);
    ```
    
2. For the client-side [*IndexedDB*](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) database, import and instantiate the *IDB* language driver.

    > IndexedDB is a low-level API for client-side storage.
    
    ```js
    // Import IDB
    import { IDB } from '@webqit/objective-sql';
    
    // Create an instance.
    const client = new IDB;
    ```
    
3. To work with Objective SQL's in-memory object storage, import and instantiate the *ODB* language driver.

    > This is an environment-agnostic in-memory store.

    ```js
    // Import IDB
    import { ODB } from '@webqit/objective-sql';
    
    // Create an instance.
    const client = new ODB;
    ```

All `client` instances above implement the same interface:

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

## Issues
To report bugs or request features, please submit an issue to this repository.

## License
MIT.

<!--
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
-->
