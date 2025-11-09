⚙️ | LinkedQL Engineering

# The Realtime Engine

<div style="display:flex; justify-content:start; align-items:center; gap:0.75em; padding-top:1.5rem; padding-bottom:1rem;">
  <a href="https://github.com/ox-harris" target="_blank"><img src="https://avatars.githubusercontent.com/u/13555392?v=4" width="32" height="32" alt="Oxford Harrison" style="border-radius:50%;" /></a>
  <b>Oxford Harrison</b> — <span>November 2025</span>
</div>

---

The Realtime Engine is the core of LinkedQL’s [realtime query](/docs/capabilities/realtime-sql) system. It lies between the storage layer and the application layer, transforming storage-level mutations — from WAL, binlog, or in-memory emitters — into logical events that materialize as live state, extending SQL’s reach from static queries to fully “live” queries.

Unlike replica-based architectures that operate only against local databases or materialized stores, the engine is designed to operate seamlessly across storage backends — from local databases to traditional databases such as PostgreSQL and MySQL — allowing both to participate equally in the "realtime" world. LinkedQL thus brings reactivity into the realms of traditional SQL databases, erasing the local/remote distinction and making live queries a universal concept across storage backends.

This paper describes the engineering behind this design — from change detection and normalization to live, observable objects that self-update in realtime.

---

**Table of Contents**

[[toc]]

## _Part I · Query Inheritance and Execution Strategies_

---

### Introduction

A fundamental inefficiency in reactive data systems is duplication of work across overlapping subscriptions. Traditional realtime architectures fulfill each subscription in isolation — maintaining its own feed, evaluating its own filters, and reconstructing the same result sets as its peers. The model is conceptually simple but operationally costly. Even a small variation in a subscription — such as an added predicate or ordering clause — can trigger an entirely new reactive process.

This becomes an especially critical concern for LinkedQL's design goals: to solve reactivity in SQL at the SQL level — Postgres, MySQL/MariaDB — rather than *just* at the client/local level (as with, e.g., PGLite). The server-first realm presents compute, latency and network costs challenges because the system will often need to re-issue subscribed queries in response to upstream DB changes. The cost of the traditional approach grows quickly as may be seen in two ways.

#### Linear Fan-Out (The Common Case)

Let:

* $S$ = number of active subscriptions (distinct live queries),
* $C_q$ = average CPU cost to the server to re-execute one subscribed query,
* $R$ = average network cost (bytes or roundtrip time) to deliver one query result to a client,
* $E$ = number of upstream DB change events in a time window.

If a single upstream event causes every subscription to re-evaluate once, the total work for one event is

$$
W_{\text{linear}} \;=\; S \times C_q
$$

and the total network cost is

$$
N_{\text{linear}} \;=\; S \times R.
$$

For concrete numbers (step-by-step arithmetic):

* Suppose $S = 1{,}000$ subscriptions.
* Suppose each request cost $C_q = 10$ ms of CPU work.
* Suppose $R = 50$ ms of network/latency-equivalent cost.

Then for a single DB event:

* $W_{\text{linear}} = 1{,}000 \times 10\ \text{ms} = 10{,}000\ \text{ms}$ of CPU time total (10 seconds).
* $N_{\text{linear}} = 1{,}000 \times 50\ \text{ms} = 50{,}000\ \text{ms}$ of accumulated network latency-equivalent (50 seconds).

So one small upstream change can produce the equivalent of 10s of server CPU and 50s of aggregated network cost across clients — which, in practice, means high load and congestion.

#### Cascading / Combinatorial Blow-Up (Worst-Case)

If subscriptions can trigger downstream writes that themselves produce more DB events, or if subscriptions are interdependent, the fan-out can grow exponentially.

Let:

* $b$ = branching factor (average number of new DB events caused by handling a single event),
* $d$ = depth (number of propagation rounds you consider).

Number of events after $d$ rounds:

$$
E_{\text{total}}(d) \;=\; \sum_{i=0}^{d} b^i \;=\; \frac{b^{d+1}-1}{b-1}\quad\text{(for }b\neq1\text{)}.
$$

Total query executions across all rounds (each event re-triggers all $S$ subscriptions):

$$
W_{\text{cascade}} \;=\; S \times C_q \times E_{\text{total}}(d).
$$

Concrete example:

* $S = 1{,}000$,
* $C_q = 10$ ms,
* $b = 3$ (each handling step creates three further DB events on average),
* $d = 3$ rounds.

Step-by-step:

1. $b^{d+1} = 3^{4} = 81.$
2. $E_{\text{total}}(3) = (81 - 1) / (3 - 1) = 80 / 2 = 40$ total events.
3. $W_{\text{cascade}} = 1{,}000 \times 10\ \text{ms} \times 40 = 400{,}000\ \text{ms}$ total CPU-equivalent (400 seconds).

So a modest branching factor of 3 over 3 rounds produces 40 events; with 1,000 subscriptions that’s 400 seconds of server CPU-equivalent work — a catastrophic load.

