import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, RecordId } from "surrealdb";
import { ref, reactive, shallowRef, shallowReactive, markRaw, toRaw } from "vue";
import { join } from "node:path";
import { createTestDb } from "../test-helper";

export type BookId = RecordId<"book">;
export type BookPascalId = RecordId<"Book">;

export interface Book {
  id: BookId;
  name: string;
  pages: number;
}

export interface BookPascal {
  id: BookPascalId;
  name: string;
  pages: number;
}

export interface CreateBookInput {
  name: string;
  pages: number;
}

describe("Vue Reactivity & SurrealDB RecordId Example", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  // 1. Basic CRUD using SDK methods
  test("creates and selects a book record using standard SDK methods", async () => {
    const [book] = await db
      .create<Book>(new Table("book"))
      .content({ name: "The Pragmatic Programmer", pages: 352 });

    expect(book).toBeDefined();
    expect(book?.id).toBeInstanceOf(RecordId);
    expect(book?.name).toBe("The Pragmatic Programmer");
    expect(book?.pages).toBe(352);

    const fetched = await db.select<Book>(book!.id);
    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("The Pragmatic Programmer");
    expect(fetched?.pages).toBe(352);
  });

  // 2. The Trap: Naive reactive() breaks private field access
  describe("The Trap: Proxy wrapping loses access to RecordId private members", () => {
    test("reactive() wraps RecordId in a Proxy which throws TypeError on .toString(), .table, .id, .toJSON()", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({ name: "Clean Code", pages: 464 });

      // Naively wrapping book in reactive state
      const state = reactive({ ...book! });

      // Under ECMAScript specifications, private fields (#table, #id) cannot be read from a Proxy:
      // "TypeError: Cannot read private member #table from an object whose class did not declare it"
      expect(() => state.id.toString()).toThrow();
      expect(() => state.id.table).toThrow();
      expect(() => state.id.id).toThrow();
      expect(() => state.id.toJSON()).toThrow();
      expect(() => state.id.equals(book!.id)).toThrow();

      // Passing proxied RecordId to SDK query fails because the SDK accesses internal private members/methods
      let sdkFailed = false;
      try {
        await db.select<Book>(state.id);
      } catch {
        sdkFailed = true;
      }
      expect(sdkFailed).toBe(true);
    });

    test("deep ref() also wraps RecordId in a Proxy causing the exact same failure", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({ name: "Design Patterns", pages: 395 });

      // ref() recursively makes objects reactive
      const bookRef = ref(book!);

      expect(() => bookRef.value.id.toString()).toThrow();
      expect(() => bookRef.value.id.table).toThrow();
      expect(() => bookRef.value.id.id).toThrow();

      // Wrapping a standalone RecordId directly in ref() also fails
      const idRef = ref(book!.id);
      expect(() => idRef.value.toString()).toThrow();
    });
  });

  // 3. Solution 1: markRaw()
  describe("Solution 1: markRaw()", () => {
    test("marking RecordId with markRaw prevents Proxy wrapping and preserves full functionality", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({ name: "Refactoring", pages: 448 });

      // Mark the id as raw (__v_skip = true) before placing in reactive state
      markRaw(book!.id);
      const state = reactive(book!);

      // Normal properties remain fully reactive
      state.pages = 450;
      expect(state.pages).toBe(450);

      // RecordId is untouched, keeping its original instance identity
      expect(state.id.toString()).toBe(book!.id.toString());
      expect(state.id.table.name).toBe("book");
      expect(state.id.id).toBe(book!.id.id);

      // Works cleanly with SDK methods
      const fetched = await db.select<Book>(state.id);
      expect(fetched?.name).toBe("Refactoring");

      // Updating in DB works
      const updated = await db.update<Book>(state.id).merge({ pages: state.pages });
      expect(updated?.pages).toBe(450);
    });
  });

  // 4. Solution 2: shallowRef()
  describe("Solution 2: shallowRef()", () => {
    test("shallowRef keeps container reactive without deeply proxying RecordId", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({
          name: "Structure and Interpretation of Computer Programs",
          pages: 657,
        });

      // shallowRef only tracks .value reference changes, leaving inner objects unproxied
      const bookRef = shallowRef(book!);

      // RecordId methods work directly without throwing
      expect(bookRef.value.id.toString()).toBe(book!.id.toString());
      expect(bookRef.value.id.table.name).toBe("book");
      expect(bookRef.value.id.id).toBe(book!.id.id);

      // Works cleanly with SDK queries
      const fetched = await db.select<Book>(bookRef.value.id);
      expect(fetched?.name).toBe("Structure and Interpretation of Computer Programs");

      // Modifying by replacing .value triggers reactive listeners without proxying
      bookRef.value = { ...bookRef.value, pages: 660 };
      expect(bookRef.value.pages).toBe(660);

      const updated = await db.update<Book>(bookRef.value.id).merge({ pages: bookRef.value.pages });
      expect(updated?.pages).toBe(660);
    });
  });

  // 5. Solution 3: shallowReactive()
  describe("Solution 3: shallowReactive()", () => {
    test("shallowReactive keeps top-level reactive but does not proxy nested RecordId", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({ name: "Domain-Driven Design", pages: 560 });

      // shallowReactive does not convert nested properties into Proxies
      const state = shallowReactive(book!);

      state.pages += 10;
      expect(state.pages).toBe(570);

      expect(state.id.toString()).toBe(book!.id.toString());
      expect(state.id.table.name).toBe("book");

      const fetched = await db.select<Book>(state.id);
      expect(fetched?.name).toBe("Domain-Driven Design");
    });
  });

  // 6. Solution 4: toRaw()
  describe("Solution 4: toRaw()", () => {
    test("extracts the raw RecordId from an already-proxied object", async () => {
      const [book] = await db
        .create<Book>(new Table("book"))
        .content({ name: "JavaScript: The Good Parts", pages: 176 });

      const state = reactive(book!);

      // state.id.toString() throws, but toRaw(state.id) un-proxies the genuine instance
      expect(() => state.id.toString()).toThrow();

      const rawId = toRaw(state.id);
      expect(rawId).toBeInstanceOf(RecordId);
      expect(rawId.toString()).toBe(book!.id.toString());
      expect(rawId.table.name).toBe("book");

      // Querying with toRaw works seamlessly
      const fetched = await db.select<Book>(rawId);
      expect(fetched?.name).toBe("JavaScript: The Good Parts");

      const updated = await db.update<Book>(rawId).merge({ pages: 180 });
      expect(updated?.pages).toBe(180);
    });
  });

  // 7. Practical Composable / Store Pattern
  describe("Vue 3 Composable Pattern (useBook)", () => {
    function useBook(surreal: Surreal) {
      const book = shallowRef<Book | null>(null);
      const loading = ref(false);

      async function load(id: BookId) {
        loading.value = true;
        try {
          const res = await surreal.select<Book>(id);
          book.value = res ?? null;
        } finally {
          loading.value = false;
        }
      }

      async function updatePages(newPages: number) {
        if (!book.value) return;
        const updated = await surreal.update<Book>(book.value.id).merge({ pages: newPages });
        if (updated) {
          book.value = updated;
        }
      }

      return { book, loading, load, updatePages };
    }

    test("composable loads and updates book safely using shallowRef", async () => {
      const [created] = await db
        .create<Book>(new Table("book"))
        .content({ name: "You Don't Know JS", pages: 278 });

      const { book, loading, load, updatePages } = useBook(db);

      expect(book.value).toBeNull();
      expect(loading.value).toBe(false);

      await load(created!.id);
      expect(book.value).toBeDefined();
      expect(book.value?.name).toBe("You Don't Know JS");
      expect(book.value?.pages).toBe(278);

      await updatePages(300);
      expect(book.value?.pages).toBe(300);

      const inDb = await db.select<Book>(created!.id);
      expect(inDb?.pages).toBe(300);
    });
  });

  // 8. PascalCase table support
  test("supports PascalCase 'Book' table shape with standard SDK methods", async () => {
    const [book] = await db
      .create<BookPascal>(new Table("Book"))
      .content({ name: "Clean Architecture", pages: 432 });

    expect(book).toBeDefined();
    expect(book?.name).toBe("Clean Architecture");
    expect(book?.pages).toBe(432);

    const fetched = await db.select<BookPascal>(book!.id);
    expect(fetched?.name).toBe("Clean Architecture");
  });
});
