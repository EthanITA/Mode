import { defineStore as defineStoreOf } from "pinia";

export function defineStore<Id extends string, Setup extends object>(
  id: Id,
  setup: () => Setup,
): ReturnType<typeof defineStoreOf<Id, Setup>>;
// In app/stores the build injects the id from the `$name` variable, so the id is written once.
export function defineStore<Setup extends object>(setup: () => Setup): ReturnType<typeof defineStoreOf<string, Setup>>;
export function defineStore(first: string | (() => object), second?: () => object): unknown {
  if (typeof first === "string" && second) return defineStoreOf(first, second);
  throw new Error(
    "defineStore(setup) takes its id from the build: export it as `export const $name = defineStore(...)` in app/stores, or pass the id.",
  );
}
