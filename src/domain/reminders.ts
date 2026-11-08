import { addDays, dayOfWeek, entriesForDay, formatTime, weekNumber, type Entry, type Preferences } from './schedule.ts';

// Class reminders: which sessions get a system notification, and when.

export type ReminderSettings = {
  enabled: boolean;
  lead: number;        // minutes before the start
  gap: number;         // skip when the previous session ended less than this many minutes earlier (0 = never skip)
  plans: boolean;      // also remind personal plans, not only courses
  sound: ReminderSound;
  vibration: ReminderVibration;
  /** The user's own tone (Android): a private copy inside the app, used when `sound` is 'custom'. */
  customSound: CustomSound | null;
};
export type CustomSound = { uri: string; name: string };

// Built-in tones are bundled files (scripts/make-reminder-sounds.mjs); 'default' is the system sound.
export type ReminderSound = 'class_bell' | 'chime' | 'soft' | 'default' | 'custom' | 'none';
export type ReminderVibration = 'long' | 'standard' | 'short' | 'none';
export const SOUNDS: { key: ReminderSound; title: string }[] = [
  { key: 'class_bell', title: '上课铃' }, { key: 'chime', title: '清脆' }, { key: 'soft', title: '柔和' }, { key: 'default', title: '系统' }, { key: 'custom', title: '自定义' }, { key: 'none', title: '静音' },
];
export const VIBRATIONS: { key: ReminderVibration; title: string }[] = [
  { key: 'long', title: '持续' }, { key: 'standard', title: '标准' }, { key: 'short', title: '短促' }, { key: 'none', title: '不振动' },
];
/** Android vibration patterns in ms (wait, buzz, wait, buzz…). 'long' keeps buzzing for about ten seconds. */
export function vibrationPattern(kind: ReminderVibration): number[] | null {
  if (kind === 'none') return null;
  if (kind === 'short') return [0, 250];
  if (kind === 'standard') return [0, 450, 250, 450];
  return [0, ...Array.from({ length: 12 }, () => [600, 250]).flat()];
}

export const LEAD_LEVELS = [5, 10, 15, 20, 30];
export const GAP_LEVELS = [0, 15, 30, 45, 60];
export const defaultReminders = (): ReminderSettings => ({ enabled: false, lead: 10, gap: 30, plans: false, sound: 'class_bell', vibration: 'long', customSound: null });

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
  const custom = raw.customSound as Partial<CustomSound> | null | undefined;
  const customSound = custom && typeof custom.uri === 'string' && /^file:\/\//.test(custom.uri) && typeof custom.name === 'string'
    ? { uri: custom.uri, name: custom.name.slice(0, 80) } : null;
  // A custom tone without its file falls back to the default bell.
  const sound = raw.sound === 'custom' && !customSound ? base.sound : raw.sound;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    lead: LEAD_LEVELS.includes(raw.lead as number) ? raw.lead as number : base.lead,
    gap: GAP_LEVELS.includes(raw.gap as number) ? raw.gap as number : base.gap,
    plans: typeof raw.plans === 'boolean' ? raw.plans : base.plans,
    sound: SOUNDS.some(item => item.key === sound) ? sound as ReminderSound : base.sound,
    vibration: VIBRATIONS.some(item => item.key === raw.vibration) ? raw.vibration as ReminderVibration : base.vibration,
    customSound,
  };
}


/** Audio formats Android's player handles; picked files are checked against these. */
export const RINGTONE_EXTENSIONS = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'amr', 'mid', 'midi', '3gp'];
export const MAX_RINGTONE_BYTES = 20_000_000;
