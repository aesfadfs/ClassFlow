import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';

import { metrics, springs, useTheme } from './theme';

const AccessibilityContext = createContext({ reduceMotion: false, reduceTransparency: false });
export const useAccessibility = () => useContext(AccessibilityContext);
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
      const contrast = window.matchMedia('(prefers-contrast: more)');
      const update = () => { setReduceMotion(motion.matches); setReduceTransparency(transparency.matches || contrast.matches); };
      update();
      [motion, transparency, contrast].forEach(query => query.addEventListener('change', update));
      return () => [motion, transparency, contrast].forEach(query => query.removeEventListener('change', update));
    }
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency).catch(() => {});
    const a = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const b = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { a.remove(); b.remove(); };
  }, []);
  return <AccessibilityContext.Provider value={{ reduceMotion, reduceTransparency }}>{children}</AccessibilityContext.Provider>;
}

const paths = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M7 14h2M12 14h2M7 18h2',
  planner: 'M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  left: 'M14 6l-6 6 6 6', right: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6',
  arrow: 'M7 17L17 7M7 7h10v10',
  check: 'M5 12l4 4L19 6', close: 'M6 6l12 12M6 18L18 6',
  clock: 'M12 8v5l3 2',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM12 7v5M9.5 9.5h5',
  book: 'M12 5v16M3 3l9 2 9-2v16l-9 2-9-2z',
  import: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  settings: 'M10 2h4l.5 2.5 1.5.6 2.2-1.3 2 2L18.9 8l.6 1.5 2.5.5v4l-2.5.5-.6 1.5 1.3 2.2-2 2-2.2-1.3-1.5.6-.5 2.5h-4l-.5-2.5-1.5-.6-2.2 1.3-2-2L5.1 16l-.6-1.5L2 14v-4l2.5-.5.6-1.5-1.3-2.2 2-2L8 5.1l1.5-.6z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  sparkles: 'M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8zM21 2v4M19 4h4',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  school: 'M2 9l10-6 10 6-10 6zM6 12v6c4 3 8 3 12 0v-6M22 9v8',
  camera: 'M8 5l2-3h4l2 3h5v16H3V5z',
  globe: 'M2 12h20M12 2c-6 5-6 15 0 20M12 2c6 5 6 15 0 20',
  leaf: 'M20 3C10 1 2 6 4 15c5 9 17 3 16-12zM4 21L16 8',
  edit: 'M12 20H4V4h8M10 14l1-5 8-8 4 4-8 8-5 1z',
  info: 'M12 11v6M12 7h.01',
  file: 'M14 2H4v20h16V8l-6-6zM14 2v6h6M8 13h8M8 17h5',
  refresh: 'M20 7a9 9 0 1 0 1 9M20 2v6h-6',
  coffee: 'M3 8h14v7a6 6 0 0 1-12 0V8M17 8h2a3 3 0 0 1 0 6h-2M2 22h18M7 2v3M12 2v3',
} as const;
export type IconName = keyof typeof paths;
const symbols: Record<IconName, string> = {
  calendar: 'calendar', planner: 'checklist', grid: 'square.grid.2x2', plus: 'plus', left: 'chevron.left', right: 'chevron.right', down: 'chevron.down', arrow: 'arrow.up.right', check: 'checkmark', close: 'xmark', clock: 'clock', pin: 'mappin.and.ellipse', book: 'book', import: 'square.and.arrow.down', settings: 'gearshape', sun: 'sun.max', sparkles: 'sparkles', trash: 'trash', school: 'graduationcap', camera: 'camera', globe: 'globe', leaf: 'leaf', edit: 'square.and.pencil', info: 'info.circle', file: 'doc.text', refresh: 'arrow.clockwise', coffee: 'cup.and.saucer',
};
export function Icon({ name, size = 20, color, strokeWidth = 1.65 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const theme = useTheme();
  const tint = color ?? theme.ink;
  if (Platform.OS === 'ios') return <SymbolView accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name={symbols[name] as React.ComponentProps<typeof SymbolView>['name']} tintColor={tint} size={size} style={{ width: size, height: size }} />;
  return <Svg accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" focusable={false} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d={paths[name]} />
    {['clock', 'globe', 'info'].includes(name) && <Circle cx="12" cy="12" r="10" />}
    {['sun', 'settings'].includes(name) && <Circle cx="12" cy="12" r={name === 'sun' ? 4 : 3} />}
    {name === 'camera' && <Circle cx="12" cy="12" r="4" />}
  </Svg>;
}

export function Glass({ children, style, interactive = false }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const { reduceTransparency } = useAccessibility();
  const theme = useTheme();
  const base = { borderWidth: 1, borderColor: theme.glassLine, overflow: 'hidden' as const };
  if (!reduceTransparency && Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return <GlassView glassEffectStyle="regular" isInteractive={interactive} style={[base, style]}>{children}</GlassView>;
  }
  if (!reduceTransparency && Platform.OS === 'web') {
    return <BlurView intensity={30} tint={theme.dark ? 'dark' : 'light'} style={[base, { backgroundColor: theme.glass }, style]}>{children}</BlurView>;
  }
  return <View style={[base, { backgroundColor: reduceTransparency ? theme.raised : theme.glass }, style]}>{children}</View>;
}

export function haptic() {
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => {});
  if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => {});
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressSurface({ children, style, disabled, onPressIn, onPressOut, scale = 0.975, ...props }: Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; scale?: number;
}) {
  const pressed = useSharedValue(0);
  const { reduceMotion } = useAccessibility();
  const feedback = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - (1 - scale) * pressed.value }],
    opacity: disabled ? 0.45 : 1 - 0.16 * Math.max(0, Math.min(pressed.value, 1)),
  }));
  return <AnimatedPressable {...props} disabled={disabled} style={[{ justifyContent: 'center' }, style, feedback]}
      onPressIn={event => { pressed.value = reduceMotion ? 1 : withSpring(1, springs.press); onPressIn?.(event); }}
      onPressOut={event => { pressed.value = reduceMotion ? 0 : withSpring(0, springs.press); onPressOut?.(event); }}>
      {children}
  </AnimatedPressable>;
}

