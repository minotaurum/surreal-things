# Projects & Tasks Example (Graph Relations)

This example demonstrates how to model and query hierarchical data (Users $\rightarrow$ Projects $\rightarrow$ Tasks) in **SurrealDB** using first-class **graph relations** (`TYPE RELATION`) and SurrealDB's JavaScript/TypeScript SDK.

## Overview

The example showcases:
- **Graph Relationship Architecture**: Connecting entities through dedicated edge tables:
  - `user -> owns -> project`
  - `project -> has_task -> task`
- **Node Tables (`SCHEMAFULL`)**:
  - `user`: User account with unique validated email.
  - `project`: Project metadata (name, optional description).
  - `task`: Actionable items with status and priority enums.
- **Edge Relation Tables (`TYPE RELATION`)**:
  - `owns`: Defined with `IN user OUT project SCHEMAFULL`.
  - `has_task`: Defined with `IN project OUT task SCHEMAFULL`.
  - Automatic validation of `in` and `out` record types by SurrealDB.
- **SDK Relation Operations**:
  - Creating graph edges with the standard SDK method `db.relate(from, new Table("..."), to)`.
- **Graph Traversal & Queries**:
  - Forward traversal: Fetching a user's projects (`->owns->project.*`) and a project's tasks (`->has_task->task.*`).
  - Backward traversal: Looking up a project's owner (`<-owns<-user.*`).
  - Multi-hop traversal: Retrieving all tasks belonging to a user across all their projects (`->owns->project->has_task->task.*`).
  - Reverse context navigation: Resolving project and owner names from a single task (`<-has_task<-project.name`, `<-has_task<-project<-owns<-user.name`).
- **Cascade Deletion via Table Events**:
  - Using `DEFINE EVENT project_deleted ON project` to automatically cascade delete child tasks and incident edges when a project is deleted.
- **Partial Updates & Cleanup**:
  - Updating task status and fields using `db.update(id).merge(...)`.
  - Verifying single task deletion cleans up relation edges while keeping parent projects intact.

---

## Schema Definition (`migration.surql`)

### 1. Node Tables

```surql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD name ON user TYPE string;
DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD created_at ON user TYPE datetime DEFAULT time::now();
DEFINE INDEX user_email ON user FIELDS email UNIQUE;

DEFINE TABLE project SCHEMAFULL;
DEFINE FIELD name ON project TYPE string;
DEFINE FIELD description ON project TYPE option<string>;
DEFINE FIELD created_at ON project TYPE datetime DEFAULT time::now();

DEFINE TABLE task SCHEMAFULL;
DEFINE FIELD title ON task TYPE string;
DEFINE FIELD description ON task TYPE option<string>;
DEFINE FIELD status ON task TYPE string 
    DEFAULT 'todo' 
    ASSERT $value IN ['todo', 'in_progress', 'done', 'cancelled'];
DEFINE FIELD priority ON task TYPE string 
    DEFAULT 'medium' 
    ASSERT $value IN ['low', 'medium', 'high'];
DEFINE FIELD created_at ON task TYPE datetime DEFAULT time::now();
```

### 2. Edge Tables & Event

```surql
-- Define Edge Tables
DEFINE TABLE owns TYPE RELATION IN user OUT project SCHEMAFULL;
DEFINE FIELD created_at ON owns TYPE datetime DEFAULT time::now();

DEFINE TABLE has_task TYPE RELATION IN project OUT task SCHEMAFULL;
DEFINE FIELD created_at ON has_task TYPE datetime DEFAULT time::now();

-- Cascade delete child tasks when project is deleted
DEFINE EVENT project_deleted ON project WHEN $event = "DELETE" THEN (
    IF $before.out != NONE THEN
        DELETE $before.out
    END
);
```

- **`TYPE RELATION IN ... OUT ...`**: Enforces that edges only connect valid record types (e.g. `owns` must start at `user` and point to `project`).
- **`DEFINE EVENT ...`**: Automatically triggers when a project and its connected edges are deleted, removing associated child tasks.

---

## Test Coverage (`index.test.ts`)

The test suite validates schema enforcement, graph relations, and lifecycle operations:

1. **Record Creation**: Creates users, projects, and tasks using standard SDK `db.create()`.
2. **Graph Linking with `db.relate()`**: Connects users to projects via `owns` and projects to tasks via `has_task`.
3. **Graph Traversal**:
   - Resolves all projects owned by a user (`->owns->project.*`).
   - Resolves all tasks in a project (`->has_task->task.*`).
   - Traverses backward to identify project ownership (`<-owns<-user.*`).
   - Executes multi-hop queries from user down to tasks (`->owns->project->has_task->task.*`).
   - Traverses backward from task to obtain parent project and owner context.
4. **Task Updates**: Uses `db.update(id).merge(...)` for status transitions.
5. **Schema Validation**: Tests email assertion, unique constraint, enum bounds, and extra field rejection (`SCHEMAFULL`).
6. **Edge Type Safety**: Confirms invalid edge combinations (e.g., trying to link `user` directly to `task` via `owns`) are rejected.
7. **Cascade Deletion**: Validates that deleting a project cascades to delete its child tasks and edges while preserving the user.
8. **Single Task Deletion**: Validates that deleting an individual task removes its edge while keeping the project intact.

---

## Running the Tests

Execute tests using Bun:

```bash
bun test examples/projects-tasks/index.test.ts
```
