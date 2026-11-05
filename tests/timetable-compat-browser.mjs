import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildTimetableScript } from '../src/features/timetableBrowserScript.ts';
import { hainnu } from '../src/features/schools.ts';
import { normalizeZhengfang, readTimetableCapture } from '../src/features/zhengfang.ts';

// Reproduce the nonstandard callback contract in the school's public
// jquery.extends.contact-min.js: filter/some receive (index, value, array).
// This fixture describes that behavior without depending on live school code.
function installSchoolExtensions() {
  Array.prototype.filter = function (predicate, context) {
    const output = [];
    for (let index = 0; index < this.length; index++) {
      if (predicate.call(context || window, index, this[index], this)) output.push(this[index]);
    }
    return output;
  };
  Array.prototype.some = function (predicate, context) {
    for (let index = 0; index < this.length; index++) {
      if (predicate.call(context || window, index, this[index], this)) return true;
    }
    return false;
  };
  Array.prototype.every = function () { return true; };
  window.schoolFilter = Array.prototype.filter;
}

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const origin = 'https://zfjw.hainnu.edu.cn';
const fixture = await readFile(new URL('../examples/zhengfang-timetable.html', import.meta.url), 'utf8');
// An ordinary untimed section causes readTimes to inspect its sibling cells.
// With the school filter override, the old script calls querySelector on 0.
const html = fixture + '<table><tr><td>第3节</td><td>10:10-10:55</td></tr></table>';
// The same suite can verify the observer extracted from the shipped APK,
// catching releases built from a stale copy even when source tests pass.
const packagedObserver = process.env.CLASSFLOW_OBSERVER_FILE
  ? await readFile(process.env.CLASSFLOW_OBSERVER_FILE, 'utf8') : null;
const buildScript = (force = false) => packagedObserver
  ? `(${packagedObserver})(${JSON.stringify(hainnu.timetableHosts)},${force}); true;`
  : buildTimetableScript(hainnu.timetableHosts, force);
const script = buildScript();
const pageErrors = [];
async function makePage(body = html) {
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(origin + '/**', route => route.fulfill({ body, contentType: 'text/html; charset=utf-8' }));
  await page.goto(origin + '/jwglxt/kbcx/xskbcx_cxXskbcxIndex.html');
  await page.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  return page;
}
async function nextCapture(page, count = 1) {
  await page.waitForFunction(count => {
    let found = 0;
    for (const message of window.messages) if (message.type === 'timetable') found++;
    return found >= count;
  }, count, { timeout: 8000 }).catch(async error => {
    const statuses = await page.evaluate(() => window.messages.map(message => message.message || message.type));
    throw new Error(`No timetable capture; reported states: ${JSON.stringify(statuses)}`, { cause: error });
  });
  const messages = await page.evaluate(() => window.messages);
  return messages.filter(message => message.type === 'timetable').at(-1);
}
try {
  for (const timing of ['before', 'after']) {
    const page = await makePage();
    if (timing === 'before') await page.evaluate(installSchoolExtensions);
    await page.evaluate(script);
    if (timing === 'after') await page.evaluate(installSchoolExtensions);
    const capture = await nextCapture(page);
    assert.equal(capture.term, '2026-2027 · 第一学期');
    assert.equal(capture.periodTimes.length, 3, 'first period and sibling time must survive filtering');
    assert.equal(capture.courses.length, 2);
    const result = normalizeZhengfang(readTimetableCapture(JSON.stringify(capture), hainnu), capture.periodTimes, 20, hainnu.id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.entries.map(entry => [entry.start, entry.end]), [[480, 580], [480, 580]]);
    assert.equal(await page.evaluate(() => Array.prototype.filter === window.schoolFilter), true, 'do not repair or replace the school page prototype');
    await page.evaluate(buildScript(true));
    assert.equal((await nextCapture(page, 2)).courses.length, 2);
    await page.close();
    console.log(`PASS: school array overrides ${timing} injection preserve DOM courses, semester, times and retry`);
  }

  const embedded = await makePage('<iframe src="/course-frame"></iframe>');
  await embedded.route(origin + '/course-frame', route => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await embedded.reload();
  await embedded.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  await embedded.evaluate(installSchoolExtensions);
  const child = embedded.frames().find(frame => frame.url().endsWith('/course-frame'));
  assert.ok(child);
  await child.evaluate(installSchoolExtensions);
  // Android's top-frame-only injection reads a child with its own prototypes.
  await embedded.evaluate(script);
  const embeddedCapture = await nextCapture(embedded);
  assert.equal(embeddedCapture.courses.length, 2);
  assert.equal(embeddedCapture.periodTimes.length, 3);
  assert.equal(await child.evaluate(() => Array.prototype.filter === window.schoolFilter), true);
  await embedded.close();
  console.log('PASS: school extensions in parent and iframe preserve top-frame-only extraction');

  for (const transport of ['xhr', 'fetch']) {
    for (const brokenDom of [false, true]) {
      const page = await makePage(html);
      await page.evaluate(installSchoolExtensions);
      await page.evaluate(script);
      if (brokenDom) await page.evaluate(() => {
        const query = document.querySelectorAll;
        document.querySelectorAll = function (selector) {
          if (selector === 'table') throw new TypeError('Simulated optional DOM reader failure');
          return query.call(this, selector);
        };
      });
      let requestCount = 0;
      await page.route(origin + '/jwglxt/kbcx/xskbcx_cxXsKb.html*', route => {
        requestCount++;
        return route.fulfill({ json: {
          kbList: [{ kcmc: '接口兼容课程', xqj: '3', jcs: '3-4', zcd: '2-16周(双)', xm: '测试老师', cdmc: '实验室', xh: 'private-student-id' }],
          jcsjList: [{ jc: '3', kssj: '10:10', jssj: '10:55' }, { jc: '4', kssj: '11:05', jssj: '11:50' }],
        } });
      });
      const schoolResponse = await page.evaluate(async transport => {
        const url = '/jwglxt/kbcx/xskbcx_cxXsKb.html';
        if (transport === 'fetch') return (await (await fetch(url, { method: 'POST' })).json()).kbList[0].kcmc;
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url);
          xhr.responseType = 'json';
          xhr.onload = () => resolve(xhr.response.kbList[0].kcmc);
          xhr.onerror = () => reject(new Error('School request failed'));
          xhr.send();
        });
      }, transport);
      assert.equal(schoolResponse, '接口兼容课程', 'instrumentation must preserve the original school response');
      assert.equal(requestCount, 1, 'instrumentation must not replay requests');
      const capture = await nextCapture(page);
      assert.deepEqual(capture.courses.map(course => course.name), ['接口兼容课程']);
      assert.equal(capture.term, '2026-2027 · 第一学期');
      assert.equal(JSON.stringify(capture).includes('private-student-id'), false);
      const normalized = normalizeZhengfang(readTimetableCapture(JSON.stringify(capture), hainnu), capture.periodTimes, 20, hainnu.id);
      assert.deepEqual(normalized.errors, []);
      assert.deepEqual(normalized.entries.map(entry => [entry.start, entry.end, entry.weeks]), [[610, 710, [2, 4, 6, 8, 10, 12, 14, 16]]]);
      await page.close();
      console.log(`PASS: ${transport} retains original response and course fields${brokenDom ? ' despite optional DOM reader failure' : ' with school extensions'}`);
    }
  }
  assert.deepEqual(pageErrors, []);
} finally { await browser.close(); }
