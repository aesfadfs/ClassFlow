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
  uiStyle: UiStyle;                      // overall look: liquid glass or pixel blocks
  font: FontChoice;                      // text face across the main screens
  presets: LookPreset[];                 // the user's own saved looks
  reminders: ReminderSettings;           // class reminders (system notifications)
  calendarLayout: 'timeline' | 'periods'; // detailed timetable: time axis, or equal rows per period
  periodPreset: 'auto' | 'guilinyang';   // rows from course times, or the user-chosen 桂林洋 bell schedule
  dragEnabled: boolean;                  // drag / resize in the detailed timetable
  haptics: boolean;
};

export type CardImageScope = 'entry' | 'title';
export type UiStyle = 'glass' | 'pixel';
export type FontChoice = 'system' | 'serif' | 'mono';
export const FONTS: { key: FontChoice; title: string }[] = [{ key: 'system', title: '默认' }, { key: 'serif', title: '衬线' }, { key: 'mono', title: '等宽' }];

/**
 * A saved look. Built-in presets leave the background photo alone; a preset
 * the user saves remembers the photo too (null = no photo).
 */
export type LookPreset = {
  id: string; name: string; uiStyle: UiStyle; font: FontChoice;
  glassPanel: number; glassBlur: number; glassCard: number; glow: boolean; backgroundDim: number;
  background?: string | null;
};
export const BUILTIN_PRESETS: LookPreset[] = [
  { id: 'builtin:glass', name: '液态玻璃', uiStyle: 'glass', font: 'system', glassPanel: 0.3, glassBlur: 12, glassCard: 0.4, glow: true, backgroundDim: 0.25 },
  { id: 'builtin:pixel', name: '像素方块', uiStyle: 'pixel', font: 'mono', glassPanel: 0.55, glassBlur: 0, glassCard: 0.68, glow: false, backgroundDim: 0.5 },
];
const MAX_PRESETS = 12;
const LOOK_KEYS = ['uiStyle', 'font', 'glassPanel', 'glassBlur', 'glassCard', 'glow', 'backgroundDim'] as const;

export function applyPreset(appearance: Appearance, preset: LookPreset): Appearance {
  const next: Appearance = { ...appearance };
  for (const key of LOOK_KEYS) (next as Record<string, unknown>)[key] = preset[key];
  if (preset.background !== undefined) next.background = preset.background;
  return next;
}

/** Whether the current look is exactly this preset (shown as the selected one). */
export const matchesPreset = (appearance: Appearance, preset: LookPreset) =>
  LOOK_KEYS.every(key => appearance[key] === preset[key]) && (preset.background === undefined || preset.background === appearance.background);

/** Save the current look as a new preset of the user's own. */
export function savePreset(appearance: Appearance, name: string, id: string): Appearance {
  const title = name.trim().slice(0, 20);
  if (!title) throw new Error('给预设起个名字吧');
  if (appearance.presets.length >= MAX_PRESETS) throw new Error(`最多保存 ${MAX_PRESETS} 个自定义预设`);
  const preset: LookPreset = { id, name: title, background: appearance.background, ...Object.fromEntries(LOOK_KEYS.map(key => [key, appearance[key]])) } as LookPreset;
  return { ...appearance, presets: [...appearance.presets, preset] };
}

export const deletePreset = (appearance: Appearance, id: string): Appearance => ({ ...appearance, presets: appearance.presets.filter(preset => preset.id !== id) });

function restorePreset(value: unknown, base: Appearance): LookPreset | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LookPreset>;
  if (typeof raw.id !== 'string' || !/^custom:[\w-]{1,40}$/.test(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 20) return null;
  return {
    id: raw.id, name: raw.name,
    uiStyle: raw.uiStyle === 'pixel' ? 'pixel' : 'glass',
    font: FONTS.some(font => font.key === raw.font) ? raw.font as FontChoice : 'system',
    glassPanel: allowed(PANEL_LEVELS, raw.glassPanel, base.glassPanel),
    glassBlur: allowed(BLUR_LEVELS, raw.glassBlur, base.glassBlur),
    glassCard: allowed(CARD_LEVELS, raw.glassCard, base.glassCard),
    glow: typeof raw.glow === 'boolean' ? raw.glow : true,
    backgroundDim: DIM_LEVELS.some(level => level.value === raw.backgroundDim) ? raw.backgroundDim as number : base.backgroundDim,
    background: isUri(raw.background) ? raw.background : null,
  };
}
export const APPEARANCE_KEY = 'classflow.appearance.v1';
export const DIM_LEVELS = [{ value: 0, title: '无' }, { value: 0.25, title: '浅' }, { value: 0.5, title: '中' }, { value: 0.7, title: '深' }];
// Choices offered in settings; the first value of each is the most see-through.
export const PANEL_LEVELS = [{ value: 0.16, title: '通透' }, { value: 0.3, title: '适中' }, { value: 0.55, title: '朦胧' }];
export const BLUR_LEVELS = [{ value: 0, title: '无' }, { value: 6, title: '轻' }, { value: 12, title: '中' }, { value: 24, title: '重' }];
export const CARD_LEVELS = [{ value: 0.22, title: '通透' }, { value: 0.4, title: '适中' }, { value: 0.68, title: '浓郁' }];
const allowed = (levels: { value: number }[], value: unknown, fallback: number) => levels.some(level => level.value === value) ? value as number : fallback;

export const defaultAppearance = (): Appearance => ({ version: 1, background: null, backgroundDim: 0.25, cardImages: {}, cardFrost: {}, greeting: true, glassPanel: 0.3, glassBlur: 12, glassCard: 0.4, glow: true, uiStyle: 'glass', font: 'system', presets: [], reminders: defaultReminders(), calendarLayout: 'timeline', periodPreset: 'auto', dragEnabled: true, haptics: true });

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

export const referencedImages = (appearance: Appearance) => new Set([appearance.background, ...Object.values(appearance.cardImages), ...appearance.presets.map(preset => preset.background)].filter((uri): uri is string => !!uri));

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
      uiStyle: value.uiStyle === 'pixel' ? 'pixel' : 'glass',
      font: FONTS.some(font => font.key === value.font) ? value.font as FontChoice : 'system',
      presets: Array.isArray(value.presets) ? value.presets.map(item => restorePreset(item, base)).filter((item): item is LookPreset => !!item).slice(0, MAX_PRESETS) : [],
      reminders: restoreReminders(value.reminders),
      calendarLayout: value.calendarLayout === 'periods' ? 'periods' : 'timeline',
      periodPreset: value.periodPreset === 'guilinyang' ? 'guilinyang' : 'auto',
      dragEnabled: typeof value.dragEnabled === 'boolean' ? value.dragEnabled : true,
      haptics: typeof value.haptics === 'boolean' ? value.haptics : true,
    };
  } catch { return base; }
}
