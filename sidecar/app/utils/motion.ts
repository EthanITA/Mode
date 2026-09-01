import type { JSAnimation } from "animejs";

import { animate, cubicBezier } from "animejs";

// animejs takes numbers, not CSS custom properties, so these mirror
// cela.css's --duration-fast and --ease-out by value.
const DURATION_FAST = 180;
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const EASE_SPRING = "outBack(1.4)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function popIn(el: HTMLElement, from = 0.95): JSAnimation | undefined {
  if (prefersReducedMotion()) {
    el.style.opacity = "1";
    el.style.transform = "";
    return undefined;
  }
  const animation = animate(el, {
    duration: DURATION_FAST,
    ease: EASE_SPRING,
    opacity: [0, 1],
    scale: [from, 1],
  });
  // Leftover transform traps descendant backdrop-filter (glass samples this box).
  void animation.then(() => {
    el.style.opacity = "";
    el.style.transform = "";
    el.style.scale = "";
  });
  return animation;
}

export function popOut(el: HTMLElement): JSAnimation | undefined {
  if (prefersReducedMotion()) {
    el.style.opacity = "0";
    return undefined;
  }
  return animate(el, {
    duration: DURATION_FAST,
    ease: EASE_OUT,
    opacity: [1, 0],
    scale: [1, 0.96],
  });
}
