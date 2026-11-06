import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { APPEARANCE_KEY, restoreAppearance } from '../domain/appearance';
import { greetingFor } from '../domain/greetings';
import { DAYS, dayOfWeek } from '../domain/schedule';
import { useAccessibility } from '../ui/primitives';

const AnimatedText = Animated.createAnimatedComponent(SvgText);
const HOLD = 1500;
const FONT = Platform.select({ ios: 'PingFang SC', android: 'sans-serif', default: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif' });

// Automated browsers (the regression suites) skip the curtain so their timing is unchanged.
const automated = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.webdriver;

/**
 * Opening curtain: a colour veil chosen for the time of day, with a greeting.
 * To open, the greeting turns into windows onto the app, then every glyph's
 * outline grows outwards, so the veil parts along the edges of the words
 * until nothing is left. Tap to skip.
 */
export function GreetingCurtain() {
  const { width, height } = useWindowDimensions();
  const { reduceMotion } = useAccessibility();
  const [visible, setVisible] = useState(() => !automated());
  const [leaving, setLeaving] = useState(false);
  const [now] = useState(() => new Date());
  const [greeting] = useState(() => greetingFor(now, Math.random(), Math.random()));
  const words = useSharedValue(0);   // greeting fades in
  const knock = useSharedValue(0);   // glyphs become see-through
  const grow = useSharedValue(0);    // glyph outlines expand
  const veil = useSharedValue(1);
  const left = useRef(false);

  // One line, sized to fit the screen; the glyph outline has to travel to the far corner.
  const size = Math.max(18, Math.min(28, (width - 48) / Math.max(6, greeting.text.length)));
  const cx = width / 2;
  const cy = Math.round(height * 0.46);
  const reach = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) * 2.2;
  const kicker = `${greeting.title} · ${now.getMonth() + 1}月${now.getDate()}日 ${DAYS[dayOfWeek(now)]}`;

  const finish = () => setVisible(false);
  // tapped: the same parting, about twice as fast.
  function reveal(quick = false, tapped = false) {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    if (quick || reduceMotion) {
      veil.set(withTiming(0, { duration: quick ? 160 : 260 }, done => { if (done) scheduleOnRN(finish); }));
      return;
    }
    const pace = tapped ? 0.55 : 1;
    knock.set(withTiming(1, { duration: 220 * pace, easing: Easing.out(Easing.quad) }));
    // Slow start so the parting is seen hugging the letters, then sweeping out.
    grow.set(withDelay(240 * pace, withTiming(1, { duration: 950 * pace, easing: Easing.bezier(0.5, 0, 0.6, 0.45) })));
    // Fade the last of the veil as well, so the app always appears even if a device draws masks lazily.
    veil.set(withDelay(1050 * pace, withTiming(0, { duration: 240 * pace }, done => { if (done) scheduleOnRN(finish); })));
  }

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    words.set(reduceMotion ? 1 : withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => reveal(), HOLD);
    AsyncStorage.getItem(APPEARANCE_KEY).then(raw => {
      if (alive && !restoreAppearance(raw).greeting) { clearTimeout(timer); reveal(true); }
    }).catch(() => {});
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  // Inside the mask black = hole: the glyphs, then their ever thicker outline.
  const hole = useAnimatedProps(() => ({ fillOpacity: knock.get(), strokeOpacity: knock.get(), strokeWidth: grow.get() * reach }));
  const ink = useAnimatedProps(() => ({ fillOpacity: words.get() * (1 - knock.get()) }));
  const caption = useAnimatedProps(() => ({ fillOpacity: words.get() * 0.8 * (1 - knock.get()) }));
  const sheet = useAnimatedStyle(() => ({ opacity: veil.get() }));

  if (!visible) return null;
  const line = { x: cx, textAnchor: 'middle' as const, fontFamily: FONT };
  return <Animated.View testID="greeting-curtain" pointerEvents={leaving ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, sheet]}>
    <StatusBar barStyle="light-content" />
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="curtainColour" x1="0" y1="0" x2="0.6" y2="1">
          <Stop offset="0" stopColor={greeting.colors[0]} />
          <Stop offset="1" stopColor={greeting.colors[1]} />
        </LinearGradient>
        <Mask id="curtainHole" x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width={width} height={height} fill="#ffffff" />
          <AnimatedText animatedProps={hole} {...line} y={cy + size * 0.36} fontSize={size} fontWeight="700"
            fill="#000000" stroke="#000000" strokeLinejoin="round" strokeLinecap="round">{greeting.text}</AnimatedText>
        </Mask>
      </Defs>
      <Rect testID="greeting-veil" x="0" y="0" width={width} height={height} fill="url(#curtainColour)" mask="url(#curtainHole)" />
      <AnimatedText animatedProps={caption} {...line} y={cy - size * 1.5} fontSize={14} fontWeight="600" fill="#ffffff" letterSpacing={1}>{kicker}</AnimatedText>
      <AnimatedText animatedProps={ink} {...line} y={cy + size * 0.36} fontSize={size} fontWeight="700" fill="#ffffff">{greeting.text}</AnimatedText>
    </Svg>
    <Pressable accessibilityRole="button" accessibilityLabel={`${greeting.text}，轻点进入`} onPress={() => reveal(false, true)} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}
