const root = document.documentElement;
root.dataset.sidecarRelay = chrome.runtime.getURL("frame.html");

// The tab's frame rules exist once this answers, and without them the sidecar takes the proxy rather than wait.
void chrome.runtime
  .sendMessage<{ ok?: boolean }>({ type: "sidecar" })
  .then((answer) => answer?.ok)
  .catch(() => false)
  .then((ok) => {
    if (ok) root.dataset.sidecarRelayReady = "true";
    else delete root.dataset.sidecarRelay;
    document.dispatchEvent(new Event("sidecar-relay"));
  });

// A string crosses from this world to the page's intact, where an object might not.
chrome.runtime.onMessage.addListener((message) => {
  document.dispatchEvent(new CustomEvent("sidecar-relay-frame", { detail: JSON.stringify(message) }));
});
