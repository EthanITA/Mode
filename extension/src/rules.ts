export interface HeaderChange {
  header: string;
  operation: "remove" | "set";
  value?: string;
}

export interface FrameRule {
  action:
    | { type: "allow" }
    | { type: "modifyHeaders"; requestHeaders?: HeaderChange[]; responseHeaders?: HeaderChange[] };
  condition: {
    excludedRequestDomains?: string[];
    requestDomains?: string[];
    resourceTypes: ["sub_frame"];
    tabIds: number[];
    urlFilter?: string;
  };
  id: number;
  priority: number;
}

export interface FrameRulesInput {
  /** The first rule id free in the session, since a restarted worker remembers nothing. */
  from: number;
  tabId: number;
}

// Google's sign-in answers 401 to a request marked as a frame, while its embeddable widgets under /gsi/ expect one.
const SIGN_IN = "accounts.google.com";

export function frameRules({ from, tabId }: FrameRulesInput): FrameRule[] {
  const tab = { resourceTypes: ["sub_frame"] as ["sub_frame"], tabIds: [tabId] };
  return [
    {
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" },
        ],
      },
      // The sidecar's own pages and the proxy's hosts keep their headers, so the fallback path works as before.
      condition: { ...tab, excludedRequestDomains: ["sidecar.localhost"] },
      id: from,
      priority: 1,
    },
    {
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "sec-fetch-dest", operation: "set", value: "document" }],
      },
      condition: { ...tab, requestDomains: [SIGN_IN] },
      id: from + 1,
      priority: 1,
    },
    { action: { type: "allow" }, condition: { ...tab, urlFilter: `||${SIGN_IN}/gsi/` }, id: from + 2, priority: 2 },
  ];
}
