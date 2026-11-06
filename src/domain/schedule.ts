export type EntryKind = 'course' | 'plan';
export type EntryColor = 'blue' | 'purple' | 'green' | 'orange' | 'pink';
export type Entry = {
  id: string;
  title: string;
  kind: EntryKind;
  day: number;
  start: number;
  end: number;
  startWeek: number;
  endWeek: number;
  parity: 'all' | 'odd' | 'even';
  weeks?: number[];
  importSource?: string;
  color: EntryColor;
  location: string;
  teacher: string;
  notes: string;
};
export type Preferences = { semesterStart: string; semesterWeeks: number; school: string };
export type ScheduleState = { version: 1; entries: Entry[]; preferences: Preferences; demo: boolean };

export const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const COLORS = {
  blue: { bg: '#eaf1ff', accent: '#4c7ee9', text: '#3764b8' },
  purple: { bg: '#f0edfc', accent: '#9b81d8', text: '#7a61b3' },
  green: { bg: '#e9f4ee', accent: '#66a585', text: '#468568' },
  orange: { bg: '#fcf1e5', accent: '#dda25c', text: '#b48040' },
  pink: { bg: '#faecf0', accent: '#d58fa9', text: '#b86c87' },
};

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
export const formatTime = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
export function parseTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match || +match[1] > 23 || +match[2] > 59) throw new Error('时间请填写为 HH:MM，例如 08:00');
  return +match[1] * 60 + +match[2];
}
export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期请填写为 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('日期无效');
  return date;
}
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export const dayOfWeek = (date: Date) => (date.getDay() + 6) % 7;
export function weekNumber(date: Date, semesterStart: string): number {
  const start = parseDate(semesterStart);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  return Math.floor(Math.round((target.getTime() - start.getTime()) / 86400000) / 7) + 1;
}
export const weekDates = (semesterStart: string, week: number) => Array.from({ length: 7 }, (_, day) => addDays(parseDate(semesterStart), (week - 1) * 7 + day));
export function occursInWeek(entry: Entry, week: number): boolean {
  if (entry.weeks) return entry.weeks.includes(week);
  return week >= entry.startWeek && week <= entry.endWeek && (entry.parity === 'all' || (entry.parity === 'odd' ? week % 2 === 1 : week % 2 === 0));
}
/** Weeks (1…semesterWeeks) in which the entry takes place. */
export const selectedWeeks = (entry: Entry, semesterWeeks: number) => Array.from({ length: semesterWeeks }, (_, index) => index + 1).filter(week => occursInWeek(entry, week));

/**
 * Store a set of picked weeks in the simplest equivalent form: a continuous
 * range, an odd- or even-week range, or else the explicit list of weeks.
 */
export function weekRule(picked: number[]): Pick<Entry, 'startWeek' | 'endWeek' | 'parity' | 'weeks'> {
  const weeks = [...new Set(picked)].filter(week => Number.isInteger(week) && week > 0).sort((a, b) => a - b);
  if (!weeks.length) throw new Error('请至少选择一周');
  const startWeek = weeks[0], endWeek = weeks[weeks.length - 1];
  const steps = weeks.slice(1).map((week, index) => week - weeks[index]);
  if (steps.every(step => step === 1)) return { startWeek, endWeek, parity: 'all', weeks: undefined };
  if (steps.every(step => step === 2)) return { startWeek, endWeek, parity: startWeek % 2 ? 'odd' : 'even', weeks: undefined };
  return { startWeek, endWeek, parity: 'all', weeks };
}

export const entriesForWeek = (entries: Entry[], week: number) => entries.filter(entry => occursInWeek(entry, week)).sort((a, b) => a.day - b.day || a.start - b.start);
export const entriesForDay = (entries: Entry[], week: number, day: number) => entriesForWeek(entries, week).filter(entry => entry.day === day);

