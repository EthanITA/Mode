import { defineStore as defineStoreOf } from "pinia";
import { isRef, toRaw, toRef } from "vue";

// Pinia's setup store with state and getters as refs, so `const { isFull } = $artifact()` stays reactive.
function build<Id extends string, Setup extends object>(id: Id, setup: () => Setup) {
  const useStore = defineStoreOf(id, setup);
  type Base = ReturnType<typeof useStore>;
  type Wrapped = Setup & Omit<Base, keyof Setup>;

  const wrapped = new WeakMap<Base, Wrapped>();

  function wrap(store: Base): Wrapped {
    const refs = new Map<string | symbol, unknown>();
    // A Proxy rather than a copy, so actions, `$patch` and `$subscribe` stay the store's own.
    return new Proxy(store, {
      get(target, key) {
        // Looked up per access, since HMR and plugins add keys after the first call.
        if (!isRef(Reflect.get(toRaw(target), key))) return Reflect.get(target, key);
        if (!refs.has(key)) refs.set(key, toRef(target, key as keyof Base));
        return refs.get(key);
      },
    }) as Wrapped;
  }

  function accessor(...args: Parameters<typeof useStore>): Wrapped {
    const store = useStore(...args);
    const known = wrapped.get(store);
    if (known) return known;
    const one = wrap(store);
    wrapped.set(store, one);
    return one;
  }

  // Pinia's HMR plugin reads these off whatever `defineStore` returned.
  return Object.defineProperties(accessor, {
    $id: { value: id },
    _pinia: { get: () => Reflect.get(useStore, "_pinia") },
  });
}

export function defineStore<Id extends string, Setup extends object>(
  id: Id,
  setup: () => Setup,
): ReturnType<typeof build<Id, Setup>>;
// In app/stores the build injects the id from the `$name` variable, so the id is written once.
export function defineStore<Setup extends object>(setup: () => Setup): ReturnType<typeof build<string, Setup>>;
export function defineStore(first: string | (() => object), second?: () => object): unknown {
  if (typeof first === "string" && second) return build(first, second);
  throw new Error(
    "defineStore(setup) takes its id from the build: export it as `export const $name = defineStore(...)` in app/stores, or pass the id.",
  );
}
