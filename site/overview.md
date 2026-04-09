# What Is LinkedQL

LinkedQL is a modern SQL interface that drops into any JavaScript application or agentic workflows with advanced capabilities.

At its simplest, it gives you a stable way to talk to data:

- `query()`
- `stream()`
- `transaction()`
- `wal.subscribe()`

But the same gives you a much broader system:

- live queries as a first-class runtime capability
- powerful SQL language shorthands for relationships, JSON, and more
- cross-runtime quering via `EdgeClient` (e.g. client -> server querying)
- an embeddable local SQL engine named FlashQL, that itself enables...
- federation, materialization, and bidirectional sync
- version safety and point-in-time replay
- and more

## Why LinkedQL

If you've built a realworld system before, you most certainly stacked up tools and capability layers on top of SQL:

- ORMs for relationships
- schema mappers and a migration system
- subscription servers like GraphQL for live updates
- custom local caches and sync layers for offline-first apps
- and probably more

The idea with LinkedQL is to be what SQL can be: a self-aware, reactive system that can directly answer modern application flows.

LinkedQL's direction is to absorb more of SQL's compensatory layers into the language.

## The Three Big Areas

### Common Client Contract

Across runtimes, LinkedQL tries to keep the core application contract stable:

- query normally with `query()`
- do live queries with `query({ live: true })`
- do pull-based queries with `stream()`
- do explicit transactional work with `transaction()`
- subscribe to table-level commits with `wal.subscribe()`

See: [Query Interface](/docs/query-api)

### Language Capabilities

LinkedQL extends SQL with application-oriented language features such as:

- [DeepRefs](/capabilities/deeprefs)
- [JSON Literals](/capabilities/json-literals)
- [Version Binding](/capabilities/version-binding)

These are about expressing richer intent in the query itself instead of pushing that intent into external glue code.

### Runtime Capabilities

LinkedQL also extends the runtime side of the database contract:

- [Live Queries](/capabilities/live-queries)
- [Federation, Materialization, and Sync](/flashql/foreign-io)

These collapse existing tall tooling stacks, capability layers, and large scale glue code into a single application-ready primitive.

## FlashQL's Role

FlashQL is an answer to an everyday question: how do I run SQL locally from the browser/edge runtime/current process? How do I optionally back the local instance up with an upstream database, plus: optionally get both instances in sync?

It gives you:

- a local SQL engine, with pluggable persistence backends
- federation, materialization, and sync with a strong conflict handling model
- historical data and point-in-time replays

See:

- [FlashQL](/flashql)
- [Federation, Materialization, and Sync](/flashql/foreign-io)
- [Sync Integration Patterns](/flashql/sync-patterns)

## Where to Start

- If you want the quickest entry, go to [Getting Started](/docs)
- If you want the universal method contract, go to [Query Interface](/docs/query-api)
- If you want the capabilities now, go to [Capabilities Overview](/capabilities)
- If you want the local runtime story, go to [FlashQL](/flashql)
