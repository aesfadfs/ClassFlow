import { addDays, dayOfWeek, entriesForDay, formatTime, weekNumber, type Entry, type Preferences } from './schedule.ts';

// Class reminders: which sessions get a system notification, and when.

export type ReminderSettings = {
  enabled: boolean;
  lead: number;        // minutes before the start
  gap: number;         // skip when the previous session ended less than this many minutes earlier (0 = never skip)
  plans: boolean;      // also remind personal plans, not only courses
};

export const LEAD_LEVELS = [5, 10, 15, 20, 30];
export const GAP_LEVELS = [0, 15, 30, 45, 60];
export const defaultReminders = (): ReminderSettings => ({ enabled: false, lead: 10, gap: 30, plans: false });

export type Reminder = { id: string; fireAt: Date; title: string; body: string };

const DAYS_AHEAD = 8;     // today plus a full week; rescheduled whenever the app opens or the timetable changes
const MAX_REMINDERS = 60; // well under Android's and iOS's pending-alarm limits

/**
 * Reminders for the next week. A session right after another one (the
 * previous one ended less than `gap` minutes before it starts, or they
 * overlap) is skipped: the student is usually still on their way between
 * classes and a buzz would only interrupt.
 */
export function planReminders(entries: Entry[], preferences: Preferences, now: Date, settings: ReminderSettings): Reminder[] {
  if (!settings.enabled) return [];
  const result: Reminder[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  for (let offset = 0; offset < DAYS_AHEAD && result.length < MAX_REMINDERS; offset++) {
    const date = addDays(today, offset);
    const week = weekNumber(date, preferences.semesterStart);
    if (week < 1 || week > preferences.semesterWeeks) continue;
    const sessions = entriesForDay(entries, week, dayOfWeek(date))
      .filter(entry => entry.kind === 'course' || settings.plans)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    for (const entry of sessions) {
      const adjacent = settings.gap > 0 && sessions.some(other => other !== entry && other.start < entry.start && entry.start - other.end < settings.gap);
      if (adjacent) continue;
      const fireAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, entry.start - settings.lead);
      if (fireAt.getTime() <= now.getTime()) continue;
      const what = entry.kind === 'plan' ? '开始' : '上课';
      result.push({
        id: `${entry.id}@${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
        fireAt,
        title: `${entry.title} · ${settings.lead} 分钟后${what}`,
        body: [`${formatTime(entry.start)}–${formatTime(entry.end)}`, entry.location, entry.teacher].filter(Boolean).join(' · '),
      });
      if (result.length >= MAX_REMINDERS) break;
    }
  }
  return result;
}

export function restoreReminders(value: unknown): ReminderSettings {
  const base = defaultReminders();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<ReminderSettings>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    lead: LEAD_LEVELS.includes(raw.lead as number) ? raw.lead as number : base.lead,
    gap: GAP_LEVELS.includes(raw.gap as number) ? raw.gap as number : base.gap,
    plans: typeof raw.plans === 'boolean' ? raw.plans : base.plans,
  };
}
