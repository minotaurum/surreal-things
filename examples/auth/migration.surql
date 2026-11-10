-- ==========================================================
-- Auth Example Migration
--
-- Table: User (and user)
-- Fields:
--   - email: string, valid format, unique
--   - password: string
--   - name: string
-- ==========================================================

-- Define schema for `user` table (standard SurrealDB lowercase convention)
DEFINE TABLE user SCHEMAFULL
    PERMISSIONS
        FOR select, update WHERE id = $auth.id,
        FOR create, delete NONE;

DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD password ON user TYPE string;
DEFINE FIELD name ON user TYPE string;

DEFINE INDEX user_email ON user FIELDS email UNIQUE;

-- Define schema for `User` table (PascalCase convention)
DEFINE TABLE User SCHEMAFULL
    PERMISSIONS
        FOR select, update WHERE id = $auth.id,
        FOR create, delete NONE;

DEFINE FIELD email ON User TYPE string ASSERT string::is_email($value);
DEFINE FIELD password ON User TYPE string;
DEFINE FIELD name ON User TYPE string;

DEFINE INDEX User_email ON User FIELDS email UNIQUE;

-- Record access method for authentication (signup / signin)
DEFINE ACCESS account ON DATABASE TYPE RECORD
    SIGNUP (
        CREATE user CONTENT {
            email: $email,
            password: crypto::argon2::generate($password),
            name: $name
        }
    )
    SIGNIN (
        SELECT * FROM user
        WHERE email = $email
          AND crypto::argon2::compare(password, $password)
    )
    WITH REFRESH;
