const to = new URLSearchParams(location.search).get("to") ?? "";
// Framed by an extension page rather than the sidecar itself, a site gets the cookies a tab of it would send.
const site = document.createElement("iframe");
site.allow = "clipboard-read; clipboard-write; fullscreen";

// Chrome's navigation events never show an extension's frames, so the worker hears of this one before the site can fail in it.
void chrome.runtime
  .sendMessage({ type: "relay" })
  .catch(() => undefined)
  .then(() => {
    if (/^https?:\/\//i.test(to)) site.src = to;
    document.body.append(site);
  });
