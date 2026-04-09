# Getting Started With LinkedQL

This guide takes you from installation to your first query with LinkedQL.

If you are totally new here, you may want to begin with [What is LinkedQL](/overview). If you are here for the embeddable local runtime, jump to [FlashQL](/flashql).

## Installation

Install the package from npm:

```bash
npm install @linked-db/linked-ql
```

The package exports the client entry points.

Import and use the Client for your database. LinkedQL works the same across all clients.

| **Client**          | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PGClient            | `@linked-db/linked-ql/postgres`      | [PostgreSQL ↗](/docs/setup#postgresql) |
| MySQLClient         | `@linked-db/linked-ql/mysql`   | [MySQL ↗](/docs/setup#mysql)           |
| MariaDBClient       | `@linked-db/linked-ql/mariadb` | [MariaDB ↗](/docs/setup#mariadb)       |
| FlashQL             | `@linked-db/linked-ql/flashql`   | [FlashQL ↗](/docs/setup#flashql)       |
| EdgeClient          | `@linked-db/linked-ql/edge`    | [Edge / Browser ↗](/docs/setup#edgeclient)   |
| EdgeWorker          | `@linked-db/linked-ql/edge-worker` | [Edge Worker ↗](/docs/setup#edgeworker) |

## Your First Query: Direct Database Client

A good first look is with a regular database client.

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await db.connect();

const result = await db.query('SELECT 10 AS value');
console.log(result.rows);
// [{ value: 10 }]

await db.disconnect();
```

## Your First Query: Local Runtime With FlashQL

LinkedQL ships with FlashQL, an embeddable SQL runtime that runs in-process.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

await db.query(`
  CREATE TABLE public.users (
    id INT PRIMARY KEY,
    name TEXT
  );

  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus');
`);

const result = await db.query(`
  SELECT id, name
  FROM public.users
  ORDER BY id
`);

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]

await db.disconnect();
```

FlashQL has the same top-level query surface as the mainstream clients.

## What Comes Next

While deliberately simple, the same interface above quickly opens into deeper grounds:

- live queries with `{ live: true }`
- iterator-based querying with `db.stream()`
- table-level changefeed subscriptions with `db.wal.subscribe()`
- language extensions like DeepRefs and JSON literals
- FlashQL orchestration with fedration, materialization, and sync

## Where to Go Next

- [Setup Guides](/docs/setup) for detailed setup by runtime
- [Query Interface](/docs/query-api) for the common method contract
- [Capabilities Overview](/capabilities) for language and runtime extensions
- [FlashQL](/flashql) for the local runtime and sync model
