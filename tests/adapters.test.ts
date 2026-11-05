import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursInWeek } from '../src/domain/schedule.ts';
import { parseDemoImport, parseImport } from '../src/domain/import.ts';
import { parseDemoTimetable, parseTimetableHTML } from '../src/features/timetableAdapters.ts';

const html = readFileSync(new URL('../examples/timetable.html', import.meta.url), 'utf8');

test('HTML and demo use the same adapter and retain explicit weeks for each meeting', () => {
  const demo = parseDemoImport(20);
  const fixture = parseImport(html, 'timetable.HTML', 20);
  assert.deepEqual(demo.errors, []);
  assert.deepEqual(fixture.errors, []);
  assert.equal(fixture.entries.length, 3);
  const withoutIds = (result: typeof demo) => result.entries.map(({ id, ...entry }) => entry);
  assert.deepEqual(withoutIds(demo), withoutIds(fixture));

  const [first, second, lab] = fixture.entries;
  assert.deepEqual([first.day, first.start, first.end, first.weeks], [0, 480, 580, [1, 3, 7]]);
  assert.deepEqual([second.day, second.start, second.end, second.weeks], [2, 610, 655, [2, 4, 6]]);
  assert.equal(first.title, second.title);
  assert.notEqual(first.location, second.location);
  assert.equal(lab.teacher, '');
  assert.equal(occursInWeek(first, 5), false);
  assert.equal(occursInWeek(first, 7), true);
});

test('demo adapts its sample weeks to a shorter semester', () => {
  const result = parseDemoTimetable(1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map(entry => entry.weeks), [[1], [1]]);
});

test('HTML extraction reads tagged JSON without executing other scripts', () => {
  const javascript = '<script>throw new Error("executed")</script>';
  assert.equal(parseTimetableHTML(html + javascript, 20).entries.length, 3);
  assert.match(parseTimetableHTML(javascript, 20).errors[0], /未找到/);
  assert.match(parseTimetableHTML(html + html, 20).errors[0], /只能包含一个/);
  assert.match(parseTimetableHTML(html.replace('"version": 1', '"version": invalid'), 20).errors[0], /JSON/);
});

test('invalid meetings are reported with their location in the file', () => {
  const malformed = html.replace('"weekday": 1', '"weekday": 9').replace('"endSection": 3', '"endSection": 9');
  const result = parseTimetableHTML(malformed, 20);
  assert.equal(result.entries.length, 1);
  assert.match(result.errors[0], /第 1 门课的第 1 条安排.*星期/);
  assert.match(result.errors[1], /第 1 门课的第 2 条安排.*节次/);
  assert.equal(parseTimetableHTML(html, 5).errors.length, 2);
});

test('empty and unsupported timetable data do not report a successful import', () => {
  const block = (data: object) => `<script type="application/json" id="classflow-timetable">${JSON.stringify(data)}</script>`;
  const empty = parseTimetableHTML(block({ version: 1, periodTimes: [], courses: [] }), 20);
  assert.deepEqual(empty.entries, []);
  assert.match(empty.errors[0], /还没有课程/);
  const unsupported = parseTimetableHTML(block({ version: 2, periodTimes: [], courses: [] }), 20);
  assert.deepEqual(unsupported.entries, []);
  assert.match(unsupported.errors[0], /版本/);
});
