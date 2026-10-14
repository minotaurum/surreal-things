# SurrealDB + TypeScript

Below is a small CRUD example using the official JavaScript/TypeScript SDK and methods such as `create`, `select`, `update`, and `delete`, avoiding `.query()`. The current SDK supports SurrealDB 2.x and later; install it with `npm install surrealdb`. [surrealdb](https://surrealdb.com/docs/reference/javascript)

## 1. Install and connect

```bash
npm install surrealdb
```

```ts
// db.ts
import Surreal from "surrealdb";

export const db = new Surreal();

export async function connectDatabase() {
  await db.connect("http://localhost:8000");

  await db.signin({
    username: "root",
    password: "root",
  });

  await db.use({
    namespace: "app",
    database: "app",
  });
}
```

For a WebSocket connection, use:

```ts
await db.connect("ws://localhost:8000");
```

The SDK supports both HTTP and WebSocket connections. [surrealdb](https://surrealdb.com/docs/reference/javascript)

## 2. Define TypeScript models

SurrealDB records contain an `id`, so define it explicitly in your application types.

```ts
// models.ts
import type { RecordId } from "surrealdb";

export type UserId = RecordId<"user">;

export interface User {
  id: UserId;
  email: string;
  name: string;
  active: boolean;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  name: string;
  active?: boolean;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  active?: boolean;
}
```

Depending on your SDK version and codecs configuration, SurrealDB values such as record IDs and datetimes can be represented by SDK-specific types or native JavaScript values.

A simpler ID type can also be used if you do not want to expose `RecordId` throughout your application:

```ts
export interface SimpleUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: Date;
}
```

## 3. Create a repository

A repository hides the SDK details and gives the rest of the application typed methods.

```ts
// user-repository.ts
import { db } from "./db";
import type {
  User,
  UserId,
  CreateUserInput,
  UpdateUserInput,
} from "./models";

export class UserRepository {
  async create(input: CreateUserInput): Promise<User> {
    const [user] = await db.create<User>("user", {
      email: input.email,
      name: input.name,
      active: input.active ?? true,
      createdAt: new Date(),
    });

    return user;
  }

  async getById(id: UserId): Promise<User | null> {
    return db.select<User>(id);
  }

  async getAll(): Promise<User[]> {
    return db.select<User>("user");
  }

  async update(id: UserId, input: UpdateUserInput): Promise<User> {
    return db.merge<User>(id, input);
  }

  async replace(id: UserId, user: Omit<User, "id">): Promise<User> {
    return db.update<User>(id, user);
  }

  async delete(id: UserId): Promise<void> {
    await db.delete(id);
  }
}
```

The main methods used here are:

| Operation | SDK method | Behaviour |
|---|---|---|
| Create | `db.create()` | Creates one or more records |
| Read one | `db.select(id)` | Retrieves a record by ID |
| Read many | `db.select("user")` | Retrieves records from a table |
| Partial update | `db.merge()` | Updates only the provided fields |
| Full update | `db.update()` | Replaces the record contents |
| Delete | `db.delete()` | Deletes a record |

## 4. Use the repository

```ts
// main.ts
import { connectDatabase } from "./db";
import { UserRepository } from "./user-repository";

async function main() {
  await connectDatabase();

  const users = new UserRepository();

  const created = await users.create({
    email: "pablo@example.com",
    name: "Pablo",
  });

  console.log("Created:", created);

  const found = await users.getById(created.id);

  if (!found) {
    throw new Error("User not found");
  }

  console.log("Found:", found);

  const updated = await users.update(found.id, {
    name: "Pablo Raez",
  });

  console.log("Updated:", updated);

  const allUsers = await users.getAll();

  console.log("All users:", allUsers);

  await users.delete(found.id);
}

main().catch(console.error);
```

## 5. Filtering without `.query()`

The standard SDK methods are convenient for CRUD, but filtering by arbitrary fields generally requires a SurrealQL statement. If you want to avoid calling `.query()` directly, put the query behind a repository method or use an SDK extension/query builder.

For simple primary-key access:

```ts
const user = await db.select<User>("user:one");
```

For creating a deterministic record ID:

```ts
const user = await db.create<User>("user:pablo", {
  email: "pablo@example.com",
  name: "Pablo",
  active: true,
  createdAt: new Date(),
});
```

For upsert-like behaviour:

```ts
const user = await db.upsert<User>("user:pablo", {
  email: "pablo@example.com",
  name: "Pablo",
  active: true,
  createdAt: new Date(),
});
```

## 6. Define the database schema

You can define a schema in a migration file:

```sql
DEFINE TABLE user SCHEMAFULL;

DEFINE FIELD email ON TABLE user
  TYPE string
  ASSERT string::is::email($value);

DEFINE FIELD name ON TABLE user
  TYPE string;

DEFINE FIELD active ON TABLE user
  TYPE bool
  DEFAULT true;

DEFINE FIELD createdAt ON TABLE user
  TYPE datetime
  DEFAULT time::now();

DEFINE INDEX user_email ON TABLE user
  COLUMNS email
  UNIQUE;
```

Although this schema is normally applied using a migration mechanism that executes SurrealQL, application CRUD can still use the SDK methods shown above.

## 7. Practical typed helper

If the SDK returns arrays for `create`, you can centralise that behaviour:

```ts
export async function createOne<T>(
  table: string,
  data: Record<string, unknown>,
): Promise<T> {
  const records = await db.create<T>(table, data);

  const record = records[0];

  if (!record) {
    throw new Error(`Could not create record in table ${table}`);
  }

  return record;
}
```

Then:

```ts
const user = await createOne<User>("user", {
  email: "pablo@example.com",
  name: "Pablo",
  active: true,
  createdAt: new Date(),
});
```

## Recommended structure

```text
src/
  db.ts
  models.ts
  repositories/
    user-repository.ts
  main.ts
migrations/
  001_create_user.surql
```

For a small project, the official SDK methods are enough. For a larger TypeScript application, keep `RecordId` and database-specific details inside repositories, and expose domain-friendly types to services and controllers.
