import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { demoState, createEntry } from '../src/domain/schedule.ts';

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const url = process.env.CLASSFLOW_URL || 'http://127.0.0.1:8082';
const errors = [];
const state = demoState();
state.demo = false;
state.entries = Array.from({ length: 7 }, (_, day) => createEntry({ id: `day-${day}`, day, title: '很长的课程名称与计算机基础', start: 480, end: 580, location: '教学楼403–404' }));
async function fitted(page) {
  const bounds = await page.evaluate(() => {
    const main = document.querySelector('[data-testid="app-main"]');
    const scrollable = [...main.querySelectorAll('*')].filter(el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1);
    return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewport: [innerWidth, innerHeight], scrollable: scrollable.length };
  });
  assert.ok(bounds.width <= bounds.viewport[0], JSON.stringify(bounds));
  assert.ok(bounds.height <= bounds.viewport[1], JSON.stringify(bounds));
  assert.equal(bounds.scrollable, 0, 'home has no scroll containers');
  const controls = await page.getByRole('button').all();
  for (const control of controls) {
    if (!await control.isVisible()) continue;
    const box = await control.boundingBox();
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= bounds.viewport[0] + 1 && box.y + box.height <= bounds.viewport[1] + 1, `control clipped: ${await control.getAttribute('aria-label')} ${JSON.stringify(box)}`);
  }
}
try {
  for (const [width, height] of [[320,568], [390,844], [412,915], [768,1024], [1440,900], [844,390]]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: width === 412 ? 'dark' : 'light' });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', JSON.stringify(snapshot)), state);
    await page.goto(url);
    await page.getByRole('button', { name: '打开完整课表', exact: true }).waitFor();
    await page.waitForTimeout(500);
    await fitted(page);
    await page.screenshot({ path: `.qa/overview-${width}.png` });
    await page.getByRole('button', { name: '打开完整课表', exact: true }).click();
    await page.getByTestId('calendar-scroll').waitFor();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '按周查看', exact: true }).click();
    await page.waitForTimeout(200);
    const canvas = await page.getByTestId('calendar-scroll').boundingBox();
    assert.ok(canvas.height > 60 && canvas.y + canvas.height < height, 'canvas uses available screen height');
    const monday = await page.getByRole('button', { name: /日 周一/ }).boundingBox();
    const sunday = await page.getByRole('button', { name: /日 周日/ }).boundingBox();
    assert.ok(monday.height < 90 && sunday.x + sunday.width <= width, 'week header remains compact and all seven days fit');
    await page.screenshot({ path: `.qa/detail-${width}.png` });
    await page.getByRole('button', { name: '返回概览', exact: true }).click();
    await page.getByRole('button', { name: '打开完整课表', exact: true }).waitFor();
    for (const name of width >= 850 ? ['时间规划', '工具箱', '我的课表'] : ['规划', '工具', '课表']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await page.waitForTimeout(650);
      await fitted(page);
      if (name === '规划' || name === '时间规划') {
        await page.getByRole('button', { name: '打开完整时间线' }).click();
        await page.getByRole('button', { name: '返回概览' }).waitFor();
        await page.waitForTimeout(650);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '打开完整时间线' }).waitFor();
        await page.waitForTimeout(400);
      }
    }
    await page.close();
    console.log(`PASS fitted home, detail and navigation: ${width}x${height}`);
  }
  // Between grid lines the card must follow the pointer, without saving prematurely.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', JSON.stringify(snapshot)), state);
  await page.goto(url);
  await page.getByRole('button', { name: '打开完整课表' }).click();
  const card = page.getByRole('button', { name: /^课程，.*周一/ });
  await card.waitFor();
  await page.waitForTimeout(700);
  const before = await card.boundingBox();
  const x = before.x + before.width / 2, y = before.y + 20;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x + 33, y + 19, { steps: 10 });
  await page.waitForTimeout(150);
  const during = await card.boundingBox();
  assert.ok(Math.abs(during.x - before.x - 33) < 5, 'horizontal drag follows pointer between days');
  assert.ok(Math.abs(during.y - before.y - 19) < 5, 'vertical drag follows pointer between time slots');
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('classflow.schedule.v1')).entries.find(e => e.id === 'day-0'));
  assert.equal((await read()).start, 480, 'drag preview does not write data');
  await page.mouse.up(); await page.waitForTimeout(800);
  assert.equal((await read()).start, 500, 'release snaps to nearest five minutes');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal((await read()).start, 480, 'undo restores source placement');
  assert.deepEqual(errors, []);
  console.log('PASS free pointer tracking, release snap, undo, no runtime errors');
} finally { await browser.close(); }
