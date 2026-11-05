import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildTimetableScript } from '../src/features/timetableBrowserScript.ts';
import { normalizeZhengfang, readTimetableCapture } from '../src/features/zhengfang.ts';
import { hainnu } from '../src/features/schools.ts';

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const fixture = await readFile(new URL('../examples/zhengfang-timetable.html', import.meta.url), 'utf8');
const script = buildTimetableScript(hainnu.timetableHosts);
const origin = 'https://zfjw.hainnu.edu.cn';
const captures = page => page.evaluate(() => window.messages.filter(message => message.type === 'timetable'));
async function makePage(html = '<h1>登录</h1><input type="password" value="never-capture">') {
  const page = await browser.newPage();
  page.on('pageerror', error => { throw error; });
  await page.route(origin + '/**', route => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await page.addInitScript(() => {
    window.messages = [];
    window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) };
  });
  await page.addInitScript({ content: script });
  await page.goto(origin + '/jwglxt/login.html');
  return page;
}
async function waitCapture(page, count = 1) {
  await page.waitForFunction(count => window.messages.filter(message => message.type === 'timetable').length >= count, count)
    .catch(async error => { console.error('Fixture messages:', await page.evaluate(() => window.messages)); throw error; });
  return (await captures(page)).at(-1);
}
try {
  const page = await makePage();
  await page.waitForTimeout(1500);
  assert.deepEqual(await captures(page), [], 'login page must not import');
  await page.evaluate(html => { document.body.innerHTML = html; }, fixture);
  const first = await waitCapture(page);
  assert.equal(first.courses.length, 2);
  assert.equal(first.courses[0].weeks, '1-8周(单),10,12周');
  assert.equal(first.courses[0].teacher, '陈老师');
  assert.equal(first.periodTimes.length, 2);
  assert.equal(first.term, '2026-2027 · 第一学期');
  const normalized = normalizeZhengfang(readTimetableCapture(JSON.stringify(first), hainnu), first.periodTimes, 20, hainnu.id);
  assert.deepEqual(normalized.errors, []);
  assert.deepEqual(normalized.entries[0].weeks, [1, 3, 5, 7, 10, 12]);
  assert.equal(JSON.stringify(await page.evaluate(() => window.messages)).includes('never-capture'), false);
  await page.waitForTimeout(1800);
  assert.equal((await captures(page)).length, 1, 'periodic scans must not duplicate');
  await page.evaluate(() => {
    document.getElementById('xqm').innerHTML = '<option selected>第二学期</option>';
    document.getElementById('xqm').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1800);
  assert.equal((await captures(page)).length, 1, 'changing term without querying must not relabel old courses');
  await page.evaluate(() => { document.querySelector('.title').textContent = '第二学期课程'; });
  assert.equal((await waitCapture(page, 2)).courses[0].name, '第二学期课程');
  await page.close();
  console.log('PASS: login, async DOM, complete course fields, exact normalization, one-shot delivery, changed timetable');

  const frames = await makePage('<iframe src="/schedule-frame"></iframe>');
  await frames.route(origin + '/schedule-frame', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
  await frames.reload();
  assert.equal((await waitCapture(frames)).courses.length, 2);
  await frames.close();
  console.log('PASS: same-origin iframe timetable');

  const list = await makePage('<table id="kblist"><tr><td id="jc_5-3-4">3-4节</td><td><div class="timetable_con"><span class="title">实验课</span><p><i title="节/周"></i>1,3,7周</p><p><i title="教师"></i>赵老师</p></div></td></tr></table>');
  const listCapture = await waitCapture(list);
  assert.deepEqual([listCapture.courses[0].weekday, listCapture.courses[0].sections, listCapture.courses[0].weeks], [5, '3-4', '1,3,7周']);
  await list.close();
  console.log('PASS: list view section and weekday mapping');

  const cross = await browser.newPage();
  await cross.route(new URL(hainnu.authUrl).origin + '/**', route => route.fulfill({ body: '<iframe src="https://zfjw.hainnu.edu.cn/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html"></iframe>', contentType: 'text/html' }));
  await cross.route(origin + '/**', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
  await cross.addInitScript(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  await cross.goto(hainnu.authUrl);
  await cross.evaluate(script);
  await cross.waitForFunction(() => window.messages.some(message => message.type === 'timetable-frame'));
  const frameUrl = await cross.evaluate(() => window.messages.find(message => message.type === 'timetable-frame').url);
  assert.equal(frameUrl, origin + '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html');
  await cross.goto(frameUrl);
  await cross.evaluate(script);
  assert.equal((await waitCapture(cross)).courses.length, 2);
  await cross.close();
  console.log('PASS: trusted cross-origin timetable frame promotion');

  const api = await makePage('<h1>教务主页</h1>');
  await api.route(origin + '/jwglxt/kbcx/xskbcx_cxXsKb.html*', async route => {
    const version = new URL(route.request().url()).searchParams.get('version');
    if (version === 'old') await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { kbList: [{ kcmc: version === 'old' ? '旧学期' : '新学期', xqj: '3', jcs: '3-4', zcd: '1-16周(双)', xm: '李老师', cdmc: '实验室 204', xh: 'must-not-send-student-id' }] } });
  });
  await api.evaluate(() => {
    const request = new XMLHttpRequest();
    request.open('POST', '/jwglxt/kbcx/xskbcx_cxXsKb.html?version=old'); request.send();
    fetch('/jwglxt/kbcx/xskbcx_cxXsKb.html?version=new', { method: 'POST' });
  });
  const response = await waitCapture(api);
  assert.equal(response.courses.length, 1);
  assert.equal(response.courses[0].name, '新学期');
  assert.deepEqual(response.periodTimes, [], 'missing section times must be explicit');
  assert.equal(JSON.stringify(response).includes('must-not-send-student-id'), false);
  await api.close();
  console.log('PASS: XHR/fetch response extraction, stale response rejection, no student identifiers');

  const delayed = await makePage('<div id="loading">加载中</div>' + fixture);
  await delayed.waitForTimeout(1800);
  assert.deepEqual(await captures(delayed), [], 'visible loading indicator must delay capture');
  await delayed.evaluate(() => {
    document.getElementById('loading').remove();
    const extra = document.querySelector('.timetable_con').cloneNode(true);
    extra.querySelector('.title').textContent = '后加载课程';
    document.getElementById('1-1').appendChild(extra);
  });
  assert.equal((await waitCapture(delayed)).courses.length, 3);
  await delayed.close();
  console.log('PASS: delayed course rendering waits for complete data');

  const empty = await makePage('<table id="kbgrid_table_0"><tr><td>暂无课程</td></tr></table>');
  await empty.waitForTimeout(1800);
  assert.deepEqual(await captures(empty), []);
  assert.equal(await empty.evaluate(() => window.messages.some(message => message.type === 'status' && message.message.includes('没有课程'))), true);
  await empty.close();
  console.log('PASS: empty timetable reports state without false success');

  const tooltip = await makePage('<table id="kblist"><tr><td id="jc_1-1-2" data-original-title="08：10—09：50">1-2节</td><td><div class="timetable_con"><span class="title">自动时间课程</span><p><i title="节/周"></i>1-16周</p></div></td></tr></table>');
  const tooltipData = await waitCapture(tooltip);
  assert.deepEqual(tooltipData.periodTimes, [{ section: 1, endSection: 2, start: '08:10', end: '09:50' }]);
  const tooltipResult = normalizeZhengfang(readTimetableCapture(JSON.stringify(tooltipData), hainnu), tooltipData.periodTimes, 20, hainnu.id);
  assert.deepEqual([tooltipResult.entries[0].start, tooltipResult.entries[0].end], [490, 590]);
  await tooltip.close();
  console.log('PASS: tooltip clock ranges and merged section counts');

  const clockApi = await makePage('<h1>课表</h1>');
  await clockApi.route(origin + '/jwglxt/kbcx/xskbcx_cxXsKb.html*', route => route.fulfill({ json: {
    kbList: [{ kcmc: '接口时间课', xqj: '2', jcs: '3-4', zcd: '1-16周', kssj: '10:13', jssj: '11:49' }],
    jcsjList: [{ jc: '3', kssj: '10:10', jssj: '10:55' }, { jc: '4', kssj: '11:05', jssj: '11:50' }],
  } }));
  await clockApi.evaluate(() => fetch('/jwglxt/kbcx/xskbcx_cxXsKb.html'));
  const clockData = await waitCapture(clockApi);
  assert.equal(clockData.periodTimes.length, 2);
  const clockResult = normalizeZhengfang(readTimetableCapture(JSON.stringify(clockData), hainnu), clockData.periodTimes, 20, hainnu.id);
  assert.deepEqual([clockResult.entries[0].start, clockResult.entries[0].end], [613, 709]);
  await clockApi.close();
  console.log('PASS: automatic API period times and exact course times');
} finally { await browser.close(); }
