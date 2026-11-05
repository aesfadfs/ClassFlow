import React, { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAccessibility } from './primitives';
import { useTheme, type Theme } from './theme';

/** The page background: the user's photo (and its veil), or null for the default ambient colours. */
export const BackgroundContext = createContext<{ uri: string | null; dim: number }>({ uri: null, dim: 0.5 });

// Frosted surfaces blur this much of the photo behind them.
export const FROST_BLUR = 28;

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
  if (!uri) return <Ambient />;
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
export function Backdrop({ offset, blur = FROST_BLUR }: { offset: { x: number; y: number }; blur?: number }) {
  const { width, height } = useWindowDimensions();
  return <View pointerEvents="none" style={{ position: 'absolute', left: -offset.x, top: -offset.y, width, height }}>
    <AppBackground blur={blur} />
  </View>;
}

export const frost = (theme: Theme, strong = false) => theme.dark
  ? { fill: strong ? 'rgba(27,32,44,0.78)' : 'rgba(30,36,50,0.52)', rim: 'rgba(255,255,255,0.13)', shadow: '0 8px 24px rgba(0,0,0,0.32)' }
  : { fill: strong ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.56)', rim: 'rgba(255,255,255,0.8)', shadow: '0 8px 24px rgba(40,55,110,0.10)' };

/**
 * Frosted-glass layer for any rounded surface: drop it in as the first child.
 * Over the ambient colours the translucent fill of the surface is enough; over
 * a photo it draws the photo blurred underneath, like a frosted pane.
 */
export function GlassFill({ radius, strong = false }: { radius: number; strong?: boolean }) {
  const theme = useTheme();
  const { uri } = useContext(BackgroundContext);
  const { reduceTransparency } = useAccessibility();
  const { ref, onLayout, offset } = useScreenOffset();
  if (!uri || reduceTransparency) return null;
  return <View ref={ref} onLayout={onLayout} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
    <Backdrop offset={offset} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: frost(theme, strong).fill }]} />
  </View>;
}
