<script lang="ts">
export type MascotState = "idle" | "thinking" | "coding" | "investigating" | "running";
</script>

<script lang="ts" setup>
const { porting = false, show = true, size = 44, state = "idle" } = defineProps<{
  porting?: boolean;
  show?: boolean;
  size?: number;
  state?: MascotState;
}>();

// Props sit outside the mark, so the box is wider than tall and `size` is the height.
const BOX = { x: -4, y: -8, w: 38, h: 34 } as const;
const width = computed(() => Math.round(size * (BOX.w / BOX.h)));

// Idle is a repertoire rather than a loop: a walk cycle with nothing happening reads as a lie.
const MOVES = ["glance-left", "glance-right", "sway-left", "sway-right", "stretch"] as const;
const REST_MS = [1400, 3200] as const;

const move = ref<(typeof MOVES)[number]>();
// Randomised per instance, so two mascots on screen never blink in lockstep.
const blink = `${(4.4 + Math.random() * 3.2).toFixed(2)}s`;
const blinkIn = `${(Math.random() * 2.5).toFixed(2)}s`;
let timer: ReturnType<typeof setTimeout> | undefined;

function perform(): void {
  move.value = MOVES[Math.floor(Math.random() * MOVES.length)];
  timer = setTimeout(() => {
    move.value = undefined;
    timer = setTimeout(perform, REST_MS[0] + Math.random() * (REST_MS[1] - REST_MS[0]));
  }, 900);
}

watch(
  () => state,
  (now) => {
    clearTimeout(timer);
    move.value = undefined;
    if (now === "idle") timer = setTimeout(perform, REST_MS[0] + Math.random() * (REST_MS[1] - REST_MS[0]));
  },
  { immediate: true },
);

onScopeDispose(() => clearTimeout(timer));
</script>

<template>
  <!-- Two of these exist, one per perch. Both open a portal on the same tick; one figure steps in
       as the other steps out, so the pair reads as one mascot that travelled. -->
  <span class="slot" :data-porting="porting" :style="{ height: `${size}px`, width: `${width}px` }">
    <svg
      class="portal"
      aria-hidden="true"
      :height="size"
      :viewBox="`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`"
      :width="width"
    >
