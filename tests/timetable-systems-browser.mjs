import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { buildTimetableScript } from '../src/features/timetableBrowserScript.ts';
import { hainnu, openSchool } from '../src/features/schools.ts';
import { normalizeZhengfang, readTimetableCapture, requiredSectionTimes } from '../src/features/zhengfang.ts';

// Open-browser readers for mainstream 教务 systems. Fixtures in
// examples/systems are fictional and follow each system's public page shape;
// passing here does not replace acceptance on real school deployments.
const browser = await chromium.launch({ headless: true, args: ['--disable-features=HttpsUpgrades,AutomaticHttpsUpgrades,HttpsFirstBalancedModeAutoEnable'], ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const packagedObserver = process.env.CLASSFLOW_OBSERVER_FILE ? await readFile(process.env.CLASSFLOW_OBSERVER_FILE, 'utf8') : null;
const openScript = packagedObserver ? `(${packagedObserver})(["*"],false); true;` : buildTimetableScript(['*']);
const fixture = name => readFile(new URL(`../examples/systems/${name}`, import.meta.url), 'utf8');
const pageErrors = [];

async function open(url, body) {
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route(new URL(url).origin + '/**', route => route.fulfill({ body, contentType: 'text/html; charset=utf-8' }));
  await page.goto(url);
  await page.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
  await page.evaluate(openScript);
  return page;
}
async function capture(page) {
  await page.waitForFunction(() => window.messages.some(message => message.type === 'timetable'), null, { timeout: 8000 }).catch(async error => {
    const statuses = await page.evaluate(() => window.messages.map(message => message.message || message.type));
    throw new Error(`No timetable capture; reported states: ${JSON.stringify(statuses)}`, { cause: error });
  });
  return page.evaluate(() => window.messages.filter(message => message.type === 'timetable').at(-1));
}
const fill = (data, clocks) => requiredSectionTimes(data).map(time => time.start ? time : { ...time, ...clocks[time.section] });
const summary = entries => entries.map(entry => [entry.title, entry.day, entry.start, entry.end, entry.weeks.join(','), entry.location, entry.teacher]);
const even = [2, 4, 6, 8, 10, 12, 14, 16].join(',');

try {
  {
    const url = 'https://jw.example.edu.cn/jsxsd/xskb/xskb_list.do';
    const page = await open(url, await fixture('qiangzhi.html'));
    const data = readTimetableCapture(JSON.stringify(await capture(page)), openSchool, url);
    assert.deepEqual(data.warnings, []);
    assert.deepEqual(data.periodTimes, [{ section: 1, endSection: 2, start: '08:00', end: '09:40' }, { section: 3, endSection: 4, start: '10:00', end: '11:40' }]);
    const result = normalizeZhengfang(data, data.periodTimes, 20, openSchool.id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(summary(result.entries), [
      ['高等数学', 0, 480, 580, '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16', '一教101', '张老师'],
      ['大学英语', 2, 480, 580, '1,2,3,4,5,6,7,8', '外语楼203', '李老师'],
      ['英语听说', 2, 480, 580, '9,10,11,12,13,14,15,16', '外语楼301', 'Smith'],
      ['程序设计实验', 1, 480, 700, even, '实验楼502', '王老师'],
    ]);
    await page.close();
    console.log('PASS: 强智 kbcontent cells, split lessons, (周)/(双周) weeks, 01-02-03-04 periods and 小节 times');
  }
  {
    // Many school systems are still plain HTTP; the open browser reads them.
    const url = 'http://jwxt.example.edu.cn/xskbcx.aspx?xh=demo';
    const page = await open(url, await fixture('zhengfang-legacy.html'));
    const data = readTimetableCapture(JSON.stringify(await capture(page)), openSchool, url);
    assert.deepEqual(data.warnings, []);
    assert.deepEqual(data.periodTimes, [], 'no clocks on the page: the user must confirm them');
    const times = fill(data, { 1: { start: '08:00', end: '08:45' }, 2: { start: '08:55', end: '09:40' }, 3: { start: '14:00', end: '14:45' }, 4: { start: '14:55', end: '15:40' } });
    const result = normalizeZhengfang(data, times, 20, openSchool.id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(summary(result.entries), [
      ['高等数学', 0, 480, 580, '1,3,5,7,9,11,13,15', 'A101', '张老师'],
      ['体育', 2, 840, 940, '1,2,3,4,5,6,7,8', '操场', '李老师'],
      ['美术鉴赏', 2, 840, 940, '9,10,11,12,13,14,15,16', '艺术楼201', '王老师'],
    ]);
    await page.close();
    console.log('PASS: 旧版正方 Table1 plain cells over HTTP, {第1-16周|单周}, Chinese period labels, two lessons per cell');
  }
  {
    const url = 'https://jw.example.edu.cn/eams/courseTableForStd!courseTable.action';
    const page = await open(url, await fixture('eams.html'));
    const data = readTimetableCapture(JSON.stringify(await capture(page)), openSchool, url);
    assert.deepEqual(data.warnings, []);
    const times = fill(data, { 1: { start: '08:00', end: '08:45' }, 2: { start: '08:55', end: '09:40' }, 5: { start: '14:00', end: '14:45' }, 6: { start: '14:55', end: '15:40' } });
    const result = normalizeZhengfang(data, times, 20, openSchool.id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(summary(result.entries), [
      ['线性代数', 0, 480, 580, '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16', '教学楼101', '赵老师'],
      ['大学物理', 2, 840, 940, even, '实验楼202', ''],
    ]);
    await page.close();
    console.log('PASS: 树维 TaskActivity script, week bitmap and day*unitCount+period cells');
  }
  for (const system of [
    { name: 'URP', page: 'https://urp.example.edu.cn/student/courseSelect/calendarSemesterCurriculum/index',
      api: '/student/courseSelect/thisSemesterCurriculum/ajaxStudentSchedule/callback',
      json: { xkxx: [{ 'A001_01': { courseName: '操作系统', attendClassTeacher: '孙老师* ', timeAndPlaceList: [
        { classDay: 2, classSessions: 3, continuingSession: 2, classWeek: '111111111111111100000000', teachingBuildingName: '一教', classroomName: '一教305', weekDescription: '1-16周' }] } }], xh: 'private-student-id' },
      expected: [['操作系统', 1, 600, 700, '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16', '一教305', '孙老师']] },
    { name: '金智', page: 'https://ehall.example.edu.cn/jwapp/sys/wdkb/*default/index.do',
      api: '/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
      json: { code: '0', datas: { xskcb: { totalSize: 1, rows: [{ KCM: '数据结构', SKJS: '周老师', JASMC: '二教201', SKXQ: 4, KSJC: 5, JSJC: 6, SKZC: '0101010101010101', ZCMC: '2-16周(双)', XH: 'private-student-id' }] } } },
      expected: [['数据结构', 3, 840, 940, even, '二教201', '周老师']] },
  ]) {
    const page = await open(system.page, '<!doctype html><title>我的课表</title><div id="app">课表加载中</div>');
    let requests = 0;
    await page.route(new URL(system.page).origin + system.api + '*', route => { requests++; return route.fulfill({ json: system.json }); });
    const original = await page.evaluate(async api => (await (await fetch(api, { method: 'POST' })).json()), system.api);
    assert.deepEqual(original, system.json, 'the school page receives its own response unchanged');
    assert.equal(requests, 1, 'no replayed requests');
    const raw = await capture(page);
    assert.equal(JSON.stringify(raw).includes('private-student-id'), false);
    const data = readTimetableCapture(JSON.stringify(raw), openSchool, system.page);
    const times = fill(data, { 3: { start: '10:00', end: '10:45' }, 4: { start: '10:55', end: '11:40' }, 5: { start: '14:00', end: '14:45' }, 6: { start: '14:55', end: '15:40' } });
    const result = normalizeZhengfang(data, times, 20, openSchool.id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(summary(result.entries), system.expected);
    // A capture is accepted only from the page that posted it.
    assert.throws(() => readTimetableCapture(JSON.stringify(raw), openSchool, 'https://other.example.com/'));
    assert.throws(() => readTimetableCapture(JSON.stringify(raw), openSchool));
    assert.throws(() => readTimetableCapture(JSON.stringify(raw), hainnu));
    await page.close();
    console.log(`PASS: ${system.name} JSON response read without replaying the request; capture bound to the posting host`);
  }
  {
    // Fixed school mode keeps its host list: the same page is not read.
    const page = await browser.newPage();
    await page.route('https://jw.example.edu.cn/**', async route => route.fulfill({ body: await fixture('qiangzhi.html'), contentType: 'text/html; charset=utf-8' }));
    await page.goto('https://jw.example.edu.cn/jsxsd/xskb/xskb_list.do');
    await page.evaluate(() => { window.messages = []; window.ReactNativeWebView = { postMessage: raw => window.messages.push(JSON.parse(raw)) }; });
    await page.evaluate(buildTimetableScript(hainnu.timetableHosts));
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => window.messages.some(message => message.type === 'timetable')), false);
    await page.close();
    console.log('PASS: fixed-school mode ignores pages outside its configured hosts');
  }
  {
    const page = await open('https://www.example.com/s?wd=test', '<!doctype html><table><tr><td>星期</td><td>天气</td></tr><tr><td>周一</td><td>晴</td></tr></table><p>搜索结果</p>');
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => window.messages.some(message => message.type === 'timetable')), false, 'ordinary pages produce no capture');
    await page.close();
    console.log('PASS: ordinary search pages report status only');
  }
  assert.deepEqual(pageErrors, []);
} finally { await browser.close(); }
