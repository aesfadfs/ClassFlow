// Period ("节次") layout of the detailed timetable: every row has the same
// height and lines up across the week, instead of a proportional time axis.
//
// Rows come from a bell schedule the user explicitly chose, plus the times of
// the courses themselves. Without a chosen schedule, rows are the distinct
// course time ranges, so nothing is guessed about a school's periods.

export type PeriodTime = { start: number; end: number };
export type PeriodRow = { start: number; end: number; label?: number };
export type PlacedRow = PeriodRow & { top: number; height: number };

type Span = { start: number; end: number };

/** Parts of [start, end) not covered by `cover` (sorted, non-overlapping). */
function uncovered(span: Span, cover: Span[]): Span[] {
  const pieces: Span[] = [];
  let cursor = span.start;
  for (const part of cover) {
    if (part.end <= cursor) continue;
    if (part.start >= span.end) break;
    if (part.start > cursor) pieces.push({ start: cursor, end: Math.min(part.start, span.end) });
    cursor = Math.max(cursor, part.end);
    if (cursor >= span.end) break;
  }
  if (cursor < span.end) pieces.push({ start: cursor, end: span.end });
  return pieces;
}

/**
 * Rows for one week. With `periods`, each period is a numbered row and only
 * the parts of entries outside every period add extra (unnumbered) rows.
 * Without it, rows are cut at every entry start and end, keeping only the
 * stretches some entry covers.
 */
export function periodRows(entries: Span[], periods: PeriodTime[] | null): PeriodRow[] {
  const bell = [...(periods ?? [])].filter(period => period.end > period.start).sort((a, b) => a.start - b.start);
  // A course running through the short break between two periods stays one block (it
  // spans the gap); only time outside the bell schedule, or a stretch that
  // does not just bridge two periods, becomes an extra row.
  const bridges = (piece: Span) => bell.some(period => period.end === piece.start) && bell.some(period => period.start === piece.end);
  const spans: Span[] = [...bell, ...entries.flatMap(entry => bell.length ? uncovered(entry, bell).filter(piece => !bridges(piece)) : [entry])];
  const cuts = [...new Set(spans.flatMap(span => [span.start, span.end]))].sort((a, b) => a - b);
  const rows: PeriodRow[] = [];
  for (let index = 0; index < cuts.length - 1; index++) {
    const start = cuts[index], end = cuts[index + 1];
    if (!spans.some(span => span.start <= start && span.end >= end)) continue;
    const period = bell.findIndex(item => item.start === start && item.end === end);
    rows.push(period >= 0 ? { start, end, label: period + 1 } : { start, end });
  }
  return rows;
}

/** Pixel rows: numbered periods share one height; unnumbered rows scale with their length within limits. */
export function placeRows(rows: PeriodRow[], rowHeight: number, gap: number): PlacedRow[] {
  let top = 0;
  return rows.map((row, index) => {
    if (index > 0) top += rows[index - 1].end === row.start ? 0 : gap;
    // Unnumbered rows usually hold a whole class (often a double period), so they grow with their length.
    const height = row.label ? rowHeight : Math.max(rowHeight * 0.55, Math.min(rowHeight * 1.8, (row.end - row.start) / 60 * rowHeight));
    const placed = { ...row, top, height };
    top += height;
    return placed;
  });
}

/** Vertical position of a time: linear inside a row, squeezed into the gap between rows. */
export function minuteToY(rows: PlacedRow[], minute: number): number {
  if (!rows.length) return 0;
  if (minute <= rows[0].start) return rows[0].top;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (minute <= row.end) {
      if (minute >= row.start) return row.top + (minute - row.start) / (row.end - row.start) * row.height;
      const previous = rows[index - 1];
      const from = previous.top + previous.height;
      return from + (minute - previous.end) / (row.start - previous.end) * (row.top - from);
    }
  }
  const last = rows[rows.length - 1];
  return last.top + last.height;
}
