import type { MaybeRefOrGetter } from "vue";
import type { SessionFiles } from "~~/shared/types/files";
import type { Maybe } from "./useSidecar";

const REFRESH_MS = 5000;

export function useFiles(key: MaybeRefOrGetter<string | undefined>): Maybe<SessionFiles> {
  const files = ref<SessionFiles>();

  async function pull(): Promise<void> {
    const value = toValue(key);
    if (!value) return;
    try {
      files.value = await $fetch<SessionFiles>(`/api/sessions/${value}/files`);
    } catch {
      // a transient read failure keeps the last good table rather than blanking it
    }
  }

  onMounted(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), REFRESH_MS);
    onScopeDispose(() => window.clearInterval(timer));
  });

  watch(
    () => toValue(key),
    () => {
      files.value = undefined;
      void pull();
    },
  );

  return files;
}
