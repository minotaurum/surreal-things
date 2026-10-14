-- ==========================================================
-- Vue Reactivity & SurrealDB RecordId Example Migration
--
-- Table: book (and Book for PascalCase convention)
-- Fields:
--   - name: string
--   - pages: int (> 0)
-- ==========================================================

-- Standard SurrealDB lowercase convention
DEFINE TABLE book SCHEMAFULL;

DEFINE FIELD name ON book TYPE string;
DEFINE FIELD pages ON book TYPE int ASSERT $value > 0;

-- PascalCase convention support
DEFINE TABLE Book SCHEMAFULL;

DEFINE FIELD name ON Book TYPE string;
DEFINE FIELD pages ON Book TYPE int ASSERT $value > 0;
