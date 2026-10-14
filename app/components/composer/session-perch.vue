<script lang="ts" setup>
import type { MascotState } from "~/components/claude/mascot.vue";
import type { SessionState } from "~~/shared/types/session";

const { tip } = defineProps<{ tip?: string }>();

const { sessionState } = useScreen();
const convo = useConversation();

const RESTING = { idle: "idle", waiting: "waiting", gone: "asleep" } as const satisfies Record<
  Exclude<SessionState, "busy">,
  MascotState
>;

const TIPS: Record<SessionState, string> = {
  busy: "Session busy",
  idle: "Session idle",
  waiting: "Session waiting on you",
  gone: "Session gone · asking still works",
};

// The stream goes quiet between tool calls while the turn still runs, so busy never rests on idle.
const state = computed<MascotState>(() => {
  const now = sessionState.value;
  if (now !== "busy") return RESTING[now];
  return convo.mascot.value === "idle" ? "thinking" : convo.mascot.value;
});
</script>

<template>
  <span
    class="perch"
    data-region="session-perch"
    role="img"
    :aria-label="TIPS[sessionState]"
    :data-session="sessionState"
    :data-tip="tip ?? TIPS[sessionState]"
  >
    <ClaudeMascot :size="40" :state="state" />
  </span>
</template>

<style scoped>
.perch {
  align-items: center;
  display: flex;
  flex: none;
  height: 40px;
  justify-content: center;
  width: 50px;
}
</style>
