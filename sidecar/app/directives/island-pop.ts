import type { Directive } from "vue";

// Optional binding value sets transform-origin, so it scales from its trigger edge.
export const vIslandPop: Directive<HTMLElement, string | undefined> = {
  getSSRProps(binding): { style: string } {
    const origin = binding.value ? ` transform-origin: ${binding.value};` : "";
    return {
      style: `opacity: 0; transform: scale(0.95);${origin}`,
    };
  },
  mounted(el, binding): void {
    if (binding.value) el.style.transformOrigin = binding.value;
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";
    popIn(el);
  },
  beforeUnmount(el): void {
    if (!el.parentNode || prefersReducedMotion()) return;
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode.insertBefore(clone, el.nextSibling);
    popOut(clone)
      ?.then(() => clone.remove())
      .catch(() => clone.remove());
  },
};
