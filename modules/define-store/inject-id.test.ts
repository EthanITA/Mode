import assert from "node:assert/strict";
import { test } from "node:test";
import { injectStoreId } from "./inject-id.ts";

test("a store without an id gets the variable name minus the dollar", () => {
  assert.equal(
    injectStoreId("export const $artifact = defineStore(() => {\n  return {};\n});"),
    'export const $artifact = defineStore("artifact", () => {\n  return {};\n});',
  );
  assert.equal(
    injectStoreId("export const $deskLayout = defineStore(\n  () => ({}),\n);"),
    'export const $deskLayout = defineStore("deskLayout", \n  () => ({}),\n);',
  );
});

test("an explicit id and any other code are left alone", () => {
  const explicit = 'export const $artifact = defineStore("custom", () => ({}));';
  const other = "const $local = defineStore(() => ({}));\nexport const useThing = defineStore(() => ({}));";
  assert.equal(injectStoreId(explicit), explicit);
  assert.equal(injectStoreId(other), other);
});
