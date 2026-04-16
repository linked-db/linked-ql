# LinkedQL <br>— The Database Primitive For Applications And Agents

**Welcome to the docs.** This page gives you the core thinking around LinkedQL and helps you map the system at a glance.

---

## What is LinkedQL?

LinkedQL is an **application-flavoured SQL** that **runs anywhere**, with **pluggable backends**, and **an offline- and sync-ready model**. 

That progression reflects how LinkedQL connects and composes modern application concerns.

---

## How That Expands

At the application-logic layer, LinkedQL gives you an upgrade path from SQL to **a superset of SQL** that:

- natively understands application-level paradigms – through a small set of additions to SQL ([the LinkedQL language additions](/lang))
- can directly drive application state in real time – through database-native reactivity ([LinkedQL Realtime](/realtime))

While its application-level surface is the invariant, LinkedQL can run wherever your app runs: on the **client**, the **server**, and the **edge**, as architecture demands.

Durable storage (**PostgreSQL**, **MySQL/MariaDB**, or **client-side storage**, depending on runtime environment) participates in the model as pluggable backends.

With modern applications spanning runtimes and crossing network boundaries, LinkedQL composes federation and sync into the storage layer as part of the model itself.

From the top-level SQL with capabilities to the pluggable storage layer with sync, LinkedQL forms a unified model that connects and composes modern application concerns.

That single model — replacing the traditional database stack of APIs, ORMs, realtime systems, and sync layers — is the design.
<!--
---

## Why LinkedQL?

The traditional database stack encodes a split between storage, application logic, transport, and synchronization. Data is modelled and propagated across these layers in storage and network/transport terms, then remapped back into application state and reshaped into application-defined contracts.

The LinkedQL core insight is to not treat the database as a low level storage system but to model it as application state itself – the canonical, durable form of state, typically separated from execution by network and protocol boundaries.

That insight is the core of the LinkedQL model:

application-flavoured query language  
→ application-defined output shapes  
→ reactive by default via mode switch  
→ crosses network and protocol boundaries with application semantics preserved  
→ directly drives application state  
-->
---

## Your Map to the Docs

| Area            | What it covers                                                   | Go to...                                                         |
| :-------------- | :--------------------------------------------------------------- | :--------------------------------------------------------------- |
| Getting Started | Basic setup and first queries                                    | [LinkedQL Guides](/guides)                                       |
| API             | Core execution model (query, stream, transactions, live queries) | [LinkedQL API](/api)                                             |
| Language        | SQL extensions and composable primitives                         | [Language Additions](/lang)                                      |
| Realtime        | Live queries and change propagation                              | [LinkedQL Realtime](/realtime)                                   |
| FlashQL         | Local execution, federation, and sync                            | [FlashQL](/flashql)                                              |
