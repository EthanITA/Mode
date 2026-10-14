import type { ComputedRef, MaybeRefOrGetter, Ref } from "vue";
import { parseTarget } from "~~/lib/web/target";

export interface WebAddressOptions {
  conversation: MaybeRefOrGetter<string>;
  /** Puts the caret in the field once it shows, the URL selected so typing replaces it. */
  focus: () => void;
  slug: MaybeRefOrGetter<string>;
}

export interface WebAddress {
  address: ComputedRef<string>;
  cancel: () => void;
  commit: () => Promise<void>;
  draft: Ref<string>;
  edit: () => Promise<void>;
  host: ComputedRef<string>;
  isEditing: Ref<boolean>;
  isOpening: Ref<boolean>;
  isRefused: Ref<boolean>;
  openOut: () => void;
  page: ComputedRef<string>;
}

const REFUSED = "Only http and https addresses open here, such as localhost:3000 or docs.mode.dev.";

// One address for the sheet's bar and the grown page's title island, so ⌘L and a typed site behave the same in both.
export function useWebAddress({ conversation, focus, slug }: WebAddressOptions): WebAddress {
  const sc = useSidecar();
  const chrome = useChrome();
  const web = $web();
  const follow = $follow();
  const isEditing = ref(false);
  const isRefused = ref(false);
  const isOpening = ref(false);
  const draft = ref("");

  const address = computed(() => web.page?.url ?? sc.artifact.value?.url ?? "");
  const host = computed(() => (address.value ? new URL(address.value).host : ""));
  const page = computed(() => (address.value ? Web.pageOf(address.value) : ""));

  async function edit(): Promise<void> {
    draft.value = address.value ? Web.typed(address.value) : "";
    isRefused.value = false;
    isEditing.value = true;
    await nextTick();
    focus();
  }

  function cancel(): void {
    isEditing.value = false;
    isRefused.value = false;
  }

  async function commit(): Promise<void> {
    const typed = parseTarget(draft.value);
    if (!typed) {
      isRefused.value = true;
      chrome.toast(REFUSED, "warning");
      return;
    }
    isOpening.value = true;
    try {
      const next = await web.visit({ slug: toValue(slug), typed });
      isEditing.value = false;
      if (next !== toValue(slug)) follow.show({ key: toValue(conversation), slug: next });
    } catch (error) {
      chrome.toast(failReason(error) ?? `${typed.host} could not be opened here`, "destructive");
    } finally {
      isOpening.value = false;
    }
  }

  function openOut(): void {
    if (address.value) window.open(address.value, "_blank", "noopener");
  }

  watch(() => toValue(slug), cancel);
  watch(
    () => web.addressing,
    () => void edit(),
  );

  return { address, cancel, commit, draft, edit, host, isEditing, isOpening, isRefused, openOut, page };
}
