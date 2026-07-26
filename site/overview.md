# LinkedQL <br>— Real-time, Object-Relational, and Version-Aware SQL

**Welcome to the docs.** This page is the conceptual narrative of LinkedQL — the core thinking, the problem space it addresses, and the architectural model it introduces. It is not a setup guide. If you're here to get running, jump straight to the [Core Guides](/guides).

---

> [!IMPORTANT]
> LinkedQL is in active development. The core query model and interfaces are stabilizing and backed by 1,200+ tests. MySQL/MariaDB live query support is still in progress. Feedback, issues, and PRs are welcome — see [Contributing](https://github.com/linked-db/linked-ql#-contributing); see [Issues](https://github.com/linked-db/linked-ql/issues).

---

## What is LinkedQL?

LinkedQL is the real-time, object-relational, and version-aware SQL for applications and agents, enabling a new programming model: **database queries as automatic contracts**. LinkedQL extends the exisiting relational database model with:

+ live queries, streaming, and subscriptions
+ direct relationship traversal via an object-relational syntax
+ automatic schema versioning and version safety

→ All in just `~100 KiB` (min+zip)

It comes with a unified set of drivers that makes it work across PostgreSQL, and MySQL/MariaDB, and across runtimes and environments – server, browser, worker, edge.

Applications and agents get a universal database interface (`db.query()`) that works as a single replacement for the traditional database stack.

LinkedQL also ships with an embeddable, in-process database: [**FlashQL**](/flashql) — that lets you have the full LinkedQL contract locally. FlashQL extends LinkedQL with:

+ offline sync as an engine-level capability
+ data federation over disparate data sources

The entire model lets you build realtime, local-first, and offline-first applications without an extra dependency or secondary infrastructure.

## Why LinkedQL

There's a whole category of tooling, infrastructure, and manual effort dedicated to exposing and querying the database, and keeping runtime and lifecycle states in sync:

+ an ORM to query and model objects from relational data
+ an API server (REST/GRAPHQL) to expose data to application clients
+ a subscription server for real-time synchronization
+ a sync engine for offline synchronization
+ manual schema coordination to keep lifecycles converged as the application evolves

Each addresses what appears to be a distinct concern but reflects a structural gap in the original `db.query()` model: **no proper way to express that aspect of the application-database relationship**.

LinkedQL closes that gap at the query boundary by formalizing these concerns as part of the application-database relationship – expressed together, enforced automatically.

---

## Database Queries as Self-Enforcing Contracts

The core idea behind LinkedQL's extension to the relational database model is to formalize how application-level assumptions and expectations implied by a query are treated. Rather than left implicit, or constructed through extra tooling and secondary infrastructure, LinkedQL formalizes them at the query boundary.

Object-relational syntax, live queries and sync, and version safety are the core components of that model:

- with object-relational syntax, the query itself becomes a formal spec of the application's object model — eliminating the traditional post-processing step and the object-relational mapping (ORM) overhead 
- with live queries and sync, the query itself becomes the subscription, and the database itself becomes the sync engine — eliminating the traditional subscription server and dedicated sync engines
- with version safety, the query itself becomes the version control surface — eliminating the traditional manual schema coordination work and lifecycle drifts inherent to the relationship

The query becomes a complete specification of the application-database relationship — a self-enforcing contract.

<!--

Relationship traversal, live queries, and schema version safety are the formal spec of that relationship:

+ with an object-relational syntax, **the application object model is formalized at the query boundary** – rather than moved to a post-processing step: application-level data assembly lines, object-relational mapping (ORM)
+ with live queries, subscriptions, and sync, **state convergence is formalized at the query boundary** – rather than handled via secondary infrastructure: API servers, subscription services, dedicated sync engines
+ with version safety, **schema assumptions is formalized at the query boundary** – rather than handled via manual coordination, on a best-effort basis, or compensated through runtime failures

Applications simply *operate by contract* (formal spec) – and stay decoupled from implementation details.

LinkedQL makes the contract self-enforcing.

-->

**_Before_:**

```text
Application  ⇄  [ ORM                     ]  ⇄  Database
                [ Realtime Infrastructure ]
                [ Sync Infrastructure     ]
                [ Manual Lifecycle        ]
                  Coordination
```

**_After_:**

```text
Application  ⇄  [ db.query(sql)           ]  ⇄  Database
```

**_Example_:**

```js
const db = new PGClient();

// A live query – with relationship traversal
const result = await db.query(`
  SELECT {
    id,
    profile: { name, email },
    parent: parent_user ~> { name, email }
  } FROM users@3_2;`,

  { live: true }
);
```

---

## The Whole Model As a Universal Contract

LinkedQL works across dialects:

+ PostgreSQL, MySQL/MariaDB  

across environments:

+ server, browser, edge, worker – via EdgeClient

and ships with an embeddable local database:

+ FlashQL  

The same interface (`db.query()`) and capabilities apply whether the database is a local dependency or remote dependency, regardless of runtime environment or storage engine.

Applications simply commit to a standard contract that everything else sits behind.

**_Before_:**

```text
1. Server-Side Application  ⇄  [ ORM                     ]  ⇄  Database
                               [ Realtime Infrastructure ]
                               [ Sync Infrastructure     ]
                               [ Manual Lifecycle        ]
                                 Coordination
2. Client-Side Application  ⇄  [ API Server              ]  ⇄  Database
```

```text
3. Local-First Application  ⇄  [ db.query(sql)           ]  ⇄  Database
                                                        (Local SQLite, PGLite, etc.)
```

**_After_:**

```text
                                      [ 1. Native Connection + Database ]
Application  ⇄  [ db.query(sql) ]  ⇄  [ 2. Edge Protocol + Database     ]
                                      [ 3. Local Database (FlashQL)     ]
```

**_Example_:**

```js
// Server-side environment only
const db = new PGClient();    // or MySQLClient/MariaDBClient
// Any environment – runs anywhere: server, browser, worker, edge
const db = new FlashQL();     // Local database    
const db = new EdgeClient();  // Remote querying

// Consistent application logic
const result = await db.query(`
  SELECT { id, profile: { name, email } } FROM users;`,
  { live: true }
);
```

---

## Getting Started

With the conceptual model in context, the next step is getting started.

The [Core Guides](/guides) take you through from installation to running your first query.

## Your Map to the Docs

| Area               | What it covers                                                             | Go to...                                                                   |
| :----------------- | :------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Core Guides        | From basic setup to first queries, to more comprehensive guides            | [Core Guides](/guides)                                                     |
| Core API           | Core API contract — the interface and query model                          | [Core API](/api)                                                          |
| Language Surface   | The LinkedQL language surface (JSON Literals, DeepRefs, etc.)              | [Language Surface](/lang)                                                  |
| Realtime Capabilities | Live queries and subscription model                                     | [Realtime Capabilities](/realtime)                                         |
| FlashQL            | LinkedQL's embeddable SQL engine for local execution, federation, and sync | [FlashQL](/flashql)                                                        |
