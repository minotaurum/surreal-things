# Authentication & User Management Example

This example demonstrates how to implement secure, robust user management and authentication in **SurrealDB** using SurrealQL schema definitions and the JavaScript/TypeScript SDK.

## Overview

The example showcases:
- **Strict Schema Enforcement (`SCHEMAFULL`)**: Preventing arbitrary or unvalidated fields on user records.
- **Data Validation & Constraints**: Built-in assertions (`string::is_email`) and unique indices.
- **Password Security**: In-database password hashing and verification using `crypto::argon2::generate()` and `crypto::argon2::compare()`.
- **Record Access (`DEFINE ACCESS ... TYPE RECORD`)**: Native SurrealDB signup and signin mechanisms providing scoped authentication tokens.
- **Row-Level Security (RLS / Permissions)**: Restricting table access so that authenticated users can only view or modify their own user record (`WHERE id = $auth.id`), preventing unauthorized user enumeration.
- **Conventions Support**: Supporting standard lowercase (`user`) and PascalCase (`User`) table names.

---

## Schema Definition (`migration.surql`)

### 1. Schema & Permissions

```surql
DEFINE TABLE user SCHEMAFULL
    PERMISSIONS
        FOR select, update WHERE id = $auth.id,
        FOR create, delete NONE;

DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD password ON user TYPE string;
DEFINE FIELD name ON user TYPE string;

DEFINE INDEX user_email ON user FIELDS email UNIQUE;
```

- **`SCHEMAFULL`**: Rejects any extraneous fields not explicitly defined on the table.
- **Permissions**:
  - `FOR select, update WHERE id = $auth.id`: Limits queries from authenticated users strictly to their own record via `$auth.id`.
  - `FOR create, delete NONE`: Disallows unauthenticated creation or deletion directly through table CRUD operations (creation must go through the access method or administrative credentials).
- **Assertions & Indexes**:
  - `ASSERT string::is_email($value)` guarantees email validity.
  - `DEFINE INDEX user_email ... UNIQUE` ensures duplicate email registrations fail.

> *Note*: The migration also provides identical definitions for a PascalCase `User` table.

### 2. Record Access Authentication

```surql
DEFINE ACCESS account ON DATABASE TYPE RECORD
    SIGNUP (
        CREATE user CONTENT {
            email: $email,
            password: crypto::argon2::generate($password),
            name: $name
        }
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = $email
          AND crypto::argon2::compare(password, $password)
    );
```

- **`SIGNUP`**: Executes when a client invokes `db.signup({ access: 'account', variables: { ... } })`. It hashes the submitted password using Argon2 before storing it.
- **`SIGNIN`**: Executes when a client invokes `db.signin({ access: 'account', variables: { ... } })`. It compares the plaintext password against the stored Argon2 hash and, on match, returns the user session.

---

## Test Coverage (`index.test.ts`)

The test suite validates both the schema rules and the authentication flows against an in-memory SurrealDB instance:

1. **User Creation**: Confirms valid users can be created with `email`, `password`, and `name`.
2. **Unique Email Constraint**: Rejects attempts to insert duplicate email addresses.
3. **Email Format Validation**: Rejects invalid email strings.
4. **Required Field Enforcement**: Fails creation if `email`, `password`, or `name` is missing.
5. **Schemafull Field Protection**: Fails if undeclared fields (e.g. `role: 'admin'`) are provided.
6. **PascalCase Compatibility**: Verifies the same constraints hold for the `User` table.
7. **Record Access Signup & Signin**:
   - Signs up a user via `client.signup()`.
   - Inspects the authenticated user via `client.auth<User>()`.
   - Signs in via `client.signin()` with valid credentials.
   - Verifies signin rejection on invalid passwords.
8. **Row-Level Security / Anti-Enumeration**:
   - Seeds multiple users into the database.
   - Signs in as a single user.
   - Asserts that `client.select(new Table("user"))` returns only the signed-in user's record, preventing user enumeration across the database.

---

## Running the Tests

Execute tests using Bun:

```bash
bun test examples/auth/index.test.ts
```
