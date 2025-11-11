# LinkedQL <br>— A Modern Take on SQL and SQL Databases

_Simplify and unify your entire database layer in a single interface_. 🛸

## What is LinkedQL

LinkedQL is both:

+ a query client — `client.query()`
+ and, more broadly, an idea — **SQL reimagined for modern apps**.

The broader idea captures the **intent** behind each tool in the compensatory layers built around SQL — query builders, ORMs, schema mappers, GraphQL servers, and other application-level boilerplates — and enables these natively within the language.

The result is SQL that finally internalizes the external capabilities built around it — **an upgrade**.

Think of LinkedQL as **SQL, upgraded** — for modern applications.

## Why LinkedQL

“Modern” SQL shouldn’t require an entire scaffolding layer to fit within modern applications.

Ideally, there should be a declarative way to express relationships in SQL rather than through an external ORM; a syntax for JSON composition instead of an imperative set of JSON functions; first-class support for application-land fundamentals like reactivity over external subscription servers; native handling of meta-concerns like schema versioning over manual migration tooling.

The goal with LinkedQL is to bring these capabilities to the database itself and retire the historic compensation layer around SQL.

## Capabilities

| Capability                    | Description                                                                                                                    |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| ⚡ **Live Queries**            | Turn on reactivity over any SQL query with `{ live: true }`. No extra infrastructure required.                                   |
| 🔗 **DeepRef Operators**      | Traverse relationships using simple path notation (`~>` / `<~`). Insert or update nested structures using same notation.       |
| 🧩 **JSON Literals**          | Bring JSON-like clearity to your queries with LinkedQL's first-class support for JSON notation.                                |
| 🪄 **Upserts**                | Do upserts with a literal UPSERT statement.                                                                                    |
| 🧠 **Schema Versioning**      | (Coming soon) Get automatic schema versioning on your database: automatic snapshots and historical introspection.              |
| 💾 **Edge & Offline Runtime** | (FlashQL) Run or embed SQL locally — in browsers, workers, or edge devices — for local-first and offline-first applications.   |
| 🌐 **Federation & Sync**      | (Alpha) Unify remote databases, REST endpoints, and local stores into a single relational graph with seamless synchronization. |

## Features

| Feature                                   | Description                                                                                             |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 💻 **Classic `client.query()` Interface** | Same classic client interface; advanced capabalities for modern applications. |
| 🔗 **Multi-Dialect Support**              | A universal parser that understands PostgreSQL, MySQL, MariaDB, and FlashQL — one client, many dialects.           |
| 💡 **Lightweight Footprint**              | A full reactive data layer in one compact library — under 80 KiB (min/zip). |
| 🎯 **Automatic Schema Inference**         | No upfront schema work. LinkedQL auto-discovers your schema and stays schema-driven across complex tasks.      | 
| 🪄 **Diff-Based Migrations**              | (Coming soon) Evolve schemas declaratively through change detection instead of hand-written migration scripts.        |

## Next Steps

Choose where to start:

| Path | Focus |
|:--|:--|
| [Getting Started](/docs) | Get started with LinkedQL in under three minutes. No database required |
| [Explore Capabilities](/capabilities) | Jump to the Capabilities section. |
| [Meet FlashQL](/flashql) | Meet FlashQL — LinkedQL's embeddable SQL engine. |
| [Engineering Deep Dive](/engineering/realtime-engine) | Dig into LinkedQL's engineering in the engineering section. |
