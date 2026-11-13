import { COLORS, createEntry, parseTime, validateEntry, type Entry, type EntryColor } from '../domain/schedule.ts';
import { matchesSchoolUrl, sameHost, type SchoolAdapter } from './schools.ts';

export type SectionTime = { section: number; endSection?: number; start: string; end: string };
export type CapturedCourse = {
  name: string; teacher: string; location: string; weekday: number;
  weeks: string; sections: string;
  start?: string; end?: string;
};
export type TimetableCapture = {
  type: 'timetable'; version: 1; sourceUrl: string; term: string;
  courses: CapturedCourse[]; periodTimes: SectionTime[]; warnings: string[];
};

// Parse complete expressions; never silently turn an unknown week into a full semester.
export function parseNumberList(value: string, maximum: number): number[] {
  const normalized = value.replace(/[，、]/g, ',').replace(/[－—–~～至]/g, '-').replace(/\s/g, '');
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(normalized)) throw new Error(`无法识别范围“${value}”`);
  const result = new Set<number>();
  for (const part of normalized.split(',')) {
    const [first, last = first] = part.split('-').map(Number);
    if (first < 1 || last < first || last > maximum) throw new Error(`范围须在 1–${maximum} 以内`);
    for (let n = first; n <= last; n++) result.add(n);
  }
  return [...result].sort((a, b) => a - b);
}

export function parseZhengfangWeeks(value: string, maximum: number): number[] {
  // 强智 writes 1-16(周) and 2-16(双周); old 正方 writes {第1-16周|单周}.
  const normalized = value.replace(/\s/g, '').replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/^\{|\}$/g, '').replace(/\|/g, '').replace(/\(周\)/g, '周')
    .replace(/单周/g, '单').replace(/双周/g, '双').replace(/第/g, '')
    .replace(/[，、；;]/g, ',').replace(/[－—–~～至]/g, '-');
  const weeks = new Set<number>();
  // Keep explicit 周 boundaries: in 4周,9周,13-19周(单), only the final
  // range is odd-only. Removing 周 first silently drops the standalone week 4.
  let rest = normalized;
  if (!rest) throw new Error(`无法识别周次“${value}”`);
  while (rest) {
    const group = /^(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)((?:\([单双]\)|[单双])?)(周?)((?:\([单双]\)|[单双])?)/.exec(rest);
    if (!group || (group[2] && group[4])) throw new Error(`无法识别周次“${value}”`);
    const marker = group[2] || group[4];
    const parity = marker.includes('单') ? 1 : marker.includes('双') ? 0 : null;
    parseNumberList(group[1], maximum).forEach(week => { if (parity === null || week % 2 === parity) weeks.add(week); });
    rest = rest.slice(group[0].length);
    if (rest) {
      if (!rest.startsWith(',') || rest.length === 1) throw new Error(`无法识别周次“${value}”`);
      rest = rest.slice(1);
    }
  }
  if (!weeks.size) throw new Error('周次范围内没有符合单双周的课程');
  return [...weeks].sort((a, b) => a - b);
}

export function courseSections(value: string): number[] {
  const cleaned = value.replace(/[第节()（）\[\]【】]/g, '').replace(/\s/g, '');
  // 强智 lists every period with hyphens: 01-02-03-04 means 1, 2, 3 and 4.
  if (/^\d+(?:-\d+){2,}$/.test(cleaned)) return parseNumberList(cleaned.replace(/-/g, ','), 30);
  return parseNumberList(cleaned, 30);
}

// Fixed schools accept only their configured timetable hosts. The open browser
// accepts a capture only from the host of the page that posted it.
function trustedSource(sourceUrl: unknown, school: SchoolAdapter, pageUrl?: string): boolean {
  if (typeof sourceUrl !== 'string') return false;
  if (school.mode === 'open') return !!pageUrl && sameHost(sourceUrl, pageUrl);
  return matchesSchoolUrl(sourceUrl, school.timetableHosts);
}

export function readTimetableCapture(message: string, school: SchoolAdapter, pageUrl?: string): TimetableCapture | null {
  if (message.length > 2_000_000) throw new Error('课表内容超过 2 MB，请缩小查询范围');
  const data = JSON.parse(message);
  if (data?.type !== 'timetable') return null;
  if (data.version !== 1 || !trustedSource(data.sourceUrl, school, pageUrl)
    || !Array.isArray(data.courses) || data.courses.length > 1000
    || !Array.isArray(data.periodTimes) || data.periodTimes.length > 30
    || typeof data.term !== 'string' || data.term.length > 200
    || !Array.isArray(data.warnings) || data.warnings.length > 1000) throw new Error('课表来源或格式无效，请重新识别');
  for (const course of data.courses) {
    if (!course || !['name', 'teacher', 'location', 'weeks', 'sections'].every(key => typeof course[key] === 'string' && course[key].length <= 500)
      || !Number.isInteger(course.weekday)) throw new Error('课表记录格式无效，请重新识别');
    if (course.start !== undefined || course.end !== undefined) {
      if (typeof course.start !== 'string' || typeof course.end !== 'string') throw new Error('课程时间格式无效');
      parseTime(course.start); parseTime(course.end);
    }
  }
  if (!data.warnings.every((warning: unknown) => typeof warning === 'string' && warning.length <= 500)) throw new Error('课表提示格式无效');
  for (const period of data.periodTimes) {
    if (!period || !Number.isInteger(period.section) || period.section < 1 || period.section > 30
      || typeof period.start !== 'string' || typeof period.end !== 'string') throw new Error('节次时间格式无效');
    if (period.endSection !== undefined && (!Number.isInteger(period.endSection) || period.endSection < period.section || period.endSection > 30)) throw new Error('节次范围无效');
    parseTime(period.start); parseTime(period.end);
  }
  return data;
}

