import type { Entry } from './schedule';
import { defaultReminders, restoreReminders, type ReminderSettings } from './reminders.ts';

// Device-local look & feel. Stored apart from the schedule so JSON backups
// stay portable (they never carry file paths that only exist on one phone).
export type Appearance = {
  version: 1;
  background: string | null;
  backgroundDim: number;                 // 0–0.85 veil of the page colour over the photo
  cardImages: Record<string, string>;    // `entry:<id>` (one item) or `title:<name>` (every session of a course)
  cardFrost: Record<string, true>;       // same keys: draw a frosted layer over that picture
  greeting: boolean;                     // greeting curtain when the app opens
  glassPanel: number;                    // panel fill opacity (lower = more see-through)
  glassBlur: number;                     // blur of the background behind glass, in px
  glassCard: number;                     // tint opacity of the home cards
  glow: boolean;                         // soft light along glass edges
  reminders: ReminderSettings;           // class reminders (system notifications)
  calendarLayout: 'timeline' | 'periods'; // detailed timetable: time axis, or equal rows per period
  periodPreset: 'auto' | 'guilinyang';   // rows from course times, or the user-chosen 桂林洋 bell schedule
  dragEnabled: boolean;                  // drag / resize in the detailed timetable
  haptics: boolean;
};

export type CardImageScope = 'entry' | 'title';
export const APPEARANCE_KEY = 'classflow.appearance.v1';
export const DIM_LEVELS = [{ value: 0, title: '无' }, { value: 0.25, title: '浅' }, { value: 0.5, title: '中' }, { value: 0.7, title: '深' }];
// Choices offered in settings; the first value of each is the most see-through.
export const PANEL_LEVELS = [{ value: 0.16, title: '通透' }, { value: 0.3, title: '适中' }, { value: 0.55, title: '朦胧' }];
export const BLUR_LEVELS = [{ value: 0, title: '无' }, { value: 6, title: '轻' }, { value: 12, title: '中' }, { value: 24, title: '重' }];
export const CARD_LEVELS = [{ value: 0.22, title: '通透' }, { value: 0.4, title: '适中' }, { value: 0.68, title: '浓郁' }];
const allowed = (levels: { value: number }[], value: unknown, fallback: number) => levels.some(level => level.value === value) ? value as number : fallback;

export const defaultAppearance = (): Appearance => ({ version: 1, background: null, backgroundDim: 0.25, cardImages: {}, cardFrost: {}, greeting: true, glassPanel: 0.3, glassBlur: 12, glassCard: 0.4, glow: true, reminders: defaultReminders(), calendarLayout: 'timeline', periodPreset: 'auto', dragEnabled: true, haptics: true });

export const cardImageKey = (scope: CardImageScope, entry: Pick<Entry, 'id' | 'title'>) => scope === 'entry' ? `entry:${entry.id}` : `title:${entry.title.trim()}`;

// A picture set on this one item wins over the picture shared by the course name.
export function cardImageFor(appearance: Appearance, entry: Pick<Entry, 'id' | 'title'>): { uri: string; scope: CardImageScope; frost: boolean } | null {
  for (const scope of ['entry', 'title'] as const) {
    const key = cardImageKey(scope, entry);
    const uri = appearance.cardImages[key];
    if (uri) return { uri, scope, frost: !!appearance.cardFrost[key] };
  }
  return null;
}

export function setCardImage(appearance: Appearance, entry: Pick<Entry, 'id' | 'title'>, scope: CardImageScope, uri: string | null, frosted = false): Appearance {
  const cardImages = { ...appearance.cardImages };
  const cardFrost = { ...appearance.cardFrost };
  const key = cardImageKey(scope, entry);
  if (uri) cardImages[key] = uri; else delete cardImages[key];
  if (uri && frosted) cardFrost[key] = true; else delete cardFrost[key];
  // Choosing a course-wide picture should be visible on this card too.
  if (scope === 'title' && uri) { delete cardImages[cardImageKey('entry', entry)]; delete cardFrost[cardImageKey('entry', entry)]; }
  return { ...appearance, cardImages, cardFrost };
}

export function forgetEntryImage(appearance: Appearance, id: string): Appearance {
  const key = `entry:${id}`;
  if (!(key in appearance.cardImages)) return appearance;
  const cardImages = { ...appearance.cardImages };
  const cardFrost = { ...appearance.cardFrost };
  delete cardImages[key]; delete cardFrost[key];
  return { ...appearance, cardImages, cardFrost };
}

export const referencedImages = (appearance: Appearance) => new Set([appearance.background, ...Object.values(appearance.cardImages)].filter((uri): uri is string => !!uri));

const isUri = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 3_000_000
  && /^(file:|content:|data:image\/|blob:|https?:)/.test(value);

export function restoreAppearance(raw: string | null): Appearance {
  const base = defaultAppearance();
  if (!raw) return base;
  try {
    const value = JSON.parse(raw) as Partial<Appearance>;
    const cardImages: Record<string, string> = {};
    if (value.cardImages && typeof value.cardImages === 'object') {
      for (const [key, uri] of Object.entries(value.cardImages)) if (/^(entry|title):.{1,120}$/.test(key) && isUri(uri)) cardImages[key] = uri;
    }
    const cardFrost: Record<string, true> = {};
    if (value.cardFrost && typeof value.cardFrost === 'object') {
      for (const [key, on] of Object.entries(value.cardFrost)) if (on === true && key in cardImages) cardFrost[key] = true;
    }
    return {
      version: 1,
      background: isUri(value.background) ? value.background : null,
      backgroundDim: typeof value.backgroundDim === 'number' && value.backgroundDim >= 0 && value.backgroundDim <= 0.85 ? value.backgroundDim : base.backgroundDim,
      cardImages,
      cardFrost,
      greeting: typeof value.greeting === 'boolean' ? value.greeting : true,
      glassPanel: allowed(PANEL_LEVELS, value.glassPanel, base.glassPanel),
      glassBlur: allowed(BLUR_LEVELS, value.glassBlur, base.glassBlur),
      glassCard: allowed(CARD_LEVELS, value.glassCard, base.glassCard),
      glow: typeof value.glow === 'boolean' ? value.glow : true,
      reminders: restoreReminders(value.reminders),
      calendarLayout: value.calendarLayout === 'periods' ? 'periods' : 'timeline',
      periodPreset: value.periodPreset === 'guilinyang' ? 'guilinyang' : 'auto',
      dragEnabled: typeof value.dragEnabled === 'boolean' ? value.dragEnabled : true,
      haptics: typeof value.haptics === 'boolean' ? value.haptics : true,
    };
  } catch { return base; }
}
