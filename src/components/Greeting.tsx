import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { APPEARANCE_KEY, restoreAppearance } from '../domain/appearance';
import { greetingFor } from '../domain/greetings';
import { DAYS, dayOfWeek } from '../domain/schedule';
import { haptic, useAccessibility } from '../ui/primitives';

const PAUSE = 450;   // after the last character, before the curtain opens
const BLOCK = 170;   // height of the text block in the middle of the screen
const GAP = 12;      // between the date line and the greeting

// Automated browsers (the regression suites) skip the curtain so their timing is unchanged.
const automated = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.webdriver;

/**
 * Opening curtain: a colour veil chosen for the time of day. The greeting is
 * typed in one character at a time with a blinking cursor (and a light tick
 * per key when haptics are on), then a line of light flashes through it and
 * the veil snaps open along that line. Tap to skip.
 */
export function GreetingCurtain() {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useAccessibility();
  const [visible, setVisible] = useState(() => !automated());
  const [leaving, setLeaving] = useState(false);
  const [now] = useState(() => new Date());
  const [greeting] = useState(() => greetingFor(now, Math.random(), Math.random()));
  const blockTop = Math.round(height * 0.46 - BLOCK / 2);
  // Where the greeting line sits inside the text block, measured once laid out.
  const [layout, setLayout] = useState({ words: 0, y: 0, h: 0 });
  const seam = layout.h ? Math.round(blockTop + (BLOCK - layout.words) / 2 + layout.y + layout.h / 2) : Math.round(height * 0.46);
  const words = useSharedValue(0);
  const line = useSharedValue(0);
  const open = useSharedValue(0);
  const veil = useSharedValue(1);
  const left = useRef(false);
  const [typed, setTyped] = useState(0);
  const [cursor, setCursor] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chars = Array.from(greeting.text);

  const finish = () => setVisible(false);
  function reveal(quick = false) {
    if (left.current) return;
    left.current = true;
    timers.current.forEach(clearTimeout);
    setTyped(chars.length);
    setLeaving(true);
    if (quick || reduceMotion) {
      veil.set(withTiming(0, { duration: quick ? 160 : 260 }, done => { if (done) scheduleOnRN(finish); }));
      return;
    }
    // A quick flash, then the halves snap apart.
    line.set(withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }));
    open.set(withDelay(110, withTiming(1, { duration: 430, easing: Easing.bezier(0.65, 0, 0.2, 1) }, done => { if (done) scheduleOnRN(finish); })));
  }

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    words.set(reduceMotion ? 1 : withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    const blink = setInterval(() => setCursor(on => !on), 480);
    const later = (ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); };
    // Read the settings first: skip entirely if switched off, and only tick when haptics are on.
    const start = (look: { greeting: boolean; haptics: boolean }) => {
      if (!alive || left.current) return;
      if (!look.greeting) { reveal(true); return; }
      if (reduceMotion) { setTyped(chars.length); later(1200, () => reveal()); return; }
      // Typing rhythm: a little uneven like real keys, a beat longer after punctuation.
      let at = 380;
      chars.forEach((char, index) => {
        at += /[，。！？、,.!?]/.test(chars[index - 1] ?? '') ? 170 : 60 + Math.random() * 55;
        later(at, () => { setTyped(index + 1); if (look.haptics && char.trim()) haptic('tick'); });
      });
      later(at + PAUSE, () => reveal());
    };
    AsyncStorage.getItem(APPEARANCE_KEY).then(raw => start(restoreAppearance(raw))).catch(() => start({ greeting: true, haptics: true }));
    return () => { alive = false; clearInterval(blink); timers.current.forEach(clearTimeout); };
  }, []);

  const sheet = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const upper = useAnimatedStyle(() => ({ transform: [{ translateY: -open.get() * (seam + 24) }] }));
  const lower = useAnimatedStyle(() => ({ transform: [{ translateY: open.get() * (height - seam + 24) }] }));
  const text = useAnimatedStyle(() => ({
    opacity: words.get() * (1 - open.get() * 0.5),
    transform: [{ translateY: (1 - words.get()) * 12 }],
  }));
  const light = useAnimatedStyle(() => ({ opacity: line.get() * (1 - open.get()), transform: [{ scaleX: line.get() }] }));

  if (!visible) return null;
  // One half of the curtain: the whole gradient and words, clipped to its side of the
  // seam, so both halves line up exactly until they part.
  const half = (part: 'upper' | 'lower') => {
    const top = part === 'upper' ? 0 : seam;
    const measure = part === 'upper';
    return <Animated.View testID={`greeting-${part}`} pointerEvents="none" style={[styles.half, { top, height: part === 'upper' ? seam : height - seam }, part === 'upper' ? upper : lower]}>
      <View style={{ position: 'absolute', left: 0, width, top: -top, height }}>
        <LinearGradient colors={greeting.colors} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { top: blockTop }]}>
          <Animated.View style={[styles.words, text]} onLayout={measure ? event => { const h = event.nativeEvent.layout.height; setLayout(current => ({ ...current, words: h })); } : undefined}>
            <Text style={styles.kicker}>{greeting.title} · {now.getMonth() + 1}月{now.getDate()}日 {DAYS[dayOfWeek(now)]}</Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.greeting}
              onLayout={measure ? event => { const { y, height: h } = event.nativeEvent.layout; setLayout(current => ({ ...current, y, h })); } : undefined}>
              {/* Untyped characters stay laid out but invisible, so the line never shifts while typing. */}
              <Text style={styles.typed}>{chars.slice(0, typed).join('')}</Text>
              <Text style={{ opacity: cursor && !leaving ? 0.9 : 0, fontWeight: '300' }}>|</Text>
              <Text style={styles.untyped}>{chars.slice(typed).join('')}</Text>
            </Text>
          </Animated.View>
        </View>
      </View>
    </Animated.View>;
  };

  return <Animated.View testID="greeting-curtain" pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, sheet]}>
    <StatusBar barStyle="light-content" />
    {half('upper')}
    {half('lower')}
    <Animated.View pointerEvents="none" style={[styles.light, { top: seam - 1, width }, light]} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${greeting.text}，轻点进入`} onPress={() => reveal()} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  half: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  center: { position: 'absolute', left: 0, right: 0, height: BLOCK, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  words: { alignItems: 'center', gap: GAP, maxWidth: 520 },
  kicker: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', letterSpacing: 1 },
  greeting: { color: '#ffffff', fontSize: 23, lineHeight: 34, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  // The shadow sits on the typed part only, so untyped (transparent) characters leave no trace.
  typed: { textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 8 },
  untyped: { color: 'transparent' },
  light: { position: 'absolute', left: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 0 14px rgba(255,255,255,0.9)' },
});
