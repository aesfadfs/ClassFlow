import React, { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAccessibility } from './primitives';
import { useTheme, type Theme } from './theme';

/** The page background: the user's photo (and its veil), or null for the default ambient colours. */
export const BackgroundContext = createContext<{ uri: string | null; dim: number }>({ uri: null, dim: 0.5 });

/**
 * How the glass looks, adjustable in settings: panel fill opacity, how much the
 * photo behind glass is blurred, how strongly cards are tinted, and the soft
 * light glow along glass edges.
 */
export type GlassLook = { panel: number; blur: number; card: number; glow: boolean; style: 'glass' | 'pixel'; font: 'system' | 'serif' | 'mono' };
export const DEFAULT_GLASS: GlassLook = { panel: 0.3, blur: 12, card: 0.4, glow: true, style: 'glass', font: 'system' };

/** Font family for the chosen face; system fonts only, so Chinese text always has glyphs. */
export function fontFamily(font: GlassLook['font']): string | undefined {
  if (font === 'serif') return Platform.select({ ios: 'Songti SC', android: 'serif', default: 'serif' });
  if (font === 'mono') return Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' });
  return undefined;
}
/** Style fragment that applies the chosen font (empty for the system font). */
export function useFont() {
  const { font } = useContext(GlassContext);
  const family = fontFamily(font);
  return family ? { fontFamily: family } : null;
}

// Pixel style: square-ish corners, thick outlines, a bevel (light top-left, dark bottom-right) and hard drop shadows.
export const PIXEL = { radius: 3, border: 3 };
export const pixelShadow = (theme: Theme, size = 4) => theme.dark
  ? `inset 3px 3px 0 rgba(255,255,255,0.10), inset -3px -3px 0 rgba(0,0,0,0.35), ${size}px ${size}px 0 rgba(0,0,0,0.55)`
  : `inset 3px 3px 0 rgba(255,255,255,0.65), inset -3px -3px 0 rgba(0,0,0,0.14), ${size}px ${size}px 0 rgba(40,32,24,0.28)`;

const PIXEL_TILES = {
  light: ['#d9d4c7', '#d2ccbe', '#e0dbcf', '#cdc6b6'],
  dark: ['#25272d', '#2a2c33', '#212328', '#2e3038'],
};
/** A calm block-grid background for the pixel style (an original tile, repeated). */
export function PixelBackdrop() {
  const theme = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tiles = PIXEL_TILES[theme.dark ? 'dark' : 'light'];
  const cell = 24, size = cell * 4;
  // Fixed shade order per 4x4 tile so neighbouring blocks never look stripy.
  const order = [0, 2, 1, 3, 1, 3, 0, 2, 2, 0, 3, 1, 3, 1, 2, 0];
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tiles[0] }]}>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id={`${id}px`} x="0" y="0" width={size} height={size} patternUnits="userSpaceOnUse">
          {order.map((shade, index) => <Rect key={index} x={(index % 4) * cell} y={Math.floor(index / 4) * cell} width={cell} height={cell} fill={tiles[shade]} />)}
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}px)`} />
    </Svg>
  </View>;
}
export const GlassContext = createContext<GlassLook>(DEFAULT_GLASS);
export const useGlass = () => useContext(GlassContext);

const BLOBS: Record<'light' | 'dark', { color: string; x: number; y: number; r: number; o: number }[]> = {
  light: [
    { color: '#86a8ff', x: 8, y: 10, r: 62, o: 0.7 },
    { color: '#ffb0cf', x: 96, y: 30, r: 56, o: 0.62 },
    { color: '#94e3d2', x: 16, y: 78, r: 58, o: 0.6 },
    { color: '#bea9fb', x: 90, y: 94, r: 52, o: 0.62 },
  ],
  dark: [
    { color: '#3552c4', x: 8, y: 10, r: 62, o: 0.55 },
    { color: '#86306f', x: 96, y: 30, r: 56, o: 0.45 },
    { color: '#1c6f65', x: 16, y: 78, r: 58, o: 0.45 },
    { color: '#4d3aa8', x: 90, y: 94, r: 52, o: 0.5 },
  ],
};

/** Soft colour fields behind the glass when no photo is chosen; already blurry, so glass can sit on it directly. */
export function Ambient() {
  const theme = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const blobs = BLOBS[theme.dark ? 'dark' : 'light'];
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]}>
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>{blobs.map((blob, index) => <RadialGradient key={index} id={`${id}b${index}`} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={blob.color} stopOpacity={blob.o} />
        <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
      </RadialGradient>)}</Defs>
      <Rect x="0" y="0" width="100" height="100" fill={theme.bg} />
      {blobs.map((blob, index) => <Circle key={index} cx={blob.x} cy={blob.y} r={blob.r} fill={`url(#${id}b${index})`} />)}
    </Svg>
  </View>;
}

