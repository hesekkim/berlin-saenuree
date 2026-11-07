export function clampSlideIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(0, index), slideCount - 1);
}