---

### The LinkedQL Model

The scaling failures outlined above are not quirks of implementation; they stem from a deeper property of reactive computation. Whenever two observers independently compute overlapping functions of the same source, their work diverges exponentially with the number of shared dependencies. 

To mitigate this, the LinkedQL Realtime engine introduces a different approach: **query inheritance**.

Queries that share the same logical base — their *FROM* graph and join conditions — are organized into a hierarchy where broader queries become **canonical windows** and narrower, more constrained queries become **subwindows**; the engine establishes a parent-child relationship between them. For instance:

```sql
q1 = SELECT t1.a, t2.b
     FROM t1 LEFT JOIN t2 ON t1.rel = t2.id
     WHERE t1.b IS NOT NULL AND (t2.a <> 0)
     ORDER BY t1.c DESC;

q2 = SELECT t2.a, t1.b, t2.c
     FROM t1 LEFT JOIN t2 ON t1.rel = t2.id
     WHERE t1.b IS NOT NULL AND t1.id = 2 AND 0 != t2.a
     ORDER BY t1.d ASC;
```

Here, `q2` inherits from `q1`. The engine detects that the `FROM` items are identical and that clause semantics are compatible. It recognizes that `t1.id = 2` is an extension of `q1`'s `WHERE` clause: `t1.b IS NOT NULL AND t2.a <> 0`, treating `q2` as a **narrower frame** of `q1`. No redundant query is sent to the database; the child window filters from the parent’s output.

Notice that this holds even with varying select lists and `ORDER BY` clauses; details just ahead.

This model scales from trivial one-table lookups to deeply nested aggregations while keeping computation proportional to the complexity of the query, not the number of concurrent listeners.


#### Cost Profile

The result of an inheritance model is a reduced number of independent subscriptions that ever exists under equivalent workloads. With inheritance:

+ Bandwidth drops: one change event fan-outs to many dependent windows locally.
+ Latency drops: every subwindow applies updates immediately without new roundtrips.
+ Computation is shared: sorting, grouping, and filtering can be reused across queries.

Let:

* $r$ = fraction of subscriptions that can be **served from shared parent windows** $0 ≤ (r) ≤ 1$.
* Effective independent subscriptions $S_{\text{eff}} = S \times (1 - r)$.

Plugging into the linear model:

$$
W_{\text{linear, reused}} = S_{\text{eff}} \times C_q = S \times (1-r) \times C_q.
$$

Concrete savings example:

* $S = 1{,}000$, $C_q = 10$ ms.
* If $r = 0.8$ (80% of subscriptions are subwindows that inherit), then:

  * $S_{\text{eff}} = 1{,}000 \times 0.2 = 200$.
  * $W_{\text{linear, reused}} = 200 \times 10\ \text{ms} = 2{,}000\ \text{ms}$ (2 seconds) instead of 10 seconds — a 5× reduction.

If inheritance also reduces the branching factor $b$ in cascades (because shared computation closes loops), the exponential/cascading costs collapse even faster.

For LinkedQL’s goal — SQL-level reactivity over Postgres/MySQL — inheritance is not a micro-optimization: it’s the primary mechanism that makes reactivity over the classic client-server model tractable at scale.

---

### Query Windows and Canonical Frames

Every live `SELECT` statement forms a **query window**, representing a continuously maintained view of a query. A canonical or *least-constrained* window is one whose frame, filter, and ordinality clauses are least constraining relative to other windows.

The following query, for example:

```sql
SELECT name FROM users;
```

operates as a superset of the following:

```sql
SELECT * FROM users WHERE active;
SELECT * FROM users WHERE active AND country='US';
SELECT id, name FROM users WHERE active AND country='US' ORDER BY created_at DESC;
```

```sql{4}
┌──────────────────────────────────────────────────────────────┐
│                    Query Inheritance Tree                    │
├──────────────────────────────────────────────────────────────┤
│  Canonical_Window: SELECT ... FROM users                     │
│  ├─ Subwindow_1: WHERE active                                │
│  │  ├─ Subwindow_1.1: AND country='US'                       │
│  │  │  └─ Subwindow_1.1.1: SELECT id, name ...               │
│  │  │                      ... ORDER BY created_at           │
│  │  │                                                        │
│  │  └─ Subwindow_1.2: AND role='admin'                       │
│  └─ Subwindow_n: WHERE created_at > '2024-01-01'             │
└──────────────────────────────────────────────────────────────┘
```

Each subwindow inherits its data stream from its parent window and locally applies any extra filtering, projection, ordering, or slicing.

---

### Detecting Inheritance

When a new query is issued, the engine analyzes its structure against semantically matching windows — depth-first. The function `intersectQueries(parent, child)` evaluates whether one can be derived from the other.

This comparison is clause-by-clause; typically:

| Clause             | Inheritance Rule                         | Meaning                                                                     |
| ------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| **FROM / JOIN**    | Must match exactly                       | Same tables and join graph.                                                 |
| **WHERE**          | Child must be equal or stricter          | All parent filters must hold; child may add more.                           |
| **ORDER BY**       | Child may reorder locally unless limited | Order equivalence is relaxed if no limit/offset.                            |
| **LIMIT / OFFSET** | Child must fit inside parent’s range     | `LIMIT 10` inherits from `LIMIT 20`; `OFFSET 10` inherits from `OFFSET 5`.  |
| **Projection**     | Flexible (non-SSR) or strict (SSR)       | Child may use subset of columns unless server-side rendering (SSR) applies. |

If these conditions hold, inheritance happens; a mapping is created describing how to construct the child’s frame from its parent’s: which rows to filter, which columns to project, and what slice of ordering to apply. Otherwise, inheritance is abandoned for the given pair of windows. The child becomes its own canonical window.

#### Clause-by-Clause Reasoning

#####  FROM / Join Graph

Inheritance is abandoned if the tables or join conditions differ.

`FROM users` ≠ `FROM users JOIN orders`.

Identical join graphs are the prerequisite for everything else.

#####  WHERE Clause (Subsets)

If child filters match or child adds additional conditions, it inherits:

```sql{2}
-- Parent
SELECT id, name FROM users WHERE active;

-- Child
SELECT id, name FROM users WHERE active AND country='US';
```

Analysis: both conditions share `active`; the child introduces `country='US'`.

The engine recognizes that as a subset and applies it locally.

#####  Projection List

In **non-SSR mode** (detailed just ahead), child window can see, not just the select projection of parent, but the underlying column list from each source table in parent window, so subwindows can render any subset of those columns.

```sql{2}
-- Parent
SELECT u.id, o.status FROM users u JOIN orders o ON u.id=o.user_id;
-- Child
SELECT u.id, u.name, o.amount FROM users u JOIN orders o ON u.id=o.user_id;
```

Inheritance: yes. Child can efficiently render its select list: `u.id`, `u.name`, `o.amount` locally, from parent window.

In **SSR mode** (detailed just ahead, too), the DB server is relied on by the system to compute the final row shape for canonical windows.
The child, this time, sees only the actual projection of parent window; thus, can inherit only if its select items map directly to the parent’s—because only those fields exist in the records inherited from parent.

#####  ORDER BY and Ordinality

Non-SSR mode is permissive: the child may order differently.

```sql{2}
-- Parent
SELECT * FROM users ORDER BY created_at DESC;
-- Child
SELECT * FROM users ORDER BY amount ASC;
```

Inheritance: yes. Child can efficiently flip/order inheritted records at its level.

However, once `LIMIT` or `OFFSET` come into the equation, inheritance rules become stricter:
order direction and keys must match exactly.

#####  LIMIT and OFFSET

If the child’s `LIMIT`/`OFFSET` frame is fully contained inside the parent’s, inheritance holds.

```sql{2}
-- Parent
SELECT * FROM users ORDER BY id LIMIT 100 OFFSET 0;
-- Child
SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 10;
```

Inheritance: yes. Child can efficiently perform a simple slice of parent’s ordered result.

#####  GROUP BY, Aggregates, Window Functions, Subqueries

These components make inline evaluation impossible.
The engine switches to **SSR mode**, meaning the database is relied on to compute the final result shape, but is instructed to attach each row’s identity key (and possibly ordinality).

Inheritance still works, but only when:

* the parent’s projection already includes the same aggregate expressions as child's,
* the child’s filters are identical (with no extension),
* ordering matches exactly.

Otherwise inheritance is abandoned for given window pair.

Example (inheritance):

```sql{2}
-- Parent (SSR)
SELECT user_id, COUNT(*) AS count FROM orders GROUP BY user_id;

-- Child
SELECT COUNT(*) AS total FROM orders GROUP BY user_id;
```

Child gets its `COUNT(*)` from parent, regardless of aliases being different.

Example (no inheritance):

```sql{2}
-- Parent
SELECT user_id, COUNT(*) AS total FROM orders GROUP BY user_id;
-- Child
SELECT user_id, MAX(amount) AS max FROM orders GROUP BY user_id;
```

Different aggregate → new canonical window.

---

### Expression Canonicalization

To detect semantically identical queries even when written differently, the engine smartly applies canonicalization when comparing expressions. This happens in a `matchExpr` function, which:

* sees `A AND B` the same as `B AND A`;
* sees `!=` and `<>` as same;
* sees `a > b` and `b < a` as same;
* sees `id IS NOT NULL AND id <> 0` and `0 != id AND id IS NOT NULL` as same.

Thus:

```sql
WHERE id IS NOT NULL AND 0 != id
```

is correctly understood as a match for:

```sql
WHERE (id <> 0) AND id IS NOT NULL
```

The result is an inheritance system that is resilient to minor syntactic differences.

---

### Strategy Selection

Each query window creates a **strategy** based on the complexity of its query.
Strategies determine how the engine maintains the window in realtime — as to whether it recomputes locally, requeries origin DB only partially, or defer to origin DB in full.