export function Button({ children, onPress, icon, label, variant = 'glass', style, disabled = false, small = false, selected }: {
  children?: React.ReactNode; onPress: () => void; icon?: IconName; label?: string;
  variant?: 'glass' | 'primary' | 'ghost' | 'danger'; style?: StyleProp<ViewStyle>; disabled?: boolean; small?: boolean; selected?: boolean;
}) {
  const theme = useTheme();
  const color = variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.danger : selected ? theme.blue : theme.ink;
  const backgroundColor = variant === 'primary' ? theme.blue : variant === 'danger' ? theme.dangerBg : selected ? theme.tint : variant === 'glass' ? theme.raised : 'transparent';
  return <PressSurface accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} style={[{ flexShrink: 0, alignSelf: 'center', borderRadius: metrics.radius.md, backgroundColor, borderWidth: variant === 'glass' ? 1 : 0, borderColor: selected ? theme.accentLine : theme.line }, style]}>
    <View style={{ minHeight: metrics.touch, width: children ? undefined : metrics.touch, paddingHorizontal: children ? (small ? 12 : 16) : 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {icon && <Icon name={icon} size={small ? 17 : 19} color={color} />}
      {typeof children === 'string' ? <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: small ? 13 : 14, fontWeight: '600', color }}>{children}</Text> : children}
    </View>
  </PressSurface>;
}

export function Reveal({ children, delay = 0, distance = 8, style }: { children: React.ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useAccessibility();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    const animation = withSpring(1, springs.settle);
    progress.value = reduceMotion ? 1 : delay ? withDelay(delay, animation) : animation;
  }, [delay, progress, reduceMotion]);
  const motion = useAnimatedStyle(() => {
    const visible = Math.max(0, Math.min(1, progress.value));
    return { opacity: visible, transform: [{ translateY: (1 - visible) * distance }] };
  });
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

export function useUI() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    label: { fontSize: metrics.type.caption, color: theme.muted },
    body: { fontSize: metrics.type.label, lineHeight: 22, color: theme.secondary },
    title: { color: theme.ink, fontWeight: '600', fontSize: metrics.type.title },
    pill: { borderRadius: metrics.radius.full, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: theme.tint },
    card: { borderRadius: metrics.radius.lg, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line },
  }), [theme]);
}
