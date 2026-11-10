# Datetime Fields in SurrealDB

Demonstrates handling `datetime` fields in SurrealDB using the JavaScript/TypeScript SDK.

## Key Concepts

- **Schema Definition (`TYPE datetime`)**: Fields defined with `TYPE datetime` strictly enforce datetime data types. You can set default values like `DEFAULT time::now()`.
- **SDK Input Expects JS `Date()`**: When creating or updating records, the SurrealDB SDK expects a JavaScript `Date()` object (or an SDK `DateTime` instance). Passing an ISO string (e.g. `"2026-12-01T14:30:00.000Z"`) will cause schema validation failure because SurrealDB treats it as a `string`, not a `datetime`.
- **Updating with SDK Methods**: Use `db.update(recordId).merge({ ... })` with JS `Date()` values.
- **Query Parameter Binding**: Bind native JS `Date()` objects directly to parameterized queries (e.g. `WHERE scheduled_at > $refDate`), which the SDK serializes appropriately.
- **Reading Datetime Values**: Fetched records represent datetime fields as SDK `DateTime` objects (preserving nanosecond precision). Use `.toDate()` to convert to a native JavaScript `Date` or `.toISOString()` / `.toString()` for ISO-8601 formatting.

See [migration.surql](./migration.surql) for the schema and [index.test.ts](./index.test.ts) for SDK usage and tests.

## Run

```bash
bun test examples/datetime/index.test.ts
```
