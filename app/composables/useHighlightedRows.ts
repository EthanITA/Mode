import type { ComputedRef, Ref } from "vue";
import type { DiffRow } from "~/utils/diff";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Highlighting lands async, so v-html gets escaped plain text first and never raw, unescaped code. */
export function useHighlightedRows(rows: ComputedRef<DiffRow[]>, lang: ComputedRef<string>): Ref<string[]> {
  const highlighted = ref<string[]>([]);
  let ticket = 0;

  watch(
    [rows, lang],
    ([list, language]) => {
      const mine = ++ticket;
      highlighted.value = list.map((row) => escapeHtml(row.text));
      void Promise.all(list.map((row) => Syntax.code(row.text, language))).then((done) => {
        if (mine === ticket) highlighted.value = done;
      });
    },
    { immediate: true },
  );

  return highlighted;
}