| Strategy      | Description                                      | Suitable For                                      | Cost Profile          |
| ------------- | ------------------------------------------------ | ------------------------------------------------- | --------------------- |
| **Local**     | Evaluate entirely in memory from received events. | Simple one-table queries without aggregates.      | Near-zero.            |
| **Selective** | Re-query only affected keys on change.           | Multi-table joins and filters.                    | Small roundtrips.     |
| **Wholistic** | Recompute full result to ensure correctness.     | Aggregations, offsets, or uncertain dependencies. | Moderate.             |
| **SSR**       | Let the DB compute and return evaluated results. | Aggregates, window functions, subqueries.         | Highest, but precise. |

These strategies form a continuum between efficiency and precision.
The planner chooses the lightest viable strategy during query analysis, then escalates dynamically if runtime complexity increases (for example, when a query adds a window function).


```html
┌─────────────────────────────────────────────────────────────┐
│                Strategy Selection Flow                      │
├─────────────────────────────────────────────────────────────┤
│  Query Analysis                                             │
│  ├─ Has Aggregates/Window Functions? → SSR Mode             │
│  ├─ Multi-table Joins? → Selective Strategy                 │
│  ├─ Complex WHERE/ORDER BY? → Wholistic Strategy            │
│  └─ Simple Single Table? → Local Computation                │
│                                                             │
│  Runtime Escalation                                         │
│  ├─ Query Complexity Increases → Upgrade Strategy           │
│  └─ Performance Degrades → Fallback to Higher Strategy      │
└─────────────────────────────────────────────────────────────┘
```

---

### SSR Mode and Inline Evaluation

A window enters **SSR mode** (Server-Side Re-evaluation) when query contains expressions that cannot be evaluated inline — such as aggregates, grouping, window functions, or subselects within the projection or ordering clauses.
In this mode, the DB server is tasked to perform the full evaluation, returning rows with an internal key and ordinality so that client-side ordering and diffing remain possible.

Inheritance under SSR mode is more restrictive:

* Projection mappings must align exactly.
* WHERE clauses must be identical (and no extension).
* ORDER BY keys must match; directions may differ when no `LIMIT`/`OFFSET` is present.

This ensures deterministic recomputation and allows consistent incremental updates even when complex SQL constructs are involved.

---

### Retrospective Inheritance

Inheritance is **retroactive**.
The order of query creation does not matter. That is, inheritance works no matter which query arrives first.

If a narrower query is created before a broader one, the runtime knows to promote the broader query to canonical status and reattach the narrower one beneath it.

Example:

```js
First:  SELECT * FROM users WHERE id > 10 AND country='US';
Later:  SELECT * FROM users WHERE id > 10; // [!code ++]
```

The latter becomes canonical once it arrives; promoted to parent window status. The earlier query becomes a subwindow automatically.

```html
┌────────────────────────────────────────┐
│  Canonical_Window: WHERE id > 10       │
│  └─ Subwindow: AND country='US'        │
└────────────────────────────────────────┘
```

This happens as a "hot" swap of dependency, preserving continuity of data flow. No recomputation or replay of historical events is required; subwindows simply inherit the parent’s state and continue streaming updates.

This retroactive parenting means the system always converges toward minimal redundant work in whatever order queries arrive. In a live environment with hundreds of concurrent listeners, it means the query graph continuously **self-optimizes** as users explore overlapping data views.

---

### Efficiency and Granularity

Inheritance minimizes redundant computation at both server and client levels:

* The database emits a single mutation event per table change.
* The canonical window applies it once, diffing or resorting as needed.
* All subwindows reuse that updated state and emit fine-grained patches downstream.

```html
┌─────────────────────────────────────────────────────────────┐
│              Event Propagation Flow                         │
├─────────────────────────────────────────────────────────────┤
│  Database Change Event                                      │
│  ├─ Canonical Window Processing                             │
│  │  ├─ Apply Change to Base Data                            │
│  │  ├─ Compute Diffing/Reordering/Slicing                   │
│  │  └─ Emit to Subwindows                                   │
│  └─ Subwindow Processing                                    │
│      ├─ Apply Own Extra Filters/Ordering/Slicing            │
│      └─ Emit to Own Subwindows (Recursive)                  │
└─────────────────────────────────────────────────────────────┘
```

Client applications typically receive **row-level diffs**, **ordering swaps**, or even **column-level patches** — the barest minimum work needed to present the query result.

The result is *fine-grained reactivity* that begins at the database and propagates through intermediate engine layers to the final consumption/presentation point — typically the UI — without redundant computation.

---

###0 Scaling Behavior

The profound advantage of the query inheritance model is that computational cost scales *only* with **query diversity**, rather than linearly with subscription count.

Here, the maximum number of active canonical windows in an application’s lifetime is **deterministic** and **fixed** at any scale — equal to the total number of unique canonical queries across the application.

