# Authentication & User Management

Demonstrates user management and authentication in SurrealDB using Record Access and Row-Level Security (RLS).

## Key Concepts

- **Schema enforcement (`SCHEMAFULL`)**: Strict typing, email assertion (`string::is_email`), and unique index on `email`.
- **In-database password hashing**: `crypto::argon2::generate()` on signup and `crypto::argon2::compare()` on signin.
- **Record access (`DEFINE ACCESS account ON DATABASE TYPE RECORD`)**: Issues session tokens via `db.signup()` and `db.signin()`.
- **Row-Level Security (RLS)**: Permissions `FOR select, update WHERE id = $auth.id` restrict access to own record and prevent user enumeration.
- **Session management**: Invalidate via `db.invalidate()`, resume via `db.authenticate(token)`.

See [migration.surql](./migration.surql) for schema and [index.test.ts](./index.test.ts) for SDK usage and tests.

## Run

```bash
bun test examples/auth/index.test.ts
```
