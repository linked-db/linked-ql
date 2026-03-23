# Getting Started with LinkedQL

This guide is the shortest path into the project.

By the end of it, you should understand three things:

- what you install
- which client shape fits your runtime
- what the common query interface looks like

If you want the broader philosophy first, start with [What is LinkedQL](/overview). If you want the full local runtime story, jump to [FlashQL](/flashql).

## Project shape

LinkedQL has two layers that are worth separating mentally:

- the **common client contract**: `query()`, `stream()`, `transaction()`, `wal.subscribe()`
- the **richer runtime layers** built on top of that contract, especially FlashQL

That distinction matters because it keeps the docs honest:

- every client does not do everything
- but the way you talk to data stays intentionally similar across runtimes

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

## Current shape

LinkedQL is no longer just a sketch of an idea. It is already a substantial, tested system with a large and growing test base across parsing, desugaring, execution, realtime behavior, sync behavior, edge transport, and storage behavior.

The practical way to read its maturity today is:

- strong already in the core client contract
- strong already in FlashQL, live queries, local-first orchestration, and version-aware querying
- still catching up in some broader DDL and migration-oriented surfaces

That is a more useful framing than either "fully done" or "just alpha."

## Dialects, clients, and runtimes

LinkedQL gives you several entry points depending on where the query should run.

| Client | Use it when | Docs |
| :-- | :-- | :-- |
| `PGClient` | your app talks directly to PostgreSQL | [Dialects & Clients](/docs/setup#postgresql) |
| `MySQLClient` | your app talks directly to MySQL | [Dialects & Clients](/docs/setup#mysql) |
| `MariaDBClient` | your app talks directly to MariaDB | [Dialects & Clients](/docs/setup#mariadb) |
| `EdgeClient` | your app talks to a remote worker/server that exposes LinkedQL over HTTP or worker ports | [Dialects & Clients](/docs/setup#edgeclient) |
| `FlashQL` | you want an embeddable local SQL runtime | [Dialects & Clients](/docs/setup#flashql) |

The important thing is not just the list. It is the architectural freedom this gives you:

- direct server DB access
- edge transport to a remote database runtime
- a full local runtime in-browser, in-worker, or in-process

## First example: direct database client

Here is the most familiar starting point: PostgreSQL.

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

Why this is a good starting point:

- it looks like the mainstream DB client flow developers already know
- it lets you learn the LinkedQL query contract without learning FlashQL first

## Second example: local runtime with FlashQL

Here is the smallest useful FlashQL setup.

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

Why this example matters:

- it shows that FlashQL is not "mock SQL"; it is a real local SQL runtime
- it uses the same `query()` shape as the mainstream clients
- it is the shortest path into local-first patterns later

## What comes after these first examples

The two examples above deliberately stay simple. But the same API family quickly expands into richer ground:

- live queries with `{ live: true }`
- lazy result streaming with `db.stream()`
- table-level changefeeds with `db.wal.subscribe()`
- syntax extensions such as DeepRefs and structured writes
- FlashQL orchestration with foreign namespaces, `origin`/`materialized`/`realtime` views, and `db.sync.sync()`

That is the general picture to keep in mind as you move deeper into the docs:

- Section 1 of the README introduces the common interface
- Section 2 introduces the language model
- Section 3 introduces orchestration and architecture
- the docs site is where those topics are expanded in full

## Where to go next

- [Dialects & Clients](/docs/setup) for setup by runtime
- [Query Interface](/docs/query-api) for the common method contract
- [Capabilities Overview](/capabilities) for the language and runtime extensions
- [FlashQL](/flashql) for the local runtime and sync model
