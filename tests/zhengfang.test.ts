import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hainnu, matchesSchoolUrl } from '../src/features/schools.ts';
import { courseSections, normalizeZhengfang, parseZhengfangWeeks, readTimetableCapture, requiredSectionTimes, resolveSchoolPeriodTimes, type TimetableCapture } from '../src/features/zhengfang.ts';
import { analyzeImport } from '../src/domain/import.ts';

const capture: TimetableCapture = {
  type: 'timetable', version: 1, sourceUrl: 'https://zfjw.hainnu.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html',
  term: '2026-2027 · 第一学期', warnings: [],
  courses: [{ name: '高等数学', teacher: '陈老师', location: '教学楼 201', weekday: 1, sections: '1-2,4', weeks: '1-8周(单),10,12周' }],
  periodTimes: [{ section: 1, start: '08:00', end: '08:45' }, { section: 2, start: '08:55', end: '09:40' }, { section: 4, start: '11:05', end: '11:50' }],
};

test('Zhengfang week expressions preserve lists, ranges and local parity', () => {
  assert.deepEqual(parseZhengfangWeeks('1-8周(单),10,12周', 20), [1, 3, 5, 7, 10, 12]);
  assert.deepEqual(parseZhengfangWeeks('第1－6周（双周）；9、11周', 20), [2, 4, 6, 9, 11]);
  assert.deepEqual(parseZhengfangWeeks('1,3-9(单),12-16(双)', 20), [1, 3, 5, 7, 9, 12, 14, 16]);
  assert.deepEqual(parseZhengfangWeeks('1-16(单)周', 20), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(parseZhengfangWeeks('4周,9周,13-19周(单)', 20), [4, 9, 13, 15, 17, 19]);
  assert.deepEqual(parseZhengfangWeeks('3周,7-10周,12-18周', 20), [3, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18]);
  for (const value of ['', '待安排', '1-999周', '6-1周', '1-6周除3周', '1,,3周', '2周(单)', '1-3周(单)(双)']) {
    assert.throws(() => parseZhengfangWeeks(value, 20), Error, value);
  }
  assert.deepEqual(courseSections('(第1-2,4节)'), [1, 2, 4]);
});

test('confirmed campus times fill only missing clocks on the matching school and campus', () => {
  const data = { ...capture, courses: [{ ...capture.courses[0], sections: '1-2,3-4,5-6,7-8,9-10', location: '桂林洋 [桂]测试教室' }], periodTimes: [] };
  const resolved = resolveSchoolPeriodTimes(data, hainnu);
  assert.deepEqual(resolved.fallbackSections, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(resolved.source, /用户参考课表/);
  assert.deepEqual(resolved.capture.periodTimes.map(time => [time.start, time.end]), [
    ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
    ['14:30', '15:15'], ['15:25', '16:10'], ['16:25', '17:10'], ['17:20', '18:05'],
    ['19:30', '20:15'], ['20:20', '21:05'],
  ]);
  const evening = { ...data, courses: [{ ...data.courses[0], sections: '9-10', weeks: '4周,9周,13-19周(单)' }] };
  const timed = resolveSchoolPeriodTimes(evening, hainnu).capture;
  const result = normalizeZhengfang(timed, timed.periodTimes, 20, hainnu.id);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([result.entries[0].start, result.entries[0].end, result.entries[0].weeks], [1170, 1265, [4, 9, 13, 15, 17, 19]]);
  assert.deepEqual(data.periodTimes, [], 'the raw capture must remain unchanged');
  for (const other of [
    { ...data, sourceUrl: 'https://other.example/timetable' },
    { ...data, courses: [{ ...data.courses[0], location: '龙昆南校区' }] },
    { ...data, courses: [{ ...data.courses[0], location: '' }] },
    { ...data, courses: [{ ...data.courses[0], sections: '11' }] },
    { ...data, courses: [{ ...data.courses[0], sections: '9-10', start: '19:40', end: '21:15' }] },
  ]) assert.deepEqual(resolveSchoolPeriodTimes(other, hainnu).fallbackSections, []);
  const explicit = { ...evening, periodTimes: [{ section: 9, endSection: 10, start: '19:40', end: '21:15' }] };
  assert.deepEqual(resolveSchoolPeriodTimes(explicit, hainnu).capture.periodTimes, explicit.periodTimes);
});

test('captured courses map to exact times, split nonconsecutive sections and deduplicate', () => {
  const result = normalizeZhengfang({ ...capture, courses: [...capture.courses, ...capture.courses] }, capture.periodTimes, 20, hainnu.id);
  assert.deepEqual(result.errors, []);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries.map(entry => [entry.day, entry.start, entry.end, entry.weeks]), [
    [0, 480, 580, [1, 3, 5, 7, 10, 12]], [0, 665, 710, [1, 3, 5, 7, 10, 12]],
  ]);
  assert.equal(result.entries[0].teacher, '陈老师');
  assert.equal(result.entries[0].importSource, 'school:hainnu');
  assert.equal(analyzeImport(result.entries, result.entries, false).entries.length, 0);
});

test('missing times, invalid schedules and too-short semesters never become invented classes', () => {
  assert.deepEqual(requiredSectionTimes({ ...capture, periodTimes: [] }), [1, 2, 4].map(section => ({ section, start: '', end: '' })));
  assert.equal(normalizeZhengfang(capture, [], 20, hainnu.id).entries.length, 0);
  assert.equal(normalizeZhengfang(capture, capture.periodTimes, 5, hainnu.id).entries.length, 0);
  assert.throws(() => normalizeZhengfang(capture, [{ section: 1, start: '09:00', end: '08:00' }], 20, hainnu.id));
  assert.throws(() => normalizeZhengfang(capture, [{ section: 1, start: '08:00', end: '09:00' }, { section: 2, start: '08:45', end: '09:30' }], 20, hainnu.id));
  const invalid = { ...capture, courses: [...capture.courses, { ...capture.courses[0], weekday: 8 }] };
  const result = normalizeZhengfang(invalid, capture.periodTimes, 20, hainnu.id);
  assert.equal(result.entries.length, 2);
  assert.match(result.errors[0], /星期/);
  assert.equal(normalizeZhengfang({ ...capture, courses: [] }, [], 20, hainnu.id).errors.length, 1);
});

test('WebView bridge checks school origins, payload bounds and record shapes', () => {
  assert.deepEqual(readTimetableCapture(JSON.stringify(capture), hainnu), capture);
  assert.equal(readTimetableCapture('{"type":"status"}', hainnu), null);
  for (const sourceUrl of ['https://zfjw.hainnu.edu.cn.attacker.test/', 'http://zfjw.hainnu.edu.cn/', 'https://evil@zfjw.hainnu.edu.cn/', 'file:///test', 'https://zfjw.hainnu.edu.cn:8443/']) {
    assert.throws(() => readTimetableCapture(JSON.stringify({ ...capture, sourceUrl }), hainnu));
  }
  assert.throws(() => readTimetableCapture(JSON.stringify({ ...capture, courses: [null] }), hainnu));
  assert.throws(() => readTimetableCapture(' '.repeat(2_000_001), hainnu));
  assert.equal(matchesSchoolUrl('https://auth.hainnu.edu.cn/login', hainnu.browserHosts), true);
  assert.equal(matchesSchoolUrl('https://fakehainnu.edu.cn/login', hainnu.browserHosts), false);
});

test('automatic grouped section times and course clock ranges need no manual period input', () => {
  const course = { ...capture.courses[0], sections: '1-2' };
  const grouped = [{ section: 1, endSection: 2, start: '08:00', end: '09:40' }];
  const result = normalizeZhengfang({ ...capture, courses: [course] }, grouped, 20, hainnu.id);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([result.entries[0].start, result.entries[0].end], [480, 580]);
  const direct = normalizeZhengfang({ ...capture, courses: [{ ...course, start: '08:13', end: '09:47' }] }, [], 20, hainnu.id);
  assert.deepEqual(direct.errors, []);
  assert.deepEqual([direct.entries[0].start, direct.entries[0].end], [493, 587]);
  assert.equal(normalizeZhengfang({ ...capture, courses: [{ ...course, sections: '1' }] }, grouped, 20, hainnu.id).entries.length, 0, 'never infer internal boundaries of a merged period');
});

test('school CAS accepts its explicit 9443 origin without broadening timetable or other ports', () => {
  assert.equal(hainnu.authUrl, 'https://auth.hainnu.edu.cn:9443/cas/login');
  assert.equal(matchesSchoolUrl(hainnu.authUrl, hainnu.browserHosts), true);
  assert.equal(matchesSchoolUrl(hainnu.authUrl + '?service=https%3A%2F%2Fzfjw.hainnu.edu.cn%2Fjwglxt%2F', hainnu.browserHosts), true);
  assert.equal(matchesSchoolUrl('https://zfjw.hainnu.edu.cn:443/jwglxt/', hainnu.browserHosts), true);
  for (const url of ['https://auth.hainnu.edu.cn:8443/cas/login', 'https://zfjw.hainnu.edu.cn:9443/',
    'https://auth.hainnu.edu.cn.attacker.test:9443/', 'https://user@auth.hainnu.edu.cn:9443/', 'http://auth.hainnu.edu.cn:9443/']) {
    assert.equal(matchesSchoolUrl(url, hainnu.browserHosts), false, url);
  }
  assert.equal(matchesSchoolUrl(hainnu.authUrl, hainnu.timetableHosts), false);
  assert.throws(() => readTimetableCapture(JSON.stringify({ ...capture, sourceUrl: hainnu.authUrl }), hainnu));
});
