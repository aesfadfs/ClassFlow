import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildTimetableScript } from '../src/features/timetableBrowserScript.ts';
import { hainnu } from '../src/features/schools.ts';
import { normalizeZhengfang, readTimetableCapture, resolveSchoolPeriodTimes } from '../src/features/zhengfang.ts';
import { occursInWeek } from '../src/domain/schedule.ts';

const html = await readFile(new URL('../examples/hainnu-timetable.html', import.meta.url), 'utf8');
const observer = process.env.CLASSFLOW_OBSERVER_FILE ? await readFile(process.env.CLASSFLOW_OBSERVER_FILE, 'utf8') : null;
const script = observer ? `(${observer})(${JSON.stringify(hainnu.timetableHosts)},false); true;` : buildTimetableScript(hainnu.timetableHosts);
const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const url = 'https://zfjw.hainnu.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html';
try {
  for (const mode of ['combined', 'grid', 'list']) {
    const page = await browser.newPage();
    await page.route(url, route => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
    await page.goto(url);
    await page.evaluate(mode => {
      if (mode === 'grid') document.querySelector('#kblist_table').remove();
      if (mode === 'list') document.querySelector('#kbgrid_table_0').remove();
      window.messages = [];
      window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) };
      Array.prototype.filter = function (predicate) {
        const output = [];
        for (let i = 0; i < this.length; i++) if (predicate(i, this[i], this)) output.push(this[i]);
        return output;
      };
    }, mode);
    await page.evaluate(script);
    await page.waitForFunction(() => window.messages.find(message => message.type === 'timetable'), null, { timeout: 8000 });
    const data = await page.evaluate(() => window.messages.find(message => message.type === 'timetable'));
    assert.equal(data.courses.length, 13, `${mode}: exact count, no duplicate view or legend`);
    assert.deepEqual(data.warnings, [], `${mode}: merged course rows inherit day and sections`);
    assert.deepEqual(data.periodTimes, [], 'the actual school page supplies no clock times');
    assert.ok(data.courses.every(course => course.teacher === '测试教师'));
    assert.ok(data.courses.every(course => course.location.length > 0));
    const resolved = resolveSchoolPeriodTimes(readTimetableCapture(JSON.stringify(data), hainnu), hainnu);
    assert.equal(resolved.fallbackSections.length, 10);
    const result = normalizeZhengfang(resolved.capture, resolved.capture.periodTimes, 20, hainnu.id);
    assert.equal(result.entries.length, 13);
    assert.deepEqual(result.errors, []);
    const thursday = result.entries.filter(entry => entry.day === 3 && entry.start === 600);
    assert.equal(thursday.length, 2, 'same-day math rows retain their different weeks');
    assert.deepEqual(thursday.map(entry => entry.weeks), [[3, 4, 5], [9, 10, 12, 13, 14, 15, 16, 17, 18, 19]]);
    const evening = result.entries.find(entry => entry.start === 1170);
    assert.equal(evening.end, 1265);
    assert.deepEqual(evening.weeks, [4, 9, 13, 15, 17, 19]);
    const week10 = result.entries.filter(entry => occursInWeek(entry, 10));
    assert.equal(week10.length, 11, 'matches the user reference screenshot for week 10');
    assert.deepEqual(week10.map(entry => [entry.day, entry.start, entry.end]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), [
      [0, 480, 580], [0, 600, 700], [0, 870, 970], [0, 985, 1085],
      [1, 870, 970], [2, 870, 970], [2, 985, 1085],
      [3, 480, 580], [3, 600, 700], [4, 480, 580], [4, 985, 1085],
    ]);
    await page.close();
    console.log(`PASS: Hainnu ${mode}: 13 arrangements, no warnings, exact confirmed times and week-10 reference`);
  }
} finally { await browser.close(); }
