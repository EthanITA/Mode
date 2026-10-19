import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReviewThread } from "../../shared/types/artifact.ts";
import { Trail } from "../../shared/utils/trail.ts";
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

test("every site gets one host of its own under the sidecar's, the same in every artifact, and maps back onto itself", () => {
  const place = Web.placeOf({ here: new URL("http://sidecar.localhost:4747/c/x"), port: 47481 });
  assert.equal(place.base, "sidecar.localhost");
  assert.equal(Web.placeOf({ here: new URL("http://127.0.0.1:4747/"), port: 1 }).base, "sidecar.localhost");
  const cases = [
    ["https://www.reddit.com/r/vue?x=1#top", "http://www.reddit.com.https.sidecar.localhost:47481/r/vue?x=1#top"],
    ["http://localhost:3000/guide", "http://localhost.http-3000.sidecar.localhost:47481/guide"],
    ["wss://gql.reddit.com/live", "ws://gql.reddit.com.https.sidecar.localhost:47481/live"],
  ];
  for (const [site, proxy] of cases) {
    assert.equal(Web.proxied(site ?? "", place), proxy);
    assert.equal(Web.upstream(proxy ?? "", place.base)?.href, site);
  }
  assert.equal(Web.proxied("http://[::1]:5173/", place), "http://localhost.http-5173.sidecar.localhost:47481/");
  assert.equal(Web.proxied(cases[0]?.[1] ?? "", place), undefined);
  assert.equal(Web.proxied("mailto:a@b.dev", place), undefined);
  assert.equal(Web.upstream("http://www.reddit.com.https.localhost:47481/", place.base), undefined);
  assert.equal(Web.addressOf("http://localhost:3000/guide?x=1#setup"), "http://localhost:3000/guide?x=1");
});

test("the gutter holds the threads of the page on screen, and the newest open one elsewhere leads the way there", () => {
  const [hooks, slots] = ["https://docs.mode.dev/guide/hooks", "https://docs.mode.dev/guide/slots"];
  const threads = [
    thread("a", hooks, "2026-10-14T10:00:00Z"),
    thread("b", slots, "2026-10-14T09:00:00Z"),
    thread("c", slots, "2026-10-14T08:00:00Z"),
    thread("d", "https://github.com/x", "2026-10-14T11:00:00Z", "resolved"),
  ];
  assert.deepEqual(
    Web.threadsOn(threads, slots).map((one) => one.id),
    ["b", "c"],
  );
  assert.deepEqual(Web.elsewhere(threads, "https://docs.mode.dev/"), [
    { count: 1, page: hooks },
    { count: 2, page: slots },
  ]);
  assert.deepEqual(Web.elsewhere(threads, hooks), [{ count: 2, page: slots }]);
  assert.equal(Web.shortOf(slots, { from: hooks }), "/guide/slots");
  assert.equal(Web.shortOf(slots, { from: "https://github.com/" }), "docs.mode.dev/guide/slots");
});

test("the address drops its scheme only where typing it back brings the same one", () => {
  assert.equal(Web.typed("http://localhost:3000/guide/hooks"), "localhost:3000/guide/hooks");
  assert.equal(Web.typed("https://www.google.com/"), "www.google.com");
  assert.equal(Web.typed("https://localhost:8443/x"), "https://localhost:8443/x");
  assert.equal(Web.typed("http://example.com/a?b=1"), "http://example.com/a?b=1");
});

test("the extension's mark picks the real address once its rules hold, and the proxy when it is missing or gives up", async () => {
  const host = (dataset: DOMStringMap) => Object.assign(new EventTarget(), { documentElement: { dataset } });
  const relay = "chrome-extension://abc/frame.html";
  assert.equal(await Web.relay(host({})), undefined);
  assert.equal(await Web.relay(host({ sidecarRelay: relay, sidecarRelayReady: "true" })), relay);
  for (const ok of [true, false]) {
    const waiting = host({ sidecarRelay: relay });
    const picked = Web.relay(waiting);
    if (ok) waiting.documentElement.dataset.sidecarRelayReady = "true";
    else delete waiting.documentElement.dataset.sidecarRelay;
    waiting.dispatchEvent(new Event("sidecar-relay"));
    assert.equal(await picked, ok ? relay : undefined);
  }
  assert.equal(
    new URL(Web.relayed(relay, "https://claude.ai/artifact/x?y=1#z")).searchParams.get("to"),
    "https://claude.ai/artifact/x?y=1#z",
  );
});

test("an entry's trail goes back and forward like a tab, and a step from the sidecar lands where it aimed", () => {
  const [a, b, c] = ["http://localhost:3000/", "http://localhost:3000/b", "http://localhost:3000/c"];
  let trail = Trail.arrive({ at: 0, urls: [] }, { how: "replace", url: a });
  trail = Trail.arrive(trail, { how: "push", url: b });
  trail = Trail.arrive(trail, { how: "push", url: c });
  assert.deepEqual(trail, { at: 2, urls: [a, b, c] });
  trail = Trail.arrive(trail, { aim: 0, how: "replace", url: a });
  assert.deepEqual(trail, { at: 0, urls: [a, b, c] });
  assert.equal(Trail.arrive(trail, { how: "traverse", url: b }).at, 1);
  assert.deepEqual(Trail.arrive(trail, { how: "push", url: c }), { at: 1, urls: [a, c] });
  assert.deepEqual(Trail.arrive(trail, { how: "replace", url: `${a}?moved` }).urls, [`${a}?moved`, b, c]);
  assert.equal(Trail.of({ at: 3, urls: [a] }), undefined);
  assert.equal(Trail.of({ at: 0, urls: ["javascript:alert(1)"] }), undefined);
});
