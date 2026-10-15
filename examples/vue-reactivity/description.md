# Vue 3 Reactivity & SurrealDB RecordId

Demonstrates how Vue 3 reactivity interacts with SurrealDB SDK objects (`RecordId`, `Table`, etc.) and how to prevent private field proxy errors.

## The Problem

SurrealDB SDK objects use native private fields (`#table`, `#id`). Vue's `reactive()` and deep `ref()` wrap nested objects in JavaScript `Proxy` instances. Because `Proxy` does not preserve private brands, calling getters or methods (`.toString()`, `.table`, `.id`, `.toJSON()`) or passing proxied IDs to the SDK throws:

```
TypeError: Cannot read private member #table from an object whose class did not declare it
```

## Solutions

1. **`shallowRef()` (Recommended)**: Tracks `.value` replacement without proxying nested properties.
   ```ts
   const book = shallowRef<Book>(fetchedBook);
   await db.select(book.value.id);
   ```
2. **`markRaw(record.id)`**: Prevents Vue from proxying the `RecordId` inside deep `reactive()`.
   ```ts
   markRaw(book.id);
   const state = reactive(book);
   ```
3. **`shallowReactive()`**: Keeps top-level properties reactive without proxying nested objects.
4. **`toRaw(state.id)`**: Extracts the underlying `RecordId` from an already-proxied object before passing to SDK methods.

See [migration.surql](./migration.surql) for schema and [index.test.ts](./index.test.ts) for executable tests including the `useBook` composable.

## Run

```bash
bun test examples/vue-reactivity/index.test.ts
```