<rect class="px p3" x="7.6" y="-2.2" width="2.2" height="2.2" />
      <rect class="px p4" x="9.8" y="-2.2" width="2.2" height="2.2" />
      <rect class="px p4" x="12" y="-2.2" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="-2.2" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="0" width="2.2" height="2.2" />
      <rect class="px p4" x="7.6" y="0" width="2.2" height="2.2" />
      <rect class="px spark" x="9.8" y="0" width="2.2" height="2.2" />
      <rect class="px p4" x="12" y="0" width="2.2" height="2.2" />
      <rect class="px p4" x="14.2" y="0" width="2.2" height="2.2" />
      <rect class="px p3" x="16.4" y="0" width="2.2" height="2.2" />
      <rect class="px p3" x="3.2" y="2.2" width="2.2" height="2.2" />
      <rect class="px p4" x="5.4" y="2.2" width="2.2" height="2.2" />
      <rect class="px p3" x="7.6" y="2.2" width="2.2" height="2.2" />
      <rect class="px p2" x="9.8" y="2.2" width="2.2" height="2.2" />
      <rect class="px p2" x="12" y="2.2" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="2.2" width="2.2" height="2.2" />
      <rect class="px p4" x="16.4" y="2.2" width="2.2" height="2.2" />
      <rect class="px p3" x="18.6" y="2.2" width="2.2" height="2.2" />
      <rect class="px p4" x="3.2" y="4.4" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="4.4" width="2.2" height="2.2" />
      <rect class="px p2" x="7.6" y="4.4" width="2.2" height="2.2" />
      <rect class="px p3" x="9.8" y="4.4" width="2.2" height="2.2" />
      <rect class="px p3" x="12" y="4.4" width="2.2" height="2.2" />
      <rect class="px p2" x="14.2" y="4.4" width="2.2" height="2.2" />
      <rect class="px p3" x="16.4" y="4.4" width="2.2" height="2.2" />
      <rect class="px p4" x="18.6" y="4.4" width="2.2" height="2.2" />
      <rect class="px p3" x="1" y="6.6" width="2.2" height="2.2" />
      <rect class="px p4" x="3.2" y="6.6" width="2.2" height="2.2" />
      <rect class="px p2" x="5.4" y="6.6" width="2.2" height="2.2" />
      <rect class="px p3" x="7.6" y="6.6" width="2.2" height="2.2" />
      <rect class="px p4" x="9.8" y="6.6" width="2.2" height="2.2" />
      <rect class="px p4" x="12" y="6.6" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="6.6" width="2.2" height="2.2" />
      <rect class="px p2" x="16.4" y="6.6" width="2.2" height="2.2" />
      <rect class="px p4" x="18.6" y="6.6" width="2.2" height="2.2" />
      <rect class="px p3" x="20.8" y="6.6" width="2.2" height="2.2" />
      <rect class="px p4" x="1" y="8.8" width="2.2" height="2.2" />
      <rect class="px p2" x="3.2" y="8.8" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="8.8" width="2.2" height="2.2" />
      <rect class="px p4" x="7.6" y="8.8" width="2.2" height="2.2" />
      <rect class="px p3" x="9.8" y="8.8" width="2.2" height="2.2" />
      <rect class="px spark" x="12" y="8.8" width="2.2" height="2.2" />
      <rect class="px p4" x="14.2" y="8.8" width="2.2" height="2.2" />
      <rect class="px p2" x="16.4" y="8.8" width="2.2" height="2.2" />
      <rect class="px p3" x="18.6" y="8.8" width="2.2" height="2.2" />
      <rect class="px p4" x="20.8" y="8.8" width="2.2" height="2.2" />
      <rect class="px p4" x="1" y="11" width="2.2" height="2.2" />
      <rect class="px p2" x="3.2" y="11" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="11" width="2.2" height="2.2" />
      <rect class="px p4" x="7.6" y="11" width="2.2" height="2.2" />
      <rect class="px p3" x="9.8" y="11" width="2.2" height="2.2" />
      <rect class="px p3" x="12" y="11" width="2.2" height="2.2" />
      <rect class="px p4" x="14.2" y="11" width="2.2" height="2.2" />
      <rect class="px p2" x="16.4" y="11" width="2.2" height="2.2" />
      <rect class="px p3" x="18.6" y="11" width="2.2" height="2.2" />
      <rect class="px p4" x="20.8" y="11" width="2.2" height="2.2" />
      <rect class="px p3" x="1" y="13.2" width="2.2" height="2.2" />
      <rect class="px p4" x="3.2" y="13.2" width="2.2" height="2.2" />
      <rect class="px p2" x="5.4" y="13.2" width="2.2" height="2.2" />
      <rect class="px p3" x="7.6" y="13.2" width="2.2" height="2.2" />
      <rect class="px spark" x="9.8" y="13.2" width="2.2" height="2.2" />
      <rect class="px p4" x="12" y="13.2" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="13.2" width="2.2" height="2.2" />
      <rect class="px p2" x="16.4" y="13.2" width="2.2" height="2.2" />
      <rect class="px p4" x="18.6" y="13.2" width="2.2" height="2.2" />
      <rect class="px p3" x="20.8" y="13.2" width="2.2" height="2.2" />
      <rect class="px p4" x="3.2" y="15.4" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="15.4" width="2.2" height="2.2" />
      <rect class="px p2" x="7.6" y="15.4" width="2.2" height="2.2" />
      <rect class="px p3" x="9.8" y="15.4" width="2.2" height="2.2" />
      <rect class="px p3" x="12" y="15.4" width="2.2" height="2.2" />
      <rect class="px p2" x="14.2" y="15.4" width="2.2" height="2.2" />
      <rect class="px p3" x="16.4" y="15.4" width="2.2" height="2.2" />
      <rect class="px p4" x="18.6" y="15.4" width="2.2" height="2.2" />
      <rect class="px p3" x="3.2" y="17.6" width="2.2" height="2.2" />
      <rect class="px p4" x="5.4" y="17.6" width="2.2" height="2.2" />
      <rect class="px p3" x="7.6" y="17.6" width="2.2" height="2.2" />
      <rect class="px p2" x="9.8" y="17.6" width="2.2" height="2.2" />
      <rect class="px spark" x="12" y="17.6" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="17.6" width="2.2" height="2.2" />
      <rect class="px p4" x="16.4" y="17.6" width="2.2" height="2.2" />
      <rect class="px p3" x="18.6" y="17.6" width="2.2" height="2.2" />
      <rect class="px p3" x="5.4" y="19.8" width="2.2" height="2.2" />
      <rect class="px p4" x="7.6" y="19.8" width="2.2" height="2.2" />
      <rect class="px p4" x="9.8" y="19.8" width="2.2" height="2.2" />
      <rect class="px p4" x="12" y="19.8" width="2.2" height="2.2" />
      <rect class="px p4" x="14.2" y="19.8" width="2.2" height="2.2" />
      <rect class="px p3" x="16.4" y="19.8" width="2.2" height="2.2" />
      <rect class="px p3" x="7.6" y="22" width="2.2" height="2.2" />
      <rect class="px p4" x="9.8" y="22" width="2.2" height="2.2" />
      <rect class="px spark" x="12" y="22" width="2.2" height="2.2" />
      <rect class="px p3" x="14.2" y="22" width="2.2" height="2.2" />
    </svg>

    <Transition appear name="beam">
      <svg
        v-if="show"
        class="mascot"
        aria-hidden="true"
        :data-move="move"
        :data-state="state"
        :height="size"
        :viewBox="`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`"
        :width="width"
      >
    <g class="cloud">
      <circle cx="27" cy="-2.6" r="3.6" />
      <circle cx="22.8" cy="-1" r="2.5" />
      <circle cx="31" cy="-0.8" r="2.6" />
      <circle class="puff p1" cx="21.6" cy="2.4" r="1.2" />
      <circle class="puff p2" cx="20.2" cy="4.4" r="0.8" />
    </g>

    <!-- Behind the body, so Claude reads as sitting at the desk rather than beside it. -->
    <g class="rig-desk">
      <rect class="bezel" x="15" y="-1" width="16" height="12.4" rx="1" />
      <rect class="screen" x="16.2" y="0.2" width="13.6" height="10" rx="0.5" />
      <rect class="code c1" x="17.4" y="1.6" width="7" height="0.9" />
      <rect class="code c2" x="17.4" y="3.4" width="10" height="0.9" />
      <rect class="code c3" x="17.4" y="5.2" width="5.4" height="0.9" />
      <rect class="code c4" x="17.4" y="7" width="8.6" height="0.9" />
      <rect class="neck" x="21.6" y="11.4" width="2.8" height="2.4" />
    </g>

    <g class="rig">
      <g class="hat">
        <rect class="brim" x="1" y="3.4" width="22" height="1.6" />
        <rect class="crown" x="6" y="0.4" width="12" height="3" />
      </g>

      <g class="head">
        <!-- The mark's own outline, minus the four legs so they can move. -->
        <path
          class="shell"
          d="M20.998 10.949H24v3.102h-3v3.028H3V14.05H0V10.95h3V5h17.998v5.949z"
        />
        <g class="eyes" :style="{ animationDelay: blinkIn, animationDuration: blink }">
          <rect class="eye left" x="6" y="8.102" width="1.488" height="2.847" />
          <rect class="eye right" x="16.51" y="8.102" width="1.49" height="2.847" />
        </g>
      </g>

      <g class="legs">
        <rect class="leg a" x="4.487" y="17.079" width="1.513" height="2.921" />
        <rect class="leg b" x="7.488" y="17.079" width="1.512" height="2.921" />
        <rect class="leg a" x="15" y="17.079" width="1.513" height="2.921" />
        <rect class="leg b" x="18" y="17.079" width="1.513" height="2.921" />
      </g>


      <g class="lens">
        <circle class="glass" cx="26.4" cy="11" r="4.2" />
        <circle class="rim" cx="26.4" cy="11" r="4.2" />
        <rect class="grip" x="20.4" y="14.2" width="3.6" height="1.4" rx="0.7" />
      </g>
    </g>

    <!-- In front, and the L the desk makes with the screen: upright glass, flat deck. -->
    <g class="keys">
      <rect class="deck" x="2.6" y="20" width="19.4" height="2.8" rx="0.6" />
      <rect class="key k1" x="4.2" y="20.8" width="2.6" height="1.2" rx="0.3" />
      <rect class="key k2" x="7.8" y="20.8" width="2.6" height="1.2" rx="0.3" />
      <rect class="key k3" x="11.4" y="20.8" width="2.6" height="1.2" rx="0.3" />
      <rect class="key k4" x="15" y="20.8" width="5.8" height="1.2" rx="0.3" />
    </g>

    <g class="prompt">
      <rect class="caret" x="10.6" y="20.4" width="2.8" height="2" />
    </g>
      </svg>
    </Transition>
  </span>
