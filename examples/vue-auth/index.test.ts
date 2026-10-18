import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { createPinia, setActivePinia } from "pinia";
import { Table, RecordId, type Surreal } from "surrealdb";
import { join } from "node:path";
import { createTestDb, expectThrows } from "../test-helper";
import { useAuthStore } from "./auth-store";
import { AuthService } from "./auth-service";
import type { User } from "./types";

describe("Vue Auth Example - AuthService with Pinia Token Storage", () => {
  let db: Surreal;
  let store: ReturnType<typeof useAuthStore>;
  let authService: AuthService;
  const migrationPath = join(import.meta.dir, "migration.surql");
  const userTable = new Table("user");

  beforeEach(async () => {
    setActivePinia(createPinia());
    db = await createTestDb(migrationPath);
    store = useAuthStore();
    authService = new AuthService(db, store);
  });

  afterEach(async () => {
    await db.close();
  });

  test("initializes with unauthenticated state in Pinia and Service", async () => {
    expect(authService.isAuthenticated).toBe(false);
    expect(store.isAuthenticated).toBe(false);
    expect(store.tokens).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(await authService.getUser()).toBeUndefined();
  });

  test("signUp registers user, saves tokens in Pinia, and populates current user", async () => {
    const tokens = await authService.signUp({
      email: "alice@example.com",
      password: "secure-password-123",
      name: "Alice Developer",
    });

    expect(tokens.access).toBeDefined();
    expect(store.tokens).toEqual(tokens);
    expect(store.isAuthenticated).toBe(true);
    expect(store.currentUser?.email).toBe("alice@example.com");
    expect(store.currentUser?.id).toBeInstanceOf(RecordId);
    expect(store.currentUser?.id.table.name).toBe("user");

    const fetched = await db.select<User>(store.currentUser!.id);
    expect(fetched?.email).toBe("alice@example.com");
    expect((fetched as unknown as Record<string, unknown>).password).toBeUndefined();
  });

  test("signUp rejects duplicate email and preserves unauthenticated state", async () => {
    await authService.signUp({ email: "alice@example.com", password: "password1", name: "Alice 1" });
    store.clear();

    await expectThrows(() =>
      authService.signUp({ email: "alice@example.com", password: "password2", name: "Alice Duplicate" })
    );

    expect(store.tokens).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  test("signIn authenticates existing user and updates Pinia tokens", async () => {
    await authService.signUp({ email: "bob@example.com", password: "bob-secret-password", name: "Bob Builder" });

    store.clear();
    await db.invalidate();

    const tokens = await authService.signIn({ email: "bob@example.com", password: "bob-secret-password" });
    expect(tokens.access).toBeDefined();
    expect(store.tokens).toEqual(tokens);
    expect(store.isAuthenticated).toBe(true);

    const user = await authService.getUser();
    expect(user?.email).toBe("bob@example.com");
    expect(user?.name).toBe("Bob Builder");
  });

  test("signIn with invalid password fails and does not set Pinia tokens", async () => {
    await authService.signUp({ email: "charlie@example.com", password: "correct-password", name: "Charlie Brown" });

    store.clear();
    await db.invalidate();

    await expectThrows(() =>
      authService.signIn({ email: "charlie@example.com", password: "incorrect-password" })
    );

    expect(store.tokens).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  test("signOut invalidates SurrealDB session and purges Pinia store", async () => {
    await authService.signUp({ email: "diana@example.com", password: "diana-password", name: "Diana Prince" });
    expect(store.isAuthenticated).toBe(true);

    await authService.signOut();

    expect(store.isAuthenticated).toBe(false);
    expect(store.tokens).toBeNull();
    expect(store.currentUser).toBeNull();
    expect(await authService.getUser()).toBeUndefined();
  });

  test("authenticate restores session from Pinia tokens on app reload", async () => {
    const initialTokens = await authService.signUp({
      email: "eva@example.com",
      password: "eva-secure-password",
      name: "Eva Green",
    });

    await db.invalidate();
    expect(store.tokens).toEqual(initialTokens);

    const restored = await authService.authenticate();
    expect(restored).toBe(true);

    const user = await authService.getUser();
    expect(user?.email).toBe("eva@example.com");
    expect(user?.name).toBe("Eva Green");
  });

  test("authenticate with invalid token throws and clears Pinia store", async () => {
    store.setTokens({ access: "invalid-token" });
    expect(store.isAuthenticated).toBe(true);

    await expectThrows(() => authService.authenticate());

    expect(store.tokens).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  test("updateProfile updates user data in SurrealDB and syncs Pinia store", async () => {
    await authService.signUp({ email: "frank@example.com", password: "frank-password", name: "Frank Sinatra" });

    const updated = await authService.updateProfile({ name: "Francis Albert Sinatra" });
    expect(updated?.name).toBe("Francis Albert Sinatra");
    expect(store.currentUser?.name).toBe("Francis Albert Sinatra");

    const fetched = await db.select<User>(store.currentUser!.id);
    expect(fetched?.name).toBe("Francis Albert Sinatra");
  });

  test("Row-Level Security (RLS) ensures signed-in user cannot view or alter other users", async () => {
    await authService.signUp({ email: "user1@example.com", password: "pwd", name: "User One" });
    const user1Id = store.currentUser!.id;

    const client2 = await createTestDb(migrationPath);
    const store2 = useAuthStore();
    const service2 = new AuthService(client2, store2);
    await service2.signUp({ email: "user2@example.com", password: "pwd", name: "User Two" });
    const user2Id = store2.currentUser!.id;

    // User 1 only sees User 1
    const usersAsUser1 = await db.select<User>(userTable);
    expect(usersAsUser1.length).toBe(1);
    expect(usersAsUser1[0]?.email).toBe("user1@example.com");
    expect(await db.select<User>(user2Id)).toBeUndefined();

    // User 2 only sees User 2
    const usersAsUser2 = await client2.select<User>(userTable);
    expect(usersAsUser2.length).toBe(1);
    expect(usersAsUser2[0]?.email).toBe("user2@example.com");

    await client2.close();
  });

  test("getAuthenticatedDb guards access when unauthenticated and exposes db session when authenticated", async () => {
    // 1. Throws when not authenticated
    expect(() => authService.getAuthenticatedDb()).toThrow(
      "Cannot access authenticated database: user is not authenticated"
    );

    // 2. Sign in user
    await authService.signUp({ email: "session@example.com", password: "pwd", name: "Session User" });

    // 3. Exposes the authenticated db instance
    const authDb = authService.getAuthenticatedDb();
    expect(authDb).toBe(db);

    // 4. Can query user-scoped data using the authenticated db session
    const currentUser = await authDb.select<User>(store.currentUser!.id);
    expect(currentUser?.email).toBe("session@example.com");

    // 5. Throws again after sign out
    await authService.signOut();
    expect(() => authService.getAuthenticatedDb()).toThrow();
  });
});
