import assert from "node:assert/strict";
import { test } from "node:test";
import { actionForFile, SPEC_ACTION, toastFor } from "./action.ts";

test("an email draft resolves to send", () => {
  assert.equal(actionForFile("rebuild-window.eml").kind, "send");
});

test("an html report resolves to publish", () => {
  assert.equal(actionForFile("timings.html").kind, "publish");
});

test("a diagram resolves to export", () => {
  assert.equal(actionForFile("diagram.svg").kind, "export");
});

test("markdown and source both fall back to commit", () => {
  assert.equal(actionForFile("RUNBOOK.md").kind, "commit");
  assert.equal(actionForFile("useSidecar.ts").kind, "commit");
});

test("send composes with the given recipient, or falls back without one", () => {
  assert.equal(actionForFile("x.eml").prompt({ file: "x.eml", recipient: "infra@" }), "Send x.eml to infra@");
  assert.equal(actionForFile("x.eml").prompt({ file: "x.eml" }), "Send x.eml to its recipient");
});

test("approve composes the slash command against the slug, not the filename", () => {
  assert.equal(SPEC_ACTION.prompt({ file: "SPEC.md", slug: "billing-v2-spec" }), "/approve billing-v2-spec");
});

test("a delivered outcome toasts the plain confirmation", () => {
  assert.equal(toastFor(SPEC_ACTION, { file: "SPEC.md" }, { delivered: true }), "Asked Claude to approve SPEC.md");
});

test("each refusal reason toasts its own explanation, never a bare failure", () => {
  const subject = { file: "SPEC.md" };
  assert.match(toastFor(SPEC_ACTION, subject, { delivered: false, reason: "no-live-session" }), /isn't live/);
  assert.match(toastFor(SPEC_ACTION, subject, { delivered: false, reason: "refused-by-inbox" }), /refused it/);
  assert.match(toastFor(SPEC_ACTION, subject, { delivered: false, reason: "request-failed" }), /couldn't reach/);
});
