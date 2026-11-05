import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { APPEARANCE_KEY, restoreAppearance } from '../domain/appearance';
import { greetingFor } from '../domain/greetings';
import { DAYS, dayOfWeek } from '../domain/schedule';
import { useAccessibility } from '../ui/primitives';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const VEIL = '#4a4d55';
const HOLD = 1500;

// Automated browsers (the regression suites) skip the curtain so their timing is unchanged.
const automated = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.webdriver;

/**
 * Opening curtain: a grey veil with a greeting for the time of day, then a
 * circular mask grows from the middle and reveals the app. Tap to skip.
 */
export function GreetingCurtain() {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useAccessibility();
  const [visible, setVisible] = useState(() => !automated());
  const [leaving, setLeaving] = useState(false);
  const [now] = useState(() => new Date());
  const [greeting] = useState(() => greetingFor(now, Math.random()));
  const words = useSharedValue(0);
  const hole = useSharedValue(0);
  const veil = useSharedValue(1);
  const exiting = useSharedValue(false);
  const left = useRef(false);

  const cx = width / 2;
  const cy = height * 0.46;
  const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + 4;

  const finish = () => setVisible(false);
  function reveal(quick = false) {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    exiting.set(true);
    words.set(withTiming(0, { duration: quick ? 120 : 220, easing: Easing.in(Easing.quad) }));
    if (quick || reduceMotion) {
      veil.set(withTiming(0, { duration: quick ? 160 : 260 }, done => { if (done) scheduleOnRN(finish); }));
      return;
    }
    hole.set(withDelay(140, withTiming(1, { duration: 760, easing: Easing.bezier(0.65, 0, 0.3, 1) }, done => { if (done) scheduleOnRN(finish); })));
  }

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    words.set(reduceMotion ? 1 : withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => reveal(), HOLD);
    AsyncStorage.getItem(APPEARANCE_KEY).then(raw => {
      if (alive && !restoreAppearance(raw).greeting) { clearTimeout(timer); reveal(true); }
    }).catch(() => {});
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // A full-screen grey sheet with a growing circular hole (even-odd fill).
  const mask = useAnimatedProps(() => {
    const r = hole.get() * reach;
    const frame = `M0 0H${width}V${height}H0Z`;
    return { d: r < 0.5 ? frame : `${frame}M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` };
  });
  const sheet = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const text = useAnimatedStyle(() => ({
    opacity: words.get(),
    transform: [{ translateY: (1 - words.get()) * (exiting.get() ? -10 : 14) }, { scale: 0.96 + words.get() * 0.04 }],
  }));

  if (!visible) return null;
  return <Animated.View testID="greeting-curtain" pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, sheet]}>
    <StatusBar barStyle="light-content" />
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <AnimatedPath animatedProps={mask} fill={VEIL} fillRule="evenodd" />
    </Svg>
    <Pressable accessibilityRole="button" accessibilityLabel={`${greeting.text}，轻点进入`} onPress={() => reveal()} style={StyleSheet.absoluteFill}>
      <View style={[styles.center, { top: cy - 80 }]}>
        <Animated.View style={[styles.words, text]}>
          <Text style={styles.kicker}>{greeting.title} · {now.getMonth() + 1}月{now.getDate()}日 {DAYS[dayOfWeek(now)]}</Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.greeting}>{greeting.text}</Text>
        </Animated.View>
      </View>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, height: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  words: { alignItems: 'center', gap: 12, maxWidth: 520 },
  kicker: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
  greeting: { color: '#ffffff', fontSize: 23, lineHeight: 34, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
});
