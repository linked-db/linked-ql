# FlashQL Guide

Unlike the other clients, FlashQL is not a connector to an external database. It is the database itself, a full SQL runtime that runs in the same process as your app.

Use `FlashQL` when you want the database to run inside your application, in Node.js, the browser, a worker, or an edge runtime.

See the [FlashQL Overview](/flashql) for architecture and capabilities.

---

## Setup

```js
import { FlashQL } from '@linked-db/linked-ql/flashql';

const db = new FlashQL();
await db.connect();

const result = await db.query('SELECT 1::text AS result');
console.log(result.rows);

await db.disconnect();
```

---

## Configuration Shape

FlashQL is configured entirely at construction time and all parameters are optional:

| Option | Type | Default | Purpose |
| :-- | :-- | :-- | :-- |
| `dialect` | `'postgres' \| 'mysql'` | `'postgres'` | default SQL dialect |
| `keyval` | `Keyval` | `null` | enables persistence |
| `getUpstreamClient` | `(origin) => client` | `null` | resolves upstream sources |
| `versionStop` | `string \| object` | `null` | boot at a historical point |
| `overwriteForward` | `boolean` | `false` | allow branching from history |
| `autoSync` | `boolean` | `true` | run sync on connect |

Example:

```js
const keyval = new IndexedDBKV({ path: ['my-app'] });
const upstream = new EdgeClient({ url: remoteUrl });

const db = new FlashQL({
  dialect: 'mysql',
  keyval,
  getUpstreamClient: () => upstream,
});
```

---

## Persistence

FlashQL supports persistence via the `keyval` parameter.

See [Persistence](/flashql#persistence).

---

## Upstream Connections

FlashQL connects to external databases via the `getUpstreamClient()` callback.

See [Federation, Materialization, and Sync](/flashql/federation-and-sync).

---

## Realtime Notes

Realtime queries, WAL subscriptions, and sync are built into the runtime. No database-level setup is required.

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the broader FlashQL architecture | [FlashQL Overview](/flashql) |
| the common API contract | [API](/api) |
