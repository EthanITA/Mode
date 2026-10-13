<script lang="ts" setup>
import type * as MonacoApi from "monaco-editor";
import type { SideSurface, SideThread } from "~/utils/ask-claude";
import { SideZones, type SideLight } from "~/utils/monaco/side-zones";

const { api, editor, place, surface } = defineProps<{
  api: typeof MonacoApi;
  editor: MonacoApi.editor.ICodeEditor;
  place: string;
  surface: SideSurface;
}>();

const sc = useSidecar();
const sides = $sideQuestion();
const zones = SideZones.attach({ api, editor });
const hosts = shallowRef<Array<{ host: HTMLElement; id: string }>>([]);
const sizes = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const id = (entry.target as HTMLElement).dataset.sideZone;
    if (id) zones.fit(id, Math.ceil(entry.borderBoxSize[0]?.blockSize ?? 0));
  }
});

const threads = computed(() => sides.at(sc.sessionKey.value, surface, place).filter((one) => !!one.anchor.lines));
const byId = computed(() => new Map(threads.value.map((one) => [one.id, one])));

function sync(now: SideThread[]): void {
  const kept = hosts.value.filter(({ host, id }) => {
    if (now.some((one) => one.id === id)) return true;
    sizes.unobserve(host);
    zones.remove(id);
    return false;
  });
  const fresh = now
    .filter((one) => !kept.some((row) => row.id === one.id))
    .map((one) => {
      const host = document.createElement("div");
      host.className = "side-zone";
      host.dataset.sideZone = one.id;
      host.dataset.surface = surface;
      zones.place(one.id, one.anchor.lines?.[1] ?? 1, host);
      sizes.observe(host);
      return { host, id: one.id };
    });
  hosts.value = [...kept, ...fresh];
}

function lightsOf(one: SideThread): SideLight[] {
  if (one.status !== "open" || !one.anchor.lines) return [];
  const answer = one.turns.findLast((turn) => !!turn.answer)?.answer;
  const pointed = SideQuestion.linesNamed(basename(place), answer).map((lines) => ({ isPointed: true, lines }));
  return [{ isPointed: false, lines: one.anchor.lines }, ...pointed];
}

watch(
  () => threads.value.map((one) => one.id).join(),
  () => sync(threads.value),
  { immediate: true },
);
watchEffect(() => zones.light(threads.value.flatMap(lightsOf)));
watch(
  () => place,
  (_, left) => sides.leave(sc.sessionKey.value, surface, left),
);

onBeforeUnmount(() => {
  sides.leave(sc.sessionKey.value, surface, place);
  sizes.disconnect();
  zones.dispose();
});
</script>

<template>
  <template v-for="row in hosts" :key="row.id">
    <Teleport v-if="byId.get(row.id)" :to="row.host">
      <SideQuestionCard :reveal="zones.reveal" source="code" :thread="byId.get(row.id)!" />
    </Teleport>
  </template>
</template>
