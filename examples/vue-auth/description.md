# Vue 3 Authentication with Pinia & SurrealDB

Demonstrates an authentication architecture for Vue 3 applications using SurrealDB Record Access, a dedicated `AuthService` wrapping the SurrealDB SDK, and a Pinia store for reactive token and session management.

## Key Concepts

- **Service Pattern (`AuthService`)**: Wraps the SurrealDB instance to encapsulate authentication workflows (`signUp`, `signIn`, `signOut`, `authenticate`, `getUser`, `updateProfile`), abstracting raw database interactions from UI components.
- **Pinia Token Storage (`useAuthStore`)**: Stores JWT session tokens (`access` and optional `refresh`) and user profile data in a centralized Pinia state store with reactive computed getters (`isAuthenticated`, `accessToken`, `currentUser`).
- **SurrealDB Record Access**: Uses `DEFINE ACCESS account ON DATABASE TYPE RECORD ... WITH REFRESH` with `SIGNUP` (argon2 hashing) and `SIGNIN` (argon2 password comparison) expressions.
- **Session Restoration & Token Rotation (`authenticate`)**: Calling `authenticate()` uses stored tokens to resume the database session. SurrealDB rotates tokens upon authentication and issues new ones; `AuthService` stores the newly issued tokens into Pinia so subsequent authentications succeed, while reusing invalidated old tokens will error.
- **Guarded DB Access (`getAuthenticatedDb`)**: Exposes the active `Surreal` client instance to other domain services or composables when authenticated, ensuring queries run in the user's `$auth` context under RLS, while throwing if called unauthenticated.
- **Vue Reactivity Safety**: Storing user profiles with `shallowRef` preserves `RecordId` instances without exposing them to deep `Proxy` wrapping that could break native private fields.
- **Row-Level Security (RLS)**: Enforces table permissions (`FOR select, update WHERE id = $auth.id`) to guarantee users only read and mutate their own data.

## Architecture

```
┌──────────────────────────────────────────────┐
│             Vue 3 Components / App           │
└───────────────┬──────────────────────────────┘
                │ Calls signUp / signIn / signOut
                ▼
┌──────────────────────────────────────────────┐
│                 AuthService                  │
│  - Wraps SurrealDB instance                  │
│  - Dispatches db.signup / db.signin / etc.   │
│  - Syncs tokens & user to Pinia Store        │
└───────────────┬──────────────────────────────┘
         ┌──────┴──────────────┐
         ▼                     ▼
┌─────────────────┐   ┌────────────────────────┐
│   Pinia Store   │   │  SurrealDB Instance    │
│  (useAuthStore) │   │  - Record Access (JWT) │
│  - tokens       │   │  - User Table & RLS    │
│  - currentUser  │   │  - Argon2 Verification │
└─────────────────┘   └────────────────────────┘
```

## Files

- [migration.surql](./migration.surql): Schema definition for the `user` table and record access configuration.
- [types.ts](./types.ts): TypeScript interfaces for `User`, `UserId`, `SignUpInput`, and `SignInInput`.
- [auth-store.ts](./auth-store.ts): Pinia store defining reactive state for tokens and user profile.
- [auth-service.ts](./auth-service.ts): Service class encapsulating database authentication methods.
- [index.test.ts](./index.test.ts): Automated tests verifying sign up, sign in, token storage, session restoration, and RLS.

## Run

```bash
bun test examples/vue-auth/index.test.ts
```
