# `db.wal.subscribe()`

This page documents the method surface for subscribing to table-level [Changefeeds](/realtime/changefeeds).

```js
await db.wal.subscribe(...)
```

---

## The Minimal Form

```js
const unsubscribe = await db.wal.subscribe((commit) => {
  console.log(commit);
});
```

This subscribes to all matching commits the database produces.

---

## Filtering by Selector

Most real use cases want to narrow the scope to specific table names.

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users', 'orders'] },
  (commit) => {
    console.log(commit.entries);
  }
);
```

### Common Selector Forms

```js
'*'
{ public: ['users'] }
{ public: ['users', 'orders'] }
{ '*': ['users', 'orders'] }
{ public: ['*'] }
[{ namespace: 'public', name: 'users' }]
```

The selector is normalized internally into a namespace-to-table mapping.

---

## Stable Subscription Slots

Subscriptions can be given a [stable id](/realtime/changefeeds#stable-subscription-slots):

```js
const unsubscribe = await db.wal.subscribe(
  { public: ['users'] },
  (commit) => console.log(commit),
  { id: 'users_slot' }
);
```

That id gives the subscription a durable slot identity so reconnecting with the same id can resume from the same logical place instead of starting from now again.

---

## Dropping Slots

To drop the slot itself, pass `{ forget: true }` to the `unsubscribe()` call:

```js
await unsubscribe({ forget: true });
```

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the commit object shape, visibility model, and use cases | [Changefeeds](/realtime/changefeeds) |
| the related live query model | [Live Queries](/realtime/live-queries) |
