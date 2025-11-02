# Idea

## What is LinkedQL

LinkedQL is a database client that solves the modern database capability problem in a single interface.
Same familiar API as a classic client (`client.query()`), but **advanced SQL over your database** — bringing relational queries, live queries, a schema versioning system, offline capabilities and more.

LinkedQL is more **a modern take on SQL and SQL databases** than just a client.

Need the full power of SQL locally? LinkedQL bundles an **embeddable, in-memory database** — codenamed **FlashQL**.
Use it as a lighter replacement for SQLite or PGLite, with all of LinkedQL’s power built in.

## Why LinkedQL

SQL and SQL databases have a **capability problem.**
Modern applications built around them have to wade through layers of **external tooling** as a consequence.<br>
(For example, need relational queries and realtime data? → typical setup: ORM + GraphQL servers.)

Rather than extend that layer with yet another prosthetic arm for a missing limb in SQL, **LinkedQL extends SQL itself** to close the gaps at their level — **syntax gaps at the language layer**, **runtime problems at the runtime layer.**

All of that comes built-in with the classic client API — giving your database an **automatic upgrade** in both **language** and **runtime capabilities**.
