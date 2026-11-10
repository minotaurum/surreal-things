# Vue 3 Reactivity with SurrealDB

SurrealDB SDK classes (`RecordId`, `Table`, `Uuid`, etc.) use native private fields (`#table`, `#id`). 

Vue's `ref()` and `reactive()` wrap objects in a `Proxy`. Because Proxies do not preserve private brand checks, calling methods (`.toString()`, `.id`, `.toJSON()`) or passing proxied IDs to SDK methods throws:

```text
TypeError: Cannot read private member #table from an object whose class did not declare it
```

---

## Solutions

### 1. `shallowRef()` (Recommended default)
Only tracks `.value` replacement. Never proxies nested `RecordId` instances.

```ts
import { shallowRef } from "vue";

const book = shallowRef(await db.select<Book>(bookId));

// Read / SDK calls work directly:
console.log(book.value.id.toString());
await db.update(book.value.id).merge({ pages: 450 });

// Reactive update via replacement:
book.value = { ...book.value, pages: 450 };
```

### 2. `markRaw()` (When deep reactivity is required)
Tells Vue not to proxy the `RecordId`. Use for reactive forms.

```ts
import { markRaw, reactive } from "vue";

const book = await db.select<Book>(bookId);
markRaw(book.id);

const form = reactive(book);
form.pages = 450; // reactive
await db.update(form.id as BookId).merge({ pages: form.pages });
```

### 3. `toRaw()` (Defensive unwrapping)
Extracts the underlying `RecordId` if the object is already proxied.

```ts
import { toRaw } from "vue";

await db.select(toRaw(state.id));
```

---

## Cheat Sheet

| Tool | Proxies `RecordId`? | Safe with SDK? | When to use |
| :--- | :---: | :---: | :--- |
| `shallowRef(record)` | No | Yes | **Default** for all fetched records and Pinia stores. |
| `markRaw(record.id)` | No | Yes | Forms needing deep `reactive()`. |
| `toRaw(proxied.id)` | Unwraps | Yes | Before passing an already-proxied ID to the SDK. |
| `ref(record)` | **Yes** | **No** | Primitives only (`string`, `number`, `boolean`). |
| `reactive(record)` | **Yes** | **No** | Avoid with SurrealDB objects unless using `markRaw`. |
