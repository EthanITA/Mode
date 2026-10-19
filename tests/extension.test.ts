import assert from "node:assert/strict";
import { test } from "node:test";
import { frameRules } from "../extension/src/rules.ts";
import { asScript } from "../lib/web/extension.ts";

test("only the sidecar's own tab may frame a site, and Google's sign-in is asked for as a page", () => {
  const rules = frameRules({ from: 7, tabId: 42 });
  assert.deepEqual(
    rules.map((rule) => rule.id),
    [7, 8, 9],
  );
  for (const rule of rules) assert.deepEqual(rule.condition.tabIds, [42]);
  const [open, signIn, widgets] = rules;
  assert.deepEqual(
    open?.action.type === "modifyHeaders" && open.action.responseHeaders?.map((change) => change.header),
    ["x-frame-options", "content-security-policy"],
  );
  assert.deepEqual(signIn?.condition.requestDomains, ["accounts.google.com"]);
  assert.ok(widgets && widgets.action.type === "allow" && widgets.priority > (signIn?.priority ?? 0));
});

test("the agent's modules load as extension scripts, their imports renamed with them", () => {
  const script = asScript('import { a } from "./blocks.ts";\nimport type { B } from "./protocol.ts";\nexport const c: B = a;\n');
  assert.match(script, /from "\.\/blocks\.js"/);
  assert.doesNotMatch(script, /protocol|: B/);
});
