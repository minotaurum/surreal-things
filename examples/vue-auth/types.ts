import type { RecordId } from "surrealdb";

export type UserId = RecordId<"user">;

export interface User {
  id: UserId;
  email: string;
  name: string;
  password?: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
}

export interface SignInInput {
  email: string;
  password: string;
}