/** Whatever sits behind the whole app; `blur` frosts a photo for glass surfaces. */
export function AppBackground({ blur = 0, testID }: { blur?: number; testID?: string }) {
  const theme = useTheme();
  const { uri, dim } = useContext(BackgroundContext);
  const { style } = useContext(GlassContext);
  if (!uri) return style === 'pixel' ? <PixelBackdrop /> : <Ambient />;
  return <View testID={testID} pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image source={{ uri }} blurRadius={blur} resizeMode="cover" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: dim }]} />
  </View>;
}

/**
 * Where a surface sits on screen, so the backdrop drawn inside it lines up with
 * the real background. Pages of the pager sit whole screen widths apart, so x is
 * folded back into the visible screen.
 */
export function useScreenOffset() {
  const ref = useRef<View>(null);
  const { width } = useWindowDimensions();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const onLayout = useCallback((_event?: LayoutChangeEvent) => {
    ref.current?.measureInWindow((x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !width) return;
      const folded = ((Math.round(x) % width) + width) % width;
      setOffset(current => current.x === folded && current.y === Math.round(y) ? current : { x: folded, y: Math.round(y) });
    });
  }, [width]);
  return { ref, onLayout, offset };
}

/** The blurred background, positioned so it lines up with the screen behind a surface at `offset`. */
export function Backdrop({ offset, blur }: { offset: { x: number; y: number }; blur?: number }) {
  const { width, height } = useWindowDimensions();
  const look = useGlass();
  return <View pointerEvents="none" style={{ position: 'absolute', left: -offset.x, top: -offset.y, width, height }}>
    <AppBackground blur={blur ?? look.blur} />
  </View>;
}

export function frost(theme: Theme, strong = false, look: GlassLook = DEFAULT_GLASS) {
  if (look.style === 'pixel') {
    return theme.dark
      ? { fill: strong ? '#353840' : '#3b3e47', rim: '#101115', shadow: pixelShadow(theme) }
      : { fill: strong ? '#f6f1e4' : '#efe8d6', rim: '#3a332b', shadow: pixelShadow(theme) };
  }
  // Strong surfaces (the timetable grid) stay more opaque so dense text is readable.
  const alpha = Math.round((strong ? Math.min(0.86, look.panel + 0.38) : look.panel) * 100) / 100;
  return theme.dark
    ? { fill: `rgba(30,36,50,${alpha})`, rim: look.glow ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.13)',
      shadow: look.glow ? '0 8px 24px rgba(0,0,0,0.30), 0 0 18px rgba(150,170,255,0.16)' : '0 8px 24px rgba(0,0,0,0.32)' }
    : { fill: `rgba(255,255,255,${alpha})`, rim: look.glow ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)',
      shadow: look.glow ? '0 8px 24px rgba(40,55,110,0.08), 0 0 18px rgba(255,255,255,0.55)' : '0 8px 24px rgba(40,55,110,0.10)' };
}

/**
 * Frosted-glass layer for any rounded surface: drop it in as the first child.
 * Over the ambient colours the translucent fill of the surface is enough; over
 * a photo it draws the photo blurred underneath, like a frosted pane.
 */
export function GlassFill({ radius, strong = false }: { radius: number; strong?: boolean }) {
  const theme = useTheme();
  const { uri } = useContext(BackgroundContext);
  const { reduceTransparency } = useAccessibility();
  const look = useGlass();
  const { ref, onLayout, offset } = useScreenOffset();
  // Pixel surfaces are solid blocks: no frosted photo underneath.
  if (!uri || reduceTransparency || look.style === 'pixel') return null;
  return <View ref={ref} onLayout={onLayout} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
    <Backdrop offset={offset} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: frost(theme, strong, look).fill }]} />
  </View>;
}