</template>

<style scoped>
.slot {
  display: block;
  flex: none;
  position: relative;
}

.slot > * {
  inset: 0;
  position: absolute;
}

.mascot {
  display: block;
  overflow: visible;
  transform-origin: 50% 72%;
}

/* Shut unless a hand-over is running; both perches are told to open on the same tick. */
.portal {
  opacity: 0;
  pointer-events: none;
}

.px { shape-rendering: crispEdges; }
.p1 { fill: var(--portal-1); }
.p2 { fill: var(--portal-2); }
.p3 { fill: var(--portal-3); }
.p4 { fill: var(--portal-4); }
.spark { fill: var(--portal-spark); }

.slot[data-porting="true"] .portal {
  animation: portal 2100ms var(--ease-out, ease-out);
}

/* The weave shifts while it is open, which is what stops it reading as a flat purple blob. */
.slot[data-porting="true"] .px {
  animation: weave 900ms ease-in-out infinite;
}

.slot[data-porting="true"] .p2 { animation-delay: 120ms; }
.slot[data-porting="true"] .p3 { animation-delay: 240ms; }
.slot[data-porting="true"] .p4 { animation-delay: 360ms; }
.slot[data-porting="true"] .spark { animation: twinkle 700ms ease-in-out infinite; }

/* Opens at 350ms, watched for 500ms, stepped through at 850ms, shut from 1750ms. */
.beam-leave-active {
  transition: opacity 300ms ease-in 850ms, scale 400ms ease-in 850ms, translate 400ms ease-in 850ms;
}

