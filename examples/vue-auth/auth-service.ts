import type { Surreal, Token, Tokens } from "surrealdb";
import { useAuthStore, type AuthStore } from "./auth-store";
import type { User, SignUpInput, SignInInput } from "./types";

/**
 * AuthService wraps a SurrealDB instance and handles user authentication,
 * automatically synchronizing session tokens and profile state with a Pinia store.
 */
export class AuthService {
  readonly db: Surreal;
  readonly store: AuthStore;
  readonly accessName: string;

  constructor(
    db: Surreal,
    store?: AuthStore,
    accessName: string = "account"
  ) {
    this.db = db;
    this.store = store ?? useAuthStore();
    this.accessName = accessName;
  }

  /**
   * Signs up a new user via SurrealDB Record Access, persists the issued
   * tokens into the Pinia store, and fetches the authenticated user profile.
   */
  async signUp(input: SignUpInput): Promise<Tokens> {
    const tokens = await this.db.signup({
      access: this.accessName,
      variables: {
        email: input.email,
        password: input.password,
        name: input.name,
      },
    });

    this.store.setTokens(tokens);

    try {
      const user = await this.db.auth<User>();
      if (user) {
        this.store.setUser(user);
      }
    } catch {
      // SurrealDB may not return an auth record immediately on certain custom access rules
    }

    return tokens;
  }

  /**
   * Signs in an existing user with email and password, persists the issued
   * tokens into the Pinia store, and fetches the authenticated user profile.
   */
  async signIn(input: SignInInput): Promise<Tokens> {
    const tokens = await this.db.signin({
      access: this.accessName,
      variables: {
        email: input.email,
        password: input.password,
      },
    });

    this.store.setTokens(tokens);

    try {
      const user = await this.db.auth<User>();
      if (user) {
        this.store.setUser(user);
      }
    } catch {
      // Record access query may be empty if credentials fail before throwing
    }

    return tokens;
  }

  /**
   * Invalidates the active SurrealDB session and purges tokens and user state
   * from the Pinia store.
   */
  async signOut(): Promise<void> {
    try {
      await this.db.invalidate();
    } finally {
      this.store.clear();
    }
  }

  /**
   * Restores an active session using an existing token or the token currently
   * stored in Pinia. Useful on application bootstrap or page refresh.
   */
  async authenticate(tokenOrTokens?: Token | Tokens): Promise<boolean> {
    const token = tokenOrTokens ?? this.store.tokens;
    if (!token) {
      return false;
    }

    await this.db.authenticate(token);

    if (typeof token === "string") {
      this.store.setTokens({ access: token });
    } else {
      this.store.setTokens(token);
    }

    try {
      const user = await this.db.auth<User>();
      if (user) {
        this.store.setUser(user);
      }
    } catch {
      // Ignore if auth record is inaccessible
    }

    return true;
  }

  /**
   * Fetches the currently authenticated user record from SurrealDB.
   * Returns undefined if unauthenticated or session is invalid.
   */
  async getUser(): Promise<User | undefined> {
    if (!this.store.isAuthenticated) {
      return undefined;
    }

    try {
      const user = await this.db.auth<User>();
      if (user) {
        this.store.setUser(user);
        return user;
      }
      return undefined;
    } catch {
      // SurrealDB throws when SELECT * FROM ONLY $auth has no authenticated record
      return undefined;
    }
  }

  /**
   * Updates fields on the authenticated user's record using standard SDK methods,
   * keeping the Pinia store in sync.
   */
  async updateProfile(
    data: Partial<Pick<User, "name" | "email">>
  ): Promise<User | undefined> {
    const user = this.store.currentUser ?? (await this.getUser());
    if (!user) {
      throw new Error("Cannot update profile: user is not authenticated");
    }

    const updated = await this.db.update<User>(user.id).merge(data);
    if (updated) {
      this.store.setUser(updated);
      return updated;
    }
    return undefined;
  }

  get isAuthenticated(): boolean {
    return this.store.isAuthenticated;
  }

  get tokens(): Tokens | null {
    return this.store.tokens;
  }

  get currentUser(): User | null {
    return this.store.currentUser;
  }
}
