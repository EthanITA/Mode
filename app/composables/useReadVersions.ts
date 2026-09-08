import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { BaselineOrigin, ConversationVersions, FileVersion, VersionContent } from "~~/shared/types/versions";

export interface ReadVersions {
  at: Maybe<number>;
  baseline: MaybeComputed<BaselineOrigin>;
  content: Maybe<VersionContent>;
  head: MaybeComputed<FileVersion>;
  list: ComputedRef<FileVersion[]>;
  reading: Ref<boolean>;
  skipped: MaybeComputed<string>;
  unreachable: Ref<boolean>;
}

export interface VersionsInput {
  path: Maybe<string>;
  sessionKey: Maybe<string>;
}

/** `at` unset means the file as it sits on disk, which is what Latest returns you to. */
export function useReadVersions({ path, sessionKey }: VersionsInput): ReadVersions {
  const at = ref<number>();
  const content = ref<VersionContent>();
  const found = ref<ConversationVersions>();
  const reading = ref(false);
  const unreachable = ref(false);

  const file = computed(() => found.value?.files.find((one) => one.path === path.value));
  const baseline = computed(() => file.value?.baseline);
  const list = computed<FileVersion[]>(() => file.value?.versions ?? []);
  const head = computed(() => list.value.at(-1));
  const skipped = computed(() => file.value?.skipped);

  let listing = 0;
  let reader = 0;

  watch(
    [sessionKey, path],
    async ([key, one]) => {
      const mine = ++listing;
      at.value = undefined;
      content.value = undefined;
      found.value = undefined;
      unreachable.value = false;
      if (!key || !one) return;
      try {
        const got = await $fetch<ConversationVersions>(`/api/sessions/${key}/versions`, { query: { path: one } });
        if (mine === listing) found.value = got;
      } catch {
        if (mine === listing) unreachable.value = true;
      }
    },
    { immediate: true },
  );

  watch([at, sessionKey, path], async ([turn, key, one]) => {
    const mine = ++reader;
    content.value = undefined;
    if (!turn || !key || !one) return;
    reading.value = true;
    try {
      const got = await $fetch<VersionContent>(`/api/sessions/${key}/versions/content`, {
        query: { path: one, turn },
      });
      if (mine === reader) content.value = got;
    } catch {
      // A fetch that threw means the store never answered, which is not the same as an empty version.
      if (mine === reader) content.value = { path: one, turn, found: false, reason: "store-failed" };
    } finally {
      if (mine === reader) reading.value = false;
    }
  });

  return { at, baseline, content, head, list, reading, skipped, unreachable };
}
