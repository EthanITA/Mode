import type { RelayNotice } from "../../lib/web/page/protocol.ts";
import { frameRules } from "./rules.ts";

const relayKey = (tabId: number, frameId: number): string => `relay:${tabId}:${frameId}`;

// Third-party cookies stay as the browser has them everywhere else; a site framed under the sidecar gets its own.
function allowCookiesUnderSidecar(): void {
  void chrome.contentSettings.cookies.set({
    primaryPattern: "<all_urls>",
    secondaryPattern: "http://sidecar.localhost/*",
    setting: "allow",
  });
}

async function frameTab(tabId: number): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const stale = rules.filter((rule) => rule.condition.tabIds?.includes(tabId)).map((rule) => rule.id);
  const from = Math.max(0, ...rules.map((rule) => rule.id)) + 1;
  await chrome.declarativeNetRequest.updateSessionRules({ addRules: frameRules({ from, tabId }), removeRuleIds: stale });
}

async function forgetTab(tabId: number): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const gone = rules.filter((rule) => rule.condition.tabIds?.includes(tabId)).map((rule) => rule.id);
  if (gone.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: gone });
  const relays = Object.keys(await chrome.storage.session.get()).filter((key) => key.startsWith(`relay:${tabId}:`));
  if (relays.length) await chrome.storage.session.remove(relays);
}

// So `sidecar status` can say the extension is there, which the sidecar's server can't see otherwise.
async function tellSidecar(at: string): Promise<void> {
  await fetch(`${at}/api/extension`, { method: "POST" }).catch(() => undefined);
}

// Only the site a relay page holds is the sidecar's page; its own frames load and fail without the sidecar caring.
async function relayOf({ parentFrameId, tabId }: chrome.webNavigation.FrameDetails): Promise<string | undefined> {
  if (parentFrameId < 0) return undefined;
  const key = relayKey(tabId, parentFrameId);
  const relay = (await chrome.storage.session.get(key))[key];
  return typeof relay === "string" ? relay : undefined;
}

async function tellFrame(type: RelayNotice["type"], details: chrome.webNavigation.FrameDetails): Promise<void> {
  const relay = await relayOf(details);
  if (!relay) return;
  const notice: RelayNotice = { relay, type, url: details.url };
  await chrome.tabs.sendMessage(details.tabId, notice, { frameId: 0 }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(allowCookiesUnderSidecar);
chrome.runtime.onStartup.addListener(allowCookiesUnderSidecar);

const typeOf = (message: unknown): unknown =>
  typeof message === "object" && !!message ? Reflect.get(message, "type") : undefined;

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const tabId = sender.tab?.id;
  if (!tabId || !sender.url) return;
  if (typeOf(message) === "relay" && sender.frameId) {
    chrome.storage.session.set({ [relayKey(tabId, sender.frameId)]: sender.url }).then(
      () => reply({ ok: true }),
      () => reply({ ok: false }),
    );
    return true;
  }
  if (typeOf(message) !== "sidecar") return;
  void tellSidecar(new URL(sender.url).origin);
  frameTab(tabId).then(
    () => reply({ ok: true }),
    (error: unknown) => reply({ error: String(error), ok: false }),
  );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));
chrome.webNavigation.onCompleted.addListener((details) => void tellFrame("loaded", details));
// A frame replaced by the next navigation reports itself aborted, which is no failure of the site.
chrome.webNavigation.onErrorOccurred.addListener(
  (details) => void (details.error === "net::ERR_ABORTED" || tellFrame("down", details)),
);
