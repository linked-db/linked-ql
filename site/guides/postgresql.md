# PostgreSQL Guide

`PGClient` is the direct PostgreSQL client for LinkedQL. It gives you full SQL access, transactions, and realtime capabilities over a native PostgreSQL connection.

Use `PGClient` when your application talks directly to PostgreSQL.

> `PGClient` uses the `node-postgres` connector under the hood and accepts all the existing constructor options.

---

## Setup

```js
import { PGClient } from '@linked-db/linked-ql/postgres';

const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
  poolMode: false,
});

await db.connect();

const result = await db.query('SELECT 1::text AS result');
console.log(result.rows);
// [{ result: '1' }]

await db.disconnect();
```

---

## Connection Mode

By default, `PGClient` runs on a single PostgreSQL connection.

You can opt into connection pooling by enabling `poolMode`:

```js
const db = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydb',
  poolMode: true,
});
```

In `poolMode`, `PGClient` uses a connection pool to handle concurrent queries more efficiently.

After initializing the instance via `db.connect()`, subsequent `db.connect()` calls simply return a checked-out client.

This lets you explicitly check out a connection for session-sensitive work:

```js
const client = await db.connect();
// ... run session-bound queries
client.release();
```

This is useful for transactions or workflows that require a stable connection.

---

## Realtime Setup

LinkedQL uses PostgreSQL's logical replication to power [live queries](/realtime/live-queries) and [`db.wal.subscribe()`](/api/wal-subscribe). This requires logical replication to be enabled on the PostgreSQL instance.

At minimum, set in your database config file:

```conf
wal_level = logical
```

Depending on your setup, you may also need:

```conf
max_replication_slots = 10
max_wal_senders = 10
```

Refer to the [official PostgreSQL documentation](https://www.postgresql.org/docs/current/logical-replication-config.html) for enabling logical replication.

> Restart PostgreSQL after changing these settings.

Once enabled, LinkedQL handles the rest automatically:

- creates a replication slot if it does not already exist
- creates a publication if it does not already exist
- subscribes to and decodes the WAL stream

The replication slot name and publication name that LinkedQL uses by default are:

| Setting | Default |
| :-- | :-- |
| Replication slot | `linkedql_default_slot` (ephemeral by default) |
| Publication | `linkedql_default_publication` |

Note that by default, when LinkedQL creates a publication, it creates it for all tables.

You can override these defaults if needed via constructor options:

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `walSlotName` | `string` | `'linkedql_default_slot'` | logical replication slot name |
| `walSlotPersistence` | `0 \| 1` | `0` | whether the slot should be ephemeral or persistent |
| `pgPublications` | `string \| string[]` | `'linkedql_default_publication'` | publication(s) used for change streaming |

Example:

```js
const db = new PGClient({
  walSlotName: 'my_slot',
  walSlotPersistence: 1,
  pgPublications: 'my_publication',
});
```

This is useful when:

- you manage replication slots manually
- you need persistent slots
- you want to integrate with an existing replication setup

> [!TIP]
> LinkedQL consumes PostgreSQL's WAL using the `pgoutput` plugin, the same mechanism PostgreSQL uses for native logical replication.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the common application-facing methods | [API](/api) |
| how this fits into larger app architectures | [Integration Patterns](/guides/integration-patterns) |