export function validateEntry(entry: Entry, semesterWeeks = 30): string | null {
  if (!entry.title.trim()) return '给这段时间起个名字吧';
  if (entry.title.length > 80) return '名称最多 80 个字';
  if (!Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6) return '请选择有效的星期';
  if (![entry.start, entry.end].every(Number.isInteger) || entry.start < 0 || entry.end > 1439 || entry.end <= entry.start) return '结束时间需要晚于开始时间，且在同一天内';
  if (!Number.isInteger(entry.startWeek) || !Number.isInteger(entry.endWeek) || entry.startWeek < 1 || entry.endWeek < entry.startWeek || entry.endWeek > semesterWeeks) return `周次范围应在第 1–${semesterWeeks} 周之间`;
  if (!['course', 'plan'].includes(entry.kind) || !Object.hasOwn(COLORS, entry.color) || !['all', 'odd', 'even'].includes(entry.parity)) return '课程格式不正确';
  if (entry.weeks !== undefined) {
    const { weeks } = entry;
    if (!Array.isArray(weeks) || !weeks.length || weeks.length > semesterWeeks || entry.parity !== 'all'
      || weeks[0] !== entry.startWeek || weeks[weeks.length - 1] !== entry.endWeek
      || [...weeks].some((week, index) => !Number.isInteger(week) || (index > 0 && week <= weeks[index - 1]))) {
      return '指定周次须为从小到大排列且不重复的整数';
    }
  } else if (entry.parity !== 'all' && entry.startWeek === entry.endWeek && !occursInWeek(entry, entry.startWeek)) {
    return '所选周次内没有符合单双周的日期';
  }
  if (entry.importSource !== undefined && (typeof entry.importSource !== 'string' || !entry.importSource.trim() || entry.importSource.length > 80)) return '导入来源格式不正确';
  return null;
}

export function findConflicts(entry: Entry, entries: Entry[]): Entry[] {
  return entries.filter(other => {
    if (other.id === entry.id || other.day !== entry.day || other.start >= entry.end || other.end <= entry.start) return false;
    for (let week = Math.max(entry.startWeek, other.startWeek); week <= Math.min(entry.endWeek, other.endWeek); week++) {
      if (occursInWeek(entry, week) && occursInWeek(other, week)) return true;
    }
    return false;
  });
}

export function freeWindows(entries: Entry[], week: number, day: number, start = 480, end = 1260) {
  const busy = entriesForDay(entries, week, day).filter(entry => entry.start < end && entry.end > start);
  const windows: { start: number; end: number }[] = [];
  let cursor = start;
  for (const entry of busy) {
    if (entry.start > cursor) windows.push({ start: cursor, end: Math.min(entry.start, end) });
    cursor = Math.max(cursor, entry.end);
  }
  if (cursor < end) windows.push({ start: cursor, end });
  return windows.filter(window => window.end - window.start >= 30);
}

export type Occurrence = { entry: Entry; date: Date; week: number; offset: number };

// Concrete upcoming sessions from "now": unfinished items today first, then
// later days in date/time order. Only weeks inside the semester are used, so
// discrete weeks and odd/even rules keep their meaning. With `once`, each
// entry appears only at its next session (the home cards), still in start order.
export function upcomingOccurrences(entries: Entry[], preferences: Preferences, now: Date, { days = 28, limit = 12, once = false } = {}): Occurrence[] {
  const result: Occurrence[] = [];
  const seen = new Set<string>();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const minute = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset < days && result.length < limit; offset++) {
    const date = addDays(today, offset);
    const week = weekNumber(date, preferences.semesterStart);
    if (week < 1 || week > preferences.semesterWeeks) continue;
    for (const entry of entriesForDay(entries, week, dayOfWeek(date))) {
      if (offset === 0 && entry.end <= minute) continue;
      if (once && seen.has(entry.id)) continue;
      seen.add(entry.id);
      result.push({ entry, date, week, offset });
      if (result.length >= limit) break;
    }
  }
  return result;
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分钟` : ''}` : `${rest} 分钟`;
}

