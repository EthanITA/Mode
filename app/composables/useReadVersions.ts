import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { BaselineOrigin, ConversationVersions, FileDiff, FileVersion, VersionContent } from "~~/shared/types/versions";

export interface ReadVersions {
  at: Maybe<number>;
  baseline: MaybeComputed<BaselineOrigin>;
  content: Maybe<VersionContent>;
  diffState: MaybeComputed<DiffState>;
  head: MaybeComputed<FileVersion>;
  list: ComputedRef<FileVersion[]>;
  reading: Ref<boolean>;
  skipped: MaybeComputed<string>;
  unreachable: Ref<boolean>;
}

export interface VersionsInput {
  path: Maybe<string>;
  sessionKey: Maybe<string>;
  // True for a markdown artifact: a non-creation version reads as a diff of that turn, not the whole file.
  diffable?: MaybeComputed<boolean>;
}

/** `at` unset means the file as it sits on disk, which is what Latest returns you to. */
export function useReadVersions({ path, sessionKey, diffable }: VersionsInput): ReadVersions {
  const at = ref<number>();
  const content = ref<VersionContent>();
  const diff = ref<FileDiff>();
  const found = ref<ConversationVersions>();
  const reading = ref(false);
  const unreachable = ref(false);

  const file = computed(() => found.value?.files.find((one) => one.path === path.value));
  const baseline = computed(() => file.value?.baseline);
  const list = computed<FileVersion[]>(() => file.value?.versions ?? []);
  const head = computed(() => list.value.at(-1));
  const skipped = computed(() => file.value?.skipped);
  const diffState = computed<DiffState | undefined>(() =>
    diff.value
      ? Diff.read({ file: { path: path.value || "", baseline: baseline.value ?? "unknown", versions: list.value, skipped: skipped.value }, to: diff.value.to, diff: diff.value })
      : undefined,
  );

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
    diff.value = undefined;
    if (!turn || !key || !one) return;
    // The version at turn-1 is whatever preceded this turn, not literally turn-1; versionAt walks back to it.
    const wantsDiff = diffable?.value && !list.value.find((version) => version.turn === turn)?.created;
    reading.value = true;
    try {
      if (wantsDiff) {
        const got = await $fetch<FileDiff>(`/api/sessions/${key}/versions/diff`, { query: { path: one, from: turn - 1, to: turn } });
        if (mine === reader) diff.value = got;
      } else {
        const got = await $fetch<VersionContent>(`/api/sessions/${key}/versions/content`, {
          query: { path: one, turn },
        });
        if (mine === reader) content.value = got;
      }
    } catch {
      // A fetch that threw means the store never answered, which is not the same as an empty version.
      if (mine === reader) {
        if (wantsDiff) diff.value = { path: one, from: turn - 1, to: turn, computed: false, reason: "store-failed" };
        else content.value = { path: one, turn, found: false, reason: "store-failed" };
      }
    } finally {
      if (mine === reader) reading.value = false;
    }
  });

  return { at, baseline, content, diffState, head, list, reading, skipped, unreachable };
}
