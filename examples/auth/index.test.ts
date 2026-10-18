import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, type RecordId } from "surrealdb";
import { join } from "node:path";
import { createTestDb, expectThrows } from "../test-helper";

export type UserId = RecordId<"user" | "User">;

export interface User {
  id: UserId;
  email: string;
  name: string;
  password?: string;
}

describe("Auth Example - User table & authentication", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");
  const userTable = new Table("user");
  const UserTable = new Table("User");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("can create a user with email, password, and name", async () => {
    const [user] = await db.create<User>(userTable).content({
      email: "alice@example.com",
      password: "hashed_password_123",
      name: "Alice Cooper",
    });

    expect(user?.email).toBe("alice@example.com");
    expect(user?.name).toBe("Alice Cooper");

    const fetched = await db.select<User>(user!.id);
    expect(fetched?.email).toBe("alice@example.com");
  });

  test("enforces unique email constraint (duplicate email fails)", async () => {
    await expectThrows(() =>
      db.create<User>(userTable).content({
        email: "alice@example.com",
        password: "another_password",
        name: "Alice Imposter",
      })
    );
  });

  test("enforces valid email format", async () => {
    await expectThrows(() =>
      db.create<User>(userTable).content({
        email: "not-a-valid-email",
        password: "pwd",
        name: "Invalid Email User",
      })
    );
  });

  test("rejects user creation when required fields are missing", async () => {
    await expectThrows(() => db.create<User>(userTable).content({ email: "bob@example.com", password: "p" }));
    await expectThrows(() => db.create<User>(userTable).content({ email: "carol@example.com", name: "Carol" }));
    await expectThrows(() => db.create<User>(userTable).content({ password: "p", name: "Dave" }));
  });

  test("rejects extra fields not in table schema (SCHEMAFULL)", async () => {
    await expectThrows(() =>
      db.create<User>(userTable).content({
        email: "eve@example.com",
        password: "secret_password",
        name: "Eve",
        role: "admin",
      })
    );
  });

  test("supports PascalCase 'User' table shape as requested", async () => {
    const [user] = await db.create<User>(UserTable).content({
      email: "user.pascal@example.com",
      password: "secure_password",
      name: "Pascal User",
    });

    expect(user?.email).toBe("user.pascal@example.com");
    expect(user?.name).toBe("Pascal User");

    await expectThrows(() =>
      db.create<User>(UserTable).content({
        email: "user.pascal@example.com",
        password: "diff_password",
        name: "Duplicate Pascal",
      })
    );
  });

  test("authenticates user via record access (signup & signin)", async () => {
    const client = await createTestDb(migrationPath);

    const signupTokens = await client.signup({
      access: "account",
      variables: { email: "member@example.com", password: "my-secret-password-123", name: "Member User" },
    });
    expect(signupTokens.access).toBeDefined();

    const authRecord = await client.auth<User>();
    expect(authRecord?.email).toBe("member@example.com");
    expect(authRecord?.name).toBe("Member User");

    const signinTokens = await client.signin({
      access: "account",
      variables: { email: "member@example.com", password: "my-secret-password-123" },
    });
    expect(signinTokens.access).toBeDefined();

    await expectThrows(() =>
      client.signin({
        access: "account",
        variables: { email: "member@example.com", password: "wrong-password" },
      })
    );

    await client.close();
  });

  test("creates several users, signs in with one, and ensures it cannot list all users in database", async () => {
    const testDb = await createTestDb(migrationPath);

    for (const u of [
      { email: "user_a@example.com", password: "PasswordA123!", name: "User A" },
      { email: "user_b@example.com", password: "PasswordB123!", name: "User B" },
      { email: "user_c@example.com", password: "PasswordC123!", name: "User C" },
    ]) {
      await testDb.query(`CREATE user CONTENT { email: '${u.email}', password: crypto::argon2::generate('${u.password}'), name: '${u.name}' };`);
    }

    const allUsersAdmin = await testDb.select<User>(userTable);
    expect(allUsersAdmin.length).toBe(3);

    await testDb.signin({
      access: "account",
      variables: { email: "user_a@example.com", password: "PasswordA123!" },
    });

    const usersAsUserA = await testDb.select<User>(userTable);
    expect(usersAsUserA.length).toBe(1);
    expect(usersAsUserA[0]?.email).toBe("user_a@example.com");

    await testDb.close();
  });

  test("authenticates, stores token, logs out, and signs in again with stored token", async () => {
    const client = await createTestDb(migrationPath);

    await client.signup({
      access: "account",
      variables: { email: "token_user@example.com", password: "secure-token-pass-123", name: "Token User" },
    });

    const token = await client.signin({
      access: "account",
      variables: { email: "token_user@example.com", password: "secure-token-pass-123" },
    });
    expect(token).toBeDefined();

    const userBeforeLogout = await client.auth<User>();
    expect(userBeforeLogout?.email).toBe("token_user@example.com");

    await client.invalidate();
    const userAfterLogout = await client.auth<User>().catch(() => undefined);
    expect(userAfterLogout).toBeUndefined();

    await client.authenticate(token);
    const userAfterTokenAuth = await client.auth<User>();
    expect(userAfterTokenAuth?.email).toBe("token_user@example.com");
    expect(userAfterTokenAuth?.name).toBe("Token User");

    await client.close();
  });
});
