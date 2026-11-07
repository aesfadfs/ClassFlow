import { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';

const light = {
  dark: false, bg: '#f1f3f7', surface: '#ffffff', raised: '#ffffff', soft: '#edf0f5',
  ink: '#171d2c', secondary: '#465166', muted: '#5f6a7e', line: '#dce2ec',
  blue: '#364bb6', onAccent: '#ffffff', tint: '#e9edff', accentLine: '#cbd4ff',
  danger: '#a62a42', dangerBg: '#ffebef', warning: '#79460c', warningBg: '#fff2dc',
  success: '#256047', successBg: '#e5f3eb', glass: 'rgba(255,255,255,0.93)',
  glassLine: '#ffffff', scrim: 'rgba(18,24,40,0.38)', shadow: 'rgba(28,41,79,0.13)',
};

const dark: typeof light = {
  dark: true, bg: '#11141c', surface: '#1b202b', raised: '#252b39', soft: '#222835',
  ink: '#f4f6ff', secondary: '#c7cfe1', muted: '#a4aec4', line: '#343d4e',
  blue: '#b0baff', onAccent: '#1b255d', tint: '#2a3458', accentLine: '#48598c',
  danger: '#ffacb9', dangerBg: '#452632', warning: '#ffd29a', warningBg: '#412f22',
  success: '#a1dbbc', successBg: '#213d34', glass: 'rgba(33,39,53,0.94)',
  glassLine: '#444d63', scrim: 'rgba(0,0,0,0.62)', shadow: 'rgba(0,0,0,0.42)',
};

export type Theme = typeof light;
/** A wallpaper may ask for one palette (a dark colour wallpaper needs light text); null follows the system. */
export const SchemeContext = createContext<'light' | 'dark' | null>(null);
export function useTheme(override?: 'light' | 'dark' | null): Theme {
  const system = useColorScheme();
  const forced = useContext(SchemeContext);
  const scheme = override === undefined ? forced ?? system : override ?? system;
  return scheme === 'dark' ? dark : light;
}

export const metrics = {
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radius: { sm: 10, md: 14, lg: 20, xl: 28, full: 999 },
  type: { caption: 12, label: 14, body: 16, title: 20, display: 34 },
  touch: Platform.OS === 'android' ? 48 : 44,
};

export const springs = {
  press: { mass: 0.55, stiffness: 410, damping: 28 },
  settle: { mass: 0.75, stiffness: 290, damping: 27 },
  // Motion.Lab physics-spring adapted to Reanimated's physical spring units.
  snap: { mass: 0.65, stiffness: 340, damping: 30, overshootClamping: true, energyThreshold: 0.001 },
  sheet: { mass: 0.9, stiffness: 310, damping: 33 },
  // Paging and card-stack snapping: carry the release velocity, settle without wobble.
  // Settles in roughly 350ms; the older 0.8/240/30 took ~600ms and read as lag on 60Hz panels.
  page: { mass: 0.7, stiffness: 330, damping: 32, overshootClamping: true },
  card: { mass: 0.7, stiffness: 260, damping: 26 },
  // Soft "jelly" return after a tap on the up-next card: a small, visible overshoot.
  squeeze: { mass: 0.5, stiffness: 320, damping: 22 },
  jelly: { mass: 1, stiffness: 170, damping: 8 },
};
