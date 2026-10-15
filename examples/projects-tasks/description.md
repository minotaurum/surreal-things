# Projects & Tasks (Graph Relations)

Demonstrates hierarchical data modeling (`User -> Project -> Task`) using SurrealDB first-class graph relations (`TYPE RELATION`) and the JavaScript SDK.

## Key Concepts

- **Edge tables (`TYPE RELATION`)**: `owns` (`IN user OUT project`) and `has_task` (`IN project OUT task`) enforce relation endpoints at the schema level.
- **SDK relations**: Link records with `db.relate(from, new Table("..."), to)`.
- **Graph traversal**:
  - Forward: `user->owns->project.*`, `project->has_task->task.*`
  - Backward: `project<-owns<-user.*`
  - Multi-hop: `user->owns->project->has_task->task.*`
- **Cascade deletion (`DEFINE EVENT`)**: `project_deleted` event automatically deletes child tasks when a project is removed.

See [migration.surql](./migration.surql) for schema and [index.test.ts](./index.test.ts) for query and traversal tests.

## Run

```bash
bun test examples/projects-tasks/index.test.ts
```