.beam-enter-active {
  transition: opacity 300ms var(--ease-out, ease-out) 900ms, scale 400ms var(--ease-out, ease-out) 900ms,
    translate 400ms var(--ease-out, ease-out) 900ms;
}

/* It looks the portal over before committing, then leans in. */
.slot[data-porting="true"] .mascot .rig {
  animation: brace 2100ms var(--ease-out, ease-out);
}

.beam-enter-from,
.beam-leave-to {
  opacity: 0;
  scale: 0.18;
  translate: 0 12%;
}

@keyframes portal {
  0% { opacity: 0; scale: 0.08 0.02; }
  17% { opacity: 1; scale: 1 1; }
  83% { opacity: 1; scale: 1 1; }
  100% { opacity: 0; scale: 0.08 0.02; }
}

@keyframes weave {
  50% { opacity: 0.55; }
}

@keyframes twinkle {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

@keyframes brace {
  0%, 16% { transform: translateX(0) rotate(0deg); }
  28% { transform: translateX(-0.6px) rotate(-2.5deg); }
  40% { transform: translateX(-0.6px) rotate(-2.5deg); }
  52% { transform: translateX(0.5px) rotate(1.5deg); }
  100% { transform: translateX(0) rotate(0deg); }
}

.shell,
.leg {
  fill: var(--mascot);
}

.brim,
.crown {
  fill: var(--prop-tweed);
}

.bezel,
.neck,
.rim,
.caret {
  fill: var(--prop-dark);
}

.rim {
  fill: none;
  stroke: var(--prop-dark);
  stroke-width: 1.3;
}

.glass {
  fill: var(--prop-glass);
  opacity: 0.22;
}

.grip {
  fill: var(--prop-tweed);
}

.screen { fill: var(--prop-screen); }
.code { fill: var(--prop-code); opacity: 0.75; }
.deck { fill: var(--prop-deck); }
.key { fill: var(--prop-key); }
.cloud circle { fill: var(--prop-cloud); opacity: 0.9; }

.rig,
.head,
.legs {
  transform-box: view-box;
  transform-origin: 12px 20px;
}

/* From the hip, so a press drives the foot into the deck rather than sinking the whole body. */
.leg {
  transform-box: view-box;
  transform-origin: 12px 17px;
}

/* Everything optional is off by default; a state turns on only what it needs. */
.hat,
.lens,
.keys,
.cloud,
.prompt,
.rig-desk {
  opacity: 0;
  pointer-events: none;
  transition: opacity 190ms var(--ease-out, ease-out);
}

/* Held back past the outgoing fade, so the old props clear before the new ones arrive. */
.mascot[data-state="investigating"] .hat,
.mascot[data-state="investigating"] .lens,
.mascot[data-state="coding"] .keys,
.mascot[data-state="coding"] .rig-desk,
.mascot[data-state="thinking"] .cloud,
.mascot[data-state="running"] .keys,
.mascot[data-state="running"] .prompt {
  opacity: 1;
  transition-delay: 150ms;
}

/* Dropping an animation mid-cycle reverts the transform at once; this eases that revert instead. */
.rig,
.head,
.legs,
.leg,
.eye,
.cloud,
.lens,
.code,
.key,
.caret {
  transition: transform 260ms var(--ease-out, ease-out);
}

.mascot[data-state="coding"] .rig {
  animation: hunch 0.46s ease-in-out infinite;
}

/* No arms on this mark, so it types with its feet, which is also funnier. */
.mascot[data-state="coding"] .leg.a { animation: tap 0.46s ease-in-out infinite; }
.mascot[data-state="coding"] .leg.b { animation: tap 0.46s ease-in-out infinite; animation-delay: 0.23s; }
.mascot[data-state="coding"] .key { animation: press 0.46s steps(1, end) infinite; }
.mascot[data-state="coding"] .k2 { animation-delay: 0.11s; }
.mascot[data-state="coding"] .k3 { animation-delay: 0.23s; }
.mascot[data-state="coding"] .k4 { animation-delay: 0.34s; }
.mascot[data-state="coding"] .code { animation: type 2.4s steps(1, end) infinite; }
.mascot[data-state="coding"] .c2 { animation-delay: 0.6s; }
.mascot[data-state="coding"] .c3 { animation-delay: 1.2s; }
.mascot[data-state="coding"] .c4 { animation-delay: 1.8s; }

.mascot[data-state="investigating"] .lens {
  animation: sweep 2.6s ease-in-out infinite;
  transform-box: view-box;
  transform-origin: 24px 12px;
}

.mascot[data-state="investigating"] .head { animation: peer 2.6s ease-in-out infinite; }
.mascot[data-state="investigating"] .eye { animation: track 2.6s ease-in-out infinite; }

.mascot[data-state="running"] .caret { animation: caret 1s steps(1, end) infinite; }
.mascot[data-state="running"] .rig { animation: wait 3s ease-in-out infinite; }

.mascot[data-state="thinking"] .cloud { animation: drift 3.4s ease-in-out infinite; }
.mascot[data-state="thinking"] .puff { animation: bubble 1.8s ease-in-out infinite; }
.mascot[data-state="thinking"] .p2 { animation-delay: 0.3s; }

/* idle: one pre-defined move at a time, legs never moving. */
.mascot[data-move="glance-left"] .eye { animation: glance-left 0.9s ease-in-out; }
.mascot[data-move="glance-right"] .eye { animation: glance-right 0.9s ease-in-out; }
.mascot[data-move="sway-left"] .rig { animation: sway-left 0.9s ease-in-out; }
.mascot[data-move="sway-right"] .rig { animation: sway-right 0.9s ease-in-out; }
.mascot[data-move="stretch"] .rig { animation: stretch 0.9s ease-in-out; }

@keyframes hunch {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(0.3px) rotate(0.5deg); }
}

