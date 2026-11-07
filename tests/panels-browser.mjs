import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { demoState } from '../src/domain/schedule.ts';

const browser = await chromium.launch({ headless: true, ...(process.env.CLASSFLOW_BROWSER ? { executablePath: process.env.CLASSFLOW_BROWSER } : {}) });
const errors = [];
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(snapshot => localStorage.setItem('classflow.schedule.v1', JSON.stringify({ ...snapshot, entries: [], demo: false })), demoState());
    await page.goto(process.env.CLASSFLOW_URL || 'http://127.0.0.1:8082');
    const close = page.getByRole('button', { name: '关闭面板', exact: true });
    await page.getByRole('button', { name: '添加课程', exact: true }).click();
    await page.getByRole('textbox', { name: '课程名称', exact: true }).fill('动效验收');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await close.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('classflow.schedule.v1')).entries.length), 1);
    await page.getByRole('button', { name: '打开完整课表' }).click();
    await page.getByRole('button', { name: '按周查看' }).click();
    await page.getByRole('button', { name: /^课程，动效验收/ }).click();
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '确认删除这条安排' }).click();
    await close.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('classflow.schedule.v1')).entries.length), 0);
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await page.getByRole('textbox', { name: '学期周数' }).fill('21');
    await page.getByRole('button', { name: '保存设置' }).click();
    await close.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('classflow.schedule.v1')).preferences.semesterWeeks), 21);
    await page.getByRole('button', { name: '偏好设置', exact: true }).click();
    await close.click();
    await close.waitFor({ state: 'hidden' });
    // Saving a look preset without a name explains itself instead of crashing.
    await page.getByRole('tab', { name: '工具', exact: true }).click();
    await page.getByRole('button', { name: /外观与壁纸/ }).click();
    await page.getByRole('button', { name: '保存当前外观' }).click();
    await page.getByText('给预设起个名字吧').first().waitFor();
    await close.click();
    await close.waitFor({ state: 'hidden' });
    await page.getByRole('tab', { name: '课表', exact: true }).click();
    await page.getByRole('button', { name: '打开完整课表' }).click();
    await page.getByRole('button', { name: '返回概览' }).waitFor();
    await page.getByRole('button', { name: '导入课表', exact: true }).click();
    await page.getByRole('button', { name: '体验教务导入演示' }).click();
    await page.getByRole('button', { name: /^导入 \d+ 条$/ }).click();
    await close.waitFor({ state: 'hidden' });
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('classflow.schedule.v1')).entries.length) > 0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(500);
    const box = await page.getByTestId('calendar-scroll').boundingBox();
    assert.ok(box.height > 140, 'landscape detail reserves room for the canvas');
    await page.screenshot({ path: `.qa/final-landscape-${reducedMotion}.png` });
    await page.getByRole('button', { name: '返回概览' }).click();
    await page.getByRole('button', { name: '打开完整课表' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `.qa/final-overview-${reducedMotion}.png` });
    await page.close();
    console.log(`PASS add, save, delete, settings, reopen, import, rotation, exit: ${reducedMotion}`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