This model resolves the cost paradox that has long made SQL-level reactivity over the traditional client–server query model intractable.

An internal query planner also means that at the window level, cost remains proportional to query complexity. Simple windows remain cheap, while complex windows pay cost proportional to their structural complexity (joins, aggregates, and total row volume).

| Query Type              | Strategy        | Roundtrip Cost  | CPU Cost       | Accuracy |
| ----------------------- | --------------- | --------------- | -------------- | -------- |
| Simple one-table filter | local           | 0               | $O(events)$      | exact    |
| Simple join             | selective       | $O(changed keys)$ | $O(rows)$        | exact    |
| Aggregate / window      | wholistic + ssr | $O(result rows)$  | $O(rows × expr)$ | exact    |
| Subselect projection    | ssr             | $O(result rows)$  | $O(expr)$        | exact    |

The result is: you don't pay for features you don't use.

---

###1 Key Takeaways

Rather than isolating each query as an independent subscription, LinkedQL's Realtime engine organizes them into a hierarchy of shared computation.

Canonical windows hold the broadest state, while subwindows refine it locally.
Combined with the strategy system — local, selective, wholistic, and SSR — this model yields a continuum of precision and efficiency that mirrors SQL’s own expressive depth.

The result is a system that behaves like SQL itself but reactive — notably fine-grained, logically consistent, and cost-proportional — without any intermediary servers, GraphQL layers, or local database replicas.

---

Now, while query inheritance solves *how* concurrent observers share computation, the next question is *how* they share **causality** — the propagation of change itself.

Part II turns to the kinetics of reactivity: the motion of events, the preservation of transactional identity, and the semantics of continuity across joins and projections.  

---

## _Part II · The Event Pipeline_

---

### _Section A · Formal Semantics — From Storage to Events_

This section defines the invariants that make realtime SQL reliable. We formalize how physical mutations from the storage engine become logical changes in query space — preserving transactional boundaries, identity, and order. These guarantees are the bedrock on which downstream processing (Section B) builds.

Each mutation begins as a physical change in a storage engine and travels—without loss of transactional identity—through the realtime runtime, through query windows, into observers and synchronizers, and finally into UI or replication systems.
This section formalizes that movement.

---

### Transactional Continuity

Let a database transaction $T$ yield a set of low-level mutation events

$$
T = \\{ e_1, e_2, …, e_n \\}
$$

as extracted from a write-ahead log or binlog feed.
The realtime engine guarantees that every layer $S_i$ of the pipeline (driver → window → subwindow → consumer) preserves the *atomic boundary* of $T$:

$$
S_i(T) = \\{ d_1, d_2, …, d_m \\},\quad
S_i \text{ does not fragment } T.
$$

No downstream stage may emit partial visibility of a transaction.

---

### Level-1 Event Shape

The driver (PostgreSQL WAL, MySQL binlog, or in-memory emitter) produces structured event batches of the form:

```js
[{
  txId, // unique transaction identifier
  relation: { schema, table, keyColumns },
  type: 'insert' | 'update' | 'delete',
  key, // optionally available
  old, new  // physical row tuples
}]
```

Batches are delivered to the engine per `txId`.
This is the raw input consumed by `QueryWindow.#handleEvents()`.

---

### Event Normalization and Row Tracking

A `#normalizeEvents()` method is the engine’s next act of interpretation.
It condenses a batch of raw DB events into a *minimal, internally consistent* sequence of logical row changes while keeping transactional grouping intact.

#### Tracking Hashes

Each physical row version is annotated with a *tracking hash*:

$$
h_{\text{track}} = f_{\text{track}}(\text{relation},\text{key})
$$

This hash is ephemeral; it lives only inside `#normalizeEvents()`.
Its role is to correlate multiple low-level events that refer to the same underlying database row—even when key columns themselves mutate between updates.

Tracking hashes allow the engine to recognize continuity across changing primary-key values or across cascaded updates within a single transaction.

#### Merge Heuristics

Normalization applies a fixed rule set that merges redundant sequences while preserving order:

| Sequence                                    | Action                 | Result        |
| ------------------------------------------- | ---------------------- | ------------- |
| insert → update                             | coalesce               | single update |
| insert → delete                             | cancel                 | drop both     |
| update → update                             | coalesce (latest wins) | single update |
| update → delete                             | coalesce               | delete        |
| delete → insert (same row by tracking hash) | coalesce               | update        |

Even when a row’s physical key changes between updates, continuity via $h_{\text{track}}$ causes the system to coalesce rather than emit disjoint events.
Thus a flurry of internal row rewrites appears downstream as one clean, semantic `update`.

---

### Logical Diff Construction

The next phase constructs *logical diffs*: mutations expressed in the vocabulary of the query window.

The engine computes a **logical hash** for each projected row:

$$
h_{\text{logic}} = f_{\text{logic}}(\text{projectionKey(row)})
$$

This hash is stable for the lifetime of the window.
It defines *semantic identity*—the notion of “the same record” as seen by the query.

