import type { ComputedRef, MaybeRefOrGetter, Ref } from "vue";
import { addressOf } from "~~/lib/web/target";

export interface WebAddressOptions {
  /** Puts the caret in the field once it shows, the URL selected so typing replaces it. */
  focus: () => void;
  slug: MaybeRefOrGetter<string>;
}

export interface WebAddress {
  address: ComputedRef<string>;
  cancel: () => void;
  commit: () => void;
  draft: Ref<string>;
  edit: () => Promise<void>;
  host: ComputedRef<string>;
  isEditing: Ref<boolean>;
  openOut: () => void;
  page: ComputedRef<string>;
}

// One address for the sheet's bar and the grown page's title island, so ⌘L and a typed address behave the same in both.
export function useWebAddress({ focus, slug }: WebAddressOptions): WebAddress {
  const sc = useSidecar();
  const web = $web();
  const isEditing = ref(false);
  const draft = ref("");

  const address = computed(() => web.page?.url ?? sc.artifact.value?.url ?? "");
  const host = computed(() => (address.value ? new URL(address.value).host : ""));
  const page = computed(() => (address.value ? Web.pageOf(address.value) : ""));

  async function edit(): Promise<void> {
    draft.value = address.value ? Web.typed(address.value) : "";
    isEditing.value = true;
    await nextTick();
    focus();
  }

  function cancel(): void {
    isEditing.value = false;
  }

  // Whatever is typed goes in this artifact, a search when it names no address, as a tab's own bar would.
  function commit(): void {
    const to = addressOf(draft.value);
    isEditing.value = false;
    if (to && to.href !== address.value) web.visit(to);
  }

  function openOut(): void {
    if (address.value) window.open(address.value, "_blank", "noopener");
  }

  watch(() => toValue(slug), cancel);
  watch(
    () => web.addressing,
    () => void edit(),
  );

  return { address, cancel, commit, draft, edit, host, isEditing, openOut, page };
}
