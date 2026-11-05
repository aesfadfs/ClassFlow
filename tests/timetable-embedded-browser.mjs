import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildTimetableScript } from '../src/features/timetableBrowserScript.ts';
import { hainnu } from '../src/features/schools.ts';
import { normalizeZhengfang, readTimetableCapture } from '../src/features/zhengfang.ts';

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const origin = 'https://zfjw.hainnu.edu.cn';
const target = origin + '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html';
const fixture = await readFile(new URL('../examples/zhengfang-timetable.html', import.meta.url), 'utf8');
const script = buildTimetableScript(hainnu.timetableHosts);
const retry = buildTimetableScript(hainnu.timetableHosts, true);
const errors = [];
async function pageWith(body) {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route(origin + '/**', route => route.fulfill({ body, contentType: 'text/html; charset=utf-8' }));
  await page.goto(origin + '/jwglxt/portal.html');
  await page.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  // Android injects into the top frame only. Reproduce that constraint here.
  await page.evaluate(script);
  return page;
}
async function capture(page, count = 1) {
  await page.waitForFunction(count => window.messages.filter(m => m.type === 'timetable').length >= count, count, { timeout: 10000 });
  return page.evaluate(() => window.messages.filter(m => m.type === 'timetable').at(-1));
}
try {
  for (const kind of ['blank', 'srcdoc']) {
    const page = await pageWith('<h1>学校主页</h1>');
    await page.evaluate(({ kind, fixture }) => {
      const frame = document.createElement('iframe');
      if (kind === 'srcdoc') frame.srcdoc = fixture;
      document.body.appendChild(frame);
      if (kind === 'blank') { frame.contentDocument.open(); frame.contentDocument.write(fixture); frame.contentDocument.close(); }
    }, { kind, fixture });
    assert.equal((await capture(page)).courses.length, 2);
    await page.close();
    console.log(`PASS top-frame-only injection reads inherited ${kind} timetable`);
  }

  const sandbox = await pageWith('<h1>学校主页</h1>');
  await sandbox.route(target, route => route.fulfill({ body: fixture, contentType: 'text/html' }));
  await sandbox.evaluate(target => {
    const frame = document.createElement('iframe'); frame.sandbox = 'allow-scripts'; frame.src = target; document.body.appendChild(frame);
  }, target);
  await sandbox.waitForFunction(() => window.messages.some(m => m.type === 'timetable-frame'));
  assert.equal(await sandbox.evaluate(() => window.messages.find(m => m.type === 'timetable-frame').url), target);
  await sandbox.goto(target);
  await sandbox.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  await sandbox.evaluate(script);
  assert.equal((await capture(sandbox)).courses.length, 2);
  await sandbox.close();
  console.log('PASS sandboxed same-host iframe promotes to readable course page');

  const structural = await pageWith(`<select id="xnm"><option>2026-2027</option></select><select id="xqm"><option>1</option></select>
    <table id="school-custom-grid"><tr><th>时间段</th><th>节次</th><th>星期一</th><th>星 期 二</th><th>星期天</th></tr>
    <tr><th rowspan="2">上午</th><th>1<br>08:00-08:45</th>
      <td rowspan="2"><font color="blue">结构测试课程</font><p>节/周：(1-2节)1-16周(单)</p><p>教师：测试老师</p><p>上课地点：教学楼 101</p></td><td></td>
      <td rowspan="2"><span class="course-name">周日课程</span><p>2-16周(双)</p></td></tr>
    <tr><th>2<br>08:55-09:40</th><td></td></tr></table>`);
  const gridData = await capture(structural);
  assert.equal(gridData.courses.length, 2);
  assert.deepEqual(gridData.courses.map(c => [c.name, c.weekday, c.sections]), [['结构测试课程', 1, '1-2'], ['周日课程', 7, '1,2']]);
  assert.equal(gridData.courses[0].teacher, '测试老师');
  assert.equal(gridData.courses[0].location, '教学楼 101');
  const result = normalizeZhengfang(readTimetableCapture(JSON.stringify(gridData), hainnu), gridData.periodTimes, 20, hainnu.id);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map(e => [e.start, e.end]), [[480,580], [480,580]]);
  await structural.evaluate(retry);
  assert.equal((await capture(structural, 2)).courses.length, 2, 'manual retry redelivers stable results');
  await structural.close();
  console.log('PASS custom table classes, merged cells, weekday headers, title/field fallbacks and retry');

  const manual = await pageWith('<h1>学校主页</h1>');
  await manual.evaluate(html => { document.body.innerHTML = html; }, fixture);
  await manual.evaluate(retry);
  assert.equal((await capture(manual)).courses.length, 2, 'retry remains pending while the page stabilizes');
  await manual.close();

  const missing = await pageWith('<table><tr><th>节次</th><th>星期一</th><th>星期二</th></tr><tr><th>1</th><td><font color="blue">缺少周次的课程</font></td><td></td></tr></table>');
  await missing.evaluate(retry);
  await missing.waitForFunction(() => window.messages.some(m => m.type === 'status' && m.message.includes('缺少周次')));
  assert.equal(await missing.evaluate(() => window.messages.some(m => m.type === 'timetable')), false);
  await missing.close();
  console.log('PASS incomplete table explains missing fields without inventing courses');

  const noHooks = await pageWith(fixture);
  await noHooks.evaluate(() => { window.XMLHttpRequest = null; });
  // The first scan already installed hooks. Check a fresh readable child instead.
  await noHooks.evaluate(html => {
    document.body.innerHTML = '';
    const frame = document.createElement('iframe'); document.body.appendChild(frame);
    frame.contentDocument.open(); frame.contentDocument.write(html); frame.contentDocument.close();
    frame.contentWindow.XMLHttpRequest = null;
  }, fixture);
  assert.equal((await capture(noHooks)).courses.length, 2);
  await noHooks.close();
  assert.deepEqual(errors, []);
  console.log('PASS optional network hooks cannot stop DOM detection; no runtime errors');
} finally { await browser.close(); }
