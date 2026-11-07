/** True for touch / coarse-pointer input (not precise mouse). */
export function isTouchLikePointer(event: Event): boolean {
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    return true;
  }
  if (event instanceof MouseEvent) {
    const pointerType = (event as PointerEvent).pointerType;
    if (pointerType === 'touch') {
      return true;
    }
    const caps = (
      event as MouseEvent & {
        sourceCapabilities?: { firesTouchEvents?: boolean };
      }
    ).sourceCapabilities;
    if (caps?.firesTouchEvents) {
      return true;
    }
  }
  return window.matchMedia('(pointer: coarse)').matches;
}
