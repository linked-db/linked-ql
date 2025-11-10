---
layout: home
title: LinkedQL
hero:
  name: LinkedQL
  text: A modern take on SQL and SQL databases.
  tagline: >
    Reactivity, Relationships, JSON, Schemas, Embedding, Federation & Sync, and More → SOLVED.
  actions:
    - theme: brand
      text: Get Started
      link: /docs/
    - theme: alt
      text: Star on GitHub
      link: https://github.com/linked-db/linked-ql
features:
  - title: Relationships Solved
    details: Traverse relationships directly in your queries — without writing a JOIN. Meet DeepRefs, the syntax shorthand that lets you follow relationships using simple arrow notation <span class="nowrap">— <code>SELECT a ~> b</code></span>
  - title: JSON Solved
    details: Bring JSON-like clearity to your queries. LinkedQL's first-class support for JSON notation saves you the wrangling with SQL's low-level JSON functions <span class="nowrap">— <code>SELECT { a, b }</code></span>
  - title: Schemas Solved
    details: Take a break from manual schema ops. LinkedQL operates with full context of your schema and automates the world for you. With Automatic Schema Inference, everything just works — without you
  - title: Reactivity Solved
    details: Turn on reactivity over arbitrary SQL with <span class="nowrap"><code>{ live∶ true }</code></span>. You get back a live view of your query. Live Queries in LinkedQL works directly on your database without a middleware or GraphQL servers.
  - title: Versioning Solved
    details: Get automatic database versioning as you iterate and evolve your schemas. LinkedQL makes that a reality right on your database. And that means, no more manual migration practices. 
  - title: Embedding, Federation & Sync Solved
    details: Run SQL anywhere — even offline. Meet <b>FlashQL</b>, the in-memory engine that brings full LinkedQL semantics to the client and edge. And it comes as one query space over your entire data universe.
---
