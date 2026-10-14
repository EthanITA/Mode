import type { InjectionKey, Ref } from "vue";

export const FACE_SHOWN: InjectionKey<Ref<boolean>> = Symbol("face-shown");

// A face kept mounted behind another reads false, so its shortcuts and the shared artifact state stand down.
export function useFaceShown(): Ref<boolean> {
  return inject(FACE_SHOWN, ref(true));
}
