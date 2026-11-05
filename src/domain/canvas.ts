import type { Entry } from './schedule.ts';

export type Placement = { day: number; start: number; end: number };
export const SNAP_MINUTES = 5;

// Prefer nearby card edges over the five-minute grid, preserving exact imported times.
export function snapPlacement(entry: Entry, day: number, minute: number, peers: Entry[], resize = false): Placement {
  const duration = entry.end - entry.start;
  const lower = resize ? Math.min(1439, entry.start + SNAP_MINUTES) : 0;
  const upper = resize ? 1439 : 1439 - duration;
  const bounded = Math.max(lower, Math.min(upper, minute));
  let snapped = Math.round(bounded / SNAP_MINUTES) * SNAP_MINUTES;
  const edges = peers.filter(other => other.id !== entry.id && other.day === day)
    .flatMap(other => resize ? [other.start, other.end] : [other.start, other.end, other.start - duration, other.end - duration])
    .filter(edge => edge >= lower && edge <= upper && Math.abs(edge - bounded) <= 7);
  if (edges.length) snapped = edges.sort((a, b) => Math.abs(a - bounded) - Math.abs(b - bounded))[0];
  snapped = Math.max(lower, Math.min(upper, snapped));
  return { day: Math.max(0, Math.min(6, day)), start: resize ? entry.start : snapped, end: resize ? snapped : snapped + duration };
}
