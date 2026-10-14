import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReviewThread } from "../../shared/types/artifact.ts";
import { Web } from "./web.ts";

const thread = (id: string, page: string, updated: string, status: ReviewThread["status"] = "open"): ReviewThread => ({
  anchor: { label: "Drift", page },
  at: updated,
  body: "simpler?",
  by: "user",
  id,
  n: 1,
  replies: [],
  status,
  updated,
});

test("each jar gets its own host under the sidecar's, except under an IP, which has no subdomain to give", () => {
  const jar = "google-com";
  assert.equal(
    Web.origin({ here: new URL("http://sidecar.localhost:4747/c/x"), jar, port: 47481 }),
    `http://${jar}.sidecar.localhost:47481`,
  );
  assert.equal(Web.origin({ here: new URL("http://127.0.0.1:4747/"), jar, port: 47481 }), "http://127.0.0.1:47481");
  assert.equal(Web.origin({ here: new URL("http://[::1]:4747/"), jar, port: 47481 }), "http://[::1]:47481");
});

test("a page inside the proxy maps back onto the site, and anything else is left alone", () => {
  const ends = { proxy: "http://a.sidecar.localhost:47481", upstream: "http://localhost:3000" };
  assert.equal(
    Web.upstreamOf("http://a.sidecar.localhost:47481/guide?x=1#setup", ends),
    "http://localhost:3000/guide?x=1#setup",
  );
  assert.equal(Web.upstreamOf("https://github.com/x", ends), "https://github.com/x");
  assert.equal(Web.srcOf({ proxy: ends.proxy, url: "http://localhost:3000/guide#setup" }), `${ends.proxy}/guide#setup`);
  assert.equal(Web.addressOf("http://localhost:3000/guide?x=1#setup"), "http://localhost:3000/guide?x=1");
});

test("the gutter holds the threads of the page on screen, and the newest open one elsewhere leads the way there", () => {
  const threads = [
    thread("a", "/guide/hooks", "2026-10-14T10:00:00Z"),
    thread("b", "/guide/slots", "2026-10-14T09:00:00Z"),
    thread("c", "/guide/slots", "2026-10-14T08:00:00Z"),
    thread("d", "/changelog", "2026-10-14T11:00:00Z", "resolved"),
  ];
  assert.deepEqual(
    Web.threadsOn(threads, "/guide/slots").map((one) => one.id),
    ["b", "c"],
  );
  assert.deepEqual(Web.elsewhere(threads, "/"), [
    { count: 1, page: "/guide/hooks" },
    { count: 2, page: "/guide/slots" },
  ]);
  assert.deepEqual(Web.elsewhere(threads, "/guide/hooks"), [{ count: 2, page: "/guide/slots" }]);
});
