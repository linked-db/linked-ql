
This is proposed (Practice & Comparison) for the last chapter of the realtime paper.

## **Chapter 5 — Examples & Analysis Atlas**

Each section would cover one or more clauses or strategy behaviors but in story form, e.g.:

1. **Simple Filters** – identical and subset WHEREs
2. **Projection Variants** – non-SSR freedom, SSR strictness
3. **Ordering Games** – direction changes, ordinal mismatches
4. **Pagination Windows** – LIMIT/OFFSET inheritance ladders
5. **Joins and Foreign Keys** – selective diffing in practice
6. **Aggregates and Grouping** – SSR inheritance boundaries
7. **Window Functions** – why they force wholistic/SSR
8. **Subselects and Lateral Joins** – correlated subquery cases
9. **Multi-level Inheritance Trees** – three-query chains
10. **Retroactive Parenting** – order of issuance independence
11. **Mixed Strategies** – local + selective coexistence
12. **Degenerate Cases** – when inheritance must stop

Each example would include:

* SQL snippets (`q1`, `q2`, possibly `q3`)
* Clause comparison table
* Engine reasoning step-by-step
* Chosen strategy (`local`, `selective`, `wholistic`, `ssr`)
* Emitted event types and whether DB roundtrip occurs
* Notes on cost and correctness

This separate chapter would make the whole system *self-demonstrating*: you can trace exactly how the engine thinks.


------------------------------

Long set of concrete examples — exhaustive pattern catalogue

Below I assemble many real-world-style examples with exact engine outcome and the reasoning pointer to the code path:

Simple subset WHERE

q1: SELECT * FROM users WHERE active

q2: SELECT * FROM users WHERE active AND country='US'

Outcome: child inherits; local filter. (intersectQueries whereClause >=).

Equivalent WHERE with different order / syntax

q1: WHERE id <> 0 AND id IS NOT NULL

q2: WHERE 0 != id AND id IS NOT NULL AND id = 2

Outcome: inherits; matchExpr normalizes conjuncts and operators; extracts child id=2 as extra filter.

Projection differs, non-SSR

q1: SELECT u.* FROM users u JOIN ...

q2: SELECT u.id, u.email FROM users u JOIN ... WHERE ...

Outcome: inherits; child renders locally from parent’s logicalRecords (non-SSR path). See SSR vs non-SSR logic.

Projection differs, SSR

q1 (SSR): returns { ssr, key }

q2: requests fields not included in ssr

Outcome: cannot inherit unless parent included exact mapped projections; subwindowingRules.projection forced to '='.

ORDER BY direction differs (non-windowed)

q1: ORDER BY id DESC

q2: ORDER BY id ASC

Outcome: in non-SSR, child can inherit and re-sort locally (if orderDirections rule allows ~); if offset/limit forces strict directions, inheritance blocked. See subwindowingRules.orderDirections.

LIMIT/OFFSET contained

q1: LIMIT 100

q2: LIMIT 20 OFFSET 10

Outcome: inherits; child slices parent locally if offset difference non-negative and limit fit. (Checks in intersectQueries.)

LIMIT/OFFSET crossing boundaries

q1: LIMIT 10

q2: LIMIT 20

Outcome: child cannot inherit (child wider than parent) — requires own root or parent that covers superset. intersectQueries limit checks fail.

Joined queries where single relation updates happen

q1: SELECT u.id, o.amount FROM users u JOIN orders o ON u.id=o.user_id

Event: orders row updated with user_id change

Outcome: #diffWithOrigin_Selective runs targeted query for affected keys (composes selection via composeSelectionLogic) and diffs remote vs local. See #diffWithOrigin_Selective and composeSelectionLogic.

Window functions

q: SELECT *, row_number() OVER (ORDER BY created_at) FROM users

Outcome: strategy.ssr = true and costly requerying for correctness; selective diffing is unsafe (window functions reorder many rows). See where hasWindowFunctions flips ssr.

Subselect in SELECT

q: SELECT u.id, (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) FROM users u

Outcome: ssr set because of subquery in select; local recompute impossible; stricter subwindowing rules apply.

Retroactive parent creation (order of registration independence)

If q1 (narrow) exists and later q2 (broader) is registered, RealtimeClient.createWindow() will try to make q1 a subwindow of q2 after starting q2 — the system tries both directions: when a new window is created, it searches windows depth-first to inherit; if none found it starts as root and then tries to adopt others as subwindows. See createWindow logic.

SSR + mapping example

Parent SSR returns ssr with fields ma=MAX(age), total=COUNT(*), key.

Child asks just for COUNT(*) — if parent’s select_list contains a structural match to COUNT(*), selectMapping will find an index and child can inherit. See selectMapping logic when subwindowingRules.projection === '='.

Ordering & LIMIT combine (windowing)

Parent: ORDER BY created_at LIMIT 100

Child: ORDER BY created_at LIMIT 150

Outcome: cannot inherit (child needs rows parent didn't hold); inherits blocked by limit checks.