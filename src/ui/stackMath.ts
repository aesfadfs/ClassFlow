// Geometry of the "up next" card stack, shared by the UI thread and tests.
//
// Cards form a vertical list. When a card reaches the top it stays pinned while
// the cards after it keep sliding up over it. Each pinned card's depth is how
// many cards have moved in front of it: the deeper, the higher it peeks, the
// smaller and darker it gets, and past MAX_DEPTH it fades out gradually.

export const STACK = {
  TOP: 30,        // room above the pinned card for the peeking stack
  LIFT: 9,        // each layer of depth peeks this much higher
  SHRINK: 0.055,  // and this much smaller
  MAX_DEPTH: 3,   // layers kept visible; the next one fades out over one card
  GAP: 12,        // space between cards in the list
};

export type StackPose = { translateY: number; scale: number; opacity: number; content: number; shade: number; zIndex: number };

/**
 * `relative` = card index − scroll position (in cards): ≥ 0 means the card is
 * at or below the top slot, < 0 means it is pinned with depth −relative.
 * `step` is card height + gap in pixels.
 */
export function stackPose(relative: number, index: number, step: number): StackPose {
  'worklet';
  if (relative >= 0) {
    return { translateY: STACK.TOP + relative * step, scale: 1, opacity: 1, content: 1, shade: 0, zIndex: 1000 + index };
  }
  const depth = -relative;
  const visible = Math.min(depth, STACK.MAX_DEPTH);
  return {
    translateY: STACK.TOP - visible * STACK.LIFT,
    scale: 1 - Math.min(depth, STACK.MAX_DEPTH + 1) * STACK.SHRINK,
    opacity: depth <= STACK.MAX_DEPTH ? 1 : Math.max(0, 1 - (depth - STACK.MAX_DEPTH)),
    content: Math.max(0, 1 - depth * 1.5),
    shade: Math.min(0.4, depth * 0.13),
    zIndex: 1000 + index,
  };
}

/** Where a released drag settles: project the fling a little, then land on a whole card. */
export function settleIndex(position: number, velocity: number, count: number): number {
  'worklet';
  return Math.max(0, Math.min(count - 1, Math.round(position + velocity * 0.22)));
}

/** Keep the same card at the top after the list changes; fall back to the nearest valid slot. */
export function anchoredIndex(keys: string[], anchor: string | null, previous: number): number {
  if (!keys.length) return 0;
  const found = anchor ? keys.indexOf(anchor) : -1;
  return found >= 0 ? found : Math.max(0, Math.min(previous, keys.length - 1));
}
