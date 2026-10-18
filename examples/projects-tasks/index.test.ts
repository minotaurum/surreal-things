import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, type RecordId } from "surrealdb";
import { join } from "node:path";
import { createTestDb, expectThrows } from "../test-helper";

// Entity Record IDs
export type UserId = RecordId<"user">;
export type ProjectId = RecordId<"project">;
export type TaskId = RecordId<"task">;
export type OwnsId = RecordId<"owns">;
export type HasTaskId = RecordId<"has_task">;

// Entity Models
export interface User {
  id: UserId;
  name: string;
  email: string;
  created_at: string;
}

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  created_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: TaskId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
}

// Edge Models
export interface OwnsEdge {
  id: OwnsId;
  in: UserId;
  out: ProjectId;
  created_at: string;
}

export interface HasTaskEdge {
  id: HasTaskId;
  in: ProjectId;
  out: TaskId;
  created_at: string;
}

describe("Projects & Tasks Example - Graph Relations", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");
  const userTable = new Table("user");
  const projectTable = new Table("project");
  const taskTable = new Table("task");
  const ownsTable = new Table("owns");
  const hasTaskTable = new Table("has_task");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("creates users, projects, and tasks using standard SDK methods", async () => {
    const [user] = await db.create<User>(userTable).content({ name: "Alice Developer", email: "alice@example.com" });
    const [project] = await db.create<Project>(projectTable).content({ name: "Website Redesign", description: "Modernize company landing page" });
    const [task1] = await db.create<Task>(taskTable).content({ title: "Build Hero Component", status: "in_progress", priority: "high" });
    const [task2] = await db.create<Task>(taskTable).content({ title: "Setup CI/CD Pipeline", status: "todo", priority: "medium" });

    expect(user?.name).toBe("Alice Developer");
    expect(project?.name).toBe("Website Redesign");
    expect(task1?.title).toBe("Build Hero Component");
    expect(task2?.status).toBe("todo");
  });

  test("connects entities via graph relations using db.relate()", async () => {
    const [user] = await db.create<User>(userTable).content({ name: "Bob Builder", email: "bob@example.com" });
    const [project] = await db.create<Project>(projectTable).content({ name: "Mobile App" });
    const [task] = await db.create<Task>(taskTable).content({ title: "Setup Push Notifications", status: "todo" });

    const ownsEdge = await db.relate<OwnsEdge>(user!.id, ownsTable, project!.id);
    expect(ownsEdge?.in.toString()).toBe(user!.id.toString());
    expect(ownsEdge?.out.toString()).toBe(project!.id.toString());

    const hasTaskEdge = await db.relate<HasTaskEdge>(project!.id, hasTaskTable, task!.id);
    expect(hasTaskEdge?.in.toString()).toBe(project!.id.toString());
    expect(hasTaskEdge?.out.toString()).toBe(task!.id.toString());
  });

  test("traverses graph relations forward and backward", async () => {
    const [user] = await db.create<User>(userTable).content({ name: "Carol Manager", email: "carol@example.com" });
    const [projectA] = await db.create<Project>(projectTable).content({ name: "Project Alpha" });
    const [projectB] = await db.create<Project>(projectTable).content({ name: "Project Beta" });

    await db.relate(user!.id, ownsTable, projectA!.id);
    await db.relate(user!.id, ownsTable, projectB!.id);

    const [taskA1] = await db.create<Task>(taskTable).content({ title: "Alpha Task 1" });
    const [taskA2] = await db.create<Task>(taskTable).content({ title: "Alpha Task 2" });

    await db.relate(projectA!.id, hasTaskTable, taskA1!.id);
    await db.relate(projectA!.id, hasTaskTable, taskA2!.id);

    // Forward: user -> owns -> project
    const [userProjects] = await db.query<[{ projects: Project[] }]>(
      `SELECT ->owns->project.* AS projects FROM ONLY $userId;`,
      { userId: user!.id }
    );
    expect(userProjects?.projects.map((p) => p.name)).toEqual(expect.arrayContaining(["Project Alpha", "Project Beta"]));

    // Forward: project -> has_task -> task
    const [projectTasks] = await db.query<[{ tasks: Task[] }]>(
      `SELECT ->has_task->task.* AS tasks FROM ONLY $projectId;`,
      { projectId: projectA!.id }
    );
    expect(projectTasks?.tasks.map((t) => t.title)).toEqual(expect.arrayContaining(["Alpha Task 1", "Alpha Task 2"]));

    // Backward: project <- owns <- user
    const [projectOwner] = await db.query<[{ owner: User[] }]>(
      `SELECT <-owns<-user.* AS owner FROM ONLY $projectId;`,
      { projectId: projectA!.id }
    );
    expect(projectOwner?.owner[0]?.name).toBe("Carol Manager");

    // Multi-hop: user -> owns -> project -> has_task -> task
    const [userTasks] = await db.query<[{ all_tasks: Task[] }]>(
      `SELECT ->owns->project->has_task->task.* AS all_tasks FROM ONLY $userId;`,
      { userId: user!.id }
    );
    expect(userTasks?.all_tasks.length).toBe(2);

    // Backward: task <- has_task <- project <- owns <- user
    const [taskContext] = await db.query<[{ project_name: string[]; owner_name: string[] }]>(
      `SELECT <-has_task<-project.name AS project_name, <-has_task<-project<-owns<-user.name AS owner_name FROM ONLY $taskId;`,
      { taskId: taskA1!.id }
    );
    expect(taskContext?.project_name).toContain("Project Alpha");
    expect(taskContext?.owner_name).toContain("Carol Manager");
  });

  test("updates task fields and status via SDK methods", async () => {
    const [task] = await db.create<Task>(taskTable).content({ title: "Draft Documentation", status: "todo", priority: "low" });

    const updated = await db.update<Task>(task!.id).merge({ status: "in_progress", priority: "high" });
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("high");

    const completed = await db.update<Task>(task!.id).merge({ status: "done" });
    expect(completed?.status).toBe("done");
  });

  test("validates schema constraints (enum assertions, email format, schemfull)", async () => {
    await expectThrows(() => db.create<User>(userTable).content({ name: "Invalid", email: "not-an-email" }));

    await db.create<User>(userTable).content({ name: "Original", email: "unique@example.com" });
    await expectThrows(() => db.create<User>(userTable).content({ name: "Clone", email: "unique@example.com" }));

    // @ts-expect-error test invalid enum
    await expectThrows(() => db.create<Task>(taskTable).content({ title: "Bad", status: "pending_review" }));
    // @ts-expect-error test invalid enum
    await expectThrows(() => db.create<Task>(taskTable).content({ title: "Bad", priority: "urgent" }));

    await expectThrows(() => db.create<Project>(projectTable).content({ name: "Extra", unexpected: "val" }));
  });

  test("validates edge table constraints (in / out record types)", async () => {
    const [user] = await db.create<User>(userTable).content({ name: "Dave", email: "dave@example.com" });
    const [task] = await db.create<Task>(taskTable).content({ title: "Dave Task" });

    await expectThrows(() => db.relate(user!.id, ownsTable, task!.id as unknown as ProjectId));
  });

  test("cascade deletes child tasks when a project is deleted", async () => {
    const [user] = await db.create<User>(userTable).content({ name: "Eve Lead", email: "eve@example.com" });
    const [project] = await db.create<Project>(projectTable).content({ name: "Temporary Project" });
    const [task1] = await db.create<Task>(taskTable).content({ title: "Temp Task 1" });
    const [task2] = await db.create<Task>(taskTable).content({ title: "Temp Task 2" });

    await db.relate(user!.id, ownsTable, project!.id);
    await db.relate(project!.id, hasTaskTable, task1!.id);
    await db.relate(project!.id, hasTaskTable, task2!.id);

    await db.delete(project!.id);

    expect(await db.select<Project>(project!.id)).toBeUndefined();
    expect(await db.select<Task>(task1!.id)).toBeUndefined();
    expect(await db.select<Task>(task2!.id)).toBeUndefined();
    expect((await db.select<User>(user!.id))?.name).toBe("Eve Lead");
  });

  test("deleting an individual task cleans up relation while keeping project intact", async () => {
    const [project] = await db.create<Project>(projectTable).content({ name: "Stable Project" });
    const [taskToKeep] = await db.create<Task>(taskTable).content({ title: "Keep this task" });
    const [taskToRemove] = await db.create<Task>(taskTable).content({ title: "Remove this task" });

    await db.relate(project!.id, hasTaskTable, taskToKeep!.id);
    await db.relate(project!.id, hasTaskTable, taskToRemove!.id);

    await db.delete(taskToRemove!.id);

    expect(await db.select<Task>(taskToRemove!.id)).toBeUndefined();
    expect(await db.select<Task>(taskToKeep!.id)).toBeDefined();
    expect(await db.select<Project>(project!.id)).toBeDefined();

    const [remaining] = await db.query<[{ tasks: Task[] }]>(
      `SELECT ->has_task->task.* AS tasks FROM ONLY $projectId;`,
      { projectId: project!.id }
    );
    expect(remaining?.tasks.length).toBe(1);
    expect(remaining?.tasks[0]?.title).toBe("Keep this task");
  });
});
