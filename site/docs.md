# Getting started with LinkedQL

Welcome to LinkedQL. You’re among the first to get here, and we hope that you find it as exciting as we do.

LinkedQL runs anywhere — Node, Bun, Deno, or the browser — and connects directly to PostgreSQL or MySQL/MariaDB. Setup is quick and intuitive.

## Installation

```bash
npm i @linked-db/linked-ql
```

```js
import { PGClient } from '@linked-db/linked-ql/pg';

const client = new PGClient({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp'
});

await client.connect();
const result = await client.query(`SELECT 10 AS value`);
console.log(result.rows); // [{ value: 10 }]
await client.disconnect();
```

## Clients & Dialects

LinkedQL ships with clients for each major SQL dialect.<br>
For PostgreSQL, MySQL, and MariaDB, it adapts seamlessly to each database through their respective native connector.

| **Dialect**         | **Package**                    | **Docs**                                                                                   |
| :------------------ | :----------------------------- | :----------------------------------------------------------------------------------------- |
| PostgreSQL          | `@linked-db/linked-ql/pg`      | [Read → PG Docs](/docs/setup#postgresql)   |
| MySQL               | `@linked-db/linked-ql/mysql`   | [Read → MySQL Docs](/docs/setup#mysql)     |
| MariaDB             | `@linked-db/linked-ql/mariadb` | [Read → MariaDB Docs](/docs/setup#mariadb) |
| FlashQL (In-Memory) | `@linked-db/linked-ql/flash`   | [Read → FlashQL Docs](/docs/setup#flashql) |
