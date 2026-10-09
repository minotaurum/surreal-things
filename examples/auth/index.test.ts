import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, type RecordId } from "surrealdb";
import { join } from "node:path";
import { createTestDb } from "../test-helper";

export type UserId = RecordId<"user">;
export type UserPascalId = RecordId<"User">;

export interface User {
  id: UserId;
  email: string;
  name: string;
  password?: string;
}

export interface UserPascal {
  id: UserPascalId;
  email: string;
  name: string;
  password?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  [key: string]: unknown;
}

describe("Auth Example - User table & authentication", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");

  beforeAll(async () => {
    // Initialize in-memory database and apply migration
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("can create a user with email, password, and name", async () => {
    const [user] = await db
      .create<User>(new Table("user"))
      .content({
        email: "alice@example.com",
        password: "hashed_password_123",
        name: "Alice Cooper",
      });

    expect(user).toBeDefined();
    expect(user?.email).toBe("alice@example.com");
    expect(user?.name).toBe("Alice Cooper");
    expect(user?.id).toBeDefined();

    const fetched = await db.select<User>(user!.id);
    expect(fetched).toBeDefined();
    expect(fetched?.email).toBe("alice@example.com");
  });

  test("enforces unique email constraint (duplicate email fails)", async () => {
    let duplicateFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          email: "alice@example.com",
          password: "another_password",
          name: "Alice Imposter",
        });
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);
  });

  test("enforces valid email format", async () => {
    let invalidEmailFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          email: "not-a-valid-email",
          password: "pwd",
          name: "Invalid Email User",
        });
    } catch {
      invalidEmailFailed = true;
    }
    expect(invalidEmailFailed).toBe(true);
  });

  test("rejects user creation when required fields are missing", async () => {
    // Missing 'name'
    let missingNameFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          email: "bob@example.com",
          password: "secret_password",
        });
    } catch {
      missingNameFailed = true;
    }
    expect(missingNameFailed).toBe(true);

    // Missing 'password'
    let missingPasswordFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          email: "carol@example.com",
          name: "Carol",
        });
    } catch {
      missingPasswordFailed = true;
    }
    expect(missingPasswordFailed).toBe(true);

    // Missing 'email'
    let missingEmailFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          password: "secret_password",
          name: "Dave",
        });
    } catch {
      missingEmailFailed = true;
    }
    expect(missingEmailFailed).toBe(true);
  });

  test("rejects extra fields not in table schema (SCHEMAFULL)", async () => {
    let extraFieldFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({
          email: "eve@example.com",
          password: "secret_password",
          name: "Eve",
          role: "admin",
        });
    } catch {
      extraFieldFailed = true;
    }
    expect(extraFieldFailed).toBe(true);
  });

  test("supports PascalCase 'User' table shape as requested", async () => {
    const [user] = await db
      .create<UserPascal>(new Table("User"))
      .content({
        email: "user.pascal@example.com",
        password: "secure_password",
        name: "Pascal User",
      });

    expect(user).toBeDefined();
    expect(user?.email).toBe("user.pascal@example.com");
    expect(user?.name).toBe("Pascal User");

    // Duplicate email on User table also fails
    let dupFailed = false;
    try {
      await db
        .create<UserPascal>(new Table("User"))
        .content({
          email: "user.pascal@example.com",
          password: "diff_password",
          name: "Duplicate Pascal",
        });
    } catch {
      dupFailed = true;
    }
    expect(dupFailed).toBe(true);
  });

  test("authenticates user via record access (signup & signin)", async () => {
    // 1. Client signup
    const client = await createTestDb(migrationPath);

    const signupTokens = await client.signup({
      access: "account",
      variables: {
        email: "member@example.com",
        password: "my-secret-password-123",
        name: "Member User",
      },
    });

    expect(signupTokens.access).toBeDefined();

    // Query authenticated record using client.auth<User>()
    const authRecord = await client.auth<User>();
    expect(authRecord).toBeDefined();
    expect(authRecord?.email).toBe("member@example.com");
    expect(authRecord?.name).toBe("Member User");

    // 2. Client signin with valid credentials
    const signinTokens = await client.signin({
      access: "account",
      variables: {
        email: "member@example.com",
        password: "my-secret-password-123",
      },
    });

    expect(signinTokens.access).toBeDefined();

    // 3. Client signin with invalid password fails
    let wrongPassFailed = false;
    try {
      await client.signin({
        access: "account",
        variables: {
          email: "member@example.com",
          password: "wrong-password",
        },
      });
    } catch {
      wrongPassFailed = true;
    }
    expect(wrongPassFailed).toBe(true);

    await client.close();
  });

  test("creates several users, signs in with one, and ensures it cannot list all users in database", async () => {
    // 1. Create a fresh in-memory database with the auth migration applied
    const testDb = await createTestDb(migrationPath);

    // 2. Create several users in the database using db.query for argon2 hashing on insert
    const usersToCreate = [
      { email: "user_a@example.com", password: "PasswordA123!", name: "User A" },
      { email: "user_b@example.com", password: "PasswordB123!", name: "User B" },
      { email: "user_c@example.com", password: "PasswordC123!", name: "User C" },
    ];

    for (const u of usersToCreate) {
      await testDb.query(`
        CREATE user CONTENT {
          email: '${u.email}',
          password: crypto::argon2::generate('${u.password}'),
          name: '${u.name}'
        };
      `);
    }

    // Verify all 3 users exist in the database (as unauthenticated/admin session) using db.select(Table)
    const allUsersAdmin = await testDb.select<User>(new Table("user"));
    expect(allUsersAdmin.length).toBe(3);

    // 3. Sign in as one of the users (User A)
    await testDb.signin({
      access: "account",
      variables: {
        email: "user_a@example.com",
        password: "PasswordA123!",
      },
    });

    // 4. Ensure User A cannot list all users in database
    // Table permissions (FOR select WHERE id = $auth.id) only return User A's record
    const usersAsUserA = await testDb.select<User>(new Table("user"));
    expect(usersAsUserA.length).toBe(1);
    expect(usersAsUserA[0]?.email).toBe("user_a@example.com");

    await testDb.close();
  });

  test("authenticates, stores token, logs out, and signs in again with stored token", async () => {
    const client = await createTestDb(migrationPath);

    // 1. Create a user
    await client.signup({
      access: "account",
      variables: {
        email: "token_user@example.com",
        password: "secure-token-pass-123",
        name: "Token User",
      },
    });

    // 2. Sign in with username and password, and store the token
    const token = await client.signin({
      access: "account",
      variables: {
        email: "token_user@example.com",
        password: "secure-token-pass-123",
      },
    });

    expect(token).toBeDefined();

    // Verify authenticated user before logout
    const userBeforeLogout = await client.auth<User>();
    expect(userBeforeLogout?.email).toBe("token_user@example.com");

    // 3. Log out (invalidate session)
    await client.invalidate();

    // Verify session is invalidated / logged out
    const userAfterLogout = await client.auth<User>();
    expect(userAfterLogout).toBeUndefined();

    // 4. Sign in again using the stored token instead of credentials
    // SurrealDB SDK supports authenticating using authenticate(token) or signin(token)
    await client.authenticate(token);

    // Verify authenticated user is restored using the token
    const userAfterTokenAuth = await client.auth<User>();
    expect(userAfterTokenAuth).toBeDefined();
    expect(userAfterTokenAuth?.email).toBe("token_user@example.com");
    expect(userAfterTokenAuth?.name).toBe("Token User");

    await client.close();
  });
});
