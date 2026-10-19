const relay = new URL(chrome.runtime.getURL("")).origin;
const chain = [...location.ancestorOrigins];
const sidecar = chain.at(-1);
// Only pages inside the sidecar's relay get the comment agent, as the proxy gave it to the pages it served.
if (sidecar && chain.includes(relay)) {
  const agent = document.createElement("script");
  agent.type = "module";
  agent.src = chrome.runtime.getURL(`page/agent.js?parent=${encodeURIComponent(sidecar)}`);
  (document.head ?? document.documentElement).append(agent);
}
