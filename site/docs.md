# Getting Started with LinkedQL

This guide takes you from installation to your first query with LinkedQL.

If you are totally new here, you may want to begin with [What is LinkedQL](/overview). If you already know you want the embeddable local runtime, jump to [FlashQL](/flashql).

## The idea in one minute

LinkedQL keeps one application-facing shape across very different runtimes:

- `db.query()` for regular SQL execution and live queries
- `db.stream()` for lazy row-by-row reads
- `db.transaction()` for explicit transactions
- `db.wal.subscribe()` for table-level changefeeds

one consistent API surface, whether `db` is:

- PostgreSQL
- MySQL
- MariaDB
- an edge client
- FlashQL, the local embeddable engine

## Installation

Install the package from npm:

```bash
npm install @linked-db/linked-ql
```

The package exports client entry points such as:

- `@linked-db/linked-ql/postgres`
- `@linked-db/linked-ql/mysql`
- `@linked-db/linked-ql/mariadb`
- `@linked-db/linked-ql/edge`
- `@linked-db/linked-ql/edge-worker`
- `@linked-db/linked-ql/flashql`

## Your first query: direct database client

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

## Your first query: local runtime with FlashQL

LinkedQL ships with FlashQL, an embeddable SQL runtime that runs in-process.

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

await db.query(`
  CREATE TABLE public.users (
    id INT PRIMARY KEY,
    name TEXT
  )
`);

await db.query(`
  INSERT INTO public.users (id, name)
  VALUES (1, 'Ada'), (2, 'Linus')
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

FlashQL is a real local runtime with the same top-level query surface as the mainstream clients.

## Which client should you start with?

Use the client that matches where the query should run:

| Client | Use it when | Guide |
| :-- | :-- | :-- |
| `PGClient` | your app talks directly to PostgreSQL | [Dialects & Clients](/docs/setup#postgresql) |
| `MySQLClient` | your app talks directly to MySQL | [Dialects & Clients](/docs/setup#mysql) |
| `MariaDBClient` | your app talks directly to MariaDB | [Dialects & Clients](/docs/setup#mariadb) |
| `EdgeClient` | your app lives in the browser or on the edge and needs to talk to the database in a remote worker or server | [Dialects & Clients](/docs/setup#edgeclient) |
| `FlashQL` | you want an embeddable local SQL runtime | [Dialects & Clients](/docs/setup#flashql) |

LinkedQL is designed for these architectural options.

## What comes next

While deliberately simple, the same interface above quickly opens into deeper grounds:

- live queries with `{ live: true }`
- lazy result streaming with `db.stream()`
- table-level changefeeds with `db.wal.subscribe()`
- language extensions such as DeepRefs and JSON literals
- FlashQL orchestration with foreign namespaces, `origin` views, `materialized` views, `realtime` views, and `db.sync.sync()`

## Where to go next

- [Dialects & Clients](/docs/setup) for setup by runtime
- [Query Interface](/docs/query-api) for the common method contract
- [Capabilities Overview](/capabilities) for language and runtime extensions
- [FlashQL](/flashql) for the local runtime and sync model
