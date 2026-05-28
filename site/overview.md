# LinkedQL <br>— Universal Database Contract for Applications and Agents

**Welcome to the docs.** This page is the conceptual narrative of LinkedQL — the core thinking, the problem space it addresses, and the architectural model it introduces. It is not a setup guide. If you're here to get running, jump straight to the [Core Guides](/guides).

---

> [!IMPORTANT]
> LinkedQL is in active development. The core query model and interfaces are stable and backed by 1,200+ tests. MySQL/MariaDB live query support is still in progress. Feedback, issues, and PRs are welcome — see [Contributing](https://github.com/linked-db/linked-ql#-contributing).

---

## What is LinkedQL?

LinkedQL is a new query primitive that lets developers express the application's logical, runtime, and lifecycle contract with the database directly within the query. It achieves this through a small set of additions to SQL — an object-relational syntax, live queries and sync capabilities, and an automatic versioning system.

While the traditional approach achieves this through an entire data stack and ongoing developer effort, LinkedQL composes these behaviours natively in SQL.

**Before:**

```text
Application  ⇄  [ ORM                     ]  ⇄  Database
                [ Realtime Infrastructure ]
                [ Sync Infrastructure     ]
                [ Manual Lifecycle        ]
                  Coordination
```

**After:**

```text
Application  ⇄  [ db.query(sql)           ]  ⇄  Database
```

### How It Works

1. **Automatic logical alignment via an object-relational syntax ([JSON Literals](/lang/json-literals), [DeepRefs](/lang/deeprefs)):** The structure that the application expects is expressed directly in the query — codifying the logical contract between storage and application. This eliminates the ORM and traditional data assembly line.

2. **Automatic runtime convergence via live queries and sync ([Live Queries](/realtime/live-queries), [Sync](/flashql/federation-and-sync)):** In just a mode switch: `{ live: true }`, the query itself becomes an automatic subscription for realtime applications. In just another mode switch, the database itself becomes the sync engine for offline-first applications. This eliminates the traditional state engineering exercise — Realtime infrastructure, Sync infrastructure.

3. **Automatic lifecycle convergence via semantic versioning ([Version Binding](/lang/version-binding)):** Schemas are automatically versioned as they evolve. Queries explicitly define their version assumptions. Both structures evolve in lockstep under a shared version model — instead of through manual coordination. This makes versioning a first-class property of the query itself.

### Result: _SQL as State Machine_

> A paradigm shift in how the application contract is expressed and enforced: from a choreography of tools, compensatory layers, and purpose-built infrastructure to a self-enforcing contract at the query boundary.

```js
const db = new PGClient(); // or: MySQLClient | FlashQL | EdgeClient

// A live query — structured output, relationship traversal, in plain SQL
const liveResult = await db.query(`
  SELECT {
    id,
    profile: { name, email },
    parent: parent_user ~> { name, email }
  } FROM users;`,

  { live: true }
);

// liveResult.rows updates automatically as the database changes —
// no realtime infrastructure, no separate subscription system
```

---

## Design & Architecture

LinkedQL is not a replacement for the database. It is _a programming contract for a database_ — PostgreSQL, MySQL/MariaDB. In this model, **developers use LinkedQL as a universal database contract across storage backends.**

### Runtime Extensions

Modern applications also increasingly need database capabilities in places where a traditional database server is impractical, unavailable, or simply the wrong abstraction. LinkedQL extends naturally into those environments through two built-in primitives:

- **A cross-runtime primitive: [the Edge Protocol](/guides/edge)**
- **A local primitive: [FlashQL](/flashql)**

Through these primitives, developers use LinkedQL as **a universal database contract across runtime boundaries — server, browser, worker, edge.**

**Before:**

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

**After:**

```text
                                      [ 1. Native Connection + Database ]
Application  ⇄  [ db.query(sql) ]  ⇄  [ 2. Edge Protocol + Database     ]
                                      [ 3. Local Database (FlashQL)     ]
```

### How It Works

| Primitive | Architectural Execution |
| --- | --- |
| **The Edge Protocol** | (Cross-Runtime Primitive) Exposes remote databases directly to application runtimes across network or worker boundaries — where the traditional approach keeps the database behind REST/GraphQL servers. By making the database directly queryable from anywhere, the Edge Protocol erases both the client/server boundary and the traditional SQL/API server split. _**[See the Edge Guide](/guides/edge)**_ |
| **FlashQL** | (Local SQL Engine) A purpose-built, embeddable, lightweight local database engine that implements the full LinkedQL contract. FlashQL works anywhere JavaScript does — server, browser, worker, edge. This removes the network dependency for local-first and offline-first applications. _**[Meet FlashQL](/flashql)**_ |

### Result: _A Universal Database Contract_

> In addition to changing _how the application contract is expressed and enforced_ — from manual to automatic — LinkedQL also changes _how the application deals with the various database engineering details_ — engine, dialect, topology — from implementation-specific coupling to a universal contract that everything else sits behind, while the application maintains consistent logic.

```js
// The same interface — across backends and evironments
const db = new PGClient();     // PostgreSQL        – runs on the server
const db = new MySQLClient();  // MySQL / MariaDB   – runs on the server
const db = new FlashQL();      // Local database    – runs anywhere: server, browser, worker, edge
const db = new EdgeClient();   // Remote querying   – runs anywhere: server, browser, worker, edge

// Consistent application logic
const result = await db.query(`
  SELECT { id, profile: { name, email } } FROM users;`,
  { live: true }
);
```

Combined, applications get a universal, self-governed database contract that automatically resolves all the moving parts — from logical, runtime, and lifecycle convergence, to engine, dialect, and topology details.

---

## Scenarios

**Scenario 1: _Edge Protocol Standardizing Data APIs on SQL._** A team running a Node.js backend exposes a GraphQL API to their frontend. Every new feature request triggers a backend change: new resolvers, schema updates, redeployments. The frontend team is bottlenecked on the backend team's capacity. After adopting LinkedQL, the frontend queries the database directly through the Edge Protocol using plain SQL — with live updates replacing their Apollo subscription setup. The GraphQL layer is retired. The backend team stops being a bottleneck. The frontend team has full querying power at the same `db.query()` interface — with live queries, sync, and version safety included.

**Scenario 2: _FlashQL as State Machine for Agents._** An AI agent framework needs structured, persistent, and synchronizable memory across sessions. The agent uses FlashQL as its local state store — writing context in plain SQL, subscribing live to changes in its working memory as its reasoning evolves, and syncing state deterministically to a cloud Postgres instance between runs. When a reasoning step produces state that needs to be undone, the agent issues a rollback. FlashQL converges local and remote state without orchestration code. The agent's entire state lifecycle — read, write, subscribe, sync, rollback — is a single SQL interface. No vector database, no separate memory middleware, no custom sync logic.

---

## Why LinkedQL

Multiple shifts are setting a new standard for modern applications and widening the gap between application requirements and traditional database assumptions:

| Shift | Effect |
| :--- | ---: |
| Compensatory infrastructure layers around databases are continuing to accumulate | Engineering overhead reaching a visible ceiling |
| Applications now span realtime, offline-first, and distributed runtimes by default | Coordination complexity compounding beyond what point solutions handle cleanly |
| AI agents require persistent, structured, versionable state to operate reliably | A new infrastructure category forming with no established standard |

This future has arrived inheriting old foundations. LinkedQL's timing reflects a moment where the new requirements are failing so visibly on old foundations that the question is no longer whether the layer changes — it's what replaces it.

### The Failure Modes

A database and an application are two divergent systems that share little in common. Every integration, across every team, forces a relationship that suffers the same failure modes: **logical misalignment**, **runtime divergence**, and **lifecycle drift**.

How the contract barely holds across all of the moving parts remains largely a developer's effort — a choreography of tools, compensatory layers, and purpose-built infrastructure.

### Failure Mode 01: Logical Misalignment

The storage layer and application layer represent things in fundamentally different ways. Developers compensate through object-relational mapping, post-processing pipelines, and multiple query roundtrips to reshape relational data into application structures.

> **Compensation Cost:** A data assembly line for every fetch operation.

### Failure Mode 02: Runtime Divergence

Data evolves at runtime. Applications must reflect that in realtime or drift out of sync with reality. Developers compensate by building subscription systems around the database to drive application state. For offline-first applications, the problem compounds — those additionally require dedicated sync engines to handle asynchronous writes and eventual convergence.

> **Compensation Cost:** Complex state engineering for realtime and offline-first applications.

### Failure Mode 03: Lifecycle Drift

Schema and code are never truly finished. The two also don't evolve together. Developers have to stay ahead of the drift, or production breaks. With no shared contract or intelligence layer between the two moving targets, developers compensate through manual coordination as the application evolves.

> **Compensation Cost:** Manual coordination work — on a best-effort basis.

### Impact

This is a fundamental inefficiency in how software is built, costing teams everywhere lost productivity, architectural and operational overheads, and significant recurring spend.

But this is not a bug in any specific tool. It is the predictable, systemic outcome of running two completely divergent systems without a shared contract.

**Building from where the problem space converges is the LinkedQL core differentiator.**

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