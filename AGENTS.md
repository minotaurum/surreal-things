## Description

In this repo we have different examples of usages of surreal db. Each example contains a `description.md`, a `migration.surql`, and a set of tests to ensure it works. The tests start a SurrealDB instance in memory, read the migration file and apply it to the db. Then, ensure the use case requirements are covered.

## Execution of scripts


YOU'RE ONLY ALLOWED TO EXECUTE THE FOLLOWING COMMANDS. DO NOT EXECUTE OTHER COMMANDS

```
bunx tsc --noEmit
bun test # and optional path to file
```

## About Bun and Node

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### APIs

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## SurrealDB Best Practices

- **Prefer SDK methods over `db.query()`**: Whenever possible, use standard SDK methods (`db.create()`, `db.select()`, `db.update()`, `db.merge()`, `db.delete()`, `db.upsert()`, etc.) instead of raw `db.query()`. Keep `db.query()` only for statements not expressible via standard SDK methods (e.g. executing arbitrary multi-statement DDL scripts or specific access evaluations like `$auth`).
- **Use TypeScript types for fetched data**: Define interfaces/types with `RecordId` (from `surrealdb`) or appropriate entity shapes for input and output data, and pass generic type parameters to the SDK methods (e.g. `db.create<User, CreateUserInput>("user", ...)`, `db.select<User[]>("user")`).
