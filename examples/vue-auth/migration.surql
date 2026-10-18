-- ==========================================================
-- Vue Auth Example Migration
--
-- Table: user
-- Fields:
--   - email: string, valid format, unique
--   - password: string
--   - name: string
-- ==========================================================

-- Define schema for `user` table
DEFINE TABLE user SCHEMAFULL
    PERMISSIONS
        FOR select, update WHERE id = $auth.id,
        FOR create, delete NONE;

DEFINE FIELD email ON user TYPE string ASSERT string::is_email($value);
DEFINE FIELD password ON user TYPE string PERMISSIONS FOR select NONE;
DEFINE FIELD name ON user TYPE string;

DEFINE INDEX user_email ON user FIELDS email UNIQUE;

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
    );
