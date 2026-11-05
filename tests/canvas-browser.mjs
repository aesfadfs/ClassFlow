import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { demoState, createEntry } from '../src/domain/schedule.ts';

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const url = process.env.CLASSFLOW_URL || 'http://127.0.0.1:8082';
const errors = [];
const state = demoState();
state.demo = false;
state.entries = [createEntry({ id: 'course', title: '画布测试课程', start: 480, end: 540 }), createEntry({ id: 'activity', title: '自定义阅读', kind: 'plan', start: 600, end: 660, color: 'green' })];
async function drag(page, locator, dx, dy, bottom = false) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2, y = box.y + (bottom ? box.height - 4 : 20);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 20 });
  await page.mouse.up(); await page.waitForTimeout(500);
}
async function saved(page, id) { return page.evaluate(id => JSON.parse(localStorage.getItem('classflow.schedule.v1')).entries.find(entry => entry.id === id), id); }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', JSON.stringify(snapshot)), state);
  await page.goto(url);
  await page.getByRole('button', { name: '打开完整课表', exact: true }).click();
  const course = page.getByRole('button', { name: /^课程，画布测试课程/ });
  await course.waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.qa/canvas-desktop.png', fullPage: true });
  await drag(page, course, 0, 64);
  assert.equal((await saved(page, 'course')).start, 540, 'drag moves one hour and snaps against following activity');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal((await saved(page, 'course')).start, 480);
  await drag(page, page.getByLabel('调整画布测试课程时长', { exact: true }), 0, 32, true);
  assert.equal((await saved(page, 'course')).end, 570, 'bottom grip resizes by thirty minutes');
  const box = await course.boundingBox();
  await drag(page, course, box.width, 0);
  assert.equal((await saved(page, 'course')).day, 1, 'week view supports moving between days');
  await page.getByRole('button', { name: '按日查看', exact: true }).click();
  await page.getByRole('button', { name: /月.*日 周一/ }).click();
  const activity = page.getByRole('button', { name: /^安排，自定义阅读/ });
  await drag(page, activity, 0, 32);
  assert.equal((await saved(page, 'activity')).start, 630, 'custom activities also drag');
  const snapshot = await page.evaluate(() => localStorage.getItem('classflow.schedule.v1'));
  const restored = await browser.newPage({ viewport: { width: 390, height: 844 } });
  restored.on('pageerror', error => errors.push(error.message));
  await restored.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', snapshot), snapshot);
  await restored.goto(url);
  await restored.getByRole('button', { name: '打开完整课表', exact: true }).click();
  await restored.getByRole('button', { name: '按周查看', exact: true }).click();
  await restored.getByRole('button', { name: /^课程，画布测试课程/ }).waitFor();
  assert.equal((await saved(restored, 'course')).day, 1);
  await restored.screenshot({ path: '.qa/canvas-mobile-week.png', fullPage: true });
  await restored.getByRole('button', { name: '按日查看', exact: true }).click();
  await restored.getByRole('button', { name: /月.*日 周一/ }).click();
  await restored.waitForTimeout(500);
  await restored.screenshot({ path: '.qa/canvas-mobile-day.png', fullPage: true });

  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce', colorScheme: 'dark' });
  touch.on('pageerror', error => errors.push(error.message));
  await touch.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', JSON.stringify(snapshot)), state);
  await touch.goto(url);
  await touch.getByRole('button', { name: '打开完整课表', exact: true }).click();
  await touch.getByRole('button', { name: /月.*日 周一/ }).click();
  const touchCourse = touch.getByRole('button', { name: /^课程，画布测试课程/ });
  await touchCourse.scrollIntoViewIfNeeded();
  const touchBox = await touchCourse.boundingBox();
  const cdp = await touch.context().newCDPSession(touch);
  const point = { x: touchBox.x + touchBox.width / 2, y: touchBox.y + 20 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y + i * 64 / 20 }] });
    await touch.waitForTimeout(12);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.waitForTimeout(500);
  assert.equal((await saved(touch, 'course')).start, 540, 'touch drag works without browser scroll taking over');
  await touch.screenshot({ path: '.qa/canvas-touch-dark.png', fullPage: true });
  await touchCourse.click();
  await touch.getByRole('textbox', { name: '课程名称', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: move, edge snap, undo, resize, cross-day move, custom activities, mobile week/day, storage restoration, touch drag, dark mode, reduced motion, tap to edit, no runtime errors');
} finally { await browser.close(); }
