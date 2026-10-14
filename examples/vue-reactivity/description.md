# Vue 3 Reactivity & SurrealDB RecordId Example

This example demonstrates how **Vue 3's reactivity system** (`ref`, `reactive`, `shallowRef`, `shallowReactive`, `markRaw`, `toRaw`) interacts with **SurrealDB JavaScript SDK (v2)** data structures, with a specific focus on **`RecordId`** and other SDK classes that use ECMAScript private fields (`#field`).

---

## The Core Problem: JavaScript Private Members & Proxies

SurrealDB's JavaScript SDK encapsulates internal state in classes like `RecordId`, `Table`, `StringRecordId`, `DateTime`, `Decimal`, `Duration`, and `Uuid` using native ECMAScript private fields (e.g., `#table` and `#id`):

```ts
class RecordId extends Value {
  #table: Table;
  #id: RecordIdValue;

  get table() {
    return this.#table;
  }

  get id() {
    return this.#id;
  }

  toString() {
    return `${escapeIdent(this.#table.name)}:${escapeIdPart(this.#id)}`;
  }
}
```

### Why Naive `reactive()` and Deep `ref()` Break

Vue 3's reactivity system is powered by JavaScript `Proxy` objects:
- When you pass a plain object to `reactive(book)` or deep `ref(book)`, Vue recursively wraps nested object properties into reactive Proxies.
- In JavaScript, **private identifiers (`#field`) are strictly branded to the class instance**. A `Proxy` is an independent object wrapping the target instance—it does not inherit the target's private brand.
- When you invoke a method or getter on a proxied `RecordId` (such as `state.id.toString()`, `state.id.table`, `state.id.id`, or `state.id.toJSON()`), the method executes with `this` bound to the **Proxy**, not the original `RecordId` instance.

The JavaScript runtime immediately throws:

```
TypeError: Cannot read private member #table from an object whose class did not declare it
```

This also breaks queries when passing the proxied ID to SDK methods:

```ts
// ❌ FAILS with TypeError:
const state = reactive(book);
await db.select(state.id); // SDK calls .toString() / accesses private fields during serialization
```

---

## Schema Definition (`migration.surql`)

For this example, we model a `book` table with a `name` and `pages` (page count):

```surql
DEFINE TABLE book SCHEMAFULL;

DEFINE FIELD name ON book TYPE string;
DEFINE FIELD pages ON book TYPE int ASSERT $value > 0;

-- PascalCase convention support
DEFINE TABLE Book SCHEMAFULL;

DEFINE FIELD name ON Book TYPE string;
DEFINE FIELD pages ON Book TYPE int ASSERT $value > 0;
```

---

## The Four Solutions in Vue 3

### Solution 1: `markRaw()` (Best for Deep Reactive State)

Vue provides `markRaw(obj)`, which attaches a non-enumerable `__v_skip = true` property to the object. Vue's reactivity system detects this flag and **never** wraps the object in a Proxy:

```ts
import { reactive, markRaw } from "vue";

// Mark the RecordId as raw before placing it into reactive state
markRaw(book.id);

const state = reactive(book);

// ✅ Works: Book fields remain reactive
state.pages = 450;

// ✅ Works: RecordId methods and getters operate on the original instance
console.log(state.id.toString()); // "book:pragmatic"
console.log(state.id.table.name); // "book"

// ✅ Works: Can be passed directly to SurrealDB SDK methods
await db.update(state.id).merge({ pages: state.pages });
```

> **Helper Tip**: If you regularly fetch records from SurrealDB, you can create a helper to mark `id` on incoming records:
> ```ts
> export function markRecordRaw<T extends { id: RecordId }>(record: T): T {
>   markRaw(record.id);
>   return record;
> }
> ```

---

### Solution 2: `shallowRef()` (Recommended Modern Vue 3 Pattern)

In modern Vue 3 (Composition API / Pinia), complex external instances and SDK models are best stored using `shallowRef()`. 

Unlike `ref()`, `shallowRef()` only tracks mutations to `.value` itself, leaving the inner properties completely un-proxied:

```ts
import { shallowRef } from "vue";

const book = shallowRef<Book>(fetchedBook);

// ✅ Works: id is NOT a Proxy
console.log(book.value.id.toString());
await db.select(book.value.id);

// ✅ Reactive updates by replacing .value or mutating and reassigning:
book.value = { ...book.value, pages: 660 };
```

---

### Solution 3: `shallowReactive()`

If you need top-level properties of a reactive container to be directly mutable without wrapping nested objects:

```ts
import { shallowReactive } from "vue";

const state = shallowReactive(book);

// ✅ Works: Top-level properties are reactive
state.pages += 10;

// ✅ Works: Nested objects (like id) are not wrapped in Proxies
console.log(state.id.toString());
await db.select(state.id);
```

---

### Solution 4: `toRaw()` (Extracting from Existing Reactive State)

If you are working in an existing codebase where records are already wrapped in deep reactive proxies, you can un-wrap the `RecordId` using `toRaw()` before invoking methods or passing to SurrealDB:

```ts
import { reactive, toRaw } from "vue";

const state = reactive(book);

// ❌ Throws TypeError:
// state.id.toString();

// ✅ Works: toRaw extracts the underlying RecordId instance
const rawId = toRaw(state.id);
console.log(rawId.toString());

// ✅ Works with SDK methods:
await db.select(rawId);
await db.update(rawId).merge({ pages: 180 });
```

---

## Production Pattern: Vue 3 Composable (`useBook`)

Here is how to structure a production-ready Vue 3 composable that interfaces with SurrealDB using `shallowRef`:

```ts
import { ref, shallowRef } from "vue";
import type { Surreal } from "surrealdb";
import type { Book, BookId } from "./index.test";

export function useBook(surreal: Surreal) {
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
```

---

## Test Coverage (`index.test.ts`)

The test suite validates both the failure modes and all four resolution strategies against an in-memory SurrealDB instance:

1. **Standard CRUD**: Confirms valid creation and fetching of `book` records via SDK methods.
2. **The Trap (reactive)**: Verifies that accessing `.toString()`, `.table`, `.id`, `.toJSON()`, or querying with a proxied `RecordId` throws `TypeError`.
3. **The Trap (ref)**: Verifies that deep `ref()` and standalone `ref(recordId)` produce the exact same failure.
4. **Solution 1 (`markRaw`)**: Demonstrates that marking the ID allows reactive state updates while preserving full `RecordId` and SDK query functionality.
5. **Solution 2 (`shallowRef`)**: Validates that `shallowRef` tracks container updates while leaving `RecordId` untouched.
6. **Solution 3 (`shallowReactive`)**: Demonstrates top-level reactivity without proxying nested `RecordId`s.
7. **Solution 4 (`toRaw`)**: Demonstrates extracting the raw `RecordId` from already-proxied objects for safe SDK interaction.
8. **Vue Composable Pattern**: Demonstrates end-to-end loading, reactive state management, and updates via `useBook`.
9. **PascalCase Convention**: Verifies compatibility with the `Book` table.

---

## Running the Tests

Execute tests using Bun:

```bash
bun test examples/vue-reactivity/index.test.ts
```
