import { COLORS, createEntry, parseTime, validateEntry, type Entry, type EntryColor } from '../domain/schedule.ts';

type TimetableResult = { entries: Entry[]; errors: string[] };
export type TimetableAdapter = {
  id: string;
  extract: (html: string) => string | null;
  parse: (raw: string) => unknown;
  normalize: (data: unknown, semesterWeeks: number) => TimetableResult;
};

const SOURCE_ID = 'classflow-timetable';
const DATA_BLOCK_START = '<script type="application/json" id="classflow-timetable">';
const DATA_BLOCK_END = '</script>';
const ENTRY_LIMIT = 1000;
const colors = Object.keys(COLORS) as EntryColor[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error('教师、教室和备注需填写为文本');
  return value.trim();
}

function normalizeTimetable(data: unknown, semesterWeeks: number): TimetableResult {
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.periodTimes) || !Array.isArray(data.courses)) {
    throw new Error('课表数据格式有误，请检查模板版本、节次时间和课程列表');
  }
  if (!data.courses.length) throw new Error('文件中还没有课程');
  if (!data.periodTimes.length) throw new Error('请填写节次时间');
  if (data.courses.length > ENTRY_LIMIT) throw new Error('一次最多导入 1000 条上课安排');
  const periods = data.periodTimes.map((period, index) => {
    try {
      if (!isRecord(period) || typeof period.start !== 'string' || typeof period.end !== 'string') {
        throw new Error('请填写开始和结束时间');
      }
      const start = parseTime(period.start);
      const end = parseTime(period.end);
      if (end <= start) throw new Error('结束时间需要晚于开始时间');
      return { start, end };
    } catch (error) {
      throw new Error(`第 ${index + 1} 节：${error instanceof Error ? error.message : '节次时间无效'}`);
    }
  });
  if (periods.some((period, index) => index > 0 && period.start < periods[index - 1].end)) {
    throw new Error('节次时间需要按顺序排列且不能重叠');
  }

  const entries: Entry[] = [];
  const errors: string[] = [];
  let meetingCount = 0;
  data.courses.forEach((course, courseIndex) => {
    const courseLabel = `第 ${courseIndex + 1} 门课`;
    if (!isRecord(course) || typeof course.name !== 'string' || !course.name.trim()
      || !Array.isArray(course.meetings) || !course.meetings.length) {
      errors.push(`${courseLabel}：请填写课程名称和至少一条上课安排`);
      return;
    }

    meetingCount += course.meetings.length;
    if (meetingCount > ENTRY_LIMIT) throw new Error('一次最多导入 1000 条上课安排');
    const title = course.name.trim();
    course.meetings.forEach((meeting, meetingIndex) => {
      try {
        if (!isRecord(meeting)) throw new Error('上课安排格式有误');
        const { weekday, startSection, endSection, weeks } = meeting;
        if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
          throw new Error('星期须为 1–7 的整数');
        }
        if (typeof startSection !== 'number' || typeof endSection !== 'number'
          || !Number.isInteger(startSection) || !Number.isInteger(endSection)
          || startSection < 1 || endSection < startSection || endSection > periods.length) {
          throw new Error(`节次须在第 1–${periods.length} 节之间，且结束节次不早于开始节次`);
        }
        if (!Array.isArray(weeks) || !weeks.length || weeks.some(week => !Number.isInteger(week) || week < 1 || week > semesterWeeks)) {
          throw new Error(`周次须为第 1–${semesterWeeks} 周内的整数`);
        }
        const sortedWeeks = [...new Set<number>(weeks)].sort((a, b) => a - b);
        const entry = createEntry({
          title,
          day: weekday - 1,
          start: periods[startSection - 1].start,
          end: periods[endSection - 1].end,
          weeks: sortedWeeks,
          startWeek: sortedWeeks[0],
          endWeek: sortedWeeks[sortedWeeks.length - 1],
          color: colors[courseIndex % colors.length],
          location: optionalText(meeting.location),
          teacher: optionalText(course.teacher),
          notes: optionalText(course.notes),
          importSource: SOURCE_ID,
        });
        const issue = validateEntry(entry, semesterWeeks);
        if (issue) throw new Error(issue);
        entries.push(entry);
      } catch (error) {
        errors.push(`${courseLabel}的第 ${meetingIndex + 1} 条安排：${error instanceof Error ? error.message : '格式有误'}`);
      }
    });
  });
  return { entries, errors };
}

export const classFlowTimetableAdapter: TimetableAdapter = {
  id: SOURCE_ID,
  extract(html) {
    const start = html.indexOf(DATA_BLOCK_START);
    if (start < 0) return null;
    const contentStart = start + DATA_BLOCK_START.length;
    const end = html.indexOf(DATA_BLOCK_END, contentStart);
    if (end < 0) throw new Error('课表数据块未闭合');
    if (html.includes(DATA_BLOCK_START, contentStart)) throw new Error('文件中只能包含一个课表数据块');
    return html.slice(contentStart, end);
  },
  parse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('课表数据块不是有效的 JSON');
    }
  },
  normalize: normalizeTimetable,
};

export function parseTimetableHTML(html: string, semesterWeeks: number): TimetableResult {
  const adapter = classFlowTimetableAdapter;
  try {
    if (html.length > 2_000_000) throw new Error('文件过大，请选择 2 MB 以内的课表文件');
    const raw = adapter.extract(html);
    if (raw === null) throw new Error('未找到可识别的课表数据，请使用课序 HTML 模板或改用 CSV');
    return adapter.normalize(adapter.parse(raw), semesterWeeks);
  } catch (error) {
    return { entries: [], errors: [error instanceof Error ? error.message : '课表解析失败'] };
  }
}

export function parseDemoTimetable(semesterWeeks: number): TimetableResult {
  const sample = {
    version: 1,
    periodTimes: [
      { start: '08:00', end: '08:45' },
      { start: '08:55', end: '09:40' },
      { start: '10:10', end: '10:55' },
    ],
    courses: [
      {
        name: '高等数学 A',
        teacher: '陈老师',
        meetings: [
          { weekday: 1, startSection: 1, endSection: 2, weeks: [1, 3, 7], location: '教学楼 A101' },
          { weekday: 3, startSection: 3, endSection: 3, weeks: [2, 4, 6], location: '教学楼 A205' },
        ],
      },
      {
        name: '计算机实验',
        meetings: [{ weekday: 5, startSection: 1, endSection: 2, weeks: [1, 2, 5], location: '实验楼 302' }],
      },
    ],
  };
  for (const course of sample.courses) {
    course.meetings = course.meetings
      .map(meeting => ({ ...meeting, weeks: meeting.weeks.filter(week => week <= semesterWeeks) }))
      .filter(meeting => meeting.weeks.length);
  }
  return parseTimetableHTML(`${DATA_BLOCK_START}${JSON.stringify(sample)}${DATA_BLOCK_END}`, semesterWeeks);
}
