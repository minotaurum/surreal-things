-- ==========================================================
-- Projects & Tasks Example Migration
--
-- Graph Relationship Architecture:
--   user -> owns -> project -> has_task -> task
--
-- Nodes:
--   - user: string name, unique email, created_at
--   - project: string name, optional description, created_at
--   - task: string title, optional description, status, priority, created_at
--
-- Edges (TYPE RELATION):
--   - owns: IN user, OUT project
--   - has_task: IN project, OUT task
-- ==========================================================

-- Define Node Tables
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
