-- ==========================================================
-- Datetime Field Example Migration
--
-- Table: event
-- Fields:
--   - title: string
--   - scheduled_at: datetime
--   - created_at: datetime (defaults to time::now())
--   - updated_at: option<datetime>
-- ==========================================================

DEFINE TABLE event SCHEMAFULL;

DEFINE FIELD title ON event TYPE string;
DEFINE FIELD scheduled_at ON event TYPE datetime;
DEFINE FIELD created_at ON event TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON event TYPE option<datetime>;