@keyframes tap {
  0%, 55%, 100% { transform: translateY(0) scaleY(1); }
  25% { transform: translateY(0.5px) scaleY(0.86); }
}

@keyframes press {
  0%, 55%, 100% { transform: translateY(0); }
  20% { transform: translateY(0.45px); }
}

@keyframes type {
  0%, 100% { opacity: 0; }
  8%, 92% { opacity: 0.75; }
}

@keyframes sweep {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(-2px, 2.2px) rotate(-11deg); }
}

@keyframes peer {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(3deg); }
}

@keyframes track {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(0.8px); }
}

@keyframes caret {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@keyframes wait {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.3px); }
}

@keyframes drift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(0.6px, -0.7px); }
}

@keyframes bubble {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.95; }
}

@keyframes shut {
  0%, 30%, 55%, 100% { transform: scaleY(1); }
  40%, 46% { transform: scaleY(0.12); }
}

@keyframes glance-left {
  0%, 100% { transform: translateX(0); }
  25%, 70% { transform: translateX(-0.9px); }
}

@keyframes glance-right {
  0%, 100% { transform: translateX(0); }
  25%, 70% { transform: translateX(0.9px); }
}

@keyframes sway-left {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(-3.5deg); }
}

@keyframes sway-right {
  0%, 100% { transform: rotate(0deg); }
  40% { transform: rotate(3.5deg); }
}

@keyframes stretch {
  0%, 100% { transform: translateY(0) scaleY(1); }
  45% { transform: translateY(-0.7px) scaleY(1.05); }
}

/* Always on, in every state: eyes that never close read as a dead sprite. */
.eyes {
  animation-iteration-count: infinite;
  animation-name: blink;
  animation-timing-function: ease-in-out;
  transform-box: view-box;
  transform-origin: 12px 9.5px;
}

@keyframes blink {
  0%, 93%, 100% { transform: scaleY(1); }
  95%, 96% { transform: scaleY(0.08); }
}

.eye {
  fill: var(--mascot-eye);
  transform-box: view-box;
  transform-origin: 12px 9.5px;
}

.cloud,
.rig-desk,
.keys,
.lens {
  transform-box: view-box;
}

@media (prefers-reduced-motion: reduce) {
  .mascot * {
    animation: none !important;
  }
}
</style>
