# FlashQL Sync

FlashQL sync is the orchestration layer for sync-enabled views.

If you have already read [Federation, Materialization, and Realtime Views](/flashql/foreign-io), this page is the operational companion:

- that page explains the *model*
- this page explains the *control surface*

## What `db.sync` manages

`db.sync` works over FlashQL views whose persistence is one of:

- `materialized`
- `realtime`

`origin` views participate in the wider federated graph, but they are not themselves sync jobs in the same way.

## The main entry point: `sync.sync()`

The central design decision in FlashQL sync is that there is one idempotent entry point:

```js
await db.sync.sync();
```

This is meant to reduce application-side bookkeeping.

You should be able to call it:

- on startup
- on reconnect
- when your app is unsure whether sync is already active

And get the correct reconciliation behavior without having to memorize a dozen separate lifecycle APIs.

## What `sync.sync()` actually does

For selected sync-enabled views, `sync.sync()` will:

- discover candidate views
- materialize local copies for "materialized" views, if not already materialized
- start realtime jobs for "realtime" views, if not already started
- resume any pending sync work after reconnect

It also coalesces overlapping runs internally, so reconnect storms do not multiply the full sync pass unnecessarily.

## Selector support

Like other LinkedQL selector-based APIs, sync operations accept selectors like:

```js
'*'
{ public: ['users_cache', 'posts_live'] }
```

### Examples

```js
await db.sync.sync();
await db.sync.sync({ public: ['users_cache'] });
await db.sync.sync({ public: ['posts_live'] });
```

## `status()`

Use `status()` to inspect the current sync state of matching views.

```js
const status = await db.sync.status({ public: ['users_cache', 'posts_live'] });
console.log(status);
```

Status records includes fields such as:

- `relation_id`
- `namespace`
- `name`
- `persistence`
- `mode`
- `enabled`
- `state`
- `slot_id`
- `last_seen_commit`
- `retry_count`
- `last_error`
- `updated_at`

### Typical state meanings

- `idle`: not currently running
- `synced`: a materialized copy was populated successfully
- `running`: a realtime job is active
- `failed`: the last attempt failed

## `stop()`

Use `stop()` to halt selected realtime jobs.

```js
await db.sync.stop({ public: ['posts_live'] });
```

By default, `stop()` also disables the stopped realtime job until you explicitly resume it.

## `resume()`

Use `resume()` to re-enable previously stopped realtime jobs.

```js
await db.sync.resume({ public: ['posts_live'] });
```

`resume()` re-enables the job and then routes back through the normal sync logic.

## Practical startup and reconnect flow

This is the core pattern most local-first apps want:

```js
await db.connect();
await db.sync.sync(); // But this is optional if options.autoSync is true, as FlashQL already calls this from within db.connect();

window.addEventListener('online', async () => {
  await db.sync.sync();
});
```

Why this works well:

- `sync.sync()` is idempotent
- overlapping calls are coalesced
- you do not need brittle application-side state flags just to avoid duplicate startup logic

## Materialized vs realtime behavior

### Materialized view

For a `materialized` view, sync typically:

- fetches the upstream rows
- replaces the local copy
- marks the job as `synced`

### Realtime view

For a `realtime` view, sync typically:

- ensures a usable local copy exists
- starts the upstream subscription
- updates the local mirror as upstream commits arrive

For reference-based realtime views, the local copy is bootstrapped and then maintained through WAL/changefeed updates.

## Example: inspect, stop, resume

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

## What sync is and is not

- sync manages local materialization and realtime mirroring of upstream relations
- sync works through explicit view definitions and job state
- sync is not a vague "magical eventual consistency" promise

## Related docs

- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
