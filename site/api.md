# Core API

LinkedQL exposes a small, stable application-facing API across its runtimes.

---

## Methods

| Method                   | Description                                      | Docs                                     |
| :----------------------- | :----------------------------------------------- | :--------------------------------------- |
| **`db.query()`**         | Execute a query and return the full result       | [Query API](/api/query)                 |
| **`db.stream()`**        | Execute a query as a streaming result set        | [Stream API](/api/stream)               |
| **`db.transaction()`**   | Execute multiple operations within a transaction | [Transaction API](/api/transaction)     |
| **`db.wal.subscribe()`** | Subscribe to database change events              | [Subscription API](/api/wal-subscribe) |

---

## Concepts

| Area         | Description                             | Docs                   |
| :----------- | :-------------------------------------- | :--------------------- |
| **Language** | LinkedQL syntax and query capabilities  | [Language Surface](/lang)         |
| **Realtime** | Streaming and live data behavior        | [Realtime Capabilities](/realtime) |
| **Guides**   | Usage patterns and integration examples | [Core Guides](/guides)     |
