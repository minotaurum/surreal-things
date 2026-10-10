import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, type RecordId } from "surrealdb";
import { join } from "node:path";
import { createTestDb } from "../test-helper";

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

// Input Types
export interface CreateUserInput {
  name: string;
  email: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  title?: string;
  description?: string;
}

describe("Projects & Tasks Example - Graph Relations", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("creates users, projects, and tasks using standard SDK methods", async () => {
    // 1. Create a user
    const [user] = await db
      .create<User>(new Table("user"))
      .content({
        name: "Alice Developer",
        email: "alice@example.com",
      });

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice Developer");
    expect(user?.email).toBe("alice@example.com");
    expect(user?.id).toBeDefined();

    // 2. Create a project
    const [project] = await db
      .create<Project>(new Table("project"))
      .content({
        name: "Website Redesign",
        description: "Modernize company landing page",
      });

    expect(project).toBeDefined();
    expect(project?.name).toBe("Website Redesign");
    expect(project?.description).toBe("Modernize company landing page");
    expect(project?.id).toBeDefined();

    // 3. Create tasks
    const [task1] = await db
      .create<Task>(new Table("task"))
      .content({
        title: "Build Hero Component",
        description: "Create responsive hero section",
        status: "in_progress",
        priority: "high",
      });

    const [task2] = await db
      .create<Task>(new Table("task"))
      .content({
        title: "Setup CI/CD Pipeline",
        status: "todo",
        priority: "medium",
      });

    expect(task1).toBeDefined();
    expect(task1?.title).toBe("Build Hero Component");
    expect(task1?.status).toBe("in_progress");
    expect(task1?.priority).toBe("high");

    expect(task2).toBeDefined();
    expect(task2?.title).toBe("Setup CI/CD Pipeline");
    expect(task2?.status).toBe("todo");
    expect(task2?.priority).toBe("medium");
  });

  test("connects entities via graph relations using db.relate()", async () => {
    // Create new records
    const [user] = await db
      .create<User>(new Table("user"))
      .content({ name: "Bob Builder", email: "bob@example.com" });

    const [project] = await db
      .create<Project>(new Table("project"))
      .content({ name: "Mobile App" });

    const [task] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Setup Push Notifications", status: "todo" });

    // Link user -> owns -> project
    const ownsEdge = await db.relate<OwnsEdge>(
      user!.id,
      new Table("owns"),
      project!.id
    );

    expect(ownsEdge).toBeDefined();
    expect(ownsEdge?.in.toString()).toBe(user!.id.toString());
    expect(ownsEdge?.out.toString()).toBe(project!.id.toString());

    // Link project -> has_task -> task
    const hasTaskEdge = await db.relate<HasTaskEdge>(
      project!.id,
      new Table("has_task"),
      task!.id
    );

    expect(hasTaskEdge).toBeDefined();
    expect(hasTaskEdge?.in.toString()).toBe(project!.id.toString());
    expect(hasTaskEdge?.out.toString()).toBe(task!.id.toString());
  });

  test("traverses graph relations forward and backward", async () => {
    // Setup: User with 2 projects, project with multiple tasks
    const [user] = await db
      .create<User>(new Table("user"))
      .content({ name: "Carol Manager", email: "carol@example.com" });

    const [projectA] = await db
      .create<Project>(new Table("project"))
      .content({ name: "Project Alpha" });

    const [projectB] = await db
      .create<Project>(new Table("project"))
      .content({ name: "Project Beta" });

    await db.relate(user!.id, new Table("owns"), projectA!.id);
    await db.relate(user!.id, new Table("owns"), projectB!.id);

    const [taskA1] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Alpha Task 1" });
    const [taskA2] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Alpha Task 2" });

    await db.relate(projectA!.id, new Table("has_task"), taskA1!.id);
    await db.relate(projectA!.id, new Table("has_task"), taskA2!.id);

    // 1. Query projects for a user using forward graph traversal: ->owns->project
    const [userProjectsResult] = await db.query<[{ projects: Project[] }]>(
      `SELECT ->owns->project.* AS projects FROM ONLY $userId;`,
      { userId: user!.id }
    );
    expect(userProjectsResult?.projects).toBeDefined();
    expect(userProjectsResult?.projects.length).toBe(2);
    const projectNames = userProjectsResult?.projects.map((p) => p.name);
    expect(projectNames).toContain("Project Alpha");
    expect(projectNames).toContain("Project Beta");

    // 2. Query tasks for a project using forward graph traversal: ->has_task->task
    const [projectTasksResult] = await db.query<[{ tasks: Task[] }]>(
      `SELECT ->has_task->task.* AS tasks FROM ONLY $projectId;`,
      { projectId: projectA!.id }
    );
    expect(projectTasksResult?.tasks).toBeDefined();
    expect(projectTasksResult?.tasks.length).toBe(2);
    const taskTitles = projectTasksResult?.tasks.map((t) => t.title);
    expect(taskTitles).toContain("Alpha Task 1");
    expect(taskTitles).toContain("Alpha Task 2");

    // 3. Query owner of a project using backward graph traversal: <-owns<-user
    const [projectOwnerResult] = await db.query<[{ owner: User[] }]>(
      `SELECT <-owns<-user.* AS owner FROM ONLY $projectId;`,
      { projectId: projectA!.id }
    );
    expect(projectOwnerResult?.owner).toBeDefined();
    expect(projectOwnerResult?.owner.length).toBe(1);
    expect(projectOwnerResult?.owner[0]?.name).toBe("Carol Manager");

    // 4. Multi-hop traversal: Get all tasks of Carol across all her projects
    const [userAllTasksResult] = await db.query<[{ all_tasks: Task[] }]>(
      `SELECT ->owns->project->has_task->task.* AS all_tasks FROM ONLY $userId;`,
      { userId: user!.id }
    );
    expect(userAllTasksResult?.all_tasks).toBeDefined();
    expect(userAllTasksResult?.all_tasks.length).toBe(2);
    const allTitles = userAllTasksResult?.all_tasks.map((t) => t.title);
    expect(allTitles).toContain("Alpha Task 1");
    expect(allTitles).toContain("Alpha Task 2");

    // 5. Backward traversal from task to project and owner
    const [taskContextResult] = await db.query<[{ title: string; project_name: string[]; owner_name: string[] }]>(
      `SELECT title, <-has_task<-project.name AS project_name, <-has_task<-project<-owns<-user.name AS owner_name FROM ONLY $taskId;`,
      { taskId: taskA1!.id }
    );
    expect(taskContextResult?.project_name).toContain("Project Alpha");
    expect(taskContextResult?.owner_name).toContain("Carol Manager");
  });

  test("updates task fields and status via SDK methods", async () => {
    const [task] = await db
      .create<Task>(new Table("task"))
      .content({
        title: "Draft Documentation",
        status: "todo",
        priority: "low",
      });

    // Merge update
    const updated = await db
      .update<Task>(task!.id)
      .merge({
        status: "in_progress",
        priority: "high",
      });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe("in_progress");
    expect(updated?.priority).toBe("high");
    expect(updated?.title).toBe("Draft Documentation");

    // Complete task
    const completed = await db
      .update<Task>(task!.id)
      .merge({ status: "done" });

    expect(completed?.status).toBe("done");
  });

  test("validates schema constraints (enum assertions, email format, schemfull)", async () => {
    // 1. Invalid email
    let invalidEmailFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({ name: "Invalid User", email: "not-an-email" });
    } catch {
      invalidEmailFailed = true;
    }
    expect(invalidEmailFailed).toBe(true);

    // 2. Duplicate email
    await db
      .create<User>(new Table("user"))
      .content({ name: "Original", email: "unique@example.com" });

    let duplicateEmailFailed = false;
    try {
      await db
        .create<User>(new Table("user"))
        .content({ name: "Clone", email: "unique@example.com" });
    } catch {
      duplicateEmailFailed = true;
    }
    expect(duplicateEmailFailed).toBe(true);

    // 3. Invalid task status
    let invalidStatusFailed = false;
    try {
      await db
        .create<Task>(new Table("task"))
        .content({
          title: "Bad Status Task",
          // @ts-expect-error test invalid enum
          status: "pending_review",
        });
    } catch {
      invalidStatusFailed = true;
    }
    expect(invalidStatusFailed).toBe(true);

    // 4. Invalid task priority
    let invalidPriorityFailed = false;
    try {
      await db
        .create<Task>(new Table("task"))
        .content({
          title: "Bad Priority Task",
          // @ts-expect-error test invalid enum
          priority: "urgent",
        });
    } catch {
      invalidPriorityFailed = true;
    }
    expect(invalidPriorityFailed).toBe(true);

    // 5. Extra fields rejected by SCHEMAFULL
    let extraFieldFailed = false;
    try {
      await db
        .create<Project>(new Table("project"))
        .content({
          name: "Project with extra field",
          unexpected: "unexpected value",
        });
    } catch {
      extraFieldFailed = true;
    }
    expect(extraFieldFailed).toBe(true);
  });

  test("validates edge table constraints (in / out record types)", async () => {
    const [user] = await db
      .create<User>(new Table("user"))
      .content({ name: "Dave", email: "dave@example.com" });

    const [task] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Dave Task" });

    // Attempting to relate user directly to task with 'owns' (which expects OUT project) fails
    let invalidEdgeFailed = false;
    try {
      await db.relate(user!.id, new Table("owns"), task!.id as unknown as ProjectId);
    } catch {
      invalidEdgeFailed = true;
    }
    expect(invalidEdgeFailed).toBe(true);
  });

  test("cascade deletes child tasks when a project is deleted", async () => {
    // 1. Create user, project, and 2 tasks connected via edges
    const [user] = await db
      .create<User>(new Table("user"))
      .content({ name: "Eve Lead", email: "eve@example.com" });

    const [project] = await db
      .create<Project>(new Table("project"))
      .content({ name: "Temporary Project" });

    const [task1] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Temp Task 1" });

    const [task2] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Temp Task 2" });

    await db.relate(user!.id, new Table("owns"), project!.id);
    await db.relate(project!.id, new Table("has_task"), task1!.id);
    await db.relate(project!.id, new Table("has_task"), task2!.id);

    // Verify tasks exist
    const selectedTask1 = await db.select<Task>(task1!.id);
    const selectedTask2 = await db.select<Task>(task2!.id);
    expect(selectedTask1).toBeDefined();
    expect(selectedTask2).toBeDefined();

    // 2. Delete the project
    await db.delete(project!.id);

    // 3. Verify project is deleted
    const selectedProject = await db.select<Project>(project!.id);
    expect(selectedProject).toBeUndefined();

    // 4. Verify cascade event deleted child tasks
    const afterDeleteTask1 = await db.select<Task>(task1!.id);
    const afterDeleteTask2 = await db.select<Task>(task2!.id);
    expect(afterDeleteTask1).toBeUndefined();
    expect(afterDeleteTask2).toBeUndefined();

    // 5. Verify the user still exists unharmed
    const selectedUser = await db.select<User>(user!.id);
    expect(selectedUser).toBeDefined();
    expect(selectedUser?.name).toBe("Eve Lead");
  });

  test("deleting an individual task cleans up relation while keeping project intact", async () => {
    const [project] = await db
      .create<Project>(new Table("project"))
      .content({ name: "Stable Project" });

    const [taskToKeep] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Keep this task" });

    const [taskToRemove] = await db
      .create<Task>(new Table("task"))
      .content({ title: "Remove this task" });

    await db.relate(project!.id, new Table("has_task"), taskToKeep!.id);
    await db.relate(project!.id, new Table("has_task"), taskToRemove!.id);

    // Delete single task via SDK
    await db.delete(taskToRemove!.id);

    // Task to remove is gone
    const deletedTask = await db.select<Task>(taskToRemove!.id);
    expect(deletedTask).toBeUndefined();

    // Task to keep is still present
    const keptTask = await db.select<Task>(taskToKeep!.id);
    expect(keptTask).toBeDefined();

    // Project is still intact
    const proj = await db.select<Project>(project!.id);
    expect(proj).toBeDefined();

    // Project only has 1 task remaining in graph traversal
    const [remainingTasksResult] = await db.query<[{ tasks: Task[] }]>(
      `SELECT ->has_task->task.* AS tasks FROM ONLY $projectId;`,
      { projectId: project!.id }
    );
    expect(remainingTasksResult?.tasks.length).toBe(1);
    expect(remainingTasksResult?.tasks[0]?.title).toBe("Keep this task");
  });
});
