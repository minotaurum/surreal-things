import { Surreal } from "surrealdb";
import { createWasmEngines } from "@surrealdb/wasm";

export interface CreateTestDbOptions {
  ns?: string;
  db?: string;
  migrationPath?: string;
}

/**
 * Creates an in-memory SurrealDB instance using the mem:// engine,
 * selects the namespace and database, and optionally applies a migration.
 */
export async function createTestDb(
  optionsOrMigration?: string | CreateTestDbOptions
): Promise<Surreal> {
  const options: CreateTestDbOptions =
    typeof optionsOrMigration === "string"
      ? { migrationPath: optionsOrMigration }
      : optionsOrMigration ?? {};

  const ns = options.ns ?? "test";
  const database = options.db ?? "test";

  const db = new Surreal({ engines: createWasmEngines() });
  await db.connect("mem://");
  await db.use({ namespace: ns, database });

  if (options.migrationPath) {
    await applyMigration(db, options.migrationPath);
  }

  return db;
}

/**
 * Reads a migration file using Bun.file and applies it to the SurrealDB instance.
 */
export async function applyMigration(db: Surreal, migrationPath: string) {
  const sql = await Bun.file(migrationPath).text();
  return await db.query(sql);
}

/**
 * Asserts that an async action throws/rejects.
 */
export async function expectThrows(action: () => unknown) {
  let threw = false;
  try {
    await action();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("Expected action to throw, but it succeeded.");
  }
}

