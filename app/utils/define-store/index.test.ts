import assert from "node:assert/strict";
import { test } from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { defineStore } from "./index.ts";
import { injectStoreId } from "./inject-id.ts";

test("a store given an id is Pinia's own: plain reads and writes, shared by every call", () => {
  setActivePinia(createPinia());
  const $counter = defineStore("counter", () => {
    const count = ref(0);
    const bump = (): void => {
      count.value += 1;
    };
    return { bump, count };
  });
  const counter = $counter();
  counter.count = 5;
  counter.bump();
  assert.equal($counter().count, 6);
  assert.equal($counter(), counter);
});

test("a store with no id throws where the build did not inject one", () => {
  assert.throws(() => defineStore(() => ({})), /takes its id from the build/);
});

test("the build gives a store the variable name minus the dollar, and leaves explicit ids and other code alone", () => {
  assert.equal(
    injectStoreId("export const $deskLayout = defineStore(\n  () => ({}),\n);"),
    'export const $deskLayout = defineStore("deskLayout", \n  () => ({}),\n);',
  );
  const untouched = [
    'export const $artifact = defineStore("custom", () => ({}));',
    "const $local = defineStore(() => ({}));\nexport const useThing = defineStore(() => ({}));",
  ];
  for (const code of untouched) assert.equal(injectStoreId(code), code);
});
