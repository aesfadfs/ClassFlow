import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapPlacement } from '../src/domain/canvas.ts';
import { createEntry, validateEntry } from '../src/domain/schedule.ts';

test('canvas snaps to exact adjacent edges and preserves duration across days', () => {
  const course = createEntry({ title: '课程', start: 480, end: 580 });
  const next = createEntry({ title: '活动', day: 2, start: 653, end: 700 });
  assert.deepEqual(snapPlacement(course, 2, 550, [next]), { day: 2, start: 553, end: 653 });
  assert.deepEqual(snapPlacement(course, 1, 549, [next]), { day: 1, start: 550, end: 650 });
  assert.deepEqual(snapPlacement(course, 2, 699, [next]), { day: 2, start: 700, end: 800 });
});

test('drag and resize stay within the day, keep recurrence and allow overlapping cards', () => {
  const course = createEntry({ title: '课程', start: 480, end: 580, weeks: [1, 3, 7], startWeek: 1, endWeek: 7 });
  const peer = createEntry({ start: 600, end: 660 });
  for (const resize of [false, true]) for (const minute of [-900, 0, 487, 610, 1440, 9999]) {
    const moved = { ...course, ...snapPlacement(course, 0, minute, [peer], resize) };
    assert.equal(validateEntry(moved), null);
    assert.deepEqual(moved.weeks, [1, 3, 7]);
  }
  assert.equal(snapPlacement(course, 0, 610, [peer]).start, 610);
  assert.equal(snapPlacement(course, 0, 598, [peer], true).end, 600);
  const late = createEntry({ title: '短活动', start: 1438, end: 1439 });
  assert.equal(validateEntry({ ...late, ...snapPlacement(late, 0, 1600, [], true) }), null);
});