export function requiredSectionTimes(capture: TimetableCapture): SectionTime[] {
  const sections = new Set<number>();
  for (const course of capture.courses) {
    try { courseSections(course.sections).forEach(section => sections.add(section)); } catch { /* shown in preview */ }
  }
  const known = capture.periodTimes.filter(period => [...sections].some(section => section >= period.section && section <= (period.endSection ?? period.section)));
  return [...known, ...[...sections].filter(section => !known.some(period => section >= period.section && section <= (period.endSection ?? period.section)))
    .map(section => ({ section, start: '', end: '' }))].sort((a, b) => a.section - b.section);
}

export function resolveSchoolPeriodTimes(capture: TimetableCapture, school: SchoolAdapter) {
  const profile = school.periodTimeProfile;
  const fallbackSections: number[] = [];
  if (!profile || !matchesSchoolUrl(capture.sourceUrl, school.timetableHosts) || !capture.courses.length
    || !capture.courses.every(course => profile.campusMarkers.some(marker => course.location.includes(marker)))) {
    return { capture, fallbackSections, source: '' };
  }
  const needed = new Set<number>();
  for (const course of capture.courses) {
    if (course.start && course.end) continue;
    try { courseSections(course.sections).forEach(section => needed.add(section)); } catch { /* preview reports malformed sections */ }
  }
  const times = [...capture.periodTimes];
  for (const time of profile.times) {
    // Explicit clocks, including merged ranges, always take precedence. Never
    // infer unknown internal boundaries or extrapolate an eleventh period.
    if (needed.has(time.section) && !times.some(known => time.section >= known.section && time.section <= (known.endSection ?? known.section))) {
      times.push({ ...time }); fallbackSections.push(time.section);
    }
  }
  return {
    capture: fallbackSections.length ? { ...capture, periodTimes: times.sort((a, b) => a.section - b.section) } : capture,
    fallbackSections,
    source: fallbackSections.length ? `${profile.label} · ${profile.source}` : '',
  };
}

export function normalizeZhengfang(capture: TimetableCapture, times: SectionTime[], semesterWeeks: number, schoolId: string) {
  const starts = new Map<number, number>(), ends = new Map<number, number>();
  for (const time of [...times].sort((a, b) => a.section - b.section)) {
    const start = parseTime(time.start), end = parseTime(time.end);
    const endSection = time.endSection ?? time.section;
    if (!Number.isInteger(time.section) || time.section < 1 || !Number.isInteger(endSection) || endSection < time.section || endSection > 30 || end <= start
      || (starts.has(time.section) && starts.get(time.section) !== start) || (ends.has(endSection) && ends.get(endSection) !== end)) {
      throw new Error(`第 ${time.section} 节时间无效：节次须按顺序排列且不能重叠`);
    }
    starts.set(time.section, start); ends.set(endSection, end);
  }
  const boundaries = [...starts].map(([section, minute]) => ({ order: section * 2, minute }))
    .concat([...ends].map(([section, minute]) => ({ order: section * 2 + 1, minute }))).sort((a, b) => a.order - b.order);
  if (boundaries.some((boundary, index) => index > 0 && boundary.minute < boundaries[index - 1].minute)) {
    throw new Error('识别到的节次时间不一致，请在学校课表刷新后重新识别');
  }
  const entries: Entry[] = [], errors = [...capture.warnings];
  const keys = new Set<string>();
  const colors = new Map<string, EntryColor>();
  for (const [index, course] of capture.courses.entries()) {
    try {
      const weeks = parseZhengfangWeeks(course.weeks, semesterWeeks);
      const sections = courseSections(course.sections);
      const groups: number[][] = [];
      sections.forEach(section => {
        const group = groups[groups.length - 1];
        if (group && group[group.length - 1] + 1 === section) group.push(section);
        else groups.push([section]);
      });
      if (!colors.has(course.name)) colors.set(course.name, (Object.keys(COLORS) as EntryColor[])[colors.size % 5]);
      const courseEntries = groups.map(group => {
        const direct = groups.length === 1 && course.start && course.end;
        const start = direct ? parseTime(course.start!) : starts.get(group[0]);
        const end = direct ? parseTime(course.end!) : ends.get(group[group.length - 1]);
        if (start === undefined || end === undefined) throw new Error('学校页面未提供完整时间，请在教务课表打开显示作息时间后重新识别');
        const entry = createEntry({
          title: course.name.trim(), teacher: course.teacher.trim(), location: course.location.trim(),
          day: course.weekday - 1, start, end,
          weeks, startWeek: weeks[0], endWeek: weeks[weeks.length - 1], color: colors.get(course.name),
          notes: [capture.term, `第 ${group.join('、')} 节`].filter(Boolean).join(' · '), importSource: `school:${schoolId}`,
        });
        const error = validateEntry(entry, semesterWeeks);
        if (error) throw new Error(error);
        return entry;
      });
      for (const entry of courseEntries) {
        const key = JSON.stringify([entry.title, entry.teacher, entry.location, entry.day, entry.start, entry.end, entry.weeks]);
        if (!keys.has(key)) { keys.add(key); entries.push(entry); }
      }
    } catch (error) { errors.push(`第 ${index + 1} 条（${course.name || '未命名课程'}）：${error instanceof Error ? error.message : '解析失败'}`); }
  }
  if (!entries.length && !errors.length) errors.push('当前学期没有可导入的课程，请检查教务系统中的学期选择');
  return { entries, errors };
}
