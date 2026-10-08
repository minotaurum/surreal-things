import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal } from "surrealdb";
import { join } from "node:path";
import { createTestDb } from "../test-helper";

describe("Auth Example - User table & authentication", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.suql");

  beforeAll(async () => {
    // Initialize in-memory database and apply migration
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("can create a user with email, password, and name", async () => {
    const result = await db.query<[{ id: string; email: string; name: string }[]]>(`
      CREATE user CONTENT {
        email: 'alice@example.com',
        password: 'hashed_password_123',
        name: 'Alice Cooper'
      };
    `);

    const users = result[0];
    expect(users).toBeDefined();
    expect(users.length).toBe(1);
    expect(users[0].email).toBe("alice@example.com");
    expect(users[0].name).toBe("Alice Cooper");
  });

  test("enforces unique email constraint (duplicate email fails)", async () => {
    let duplicateFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          email: 'alice@example.com',
          password: 'another_password',
          name: 'Alice Imposter'
        };
      `);
    } catch {
      duplicateFailed = true;
    }
    expect(duplicateFailed).toBe(true);
  });

  test("enforces valid email format", async () => {
    let invalidEmailFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          email: 'not-a-valid-email',
          password: 'pwd',
          name: 'Invalid Email User'
        };
      `);
    } catch {
      invalidEmailFailed = true;
    }
    expect(invalidEmailFailed).toBe(true);
  });

  test("rejects user creation when required fields are missing", async () => {
    // Missing 'name'
    let missingNameFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          email: 'bob@example.com',
          password: 'secret_password'
        };
      `);
    } catch {
      missingNameFailed = true;
    }
    expect(missingNameFailed).toBe(true);

    // Missing 'password'
    let missingPasswordFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          email: 'carol@example.com',
          name: 'Carol'
        };
      `);
    } catch {
      missingPasswordFailed = true;
    }
    expect(missingPasswordFailed).toBe(true);

    // Missing 'email'
    let missingEmailFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          password: 'secret_password',
          name: 'Dave'
        };
      `);
    } catch {
      missingEmailFailed = true;
    }
    expect(missingEmailFailed).toBe(true);
  });

  test("rejects extra fields not in table schema (SCHEMAFULL)", async () => {
    let extraFieldFailed = false;
    try {
      await db.query(`
        CREATE user CONTENT {
          email: 'eve@example.com',
          password: 'secret_password',
          name: 'Eve',
          role: 'admin'
        };
      `);
    } catch {
      extraFieldFailed = true;
    }
    expect(extraFieldFailed).toBe(true);
  });

  test("supports PascalCase 'User' table shape as requested", async () => {
    const result = await db.query<[{ id: string; email: string; name: string }[]]>(`
      CREATE User CONTENT {
        email: 'user.pascal@example.com',
        password: 'secure_password',
        name: 'Pascal User'
      };
    `);

    const users = result[0];
    expect(users).toBeDefined();
    expect(users.length).toBe(1);
    expect(users[0].email).toBe("user.pascal@example.com");
    expect(users[0].name).toBe("Pascal User");

    // Duplicate email on User table also fails
    let dupFailed = false;
    try {
      await db.query(`
        CREATE User CONTENT {
          email: 'user.pascal@example.com',
          password: 'diff_password',
          name: 'Duplicate Pascal'
        };
      `);
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

    // Query authenticated record
    const authRecord = await client.query<[{ id: string; email: string; name: string }[]]>(
      "SELECT * FROM $auth;"
    );
    expect(authRecord[0][0].email).toBe("member@example.com");
    expect(authRecord[0][0].name).toBe("Member User");

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
});
