import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptHMRUpdate, createPinia, setActivePinia } from "pinia";
import { computed, ref, toRaw } from "vue";
import { defineStore } from "./define-store.ts";

const $counter = defineStore("counter", () => {
  const count = ref(0);
  const double = computed(() => count.value * 2);
  const bump = (): void => {
    count.value += 1;
  };
  return { bump, count, double };
});

test("destructured state and getters are live refs, and an action works detached", () => {
  setActivePinia(createPinia());
  const { bump, count, double } = $counter();
  bump();
  assert.equal(count.value, 1);
  count.value = 5;
  assert.equal(double.value, 10);
  assert.equal($counter().count.value, 5);
});

test("the store's own members still pass through", () => {
  setActivePinia(createPinia());
  const store = $counter();
  store.$patch({ count: 3 });
  assert.equal(store.count.value, 3);
  assert.equal(store.$id, "counter");
});

test("every call hands back the same store and the same refs", () => {
  setActivePinia(createPinia());
  assert.equal($counter(), $counter());
  assert.equal($counter().count, $counter().count);
});

test("a plain value stays plain, and a ref added after the first call is still a ref", () => {
  setActivePinia(createPinia());
  const $labelled = defineStore("labelled", () => ({ label: "x" }));
  assert.equal($labelled().label, "x");
  const held = $counter();
  Object.assign(toRaw(held), { late: ref(1) });
  assert.equal((held as unknown as { late: { value: number } }).late.value, 1);
});

test("a store with no id throws where the build did not inject one", () => {
  assert.throws(() => defineStore(() => ({})), /takes its id from the build/);
});

test("an HMR update neither throws nor cuts a destructured ref off the store", () => {
  setActivePinia(createPinia());
  const { count } = $counter();
  const next = defineStore("counter", () => ({ count: ref(0), extra: ref("new") }));
  // The Vite plugin injects this call as plain JS, so its Pinia-typed signature only gets in the way here.
  acceptHMRUpdate($counter as never, { data: {}, invalidate: () => undefined } as never)({ $counter: next });
  count.value = 7;
  assert.equal($counter().count.value, 7);
  assert.equal(next().extra.value, "new");
});
