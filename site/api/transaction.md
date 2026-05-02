# `db.transaction()` and `db.begin()`

LinkedQL exposes two ways to work with explicit transactions:

- `db.transaction(cb)` for scoped transactions
- `db.begin()` for manual lifecycle control

---

## `db.transaction()`

`transaction(cb)` creates an explicit transaction scope.

```js
await db.transaction(async (tx) => {
  // do multiple things atomically
});
```

- if the callback resolves, LinkedQL commits
- if the callback throws, LinkedQL rolls back and re-throws

The callback shape is stable across runtimes, but the transaction object `tx` itself is runtime-specific.

### Example 1: Mainstream Databases

```js
await db.transaction(async (tx) => {
  await db.query(
    'INSERT INTO users (id, name) VALUES ($1, $2)',
    { values: [1, 'Ada'], tx }
  );

  await db.query(
    'UPDATE users SET active = true WHERE id = $1',
    { values: [1], tx }
  );
});
```

### Example 2: FlashQL

FlashQL works the same as above. But it additionally exposes DDL and DML methods on the `tx` object itself:

```js
await flash.transaction(async (tx) => {
  const table = tx.getTable({ namespace: 'public', name: 'users' });
  await table.insert({ id: 1, name: 'Ada' });
});
```

This is the same transactional scope, but with FlashQL's lower-level transaction surface available directly on `tx`.

---

## `db.begin()`

`db.begin()` gives you a transaction handle directly:

```js
const tx = await db.begin();

try {
  await db.query(
    'INSERT INTO users (id, name) VALUES ($1, $2)',
    { values: [1, 'Ada'], tx }
  );
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

This is useful when:

- you need manual commit/rollback timing
- transaction control spans multiple branches
- you are integrating with lower-level control flow

---

## Additional Reading

| If you want to learn about... | Go to... |
| :-- | :-- |
| the base `query()` API | [Query API](/api/query) |
| the base `stream()` API | [Stream API](/api/stream) |
