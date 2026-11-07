import React, { useEffect, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { snapToRange, type SliderRange } from '../domain/appearance';
import { PIXEL, useGlass } from './glass';
import { PressSurface, haptic, useAccessibility, useUI } from './primitives';
import { metrics, useTheme } from './theme';

export type SliderMark = { value: number; title: string };

const THUMB = 26;
// Bouncy settle: a visible overshoot that rings out in about half a second.
const SETTLE = { mass: 0.7, stiffness: 230, damping: 13 };
// A release faster than this (px/s) throws the thumb: it glides on and slows down by itself.
const FLING = 350;
// Glide friction per millisecond: lower stops sooner. 0.994 carries a 2000 px/s throw about 330 px.
const GLIDE = 0.994;
// A gentle release still drifts this far (seconds of travel at the release speed).
const CARRY = 0.05;
// Release within this many px of a mark and the thumb lands on it.
const MAGNET = 14;
// Rubber band past the ends: the further you pull, the less it follows.
const rubber = (over: number) => {
  'worklet';
  const sign = over < 0 ? -1 : 1;
  const distance = Math.abs(over);
  return sign * (distance * 0.55 * 90) / (90 + distance * 0.55);
};

/**
 * A springy slider: drags past either end with resistance, a throw glides on and slows down,
 * snaps onto nearby marks and settles with a soft overshoot. Tapping a mark's name, or the
 * track itself, springs the thumb there.
 */
export function SpringSlider({ label, detail, value, range, marks, format, onChange }: {
  label: string; detail?: string; value: number; range: SliderRange; marks: SliderMark[];
  format: (value: number) => string; onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const ui = useUI();
  const glass = useGlass();
  const pixel = glass.style === 'pixel';
  const { reduceMotion } = useAccessibility();
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(value);
  const committed = useRef(value);
  const span = range.max - range.min;
  const toX = (v: number) => (Math.min(range.max, Math.max(range.min, v)) - range.min) / span * width;

  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const press = useSharedValue(0);
  const stretch = useSharedValue(1);
  const lastSent = useSharedValue(0);
  const lastMark = useSharedValue(-1);
  const trackWidth = useSharedValue(0);
  const markXs = useSharedValue<number[]>([]);
  // True while a finger or a throw moves the thumb; mark ticks and edge bumps only fire then.
  const moving = useSharedValue(false);
  const atEdge = useSharedValue(false);

  const settle = (target: number, velocity = 0) => {
    'worklet';
    x.set(reduceMotion ? withTiming(target, { duration: 160 }) : withSpring(target, { ...SETTLE, velocity }));
  };

  // Follow outside changes (a preset, undo) with the same spring.
  useEffect(() => {
    trackWidth.set(width);
    markXs.set(marks.map(mark => toX(mark.value)));
    if (!width) return;
    if (Math.abs(value - committed.current) > 1e-6 || x.get() === 0) settle(toX(value));
    committed.current = value;
    setShown(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, width, marks, range.min, range.max]);

  const valueAt = (px: number) => {
    'worklet';
    const w = trackWidth.get();
    if (!w) return range.min;
    const raw = range.min + Math.min(1, Math.max(0, px / w)) * span;
    return Math.round(Math.round((raw - range.min) / range.step) * range.step * 1000 + range.min * 1000) / 1000;
  };
  const landing = (px: number) => {
    'worklet';
    const w = trackWidth.get();
    const clamped = Math.min(w, Math.max(0, px));
    let best = clamped;
    let gap = MAGNET;
    for (const markX of markXs.get()) if (Math.abs(markX - clamped) < gap) { gap = Math.abs(markX - clamped); best = markX; }
    return best;
  };

  const live = (next: number) => setShown(next);
  const commit = (next: number) => {
    const snapped = snapToRange(range, next);
    committed.current = snapped;
    setShown(snapped);
    onChange(snapped);
  };
  const tick = () => haptic('tick');
  const bump = () => haptic('edge');

  const goTo = (px: number, velocity = 0) => {
    'worklet';
    moving.set(false);
    const target = landing(px);
    // The landing value comes from the exact mark when it snapped to one.
    settle(target, velocity);
    stretch.set(withSequence(withTiming(1.18, { duration: 70 }), withSpring(1, SETTLE)));
    runOnJS(commit)(valueAt(target));
  };

  const pan = Gesture.Pan().activeOffsetX([-4, 4]).failOffsetY([-12, 12])
    .onBegin(() => { press.set(withSpring(1, SETTLE)); })
    .onStart(() => { start.set(x.get()); moving.set(true); lastMark.set(-1); atEdge.set(x.get() <= 0 || x.get() >= trackWidth.get()); })
    .onUpdate(event => {
      const w = trackWidth.get();
      const raw = start.get() + event.translationX;
      const next = raw < 0 ? rubber(raw) : raw > w ? w + rubber(raw - w) : raw;
      x.set(next);
      stretch.set(1 + Math.min(0.3, Math.abs(event.velocityX) / 4000));
    })
    .onEnd(event => {
      const w = trackWidth.get();
      const pos = x.get();
      const velocity = event.velocityX;
      if (reduceMotion || pos < 0 || pos > w || Math.abs(velocity) < FLING) { goTo(pos + velocity * CARRY, velocity); return; }
      // Thrown: glide on from the release speed, slowing down; a hit on an end bounces back.
      stretch.set(withTiming(1, { duration: 420 }));
      x.set(withDecay({ velocity, deceleration: GLIDE, clamp: [0, w], rubberBandEffect: true, rubberBandFactor: 0.7 }, finished => {
        if (!finished) return; // caught by a new touch; that gesture commits instead
        moving.set(false);
        const target = landing(x.get());
        if (Math.abs(target - x.get()) > 0.5) settle(target);
        runOnJS(commit)(valueAt(target));
      }));
    })
    .onFinalize(() => { press.set(withSpring(0, SETTLE)); });
  const tap = Gesture.Tap().maxDuration(400).onEnd(event => { goTo(event.x - THUMB / 2); });
  const gesture = Gesture.Exclusive(pan, tap);

  // Readout, mark ticks and the bump at either end follow the thumb, whether dragged or gliding.
  useAnimatedReaction(() => x.get(), pos => {
    const now = Date.now();
    if (now - lastSent.get() > 40) { lastSent.set(now); runOnJS(live)(valueAt(pos)); }
    if (!moving.get()) return;
    const xs = markXs.get();
    let near = -1;
    for (let index = 0; index < xs.length; index++) if (Math.abs(xs[index] - pos) < 3) near = index;
    if (near !== -1 && near !== lastMark.get()) runOnJS(tick)();
    lastMark.set(near);
    const edge = pos <= 0 || pos >= trackWidth.get();
    if (edge && !atEdge.get()) runOnJS(bump)();
    atEdge.set(edge);
  });

  const thumbStyle = useAnimatedStyle(() => {
    const w = trackWidth.get();
    const pos = x.get();
    // Squash against the wall when pulled past an end.
    const over = pos < 0 ? -pos : pos > w ? pos - w : 0;
    const squash = Math.min(0.25, over / 120);
    return {
      transform: [
        { translateX: pos },
        { scaleX: (1 + press.get() * 0.18) * stretch.get() * (1 - squash) },
        { scaleY: (1 + press.get() * 0.18) / Math.sqrt(stretch.get()) * (1 + squash * 0.6) },
      ],
    };
  });
  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(0, x.get()) + 3 }));
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + press.get() * 0.35 }] }));

  const radius = pixel ? PIXEL.radius : THUMB / 2;
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.max(0, event.nativeEvent.layout.width - THUMB));
  const step = (direction: 1 | -1) => commit(Math.min(range.max, Math.max(range.min, shown + direction * range.step * (range.step < 1 ? 5 : 2))));

  return <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={{ flex: 1, fontSize: metrics.type.body, color: theme.ink, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: metrics.type.body, color: theme.blue, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{format(shown)}</Text>
    </View>
    {!!detail && <Text style={ui.label}>{detail}</Text>}
    <GestureDetector gesture={gesture}>
      <View onLayout={onLayout} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(shown) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={{ height: THUMB + 14, justifyContent: 'center' }}>
        <Animated.View style={[{ marginHorizontal: THUMB / 2 - 3, height: 6, borderRadius: pixel ? 0 : 3, backgroundColor: theme.line, overflow: 'hidden' }, trackStyle]}>
          <Animated.View style={[{ height: '100%', backgroundColor: theme.blue, opacity: 0.85 }, fillStyle]} />
        </Animated.View>
        {width > 0 && marks.map(mark => <View key={mark.title} pointerEvents="none"
          style={{ position: 'absolute', left: toX(mark.value) + THUMB / 2 - 2, width: 4, height: 4, borderRadius: pixel ? 0 : 2, backgroundColor: theme.ink, opacity: 0.35 }} />)}
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: radius, backgroundColor: '#ffffff',
          borderWidth: pixel ? PIXEL.border : 0, borderColor: theme.ink, boxShadow: pixel ? undefined : '0 2px 6px rgba(0,0,0,0.28)',
        }, thumbStyle]} />
      </View>
    </GestureDetector>
    {width > 0 && <View style={{ height: 30 }}>
      {marks.map((mark, index) => {
        const active = Math.abs(shown - mark.value) < range.step / 2;
        const center = toX(mark.value) + THUMB / 2;
        // Keep the names at both ends inside the row.
        const edge = index === 0 && center < 30 ? { left: 0 } : index === marks.length - 1 && center > width + THUMB - 30 ? { right: 0 } : { left: center - 30 };
        return <PressSurface key={mark.title} accessibilityRole="button" accessibilityLabel={`${label}设为${mark.title}`} accessibilityState={{ selected: active }}
          onPress={() => { haptic(); moving.set(false); settle(toX(mark.value)); stretch.set(withSequence(withTiming(1.18, { duration: 70 }), withSpring(1, SETTLE))); commit(mark.value); }}
          style={{ position: 'absolute', top: 0, width: 60, minHeight: 30, alignItems: edge.left === 0 ? 'flex-start' : edge.right === 0 ? 'flex-end' : 'center', justifyContent: 'center', ...edge }}>
          <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? theme.blue : theme.secondary }}>{mark.title}</Text>
        </PressSurface>;
      })}
    </View>}
  </View>;
}
