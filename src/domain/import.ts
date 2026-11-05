import { createEntry, findConflicts, isScheduleState, occursInWeek, parseTime, validateEntry, COLORS, type Entry, type EntryColor, type Preferences } from './schedule.ts';
import { parseDemoTimetable, parseTimetableHTML } from '../features/timetableAdapters.ts';

export type ImportResult = { entries: Entry[]; errors: string[]; preferences?: Preferences };

export const parseDemoImport = parseDemoTimetable;

export function analyzeImport(entries: Entry[], existing: Entry[], replace: boolean, replaceDemo = false) {
  const retained = replace ? existing.filter(entry => !replaceDemo && entry.kind === 'plan') : existing;
  const fingerprint = (entry: Entry) => {
    const weeks = Array.from({ length: entry.endWeek - entry.startWeek + 1 }, (_, i) => entry.startWeek + i)
      .filter(week => occursInWeek(entry, week));
    return JSON.stringify([entry.title.trim(), entry.day, entry.start, entry.end, weeks, entry.kind, entry.location.trim(), entry.teacher.trim()]);
  };
  const keys = new Set(retained.map(fingerprint));
  const unique = entries.filter(entry => {
    const key = fingerprint(entry);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  const nextEntries = [...retained, ...unique];
  return {
    entries: unique,
    nextEntries,
    duplicateCount: entries.length - unique.length,
    conflictCount: unique.filter(entry => findConflicts(entry, nextEntries).length > 0).length,
  };
}

// RFC 4180 parser: handles quoted commas, line breaks and UTF-8 BOM exports.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field.length) throw new Error('CSV 引号格式有误，请使用模板格式');
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); if (row.some(cell => cell.trim())) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV 引号未闭合，请检查文件');
  row.push(field); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

export function parseImport(text: string, fileName: string, semesterWeeks = 20): ImportResult {
  if (text.length > 2_000_000) throw new Error('文件过大，请选择 2 MB 以内的课表文件');
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'html' || extension === 'htm') return parseTimetableHTML(text, semesterWeeks);
  const entries: Entry[] = [], errors: string[] = [];
  let preferences: Preferences | undefined;
  let records: Record<string, unknown>[];
  if (extension === 'json') {
    const parsed = JSON.parse(text);
    if (parsed && !Array.isArray(parsed) && parsed.version !== undefined) {
      if (!isScheduleState(parsed)) throw new Error('课序备份格式无效或版本不兼容');
      preferences = parsed.preferences;
    }
    records = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(records)) throw new Error('JSON 需要为课程数组，或包含 entries 数组');
  } else if (extension === 'csv') {
    const [header, ...rows] = parseCSV(text);
    if (!header || !rows.length) throw new Error('文件中还没有课程，请参考 CSV 模板');
    const alias: Record<string, string> = { '课程名称': 'title', '星期': 'day', '开始时间': 'start', '结束时间': 'end', '教室': 'location', '教师': 'teacher', '开始周': 'startWeek', '结束周': 'endWeek', '备注': 'notes' };
    const keys = header.map(key => alias[key.trim()] || key.trim());
    if (!['title', 'day', 'start', 'end'].every(key => keys.includes(key))) throw new Error('CSV 缺少课程名称、星期、开始时间或结束时间列');
    records = rows.map(row => Object.fromEntries(keys.map((key, i) => [key, row[i] ?? ''])));
  } else throw new Error('请选择 HTML、CSV 或 JSON 文件。Excel 文件请先另存为 UTF-8 CSV。');
  if (records.length > 1000) throw new Error('一次最多导入 1000 条记录');
  records.forEach((record, index) => {
    try {
      if (!record || typeof record !== 'object') throw new Error('课程记录格式错误');
      const isBackup = extension === 'json' && typeof record.start === 'number';
      const dayNames: Record<string, number> = { '周一': 0, '周二': 1, '周三': 2, '周四': 3, '周五': 4, '周六': 5, '周日': 6, '星期一': 0, '星期二': 1, '星期三': 2, '星期四': 3, '星期五': 4, '星期六': 5, '星期日': 6 };
      const rawDay = String(record.day ?? '').trim();
      const day = Object.hasOwn(dayNames, rawDay) ? dayNames[rawDay] : rawDay ? Number(rawDay) - (isBackup ? 0 : 1) : NaN;
      const entry = createEntry({
        title: String(record.title ?? '').trim(), day,
        start: typeof record.start === 'number' ? record.start : parseTime(String(record.start ?? '')),
        end: typeof record.end === 'number' ? record.end : parseTime(String(record.end ?? '')),
        location: String(record.location ?? ''), teacher: String(record.teacher ?? ''), notes: String(record.notes ?? ''),
        startWeek: record.startWeek ? Number(record.startWeek) : 1,
        endWeek: record.endWeek ? Number(record.endWeek) : semesterWeeks,
        kind: record.kind === 'plan' ? 'plan' : 'course',
        parity: (record.parity || 'all') as Entry['parity'],
        color: (record.color || Object.keys(COLORS)[index % 5]) as EntryColor,
        weeks: extension === 'json' ? record.weeks as Entry['weeks'] : undefined,
        importSource: preferences ? record.importSource as Entry['importSource'] : extension,
      });
      const error = validateEntry(entry, preferences ? 30 : semesterWeeks);
      if (error) throw new Error(error);
      entries.push(entry);
    } catch (error) { errors.push(`第 ${index + 1} 条：${error instanceof Error ? error.message : '格式错误'}`); }
  });
  return { entries, errors, preferences };
}

export const CSV_TEMPLATE = '课程名称,星期,开始时间,结束时间,教室,教师,开始周,结束周\n高等数学 A,周一,08:00,09:40,公共教学楼302,陈老师,1,20\n大学英语,周三,10:10,11:50,外语楼205,王老师,1,20';
