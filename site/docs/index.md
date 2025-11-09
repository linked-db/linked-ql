# Getting Started with LinkedQL

This guide takes you from installation to your first query with LinkedQL. No database connection is required, as LinkedQL runs entirely in memory too.

If you're totally new here, you may want to [meet LinkedQL](docs/about).

---

> [!IMPORTANT]
> 🚀 **LinkedQL is in active development and evolving daily.** Current status = **alpha**.<br>
> You’re welcome to experiment, but it’s not yet suited for production workloads.

## Installation

LinkedQL is distributed as an npm package. Install it with:

```bash
npm install @linked-db/linked-ql
```

The package provides clients for all supported SQL dialects — including **FlashQL**, the in-memory SQL engine for local or offline use.

## Initialization

Import and initialize the client for your use case. You can run either fully in-memory or with a database.
Here are two quick examples:

### Run Locally with FlashQL

FlashQL lets you run SQL queries entirely in memory — with zero setup.

```js
import { FlashClient } from '@linked-db/linked-ql/flash';

const client = new FlashClient();

const result = await client.query(`
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
  INSERT INTO users (name) VALUES ('Ada'), ('Linus');
  SELECT * FROM users;
`);

console.log(result.rows);
// [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]
```

FlashQL is ideal for:

* **Local-first and offline-first apps**
* **Running SQL over runtime data**
* **Testing and prototyping**

### Connect to a Database

Connect to your database from the list of supported dialects below.
Here’s an example using PostgreSQL:

```js
import { PGClient } from '@linked-db/linked-ql/pg';

const client = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp',
});

await client.connect();

const result = await client.query(`SELECT 10 AS value`);
console.log(result.rows); // [{ value: 10 }]

await client.disconnect();
```

## Supported Dialects

| **Dialect**         | **Import Path**                | **Guide**                          |
| :------------------ | :----------------------------- | :--------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/pg`      | [PostgreSQL →](docs/setup#postgresql) |
| MySQL               | `@linked-db/linked-ql/mysql`   | [MySQL →](docs/setup#mysql)           |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [MariaDB →](docs/setup#mariadb)       |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flash`   | [FlashQL →](docs/setup#flashql)       |

## The Query Interface

LinkedQL maintains a **unified and familiar interface** across all dialects — whether remote or local.
Method signatures and return values are consistent and documented in the
[**Client API Reference →**](docs/query-api)

## Troubleshooting

* **Connection refused** — Check your database credentials and network access.
* **Unexpected syntax** — Review LinkedQL’s [Language Guide](docs/lang) for supported SQL extensions.
* **Lost data (FlashQL)** — Remember FlashQL runs in memory; data resets when the process exits. Persistent storage options planned.

If you encounter a reproducible issue, please open a ticket on
[**GitHub › LinkedQL Issues**](https://github.com/linked-db/linked-ql/issues)
and include a concise code sample, dialect, and environment details.

## Next Steps

* [Dialects & Clients](docs/setup) — PostgreSQL, MySQL, MariaDB, FlashQL
* [Capabilities](docs/capabilities) — Relationships, JSON, Live Queries, etc.
* [FlashQL](docs/flashql) — In-memory SQL engine overview
