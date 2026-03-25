# What is LinkedQL

LinkedQL is a modern SQL interface and runtime family for application code.

At its simplest, it gives you a stable way to talk to data:

- `query()`
- `stream()`
- `transaction()`
- `wal.subscribe()`

At its richest, it gives you a much broader system:

- SQL language extensions for application-shaped querying and writing
- live queries as a first-class runtime capability
- an embeddable local SQL engine in FlashQL
- edge transport through `EdgeClient` and `EdgeWorker`
- federation, materialization, realtime mirroring, and sync in FlashQL
- version binding and point-in-time replay

## The short version

If traditional DB clients answer the question:

> "How do I send SQL to this database?"

LinkedQL tries to answer the larger application question:

> "How do I keep one coherent data interface while my data moves across local runtime, remote database, edge transport, and reactive app state?"

That is the real project.

## Why LinkedQL exists

Modern app stacks often surround SQL with a compensation layer:

- ORMs for relationships
- schema mappers for shape control
- subscription servers for reactivity
- extra transport code for edge and worker environments
- custom local caches and sync layers for offline-first apps

LinkedQL's direction is to pull more of that work back into a coherent SQL-facing model.

Not by pretending every concern is "just SQL," but by extending the query/runtime layer where that actually improves the developer experience.

## The three big areas

### Common client contract

Across runtimes, LinkedQL tries to keep the core application contract stable:

- query buffered results with `query()`
- lazily consume rows with `stream()`
- do explicit transactional work with `transaction()`
- subscribe to table-level commits with `wal.subscribe()`

See: [Query Interface](/docs/query-api)

### Language capabilities

LinkedQL extends SQL with application-oriented language features such as:

- [DeepRefs](/capabilities/deeprefs)
- [JSON Literals](/capabilities/json-literals)
- [Version Binding](/capabilities/version-binding)

These are about expressing richer intent in the query itself instead of pushing that intent into external glue code.

### Runtime capabilities

LinkedQL also extends the runtime side of the database contract:

- [Live Queries](/capabilities/live-queries)
- [Streaming](/capabilities/streaming)
- [Changefeeds](/capabilities/changefeeds)
- [FlashQL](/flashql)

This is where the project becomes especially interesting for modern application architecture.

## FlashQL's role

FlashQL is the most ambitious runtime in the project.

It gives you:

- a local SQL engine
- persistence through pluggable key-value backends
- foreign-client federation
- explicit local copies of remote data through `origin`, `materialized`, and `realtime` views
- sync orchestration through `db.sync`
- point-in-time boot through `versionStop`

See:

- [FlashQL](/flashql)
- [Federation, Materialization, and Realtime Views](/flashql/foreign-io)
- [FlashQL Sync](/flashql/sync)

## What LinkedQL is not claiming

It is just as important to be explicit about scope.

LinkedQL is not claiming:

- full byte-for-byte compatibility with every mainstream database feature surface
- complete parity across every driver and dialect path
- that every parsed construct is equally mature at runtime

The strong parts of the project today are real. They are also specific.

## Where to start

- If you want the quickest entry, go to [Getting Started](/docs)
- If you want the universal method contract, go to [Query Interface](/docs/query-api)
- If you want the language extensions, go to [Capabilities Overview](/capabilities)
- If you want the local runtime story, go to [FlashQL](/flashql)
