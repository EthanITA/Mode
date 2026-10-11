import { defineStore as defineStoreOf, storeToRefs, type StoreGeneric } from "pinia";

// Pinia's setup store with state and getters already as refs, so `const { isFull } = $artifact()` stays reactive.
export function defineStore<Id extends string, Setup extends object>(id: Id, setup: () => Setup) {
  const useStore = defineStoreOf(id, setup);
  type Base = ReturnType<typeof useStore>;

  function accessor(...args: Parameters<typeof useStore>): Setup & Omit<Base, keyof Setup> {
    const store = useStore(...args);
    // Pinia's generic store never narrows to StoreGeneric while Setup is open.
    const refs = storeToRefs(store as StoreGeneric);
    // A Proxy rather than a copy, so actions, `$patch` and `$subscribe` stay the store's own.
    return new Proxy(store, {
      get: (target, key) => (Reflect.has(refs, key) ? Reflect.get(refs, key) : Reflect.get(target, key)),
    }) as Setup & Omit<Base, keyof Setup>;
  }

  // Pinia's HMR plugin reads these off whatever `defineStore` returned.
  return Object.defineProperties(accessor, {
    $id: { value: id },
    _pinia: { get: () => Reflect.get(useStore, "_pinia") },
  });
}