Mapping flow:

$$
\mathrm{row_{physical}}
\xrightarrow{f_{track}} h_{track}
\xrightarrow{projection} \mathrm{row_{logical}}
\xrightarrow{f_{logic}} h_{logic}
$$

The transformation occurs in the diff-generation routines:
`#diffWithLocal()` for locally evaluable clauses,
`#diffWithOrigin_Selective()` for selective re-queries,
and `#diffWithOrigin_Wholistic()` for complete re-queries.

---

### Join-Key Transition Semantics

Joined queries complicate identity because the join output’s cardinality can change even when base tables remain partially constant.
A left-side row that once produced no joined result may later produce one, or the reverse becomes the case.

Without correction, such transitions would appear as a `delete` + `insert` pair, causing downstream consumers or UIs to see a record vanish and re-appear.
The engine instead performs **join-key transition analysis** inside its normalization-to-diff bridge.

For each left-hand key $k_L$:

| Previous join output | Current join output | Emitted event | Semantic meaning             |
| -------------------- | ------------------- | ------------- | ---------------------------- |
| `[L, null]`          | `[L, R]`            | `update`      | join materialized            |
| `[L, R]`             | `[L, null]`         | `update`      | join dissolved               |
| `[L, R₁]`            | `[L, R₂]`           | `update`      | join target changed          |
| `[L, null]`          | —                   | `delete`      | left row removed             |
| —                    | `[L, null]`         | `insert`      | left row added without match |

Formally, a transition function

$$
τ(s_{\text{old}}, s_{\text{new}}) → e,
\quad e ∈ \\{\text{insert}, \text{update}, \text{delete}\\}
$$

maps pairs of join states $s = (L,R)$ to the minimal event preserving semantic continuity.
This mechanism is what allows a UI or replica to treat a changing join as a smooth in-place update rather than a flicker of destruction and creation.

---

### Transaction-Through Invariant

Once logical diffs are built, the engine enforces a strict *transaction-through* rule:

Every resulting batch $D_T = \\{ d_1,…,d_m \\}$ remains atomic across propagation.

