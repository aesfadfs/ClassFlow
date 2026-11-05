import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntry, demoState, emptyState, restoreScheduleState, findConflicts, freeWindows, isScheduleState, layoutDay, occursInWeek, parseDate, parseTime, weekDates, weekNumber, dateKey, validateEntry } from '../src/domain/schedule.ts';
import { analyzeImport, CSV_TEMPLATE, parseCSV, parseImport } from '../src/domain/import.ts';

test('fresh installs start empty and legacy examples do not return on upgrade', () => {
  const initial = emptyState(new Date(2026, 10, 4));
  assert.deepEqual(initial.entries, []);
  assert.equal(initial.demo, false);
  assert.equal(isScheduleState(initial), true);
  assert.equal(initial.preferences.semesterStart, '2026-08-31');
  const legacy = demoState();
  const migrated = restoreScheduleState(JSON.stringify(legacy));
  assert.deepEqual(migrated.entries, []);
  assert.equal(migrated.demo, false);
  assert.deepEqual(migrated.preferences, legacy.preferences);
  const saved = { ...initial, entries: [createEntry({ title: '已保存的课程' }), createEntry({ title: '个人安排', kind: 'plan' })] };
  assert.deepEqual(restoreScheduleState(JSON.stringify(saved)), saved);
  assert.deepEqual(restoreScheduleState(JSON.stringify(initial)), initial);
  assert.throws(() => restoreScheduleState('broken'));
  assert.throws(() => restoreScheduleState('{}'));
});

test('semester boundaries use local calendar dates', () => {
  assert.equal(weekNumber(parseDate('2026-10-30'), '2026-08-31'), 9);
  assert.equal(weekNumber(parseDate('2026-08-30'), '2026-08-31'), 0);
  assert.equal(dateKey(weekDates('2026-08-31', 9)[6]), '2026-11-01');
  assert.throws(() => parseDate('2026-02-30'));
  assert.throws(() => parseTime('25:10'));
  assert.throws(() => parseTime('08:99'));
});
test('odd and even weeks never report a false collision', () => {
  const odd = createEntry({ title: '单周课', parity: 'odd' });
  const even = createEntry({ title: '双周课', parity: 'even' });
  assert.equal(findConflicts(odd, [even]).length, 0);
  assert.equal(occursInWeek(odd, 2), false);
  assert.equal(occursInWeek(odd, 3), true);
  assert.equal(validateEntry({ ...odd, startWeek: 2, endWeek: 2 }), '所选周次内没有符合单双周的日期');
});
test('adjacent courses do not conflict, real overlaps do', () => {
  const a = createEntry({ title: 'A', start: 480, end: 580 });
  const b = createEntry({ title: 'B', start: 580, end: 680 });
  assert.equal(findConflicts(a, [a, b]).length, 0);
  assert.equal(findConflicts({ ...b, start: 579 }, [a]).length, 1);
});
test('free time merges overlapping occupied intervals and clips to day', () => {
  const a = createEntry({ title: 'A', start: 450, end: 580 });
  const b = createEntry({ title: 'B', start: 540, end: 660 });
  const c = createEntry({ title: 'C', start: 1200, end: 1320 });
  assert.deepEqual(freeWindows([b, c, a], 1, 0), [{ start: 660, end: 1200 }]);
});
test('chain overlaps occupy stable non-overlapping lanes', () => {
  const entries = [createEntry({ title: 'A', start: 480, end: 600 }), createEntry({ title: 'B', start: 540, end: 660 }), createEntry({ title: 'C', start: 600, end: 720 })];
  assert.deepEqual(layoutDay(entries).map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 2]]);
});
test('CSV supports UTF-8 BOM, quoted commas, escaped quotes and multiline notes', () => {
  assert.deepEqual(parseCSV('\uFEFF课程,备注\r\n"数学, A","第一行\n第二行 ""重点"""'), [['课程', '备注'], ['数学, A', '第一行\n第二行 "重点"']]);
  assert.throws(() => parseCSV('a,b\n"unclosed'));
  const parsed = parseImport('\uFEFF' + CSV_TEMPLATE, '课程.CSV');
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].day, 0);
});
test('invalid rows are reported instead of silently dropped', () => {
  const parsed = parseImport('课程名称,星期,开始时间,结束时间\n数学,周九,08:00,09:40\n英语,周一,10:00,09:00', '课程.csv');
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.errors.length, 2);
  assert.throws(() => parseImport('a,b\n1,2', '课程.csv'));
});
test('backup roundtrip retains times, days and independent identifiers', () => {
  const original = demoState();
  const parsed = parseImport(JSON.stringify(original), 'backup.json');
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries.length, original.entries.length);
  assert.equal(parsed.entries[0].day, original.entries[0].day);
  assert.equal(parsed.entries[0].start, original.entries[0].start);
  assert.notEqual(parsed.entries[0].id, original.entries[0].id);
  assert.deepEqual(parsed.preferences, original.preferences);
  assert.equal(isScheduleState(original), true);
  assert.equal(isScheduleState({ ...original, preferences: { ...original.preferences, semesterWeeks: 10 } }), true);
  assert.equal(isScheduleState({ ...original, entries: [null] }), false);
});

test('import preview and commit share a deduplicated merge and count real conflicts', () => {
  const manual = createEntry({ title: '手动课程', endWeek: 5, parity: 'odd' });
  const duplicate = createEntry({ ...manual, id: 'duplicate', weeks: [1, 3, 5], parity: 'all' });
  const separateWeeks = createEntry({ title: '离散周课程', startWeek: 2, endWeek: 4, weeks: [2, 4] });
  const overlap = createEntry({ title: '重叠课程', startWeek: 1, endWeek: 1 });
  const result = analyzeImport([duplicate, separateWeeks, overlap, separateWeeks], [manual], false);
  assert.deepEqual(result.entries, [separateWeeks, overlap]);
  assert.deepEqual(result.nextEntries, [manual, separateWeeks, overlap]);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.conflictCount, 1);
  assert.equal(analyzeImport([duplicate, separateWeeks, overlap], result.nextEntries, false).entries.length, 0);
  const plan = createEntry({ title: '个人安排', kind: 'plan' });
  assert.deepEqual(analyzeImport([separateWeeks], [manual, plan], true).nextEntries, [plan, separateWeeks]);
  assert.deepEqual(analyzeImport([separateWeeks], [manual, plan], true, true).nextEntries, [separateWeeks]);
});

test('backup roundtrip preserves explicit weeks and import source', () => {
  const entry = createEntry({ title: '实验课', startWeek: 1, endWeek: 9, weeks: [1, 5, 9], importSource: 'demo' });
  const state = { ...demoState(), entries: [entry] };
  const parsed = parseImport(JSON.stringify(state), 'backup.json');
  assert.deepEqual(parsed.entries[0].weeks, entry.weeks);
  assert.equal(parsed.entries[0].importSource, entry.importSource);
});
