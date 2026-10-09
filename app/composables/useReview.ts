import type { Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { ReviewAction, ReviewActionReply, ReviewFile, ReviewSnapshot } from "~~/shared/types/review";

export interface ReviewFace {
  act: (action: ReviewAction, done: string) => Promise<void>;
  busy: Ref<boolean>;
  confirming: Maybe<string>;
  decideAll: (isAccept: boolean) => Promise<void>;
  decideFile: (isAccept: boolean) => Promise<void>;
  decideHunk: (change: number, isAccept: boolean) => Promise<void>;
  decideLines: (isAccept: boolean) => Promise<void>;
  file: MaybeComputed<ReviewFile>;
  isCompact: Ref<boolean>;
  isWrapped: Ref<boolean>;
  listen: () => void;
  picks: Ref<string[]>;
  selected: Maybe<string>;
  snapshot: Maybe<ReviewSnapshot>;
  travel: (way: "redo" | "undo") => Promise<void>;
}

const FAILED: Record<Exclude<ReviewActionReply, { delivered: true }>["reason"], string> = {
  "bad-action": "That action was malformed, so nothing was sent.",
  "no-live-session": "This conversation isn't running. Resume it to apply the review.",
  "refused-by-inbox": "The conversation refused the message. Try again in a moment.",
};

export function useReview(): ReviewFace {
  const sc = useSidecar();
  const chrome = useChrome();
  const snapshot = useState<ReviewSnapshot | undefined>("rv:snapshot");
  const selected = useState<string | undefined>("rv:selected");
  const isCompact = useState("rv:compact", () => true);
  const isWrapped = useState("rv:wrapped", () => true);
  const picks = useState<string[]>("rv:picks", () => []);
  const confirming = useState<string | undefined>("rv:confirming");
  const busy = useState("rv:busy", () => false);

  const file = computed(() => {
    const files = snapshot.value?.files ?? [];
    return files.find((one) => one.path === selected.value) ?? files[0];
  });

  async function act(action: ReviewAction, done: string): Promise<void> {
    const key = sc.sessionKey.value;
    if (!key || busy.value) return;
    busy.value = true;
    try {
      const reply = await $fetch<ReviewActionReply>(`/api/sessions/${encodeURIComponent(key)}/review`, {
        body: action,
        method: "POST",
      });
      if (reply.delivered) chrome.toast(done);
      else chrome.toast(FAILED[reply.reason], "warning");
    } catch {
      chrome.toast("The sidecar could not reach its server.", "destructive");
    } finally {
      busy.value = false;
      picks.value = [];
      confirming.value = undefined;
    }
  }

  async function decideLines(isAccept: boolean): Promise<void> {
    const here = file.value;
    if (!here || !picks.value.length) return;
    const lines = Review.picksOf(here, picks.value);
    const where = Review.spanOf(lines.new.length ? lines.new : lines.old);
    await act(
      { do: isAccept ? "accept-lines" : "reject-lines", path: here.path, ...lines },
      isAccept ? `Accepted ${where}` : `Rejected ${where}, Claude is told`,
    );
  }

  async function decideHunk(change: number, isAccept: boolean): Promise<void> {
    const here = file.value;
    if (!here) return;
    const lines = Review.hunkOf(here, change);
    await act(
      { do: isAccept ? "accept-lines" : "reject-lines", path: here.path, ...lines },
      isAccept ? "Accepted the hunk" : "Rejected the hunk, Claude is told",
    );
  }

  // Rejecting a whole file throws away work, so it takes a second press.
  async function decideFile(isAccept: boolean): Promise<void> {
    const here = file.value;
    if (!here) return;
    if (!isAccept && confirming.value !== here.path) {
      confirming.value = here.path;
      return;
    }
    await act(
      { do: isAccept ? "approve" : "reject", paths: [here.path] },
      isAccept ? `Approved ${basename(here.path)}` : `Rejected ${basename(here.path)}, Claude is told`,
    );
  }

  async function decideAll(isAccept: boolean): Promise<void> {
    const paths = (snapshot.value?.files ?? []).map((one) => one.path);
    if (!paths.length) return;
    if (!isAccept && confirming.value !== "*") {
      confirming.value = "*";
      return;
    }
    await act(
      { do: isAccept ? "approve" : "reject", paths },
      isAccept ? "Approved everything" : "Rejected everything, Claude is told",
    );
  }

  async function travel(way: "redo" | "undo"): Promise<void> {
    const label = snapshot.value?.[way];
    if (!label) return;
    await act({ do: way }, `${way === "undo" ? "Undid" : "Redid"} ${label}`);
  }

  // Called once by the face that shows the review, so one stream serves every part of it.
  function listen(): void {
    let source: EventSource | undefined;
    const disconnect = (): void => {
      source?.close();
      source = undefined;
    };
    watch(
      () => sc.sessionKey.value,
      (key) => {
        disconnect();
        snapshot.value = undefined;
        picks.value = [];
        if (!key) return;
        source = new EventSource(`/api/sessions/${encodeURIComponent(key)}/review/stream`);
        source.addEventListener("review", (event: MessageEvent<string>) => {
          snapshot.value = JSON.parse(event.data) as ReviewSnapshot;
        });
      },
      { immediate: true },
    );
    // Row keys are line numbers, so a picked row means nothing once the file under it moves.
    watch(file, () => {
      picks.value = [];
    });
    onScopeDispose(disconnect);
  }

  return {
    act,
    busy,
    confirming,
    decideAll,
    decideFile,
    decideHunk,
    decideLines,
    file,
    isCompact,
    isWrapped,
    listen,
    picks,
    selected,
    snapshot,
    travel,
  };
}
