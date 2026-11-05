import type { Entry } from './schedule';

// Device-local look & feel. Stored apart from the schedule so JSON backups
// stay portable (they never carry file paths that only exist on one phone).
export type Appearance = {
  version: 1;
  background: string | null;
  backgroundDim: number;                 // 0–0.85 veil of the page colour over the photo
  cardImages: Record<string, string>;    // `entry:<id>` (one item) or `title:<name>` (every session of a course)
  cardFrost: Record<string, true>;       // same keys: draw a frosted layer over that picture
  greeting: boolean;                     // greeting curtain when the app opens
  dragEnabled: boolean;                  // drag / resize in the detailed timetable
  haptics: boolean;
};

export type CardImageScope = 'entry' | 'title';
export const APPEARANCE_KEY = 'classflow.appearance.v1';
export const DIM_LEVELS = [{ value: 0.25, title: '浅' }, { value: 0.5, title: '中' }, { value: 0.7, title: '深' }];

export const defaultAppearance = (): Appearance => ({ version: 1, background: null, backgroundDim: 0.5, cardImages: {}, cardFrost: {}, greeting: true, dragEnabled: true, haptics: true });

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
      dragEnabled: typeof value.dragEnabled === 'boolean' ? value.dragEnabled : true,
      haptics: typeof value.haptics === 'boolean' ? value.haptics : true,
    };
  } catch { return base; }
}
