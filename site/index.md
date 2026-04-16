---
layout: home
title: LinkedQL
hero:
  name: LinkedQL
  text: The database primitive for modern apps and agents.
  tagline:
    Replace the traditional database stack with an application-flavoured SQL. LinkedQL is built to directly power realtime, local-first, and offline-first applications through a small set of additions to SQL.
  actions:
    - theme: brand
      text: Get Started
      link: /guides/
    - theme: alt
      text: What Is LinkedQL
      link: /overview
    - theme: alt
      text: Star on GitHub
      link: https://github.com/linked-db/linked-ql
features:
  - title: Relationships Solved
    details: "Traverse declared relationships directly in SQL without hand-writing every join. DeepRefs turns schema relationships into first-class query syntax <span class=\"nowrap\">— <code>SELECT author ~> name</code></span>"

  - title: JSON Solved
    details: "Shape the result the way the application actually wants to consume it. JSON literals pull object and array construction back into the query <span class=\"nowrap\">— <code>SELECT { a, b }</code></span>"

  - title: Schemas Solved
    details: "Work against a SQL surface that understands schema, relationships, and versioned structure as part of the language and runtime model."

  - title: Reactivity Solved
    details: "Turn on reactivity over arbitrary SQL with <span class=\"nowrap\"><code>{ live: true }</code></span>. You get back a live view of the query itself, without bolting on a separate subscription stack."

  - title: Versioning Solved
    details: "Make schema/version assumptions explicit in the query contract and carry version-aware workflows into the embedded runtime story."

  - title: Embedding, Federation & Sync Solved
    details: "Run SQL in-process with <b>FlashQL</b>, declare foreign views in SQL, materialize them locally, and keep them in sync without first inventing a separate local-first stack."

  - title: Sync, Realtime & Local-first Solved
    details: "Support realtime, local-first, and offline-first directly from SQL. Federate and sync data between local/remote databases without introducing a separate sync or realtime layer."
---
