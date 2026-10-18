import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
import type { Tokens } from "surrealdb";
import type { User } from "./types";

export const useAuthStore = defineStore("auth", () => {
  // Store authentication tokens in Pinia state
  const tokens = ref<Tokens | null>(null);

  // Store user record using shallowRef to avoid proxy wrapping RecordId private members
  const user = shallowRef<User | null>(null);

  // Reactive getters
  const isAuthenticated = computed(() => Boolean(tokens.value?.access));
  const accessToken = computed(() => tokens.value?.access ?? null);
  const refreshToken = computed(() => tokens.value?.refresh ?? null);
  const currentUser = computed(() => user.value);

  // Actions
  function setTokens(newTokens: Tokens | null) {
    tokens.value = newTokens;
  }

  function setUser(newUser: User | null) {
    user.value = newUser;
  }

  function clear() {
    tokens.value = null;
    user.value = null;
  }

  return {
    tokens,
    user,
    isAuthenticated,
    accessToken,
    refreshToken,
    currentUser,
    setTokens,
    setUser,
    clear,
  };
});

export type AuthStore = ReturnType<typeof useAuthStore>;
