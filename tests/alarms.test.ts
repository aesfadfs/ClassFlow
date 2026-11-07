import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALARM_WINDOW_MS, defaultReminders, restoreReminders, splitAlarms, type Reminder } from '../src/domain/reminders.ts';

const now = new Date(2026, 10, 6, 20, 0);
const at = (hours: number): Reminder => ({ id: `r${hours}`, fireAt: new Date(now.getTime() + hours * 3_600_000), title: 't', body: 'b' });

test('alarm mode turns only the next 24 hours into alarms', () => {
  const reminders = [at(1), at(23.9), at(24), at(24.1), at(60)];
  const { alarms, notifications } = splitAlarms(reminders, now, true);
  assert.deepEqual(alarms.map(item => item.id), ['r1', 'r23.9', 'r24']);
  assert.deepEqual(notifications.map(item => item.id), ['r24.1', 'r60']);
  assert.equal(ALARM_WINDOW_MS, 86_400_000);
});

test('with alarm mode off nothing becomes an alarm (so existing ones get removed)', () => {
  const { alarms, notifications } = splitAlarms([at(1), at(30)], now, false);
  assert.deepEqual(alarms, []);
  assert.equal(notifications.length, 2);
});

test('alarm mode is off by default and survives a restore', () => {
  assert.equal(defaultReminders().alarm, false);
  assert.equal(restoreReminders({ ...defaultReminders(), alarm: true }).alarm, true);
  assert.equal(restoreReminders({ enabled: true }).alarm, false);
  assert.equal(restoreReminders({ alarm: 'yes' }).alarm, false);
});
