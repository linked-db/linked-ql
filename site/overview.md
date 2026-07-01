# LinkedQL <br>— Universal Database Contract for Applications & Agents

**Welcome to the docs.** This page is the conceptual narrative of LinkedQL — the core thinking, the problem space it addresses, and the architectural model it introduces. It is not a setup guide. If you're here to get running, jump straight to the [Core Guides](/guides).

---

> [!IMPORTANT]
> LinkedQL is in active development. The core query model and interfaces are stabilizing and backed by 1,200+ tests. MySQL/MariaDB live query support is still in progress. Feedback, issues, and PRs are welcome — see [Contributing](https://github.com/linked-db/linked-ql#-contributing); see [Issues](https://github.com/linked-db/linked-ql/issues).

---

## What is LinkedQL?

LinkedQL is a query interface (`db.query()`) that gives applications a stable contract across runtimes and environments – server, browser, worker, edge – with the same idea:

+ live queries, lazy fetching, subscriptions, and sync
+ relationship traversal and object-relational syntax
+ automatic schema versioning and version safety
+ data federation over disparate data sources

→ All in just `~100 KiB` (min+zip)

Conceptually, these are not separate features – they are aspects of the same thing: the full application-database relationship, *formalized* at the query boundary.

The model is delivered as a universal database contract that works across database engines, runtime environments, and deployment architectures.

---

## Why LinkedQL

A database and an application are two divergent systems that share little in common.
Every application ends up building the same scaffolding around that relationship to make it work:

+ an ORM to model objects from relational data
+ a subscription server for real-time capabilities
+ a sync engine for offline-first capabilities
+ manual schema coordination to keep lifecycles converged as the application evolves

Each is incidental to the application itself, and exists because the original query model does not natively cover those concerns.

LinkedQL closes that gap at the query boundary by formalizing these concerns as part of the application-database relationship – expressed together, enforced automatically.

---

## The Application-Database Relationship – Formalized

Relationship traversal, live queries, and schema version safety are the formal spec of that relationship:

+ object-relational syntax: **the application object model formalized at the query boundary** – rather than moved to a post-processing step: application-level data assembly lines, object-relational mapping (ORM)
+ live queries, subscriptions, and sync: **state convergence formalized at the query boundary** – rather than handled via secondary infrastructure: API servers, subscription services, dedicated sync engines
+ version safety: **schema assumptions formalized at the query boundary** – rather than handled via manual coordination, on a best-effort basis, or compensated through runtime failures

Applications simply *operate by contract* (formal spec) – and stay decoupled from implementation details.

LinkedQL makes the contract self-enforcing.

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