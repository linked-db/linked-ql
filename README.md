# Linked QL

A query client that extends standard SQL with new syntax sugars for simpler queries and enables auto-versioning capabilities on any database. And what's more, ready to talk to any DB!

+ **Magic Paths.** Express relationships graphically. Meet the magic path operators that leverage heuristics to let you connect to columns on other tables without writing a JOIN.

+ **Auto-Versioning.** Create, Drop, Alter schemas without needing to manually version each operation. Linked QL automatically adds auto-versioning capabilities to your database.

+ **Omni-DB.** Talk to YOUR DB of choice - from the server-side PostgreSQL and MySQL, to the client-side [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), to the plain JSON object. One syntax to rule them all.

Linked QL wraps all the powerful concepts in a simple, succint API.

## Basic Usage

Install Linked QL:

```cmd
npm install @linked-db/linked-ql
```

Obtain the Linked QL client for your target database:

1. For SQL databases, install the regular SQL client you use for your DB - `pg` for PostgreSQL, `mysql2` for MySQL databases:

    ```cmd
    npm install pg
    ```

    Import and instantiate Linked QL over your DB client:

    ```js
    // Import SQL as LinkedQl
    import pg from 'pg';
    import LinkedQl from '@linked-db/linked-ql/sql';

    // Connect
    const pgClient = new pg.Client({
        host: 'localhost',
        port: 5432,
    });
    await pgClient.connect();

    // Use as a wrapper
    const linkedQlClient = new LinkedQl(pgClient, { dialect: 'postgres' });
    ```
    
2. For the client-side [*IndexedDB*](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) database, import and instantiate the *IDB* language driver.

    > IndexedDB is a low-level API for client-side storage.
    
    ```js
    // Import IDB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql/idb';
    
    // Create an instance.
    const linkedQlClient = new LinkedQl;
    ```
    
3. To work with Linked QL's in-memory object storage, import and instantiate the *ODB* language driver.

    > This is an environment-agnostic in-memory store.

    ```js
    // Import ODB as LinkedQl
    import LinkedQl from '@linked-db/linked-ql';
    
    // Create an instance.
    const LinkedQlClient = new LinkedQl;
    ```

All `LinkedQl` instances above implement the same interface:

1. The `LinkedQlClient.query()` method lets you run any SQL query on your database.

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
