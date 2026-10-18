import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, RecordId } from "surrealdb";
import { ref, reactive, shallowRef, shallowReactive, markRaw, toRaw } from "vue";
import { join } from "node:path";
import { createTestDb } from "../test-helper";

export type BookId = RecordId<"book" | "Book">;

export interface Book {
  id: BookId;
  name: string;
  pages: number;
}

describe("Vue Reactivity & SurrealDB RecordId Example", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");
  const bookTable = new Table("book");
  const BookTable = new Table("Book");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("creates and selects a book record using standard SDK methods", async () => {
    const [book] = await db.create<Book>(bookTable).content({ name: "The Pragmatic Programmer", pages: 352 });
    expect(book?.id).toBeInstanceOf(RecordId);
    expect(book?.name).toBe("The Pragmatic Programmer");

    const fetched = await db.select<Book>(book!.id);
    expect(fetched?.pages).toBe(352);
  });

  describe("The Trap: Proxy wrapping loses access to RecordId private members", () => {
    test("reactive() wraps RecordId in a Proxy which throws TypeError on .toString(), .table, .id, .toJSON()", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "Clean Code", pages: 464 });
      const state = reactive({ ...book! });

      try {
        state.id.toString();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
      }
      expect(state.id).not.toBe(book!.id);
    });

    test("deep ref() also wraps RecordId in a Proxy causing the exact same failure", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "Design Patterns", pages: 395 });
      const bookRef = ref(book!);

      try {
        bookRef.value.id.toString();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
      }
      expect(bookRef.value.id).not.toBe(book!.id);
    });
  });

  describe("Solution 1: markRaw()", () => {
    test("marking RecordId with markRaw prevents Proxy wrapping and preserves full functionality", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "Refactoring", pages: 448 });
      markRaw(book!.id);
      const state = reactive(book!);

      state.pages = 450;
      expect(state.pages).toBe(450);
      expect(state.id.toString()).toBe(book!.id.toString());

      const fetched = await db.select<Book>(state.id);
      expect(fetched?.name).toBe("Refactoring");

      const updated = await db.update<Book>(state.id).merge({ pages: state.pages });
      expect(updated?.pages).toBe(450);
    });
  });

  describe("Solution 2: shallowRef()", () => {
    test("shallowRef keeps container reactive without deeply proxying RecordId", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "SICP", pages: 657 });
      const bookRef = shallowRef(book!);

      expect(bookRef.value.id.toString()).toBe(book!.id.toString());

      const fetched = await db.select<Book>(bookRef.value.id);
      expect(fetched?.name).toBe("SICP");

      bookRef.value = { ...bookRef.value, pages: 660 };
      expect(bookRef.value.pages).toBe(660);

      const updated = await db.update<Book>(bookRef.value.id).merge({ pages: bookRef.value.pages });
      expect(updated?.pages).toBe(660);
    });
  });

  describe("Solution 3: shallowReactive()", () => {
    test("shallowReactive keeps top-level reactive but does not proxy nested RecordId", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "DDD", pages: 560 });
      const state = shallowReactive(book!);

      state.pages += 10;
      expect(state.pages).toBe(570);
      expect(state.id.toString()).toBe(book!.id.toString());

      const fetched = await db.select<Book>(state.id);
      expect(fetched?.name).toBe("DDD");
    });
  });

  describe("Solution 4: toRaw()", () => {
    test("extracts the raw RecordId from an already-proxied object", async () => {
      const [book] = await db.create<Book>(bookTable).content({ name: "JS Good Parts", pages: 176 });
      const state = reactive(book!);

      try {
        state.id.toString();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
      }

      const rawId = toRaw(state.id);
      expect(rawId).toBeInstanceOf(RecordId);
      expect(rawId.toString()).toBe(book!.id.toString());

      const fetched = await db.select<Book>(rawId);
      expect(fetched?.name).toBe("JS Good Parts");

      const updated = await db.update<Book>(rawId).merge({ pages: 180 });
      expect(updated?.pages).toBe(180);
    });
  });

  describe("Vue 3 Composable Pattern (useBook)", () => {
    function useBook(surreal: Surreal) {
      const book = shallowRef<Book | null>(null);
      const loading = ref(false);

      async function load(id: BookId) {
        loading.value = true;
        try {
          book.value = (await surreal.select<Book>(id)) ?? null;
        } finally {
          loading.value = false;
        }
      }

      async function updatePages(newPages: number) {
        if (!book.value) return;
        const updated = await surreal.update<Book>(book.value.id).merge({ pages: newPages });
        if (updated) book.value = updated;
      }

      return { book, loading, load, updatePages };
    }

    test("composable loads and updates book safely using shallowRef", async () => {
      const [created] = await db.create<Book>(bookTable).content({ name: "YDKJS", pages: 278 });
      const { book, loading, load, updatePages } = useBook(db);

      expect(book.value).toBeNull();
      expect(loading.value).toBe(false);

      await load(created!.id);
      expect(book.value?.name).toBe("YDKJS");

      await updatePages(300);
      expect(book.value?.pages).toBe(300);

      const inDb = await db.select<Book>(created!.id);
      expect(inDb?.pages).toBe(300);
    });
  });

  test("supports PascalCase 'Book' table shape with standard SDK methods", async () => {
    const [book] = await db.create<Book>(BookTable).content({ name: "Clean Architecture", pages: 432 });
    expect(book?.name).toBe("Clean Architecture");

    const fetched = await db.select<Book>(book!.id);
    expect(fetched?.name).toBe("Clean Architecture");
  });
});
