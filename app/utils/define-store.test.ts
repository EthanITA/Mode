import assert from "node:assert/strict";
import { test } from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { computed, ref } from "vue";
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
