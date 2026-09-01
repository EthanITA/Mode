import type { ComputedRef } from "vue";
import type { MaybeComputed } from "~/composables/useSidecar";
import type { ReviewThread } from "~~/shared/types/artifact";
import type { How, Slot, Why } from "~~/shared/types/mode";
import type { LiveSession } from "~~/shared/types/session";
import type { Tint } from "~/utils/tint";

export interface StepView {
  gate: boolean;
  label: string;
  state: "done" | "current" | "ahead";
}

export interface SlotView {
  axis: "mode" | "style";
  how: How;
  label: string;
  summary: string;
  tint: Tint;
}

export interface ArtifactRow {
  slug: string;
  title: string;
}

export interface NoteGroup {
  label: string;
  threads: ReviewThread[];
}

export interface Waiting {
  gates: number;
  notes: number;
  questions: number;
  total: number;
}

export interface Screen {
  artifactRows: ComputedRef<ArtifactRow[]>;
  ground: ComputedRef<{ told: number; total: number }>;
  liveState: ComputedRef<LiveState>;
  noteGroups: ComputedRef<NoteGroup[]>;
  openNotes: ComputedRef<number>;
  position: ComputedRef<{ index: number; count: number }>;
  session: MaybeComputed<LiveSession>;
  slots: ComputedRef<SlotView[]>;
  steps: ComputedRef<StepView[]>;
  tabs: ComputedRef<TabView[]>;
  waiting: ComputedRef<Waiting>;
  why: MaybeComputed<Why>;
}

export interface TabView {
  cwd: string;
  key: string;
  live: boolean;
  name: string;
  tint: Tint;
  waiting: boolean;
}

export interface LiveState {
  label: string;
  running: boolean;
}

/** Never the raw key while anything more human is on hand — the id is the last resort. */
export function nameOf(session: LiveSession): string {
  return session.name || basename(session.cwd) || session.key;
}

function shutGates(why: Why | undefined): number {
  return why?.gates.filter((gate) => gate.state === "shut").length ?? 0;
}

function slotLabel(slot: Slot): string {
  return slot.name ? `${sigil(slot.how)}${slot.name}` : "auto";
}

export function useScreen(): Screen {
  const sc = useSidecar();

  const session = computed(() => sc.sessions.value.find((s) => s.key === sc.sessionKey.value));
  const why = computed(() => (sc.sessionKey.value ? sc.whys.value[sc.sessionKey.value] : undefined));

  // Tabs are live conversations; with none running, the last productive one beats a blank screen.
  const railed = computed(() => {
    const live = sc.sessions.value.filter((s) => s.live);
    return live.length ? live : sc.sessions.value.filter((s) => s.artifacts.length).slice(0, 1);
  });

  const tabs = computed<TabView[]>(() =>
    railed.value.map((s) => ({
      cwd: homePath(s.cwd),
      key: s.key,
      live: s.live,
      name: nameOf(s),
      tint: sessionTint(s.key),
      waiting: shutGates(sc.whys.value[s.key]) > 0,
    })),
  );

  const liveState = computed<LiveState>(() => {
    const here = session.value;
    if (!here?.live) return { label: "not running", running: false };
    const label = here.status === "busy" ? "working" : here.status === "idle" ? "idle" : "live";
    return { label, running: true };
  });

  const titles = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.slug, meta.title])));

  const artifactRows = computed<ArtifactRow[]>(() =>
    (session.value?.artifacts ?? []).map((slug) => ({ slug, title: titles.value.get(slug) || deslug(slug) })),
  );

  const position = computed(() => {
    const slugs = session.value?.artifacts ?? [];
    const at = sc.slug.value ? slugs.indexOf(sc.slug.value) : -1;
    return { index: at < 0 ? 0 : at + 1, count: slugs.length };
  });

  // The gate flag lives on the contract, not on the pipeline the session reports.
  const gateLabels = computed(() => {
    const name = session.value?.slots.mode.name;
    const contract = sc.contracts.value.modes.find((c) => c.name === name);
    return new Set((contract?.steps ?? []).filter((step) => step.gate).map((step) => step.label.toLowerCase()));
  });

  const steps = computed<StepView[]>(() => {
    const pipeline = session.value?.pipeline;
    if (!pipeline) return [];
    const done = new Set(pipeline.done.map((label) => label.toLowerCase()));
    return pipeline.steps.map((label) => ({
      gate: gateLabels.value.has(label.toLowerCase()),
      label,
      state: done.has(label.toLowerCase()) ? "done" : label === pipeline.current ? "current" : "ahead",
    }));
  });

  const slots = computed<SlotView[]>(() => {
    const held = session.value?.slots;
    if (!held) return [];
    return (["mode", "style"] as const).map((axis) => ({
      axis,
      how: held[axis].how,
      label: slotLabel(held[axis]),
      summary: held[axis].summary || `no ${axis} contract is held`,
      tint: tintOf(held[axis].color, `${axis}:${held[axis].name ?? ""}`),
    }));
  });

  const ground = computed(() => {
    const rules = why.value?.rules;
    const told = rules?.told.length ?? 0;
    return { told, total: told + (rules?.waiting.length ?? 0) };
  });

  const threads = computed(() => sc.artifact.value?.threads ?? []);
  const openNotes = computed(() => threads.value.filter((thread) => thread.status === "open").length);

  const noteGroups = computed<NoteGroup[]>(() => {
    const groups = new Map<string, ReviewThread[]>();
    for (const thread of threads.value) {
      const label = thread.anchor?.label || "elsewhere on the page";
      const bucket = groups.get(label);
      if (bucket) bucket.push(thread);
      else groups.set(label, [thread]);
    }
    return [...groups].map(([label, list]) => ({ label, threads: list }));
  });

  const waiting = computed<Waiting>(() => {
    const gates = shutGates(why.value);
    // Questions need the streaming CLI, so this arm is always zero and is marked as such.
    const questions = 0;
    return { gates, notes: openNotes.value, questions, total: gates + openNotes.value + questions };
  });

  return { artifactRows, ground, liveState, noteGroups, openNotes, position, session, slots, steps, tabs, waiting, why };
}
