# FlashQL Sync API

FlashQL sync is the orchestration engine for materialized and realtime views.

If you have already read [Federation, Materialization, and Sync](/flashql/federation-and-sync), this page is the operational companion:

- that page explains the *model*
- this page explains the *control surface*

---

## What the Sync Manager Manages

`db.sync` works over FlashQL views whose replication mode is one of:

- `materialized`
- `realtime`

Basic views aren't captured here as they participate in the wider federated graph and not sync-based.

The Sync engine has two complementary responsibilities:

- Pull or subscribe to origin tables: **inbound sync**
- Push writes back to origin tables, with automatic conflict detection: **outbound sync**

Sync is a self-driven process in FlashQL. The public Sync API, however, makes it inspectable, interceptable, and instructable.

Being self-driven helps eliminate application-side bookkeeping.

---

## The Main Application-Level Entry Point: `sync.sync()`

The central design decision in FlashQL sync is that there is one idempotent application-level entry point:

```js
await db.sync.sync();
```

Calling this API triggers background sync across FlashQL – if not already running. Successive calls converge to a single trigger.

You should be able to call it:

- on network reconnection
- when your app is unsure whether sync is currently active

and get the correct reconciliation behavior without having to memorize a dozen separate lifecycle APIs.

---

## Practical Startup and Reconnect Flow

This is the core pattern most local-first apps want:

```js
window.addEventListener('online', async () => {
  await db.sync.sync();
});
```

Why this works well:

- `sync.sync()` is idempotent
- overlapping calls are coalesced
- network reconnect storms have no damaging effect

And just as importantly, this is meant to be the only thing the app really needs to remember:

- on reconnect, call `db.sync.sync()`
- everything else should already be automatic

---

## What `sync.sync()` Does

For the given selector, `sync.sync(selector?)` will discover candidate views and:

- for inbound sync, do one of:
  - materialize local copies, if not already materialized – in the case of "materialized" views
  - start realtime jobs, if not already started – in the case of "realtime" views
- for outbound sync
  - retry queued writes to origin tables

---

## Selector Support

Like other LinkedQL selector-based APIs, the Sync API accepts selectors like:

```js
await db.sync.sync({ public: ['users_cache'] });
await db.sync.sync({ public: ['posts_live'] });
```

## `sync.status()`

Use `sync.status()` to inspect the current sync state of matching views.

```js
const status = await db.sync.status({ public: ['users_cache', 'posts_live'] });
console.log(status);
```

Status records includes fields such as:

- `enabled`
- `state`
- `retry_count`
- `last_error`
- `updated_at`
- `next_retry_at`

### Typical State Meanings

- `idle`: not currently running
- `synced`: a materialized copy was populated successfully
- `running`: a realtime job is active
- `failed`: the last attempt failed

---

## `sync.stop()`

Use `sync.stop()` to halt selected realtime jobs.

```js
await db.sync.stop({ public: ['posts_live'] });
```

For realtime views, `sync.stop()` doesn't just stop a job but disables it until explicitly resumed.

---

## `sync.resume()`

Use `sync.resume()` to re-enable previously stopped jobs.

```js
await db.sync.resume({ public: ['posts_live'] });
```

`sync.resume()` re-enables the job and then routes back through the normal sync logic.

---

## Materialized vs Realtime Behavior

### Materialized View

For a `materialized` view, sync typically:

- fetches the upstream rows
- replaces the local copy
- marks the job as `synced`

### Realtime View

For a `realtime` view, sync typically:

- ensures a usable local copy exists
- starts the upstream subscription
- updates the local mirror as upstream commits arrive

---

## Outbound Write Behavior

When a replicated view is also writeable, `db.sync` is also responsible for draining queued outbound work.

### Failure and Retry Semantics

For outsync work, FlashQL distinguishes at least these cases:

- `pending`
- `failed`
- `conflicted`
- `applied`

Practical meaning:

- transient failures, like network-level failures, become `failed` and get a future `next_retry_at`.
  (This retry timing can be bypassed via `sync.sync({ ... }, { forceSync: true })`)
- conflicts become `conflicted`
- successful outbound application becomes `applied`

Queue state is about the outbound attempt. Row state is still authoritatively driven by inbound origin commits or explicit refreshes.

---

## Observable Sync Events

`db.sync` emits operational events such as:

- `error`
- `conflict`

These are useful for app-level observability and diagnostics without requiring the app to infer queue semantics from row data alone.

```js
db.sync.on('error', (e) => {
  console.log(e);
});
```

---

## Example: Inspect, Stop, Resume

```js
await db.sync.sync({ public: ['posts_live'] });

const before = await db.sync.status({ public: ['posts_live'] });
console.log(before[0].state);
// 'running'

await db.sync.stop({ public: ['posts_live'] });

const stopped = await db.sync.status({ public: ['posts_live'] });
console.log(stopped[0].enabled);
// false

await db.sync.resume({ public: ['posts_live'] });

const resumed = await db.sync.status({ public: ['posts_live'] });
console.log(resumed[0].state);
// 'running'
```

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the boreader sync story | [Federation, Materialization, and Sync](/flashql/federation-and-sync) |
| how sync fits into larger application architectures | [Integration Patterns](/guides/integration-patterns) |
