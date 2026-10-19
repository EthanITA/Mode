declare namespace chrome {
  interface Tab {
    id?: number;
  }

  interface MessageSender {
    frameId?: number;
    tab?: Tab;
    url?: string;
  }

  namespace storage {
    const session: {
      get(keys?: string | string[]): Promise<Record<string, unknown>>;
      remove(keys: string | string[]): Promise<void>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  }

  namespace runtime {
    const id: string;
    function getURL(path: string): string;
    function sendMessage<T = unknown>(message: unknown): Promise<T | undefined>;
    const onMessage: {
      addListener(
        listener: (message: unknown, sender: MessageSender, reply: (answer?: unknown) => void) => boolean | void,
      ): void;
    };
    const onStartup: { addListener(listener: () => void): void };
    const onInstalled: { addListener(listener: () => void): void };
  }

  namespace scripting {
    function executeScript(details: { files: string[]; target: { tabId: number } }): Promise<unknown>;
  }

  namespace tabs {
    function query(filter: { url?: string }): Promise<Tab[]>;
    function sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
    const onRemoved: { addListener(listener: (tabId: number) => void): void };
  }

  namespace declarativeNetRequest {
    function getSessionRules(): Promise<{ id: number; condition: { tabIds?: number[] } }[]>;
    function updateSessionRules(options: { addRules?: unknown[]; removeRuleIds?: number[] }): Promise<void>;
  }

  namespace contentSettings {
    const cookies: {
      set(details: { primaryPattern: string; secondaryPattern?: string; setting: "allow" | "block" }): Promise<void>;
    };
  }

  namespace webNavigation {
    interface FrameDetails {
      error?: string;
      frameId: number;
      parentFrameId: number;
      tabId: number;
      url: string;
    }
    type FrameEvent = { addListener(listener: (details: FrameDetails) => void): void };
    const onCompleted: FrameEvent;
    const onErrorOccurred: FrameEvent;
  }
}