$$
∀L_i ∈ \text{pipeline},\;
L_i(D_T) = D_T' ,\quad
|D_T'| = |D_T|,\;
\text{order}(D_T') = \text{order}(D_T)
$$

No fragmentation, no interleaving between transactions.

---

### Formal Properties Summary

| Property                  | Guarantee                                                | Enforcement Site                                             |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **Transaction atomicity** | all diffs from one DB transaction propagate as one batch | `QueryWindow.#normalizeEvents()` → `RealtimeClient` emission |
| **Row tracking**          | continuity preserved across key mutations                | `#normalizeEvents()` via $h_{\text{track}}$                           |
| **Logical identity**      | stable semantic record identity                          | diff construction (`#diffWith*`)                             |
| **Join transition**       | in-place updates for join cardinality shifts             | normalization–diff bridge                                    |
| **Order preservation**    | transactional ordering retained end-to-end               | batch queue scheduler                                        |

These formal guarantees lay the foundation for robust downstream processing, shaping how subsequent layers handle and propagate change.

These invariants complete the engine’s contract at the event level. What follows traces how these atomic changes become live, convergent state.

---

### _Section B · Downstream Processing — From Events to State_

This section explains how upstream guarantees (atomicity, identity, and order) materialize as concrete emissions and state evolution at the edges — subscriptions, live objects, observers, and UI/state stores. We begin with the event vocabulary, then build up to object-first consumption, and finally formalize convergence.

```js
┌─────────────────────────────────────────────────────────────┐
│                   Realtime Event Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│  DB WAL/Binlog  →  Driver  →  QueryWindow  →  Emissions     │
│                                   │             │           │
│                                   │             ├─ result   │
│                                   │             ├─ diff     │
│                                   │             └─ swap     │
│                                   ▼                         │
│                             RealtimeResult (rows)           │
│                                   │                         │
│                         Observer.observe(rows, …)           │
└─────────────────────────────────────────────────────────────┘
```

---

### Subscription Interfaces and Mutation Handling

At the outer edge of the realtime runtime, change is communicated as a sequence of discrete **event emissions**. Each emission corresponds to a single stage in a query’s evolution — sometimes a full result, sometimes a diff, sometimes a reorder — but always a coherent statement of truth.

These emissions are shaped by the upstream guarantees of:

- atomicity — what the engine receives as an atomic DB transaction is processed and delivered atomically;
- identity — stable hashes universally identify records across updates;
- order — events are delivered in the order they were received.

---

#### Event Vocabulary and the Logic of Identity

Every emission falls into one of three event types:

| Event | Shape | Meaning |
|-------|-------|---------|
| `result` | `{ rows, hashes }` | A full materialization update carrying the current canonical state of the query. |
| `diff` | `[{ type, old?, new?, oldHash?, newHash? }]` | Inserts, updates, and deletions carrying incremental state change. |
| `swap` | `[[hashA, hashB], …]` | Positional update carrying explicit key-swap pairs. |

Each record in an emission carries a **logical hash** $h$ that expresses semantic identity:

$$
h = f_{\mathrm{logic}}(\mathrm{projectionKey(row)})
$$

These hashes remain stable across updates, anchoring diffs and swaps so that consumers can update state incrementally without re-materializing the whole result.

```html
┌──────────────┐     diff      ┌───────────────────────────┐
│  Emissions   │ ───────────▶  │  { type, oldHash, new… }  │
└──────────────┘               └─────────────┬─────────────┘
                                        apply│by hash
                                             ▼
                                   ┌─────────────────┐
                                   │  Local State    │
                                   └─────────────────┘
```

---

#### The Callback Model

LinkedQL clients offer a **callback model** for live queries, delivering emissions directly to your handler. When a query is issued with `{ live: true }`, the client invokes the callback for each event type (`result`, `diff`, `swap`) as changes occur.

Example:
```js
client.query(query, { live: true }, (eventName, eventData) => {
    if (eventName === 'diff') for (const e of eventData) apply(e);
});
```

This interface is consistent across LinkedQL drivers and enables fine-grained, atomic state updates with minimal ceremony.

---

#### Live Objects

Live queries are also delivered as a "live", self-updating array — `result.rows` — that preserves transactional semantics and identity guarantees while remaining a plain, iterable data structure. This section specifies its behavior and interaction with the event vocabulary.

```js
const result = await client.query(query, { live: true });
```

Here, `RealtimeResult` self-binds to the event vocabulary (`result`, `diff`, `swap`) and mutates internal state as events stream in.

| Event    | Internal effect in `RealtimeResult` |
| -------- | ----------------------------------- |
| `result` | Replace the entire canonical state. |
| `diff`   | Apply inserts/updates/deletes by logical hash. |
| `swap`   | Incrementally reorder by swapping hashed keys. |

All mutations occur inside `Observer.batch` by which the atomicity of received events is preserved. Observers never see half-applied state.

The result is an ordinary, iterable array that quietly stays in sync with the database over time.

Key properties:

- Atomic: updates apply as indivisible batches (reflecting DB transactions).
- Addressable: diffs are anchored by stable logical hashes, enabling in-place updates.
- Observable: mutations are visible through a standard observation protocol.
- Portable: the same object can cross process and network boundaries intact.

```js
┌──────────────────────────────┐
│ RealtimeResult (live object) │
├───────────────┬──────────────┤
│ rows: []      │ hashes: []   │
└───────────────┴──────────────┘
        ▲             ▲
        │ batches     │ identities
        │             │
Events ─┴─────────────┴─▶ _apply(result|diff|swap)
```

```
Events → RealtimeResult._apply(...) → result.rows (observable)
```

For a quick note on terminology: “event”, as used here, denotes the runtime concept; “message” denotes a transport vehicle (e.g., over a wire).


---

#### Observability and Its Universal Protocol

The observability of `result.rows` is based on the *Observer* protocol. The [Observer API](https://github.com/webqit/observer) is the minimal, language-wide protocol for observing object/array mutations as first-class data. `result.rows` conforms to this protocol, mapping every committed change (result, diff, swap) to relevant mutations.

Operational view:

$$
\Delta_t = [\delta_1, \delta_2, \dots, \delta_k] \quad\text{(a batch of atomic operations)}
$$

Each $\delta_i$ is one of: set/update at a path, insert at an index, remove at an index, or swap between two indices. Applied in order, the batch yields the next state:

$$
S_{t+1} = S_t \oplus \Delta_t
$$

Where $\oplus$ is the deterministic application defined by the Observer protocol. Because LinkedQL emits atomic batches, observers see no torn frames.

```js
Observer.observe(result.rows, changes => {
    // changes = an ordered list of operations (Δ_t)
    for (const op of changes) applyToView(op);
});
```

Mapping from events to observation ops:

```js
Events (result|diff|swap)
        │
        ▼
RealtimeResult._apply(...)  ──►  Δ_t (Observer ops)
        │                           │
        ▼                           ▼
   result.rows (state)        Observers/renderers
```

Properties induced by the protocol (as used here):

- Atomic visibility: a DB transaction corresponds to one observed batch $\Delta_t$.
- Minimality: diffs become just the operations that change; swaps become positional exchanges only.
- Composability: $\Delta_t$ can be replayed across process or network boundaries without re-deriving from data.
- Idempotence & convergence: inherited from hashes and batch semantics.

Because the protocol is universal, the same live object can cross process boundaries and network layers untouched: renderers animate mutations; replicators persist them; frameworks like *Webflo* can transport them directly as messages. This object-first model replaces message-handling scaffolding: you do not reconstruct state from events; the state reconstructs itself.

---

#### Incremental State Change

Formally, the evolution of any observable state $S_t$ under incoming emissions is:

$$
S_{t+1} = S_t \oplus E_t
$$

where $E_t$ is the next emission and $\oplus$ is the deterministic application of that emission’s `result`, `diff`, or `swap`.

Idempotence follows from stable identity and atomic batches:

$$
S_t \oplus E_t \oplus E_t = S_t \oplus E_t
$$

And convergence across observers that receive the same emission sequence:

$$
S_{t+n}^{(a)} = S_{t+n}^{(b)} \quad \text{for all observers } a,b
$$

This is the quiet mathematics behind the system’s “live” illusion.

---

#### Live Objects Contract (API and Invariants)

API surface:

- `result.rows`: a mutable, observable array of row objects.
- `result.abort()`: stop live updates and detach observers.

Note that the callback mode and the live-object mode are mutually exclusive: providing a callback in `query(q, { live: true }, callback)` opts you out of the live-object mode for that call; you receive emissions only. In callback mode, `result.rows` still contains the initial materialization, but it is not live; subsequent updates arrive via `result` (full-state replacement, typically for non-diffed computations) and `diff`/`swap` events. Omit the callback to receive a `RealtimeResult` with `result.rows` as a live object.

Core invariants (summary):

- Transactional batching: all state changes from a DB transaction apply atomically.
- Stable identity: each row carries a logical hash $h$ computed as

  $$
  h = f_{\mathrm{logic}}(\mathrm{projectionKey(row)})
  $$

- Idempotence:

  $$
  S_t \oplus E_t \oplus E_t = S_t \oplus E_t
  $$

- Convergence:

  $$
  S_{t+n}^{(a)} = S_{t+n}^{(b)} \quad \text{for all observers } a,b
  $$

---

### Summary and Key Takeaways

The Realtime Engine defines a complete operational model for reactive query execution within LinkedQL.

1. **Identity and Incrementality**  
   Every row in a live query result carries a *logical hash* that encodes its semantic identity.  
   These hashes allow change events to address records directly — so updates, deletions, and swaps act on existing state rather than reconstructing it from scratch.  
   This property is what makes every change minimal, referential, and consistent across observers.

2. **Atomic and Deterministic Application**  
   Each emitted event — `diff`, `swap`, or `result` — forms a complete and self-contained unit of change.  
   Application is atomic and deterministic: the same sequence of emissions always converges to the same final state, regardless of where it is replayed.  
   Observers see only consistent transitions; never partial state.

3. **Minimal Change Algebra**  
   The runtime operates under a minimal algebra of state transformation:

   $$
   S_{t+1} \;=\; S_t \oplus D_T
   $$

   where $S_t$ is the current state, $D_T$ is the logical diff derived from transaction $T$, and $\oplus$ is the operator that applies it.  
   This operation is associative, idempotent, and convergent — ensuring that any client applying the same diff sequence reaches the same state.

4. **Unified Object Model**  
   Query results are ordinary observable objects (`RealtimeResult`), not specialized stream abstractions.  
   They can be read, serialized, or passed like any JavaScript object, yet remain live and internally self-updating through the same minimal algebra.  
   Systems that implement the Observer API can introspect them directly:  
   ```js
   Observer.observe(result.rows, changes => console.log(changes));
   ```
   This design allows any renderer, replicator, or transport layer to integrate seamlessly with LinkedQL’s live objects, eliminating glue code and external state management.

## *Part 3 · Key Contributions and Conclusion*

---

### Key Contributions

The engineering of the LinkedQL Realtime Engine opens new axes of exploration for reactivity over SQL — spanning realtime computation that remains **cost-bounded**, **operationally deterministic**, and **semantically coherent** across diverse database models: local, remote, or distributed.

1. **Better Cost Model**
   The **inheritance model** enables shared computation and incremental state across equivalent queries.
   Overlapping queries converge into canonical and derived windows, transforming redundancy into reuse.
   The result is a **scalable realtime system** whose total computation scales **by query diversity** rather than audience size — establishing predictable, algebraically measurable scaling laws for reactivity over SQL.

2. **Incremental Propagation**
   The **event pipeline** achieves full state continuity through incremental change.
   Each mutation is normalized once, diffed once, and emitted with invariants sufficient for any observer to advance deterministically to the next state — without revalidation or replay.
   The result is an **efficient realtime system** governed by a precise incremental calculus: constant work per event, minimal bandwidth, and provable coherence across all observers.

3. **Semantic Continuity**
   The *live result model* represents each query as an ordinary object that simultaneously functions as a reactive data surface.
   State and change coexist within the same structure, eliminating the need for manual event handling, reconciliation logic, or synchronization layers.
   The result is a **transparent programming interface** where data remains live and directly usable across the application stack.

### Conclusion

The Realtime Engine transforms SQL from a request–response interface into a live, continuous medium of data exchange.
It brings realtime behavior out of middleware layers and external subscription servers and embeds it directly into SQL itself — with deterministic scaling even on mainstream databases.
It demonstrates that the next evolution of relational systems lies not in *more layers*, but in *fewer* — a return to simplicity.
