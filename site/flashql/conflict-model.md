# Conflict Handling

FlashQL sync is designed around predictable conflict behavior.

It means the system has a clear model for when a local write can still be applied and when it has lost the race to newer authoritative state. What FlashQL doesn't do is automatic merge. That would be bad "magic".

---

## What a Conflict Usually Means

A conflict usually means one of these:

- another client already updated the row
- another client already deleted the row

and so, the origin row version no longer matches the version the view knows.

These scenarios are expected sync outcomes, not mysterious events.

### Example Conflict Scenarios

These are the typical cases to keep in mind.

#### Update vs Update

- two offline clients both update the same row
- one reconnects first to apply upstream
- the second reconnects later

#### Delete vs Update

- one client deletes while offline
- the other updates the same row and reconnects first
- the earlier delete later tries to apply

#### Update vs Delete

- one client updates while offline
- the other deletes the same row and reconnects first
- the earlier update later tries to apply

---

## Conflict Handling

FlashQL sync is built around a single rule of thumb:

> If two clients both edit the same row, you do not want the latter to silently overwrite the former.

You want the system to say, in effect:

> "when a row has evolved past the version you last saw, do not overwrite"
> "apply this write only if the origin row is still the version you think it is"

That is the heart of FlashQL's conflict model.

### The Conflict Detection Model: Row Versioning

A write back to the origin table should succeed only if the origin row is still the exact version the view holds a reference to. Should the origin row be one or more commits ahead of the view, a write back to that row should fail with a conflict error.

For this to work, incoming rows must carry with them a "version" tag into the view. A write back to the origin uses the tag to assert that the row hasn't evolved past the version it holds a reference to.

This "row-version" idea is native to MVCC-based – Multi-Version Concurrency Control – database systems like PostgreSQL and FlashQL. FlashQL sync *automatically* infers a row's version from the row's internal `XMIN` tag. **Conflict detection becomes automatic.**

For non-MVCC-based systems like MySQL, a custom "version" column must be explicitly created and manually managed on the origin table. (The custom "version" column idea is also allowed for MVCC-based setups where that's desired.)

```js
await db.query(`
  CREATE TABLE public.blog (
    id INT PRIMARY KEY,
    content TEXT,
    author_name TEXT,
    _custom_row_version BIGINT
  );
`);
```

This column must be of type `BIGINT`.

The chosen column name must be passed to the view at creation time:

```js
await db.query(`
  CREATE REALTIME VIEW public.users AS
  SELECT * FROM public.users
  WITH (
    replication_origin = 'postgres:primary',
    upstream_mvcc_key = '_custom_row_version'
  );
`);
```

This tells FlashQL over which column to compare row version.

For non-MVCC-based systems like MySQL, not specifying an `upstream_mvcc_key` defaults the write behaviour to:

> update row `id = 1`

Meaning:

> "update anyway; last-writer-wins"

With row versioning, that instead becomes:

> update row `id = 1` only if it is still version `13297`

That difference is what makes conflict handling predictable.

* conflicts are explicit
* data loss is avoided
* the app can react intentionally

### What Happens on Conflict

If the version no longer matches:

* the write operation is rejected
* the write attempt is marked as `conflicted` on the view's control plane table
* origin state remains authoritative
* the view eventually catches up with the commit that caused the divergence
  (This happens via an explicit refresh or via inbound sync – in the case of realtime views.)

### What Happens on Success

On version equality pass:

* the write operation is applied
* the write attempt is marked as `applied` on the view's control plane table
* origin table dispatches a commit event that may echo back to the view, in the case of realtime views
* the view catches up via that event (inbound sync), or via an explicit refresh

---

## How This Relates to Write Policies

Conflict detection works with both write policies, but the user experience differs.

### `origin_first` – the Default

- local writes are queued and dispatched async
- the view's visible state **waits until** either:
  - inbound sync echos back the change – for realtime views
  - the view is explicitly refreshed

### `local_first`

- local writes are staged as visible rows **immediately**
- the row carries `__staged = true` until either:
  - inbound sync echos back the change – for realtime views
  - the view is explicitly refreshed

In a conflict scenario, the view self-normalizes on an explicit refresh or via inbound sync.

The difference between the policies is really **the view's immediate state until normalization**.

---

## Observable Conflict Behavior

`db.sync` emits a dedicated `conflict` event for these cases.

That lets applications observe conflict as its own operational category instead of as generic errors. (See [Observable Sync Events](/flashql/sync-api#observable-sync-events))

This can be useful for inspection and debugging.

---

## What Conflict Handling Is Not

FlashQL explicitly doesn't do:

- arbitrary semantic merges
- domain-specific reconciliation logic

What it does is narrower and more useful:

- when a replicated writable view has a usable origin version token, FlashQL can detect and classify write races predictably

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the broader sync story | [Federation, Materialization, and Sync](/flashql/federation-and-sync) |
| the runtime sync API | [The Sync API](/flashql/sync-api) |
| where sync fits into larger application shapes | [Integration Patterns](/guides/integration-patterns) |
