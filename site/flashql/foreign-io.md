# Federation & Sync (Alpha)

Federation and Sync extend FlashQL’s reach beyond the local store into **remote databases**, **APIs**, or any other data endpoint — exposed in its _Foreign I/O_ set of APIs.

With Foreign I/O, you can stream data on demand, materialize remote datasets locally, or maintain continuous two-way synchronization.

* **Federation** — join remote databases or arbitrary data sources directly in a query, on demand.
* **Materialization** — pull and persist remote datasets locally for offline-first or edge-first workloads.
* **Sync** — keep local and remote datasets in continuous, bidirectional synchronization.

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │ ─────── Federation ──────────> │   Remote DB(s)   │
│                 │ <────── Materialization ────── │                  │
│     (Local)     │ <────── Sync ────────────────> │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

Each mode requires FlashQL to be initialized with a remote connection factory:

```js
import { FlashClient } from '@linked-db/linked-ql/flash';
import { PGClient } from '@linked-db/linked-ql/pg';

const local = new FlashClient({
  onCreateRemoteClient: async (opts) => {
    const remote = new PGClient(opts);
    await remote.connect();
    return remote;
  },
});
await local.connect();
```

## Query Federation

Join remote databases or arbitrary data sources in the same query — on demand. 

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │ ─────── Federation ──────────> │   Remote DB(s)   │
│                 │         query parts run →      │                  │
│     (Local)     │         results stream ←       │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

*(a) Federate a remote dataset (or many of such)*

```js
await local.federate({ public: ['users', 'orders'] }, {
  host: 'localhost',
  port: 5432,
  database: 'production'
});
```

*(b) With filters*

```js
await local.federate(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 }
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(c) Using SQL*

```js
await local.federate(
  {
    analytics: {
      name: 'events',
      query: `
        SELECT * FROM public.events 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(d) Query across all federated origins* LinkedQL automatically routes the relevant parts of your query to their respective origins and streams results back into the working dataset.

```js
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total, 
    p.name AS product_name,
    e.event_type
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  LEFT JOIN analytics.events e ON u.id = e.user_id
  WHERE o.created_at > NOW() - INTERVAL '30 days'
  ORDER BY o.total DESC
`);

console.log(result.rows);
```

+ Federation is lazy — data is streamed on demand, not bulk-copied.
+ Perfect for large datasets that don't fit into local memory at once.

## Data Materialization

Pull remote datasets locally for offline-first and edge-first workloads.

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │                                │   Remote DB(s)   │
│                 │ <────── Materialization ────── │                  │
│     (Local)     │         pull data ←            │ (Postgres, etc.) │
└─────────────────┘         keep locally           └──────────────────┘
```

*(a) Materialize specified tables from a remote database (or many of such; executes immediately*

```js
await local.materialize({ public: ['users', 'orders'] }, {
  host: 'localhost',
  port: 5432,
  database: 'production'
});
```

*(b) With filters*

```js
await local.materialize(
  {
    pg1: {
      namespace: 'public',
      name: 'products',
      filters: { status: 1 }
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(c) Using SQL*

```js
await local.materialize(
  {
    analytics: {
      name: 'events',
      query: `
        SELECT * FROM public.events 
        WHERE created_at > NOW() - INTERVAL '7 days'
      `
    }
  },
  { connectionString: 'postgresql://user:pass@remote-db:5432/analytics' }
);
```

*(d) Query locally — offline)*

```js
const result = await local.query(`
  SELECT 
    u.id, 
    u.name,
    o.total,
    p.name AS product_name
  FROM public.users u
  JOIN public.orders o ON u.id = o.user_id
  JOIN pg1.products p ON o.product_id = p.id
  ORDER BY o.total DESC
`);
console.log(result.rows);
```

+ Materialization executes immediately and pulls the targeted data locally.
+ Use `{ live: true }` to make it self-updating.
+ Ideal for PWAs and edge runtimes where offline continuity matters.

## Data Sync

Materialize datasets and activate two-way synchronization between local and remote datasets. Offline writes are queued and replayed; conflicts are resolved.

```
┌─────────────────┐                                ┌──────────────────┐
│     FlashQL     │         changes ⇄              │   Remote DB(s)   │
│                 │         resolve conflicts      │                  │
│     (Local)     │ <────── Sync ────────────────> │ (Postgres, etc.) │
└─────────────────┘                                └──────────────────┘
```

*(a) Initialize and activate sync*

```js
await local.sync(
  { public: ['users', 'orders'] },
  { host: 'localhost', port: 5432, database: 'production' }
);
```

*(b) Mutate locally — changes sync automatically)*

```js
await local.query(`
  INSERT INTO users (name, email)
  VALUES ('New User', 'user@example.com')
`);

await local.query(`
  UPDATE orders
  SET status = 'completed'
  WHERE id = 123
`);
```

+ Sync combines materialization with live bidirectional updates and conflict resolution.
+ Changes queue automatically when offline and replay when connectivity returns.
+ The mode you reach for in offline-first apps and edge nodes.
+ Current stage: **alpha**.