export function describeOccurrence({ entry, date, offset }: Occurrence, now: Date): { status: string; progress: number | null; dateLabel: string } {
  const minute = now.getHours() * 60 + now.getMinutes();
  const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日 ${DAYS[dayOfWeek(date)]}`;
  if (offset === 0 && entry.start <= minute && minute < entry.end) {
    return { status: `进行中 · 还剩 ${duration(entry.end - minute)}`, progress: (minute - entry.start) / (entry.end - entry.start), dateLabel };
  }
  if (offset === 0) return { status: entry.start - minute <= 90 ? `${duration(entry.start - minute)}后开始` : `今天 ${formatTime(entry.start)}`, progress: null, dateLabel };
  const prefix = offset === 1 ? '明天' : offset === 2 ? '后天' : dateLabel;
  return { status: `${prefix} ${formatTime(entry.start)}`, progress: null, dateLabel };
}

// Connected overlap groups share a stable lane count, including chain overlaps.
export function layoutDay(entries: Entry[]): { entry: Entry; lane: number; lanes: number }[] {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { entry: Entry; lane: number; lanes: number }[] = [];
  let group: Entry[] = [], groupEnd = -1;
  function flush() {
    const ends: number[] = [];
    const items = group.map(entry => {
      let lane = ends.findIndex(end => end <= entry.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = entry.end;
      return { entry, lane };
    });
    result.push(...items.map(item => ({ ...item, lanes: ends.length })));
    group = []; groupEnd = -1;
  }
  for (const entry of sorted) {
    if (entry.start >= groupEnd && group.length) flush();
    group.push(entry); groupEnd = Math.max(groupEnd, entry.end);
  }
  if (group.length) flush();
  return result;
}

export function createEntry(overrides: Partial<Entry> = {}): Entry {
  return { id: uid(), title: '', kind: 'course', day: 0, start: 480, end: 580, startWeek: 1, endWeek: 20, parity: 'all', color: 'blue', location: '', teacher: '', notes: '', ...overrides };
}

export function emptyState(now = new Date()): ScheduleState {
  // Keep the initial empty calendar in the current semester.
  const semester = new Date(now.getFullYear(), now.getMonth() >= 7 ? 7 : 1, now.getMonth() >= 7 ? 31 : 23, 12);
  semester.setDate(semester.getDate() - dayOfWeek(semester));
  return {
    version: 1, demo: false,
    preferences: { semesterStart: dateKey(semester), semesterWeeks: 20, school: '海南师范大学' },
    entries: [],
  };
}

export function restoreScheduleState(raw: string): ScheduleState {
  const parsed: unknown = JSON.parse(raw);
  if (!isScheduleState(parsed)) throw new Error('invalid backup');
  // Older installs can contain untouched starter examples. User edits and
  // confirmed imports already set demo to false and must be kept on upgrade.
  return parsed.demo ? { ...parsed, demo: false, entries: [] } : parsed;
}

export function demoState(): ScheduleState {
  const course = (title: string, day: number, start: number, end: number, color: EntryColor, location: string, teacher: string) => createEntry({ title, day, start, end, color, location, teacher });
  return {
    ...emptyState(), demo: true,
    entries: [
      course('高等数学 A', 0, 480, 580, 'blue', '公共教学楼 · 302', '陈老师'),
      course('大学英语', 0, 610, 710, 'purple', '外语楼 · 205', '王老师'),
      course('程序设计基础', 0, 870, 970, 'orange', '实验楼 · 401', '李老师'),
      course('程序设计基础', 1, 480, 580, 'orange', '实验楼 · 401', '李老师'),
      course('思想道德与法治', 1, 840, 940, 'pink', '公共教学楼 · 108', '张老师'),
      course('大学英语', 2, 610, 710, 'purple', '外语楼 · 205', '王老师'),
      course('高等数学 A', 2, 840, 940, 'blue', '公共教学楼 · 302', '陈老师'),
      course('数据结构', 3, 480, 580, 'green', '信息楼 · 306', '林老师'),
      course('大学体育', 3, 960, 1060, 'orange', '体育馆 · 羽毛球场', '周老师'),
      course('高等数学 A', 4, 480, 580, 'blue', '公共教学楼 · 302', '陈老师'),
      course('数据结构', 4, 840, 940, 'green', '信息楼 · 306', '林老师'),
      createEntry({ title: '去图书馆，读几页书', kind: 'plan', day: 1, start: 630, end: 720, color: 'green', location: '图书馆 · 三楼', startWeek: 1, endWeek: 20 }),
      createEntry({ title: '留一点时间给自己', kind: 'plan', day: 5, start: 900, end: 1020, color: 'purple', notes: '散步、音乐，或者什么也不做。' }),
    ],
  };
}

export function isScheduleState(value: unknown): value is ScheduleState {
  if (!value || typeof value !== 'object') return false;
  const state = value as ScheduleState;
  try {
    parseDate(state.preferences.semesterStart);
    return dayOfWeek(parseDate(state.preferences.semesterStart)) === 0 && state.version === 1 && typeof state.demo === 'boolean' && typeof state.preferences.school === 'string' && Number.isInteger(state.preferences.semesterWeeks) && state.preferences.semesterWeeks >= 1 && state.preferences.semesterWeeks <= 30 && Array.isArray(state.entries) && state.entries.length <= 3000 && state.entries.every(entry => entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.location === 'string' && typeof entry.teacher === 'string' && typeof entry.notes === 'string' && !validateEntry(entry, 30));
  } catch { return false; }
}
