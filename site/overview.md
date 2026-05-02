# LinkedQL <br>— Portable Query Engine for Applications and Agents

**Welcome to the docs.** This page gives you the core thinking around LinkedQL and helps you map the system at a glance.

---

## What is LinkedQL?

LinkedQL is a portable query engine that runs in any JavaScript application and directly powers application state.

It extends SQL with a small set of composable capabilities for relationships, reactivity, and cross-runtime state — directly enabling real-time, local-first, and offline-first application architectures.

### What It Replaces

LinkedQL composes capabilities traditionally handled by separate systems directly into SQL — ORMs (e.g. Prisma), API/query layers (e.g. GraphQL), and sync engines (e.g. ElectricSQL).

This shifts applications from manual capability scaffolding to a unified, composable, SQL-based model for application logic and state.

### Where It Runs

LinkedQL is not tied to a single execution environment or architectural pattern.

It can be used as a query client over existing PostgreSQL and MySQL/MariaDB databases, embedded directly into JavaScript runtimes (browser, server, workers, edge), or used as a cross-runtime query layer – as architecture demands.

The same application-facing contract applies across all environments.

## Why LinkedQL?

LinkedQL is the destination you arrive at when you solve the application data layer as one domain problem.

Most current efforts—from ORMs to API/query layers to sync systems—either solve only a slice of that problem or do so in ways that don’t compose.

Each sees the dots in isolation and tries to solve them individually.

The core insight behind LinkedQL is *how those dots connect together at the SQL level*.

<!--
> Building from where the problem space converges is the LinkedQL core differentiator
-->

---

## Your Map to the Docs

| Area               | What it covers                                                             | Go to...                                                                   |
| :----------------- | :------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Core Guides        | From basic setup to first queries, to more comprehensive guides            | [Core Guides](/guides)                                                     |
| Core API           | Core API contract — the interface and query model                          | [Core API](/core)                                                          |
| Language Surface   | The LinkedQL language surface (JSON Literals, DeepRefs, etc.)              | [Language Surface](/lang)                                                  |
| Realtime Capabilities | Live queries and subscription model                                        | [Realtime Capabilities](/realtime)                                         |
| FlashQL            | LinkedQL's embeddable SQL engine for local execution, federation, and sync | [FlashQL](/flashql)                                                        |
