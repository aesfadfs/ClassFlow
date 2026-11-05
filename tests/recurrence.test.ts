import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntry, demoState, entriesForWeek, findConflicts, isScheduleState, occursInWeek, validateEntry } from '../src/domain/schedule.ts';

test('discrete weeks apply to the timetable and conflict detection', () => {
  const discrete = createEntry({ title: '实验课', startWeek: 1, endWeek: 8, weeks: [1, 4, 8] });
  const odd = createEntry({ title: '单周课程', startWeek: 3, endWeek: 7, parity: 'odd' });
  const even = createEntry({ title: '双周课程', startWeek: 2, endWeek: 6, parity: 'even' });

  assert.equal(validateEntry(discrete), null);
  assert.deepEqual(entriesForWeek([discrete, odd, even], 3), [odd]);
  assert.deepEqual(entriesForWeek([discrete, odd, even], 4), [discrete, even]);
  assert.deepEqual(findConflicts(discrete, [discrete, odd, even]), [even]);
  assert.equal(occursInWeek(discrete, 7), false);
  assert.equal(occursInWeek(discrete, 8), true);
});

test('explicit weeks and provenance are validated in stored schedules', () => {
  const entry = createEntry({ title: '课程', startWeek: 1, endWeek: 8, weeks: [1, 4, 8], importSource: 'demo' });
  const state = { ...demoState(), demo: false, entries: [entry] };

  assert.equal(isScheduleState(JSON.parse(JSON.stringify(state))), true);
  assert.equal(isScheduleState(JSON.parse(JSON.stringify(demoState()))), true);
  for (const weeks of [[], [1, 5, 3, 8], [1, 4, 4, 8], [1, 4, 9], [1, 3.5, 8], [1, , 8]]) {
    assert.equal(isScheduleState({ ...state, entries: [{ ...entry, weeks }] }), false);
  }
  assert.equal(isScheduleState({ ...state, entries: [{ ...entry, weeks: null }] }), false);
  assert.equal(isScheduleState({ ...state, entries: [{ ...entry, parity: 'odd' }] }), false);
  assert.equal(isScheduleState({ ...state, entries: [{ ...entry, importSource: 42 }] }), false);
  assert.equal(isScheduleState({ ...state, entries: [{ ...entry, importSource: ' ' }] }), false);
});
