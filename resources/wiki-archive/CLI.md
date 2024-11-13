
# The Linked QL CLI

Linked QL migrations are a **small** addition to Linked QL. And it comes ready-to-use, via the `linkedql` command, upon Linked QL's installation. (No extra setup is required.)

## Overview

The `linkedql` command comes as part of your local Linked QL installation and not as a global package, and that means you'll need the `npx` prefix to run the commands below. E.g.

```cmd
npx linkedql commit
```

On each command, you can use the `--dir` flag to point Linked QL to your "database" directory (where you have your `schema.json` and `driver.js` files), that's if you have chosen a different location other than `./database`:

```cmd
npx linkedql commit --dir="./src/database-stuff"
```

*(Relative paths will resolve against your current working directory (CWD).)*

To run a command for a specific database out of your list of databases, use the `--db` flag:

```cmd
npx linkedql commit --db=database_1
```

To turn off prompts and get Linked QL to just take the "sensible-default" action, use the flag `--yes` (formally `--auto`, before `v0.12.0`):

```cmd
npx linkedql commit --yes
```

> Note that as of `@linked-db/linked-ql@0.11.0`, the following commands `forget`, `leaderboard`, `migr
ate` have been depreciated in favour of `clear-histories`, `state`, `commit` respectively, and a new command `generate` introduced.

## Commands

### `linkedql commit`

*Interactively commit your schema changes against your DB.* Linked QL looks through your local schema and compares with your active DB structure to see what's new. It works interactively by default and you're able to preview each SQL query to be run.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql commit
```

```cmd
npx linkedql commit --db=database_1
```

Use the `--desc` flag to provide the description for your new changes:

```cmd
npx linkedql commit --desc="Initial DB creation"
```

Use the flag `--quiet` to turn off SQL previews:

```cmd
npx linkedql commit --quiet
```

</details>

### `linkedql rollback`

*Interactively perform a rollback.* Linked QL looks for the next savepoint at each database and initiates a rollback. It works interactively by default and you're able to preview each SQL query to be run.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql rollback
```

```cmd
npx linkedql rollback --db=database_1
```

Use the `--direction` flag to specify either a "backward" rollback (the default) or a "forward" rollback if already at a certain rollback state:

```cmd
npx linkedql rollback --direction=forward
```

Use the flag `--quiet` to turn off SQL previews:

```cmd
npx linkedql migrate --quiet
```

</details>

### `linkedql state`

*View the state of each database.* Linked QL displays details about the latest savepoint at each database.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql state
```

```cmd
npx linkedql state --db=database_1
```

Use the flag `--direction` to specify either a "back in time" lookup (the default) or "forward in time" lookup if already at a certain rollback state:

```cmd
npx linkedql state --direction=forward
```

</details>

### `linkedql refresh`

*Refresh local schema file.* Linked QL regenerates the schema from current DB structure for each database it has managed; refreshes local copy.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql refresh
```

```cmd
npx linkedql refresh --db=database_1
```

</details>

### `linkedql generate`

*Same as `linkedql generate`*, except that it will also eagerly generate the schema for an explicitly-named DB that has not been managed by Linked QL.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql generate
```

```cmd
npx linkedql generate --db=database_1
```

</details>

### `linkedql clear-histories`

*Permanently erase savepoint histories.* Linked QL deletes the savepoint history of all databases, or a specific database from the `--db` flag. This is irreversible.

<details><summary>🐹 Usage:</summary>

```cmd
npx linkedql clear-histories
```

```cmd
npx linkedql clear-histories --db=database_1
```

</details>
