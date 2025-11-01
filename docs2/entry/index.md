---
title: "Entry Layer"
description: "The interface layer that accepts SQL via .query(), routes it through the system, and connects to PostgreSQL, MySQL, MariaDB, and FlashQL."
permalink: /entry/
nav_order: 1
layout: page
---

# Entry Layer (`entry`)

The entry layer defines the interface between the user and the LinkedQL runtime.  
It handles incoming SQL through `.query()`, orchestrates its passage through the Language and Processing layers,  
and returns live results via dialect-specific clients.

+ [API (`api`)](api) — the query interface.
+ [Clients (`clients`)](clients) — clients and dialects.