import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { describeOccurrence, formatTime, type Entry, type Occurrence } from '../domain/schedule';
import { haptic, Icon, PRESS_DELAY, useAccessibility, useTapGuard, useUI } from '../ui/primitives';
import { metrics, springs, useTheme } from '../ui/theme';
import { Backdrop, fontFamily, useGlass, useScreenOffset } from '../ui/glass';
import { STACK, anchoredIndex, settleIndex, stackPose } from '../ui/stackMath';

const RATIO = 1.45;       // close to bank card proportions, a little taller for text
const SIDE = 10;          // room for card shadows inside the clipped stage
const GRADIENTS: Record<Entry['color'], [string, string]> = {
  blue: ['#4f7cf0', '#2a47ad'],
  purple: ['#9277de', '#5b3fa6'],
  green: ['#43a07a', '#21664d'],
  orange: ['#e59a4f', '#b4612a'],
  pink: ['#de7b9d', '#a3456c'],
};
// Tinted glass: the same colours as RGB, made translucent by the card setting.
const GLASS: Record<Entry['color'], [string, string]> = {
  blue: ['79,124,240', '42,71,173'],
  purple: ['146,119,222', '91,63,166'],
  green: ['67,160,122', '33,102,77'],
  orange: ['229,154,79', '180,97,42'],
  pink: ['222,123,157', '163,69,108'],
};
const glassTint = (color: Entry['color'], alpha: number): [string, string] =>
  [`rgba(${GLASS[color][0]},${alpha})`, `rgba(${GLASS[color][1]},${Math.min(0.92, alpha + 0.16)})`];

const keyOf = (item: Occurrence) => `${item.entry.id}-${item.offset}`;

/**
 * "Up next" stack: a vertical list of the coming courses and plans. A card that
 * reaches the top stays pinned while the next ones slide up over it, and the
 * earlier cards sink into a compressed stack above. Scroll by touch (with
 * inertia), mouse wheel or keyboard; tap a card to bring it to the top, tap the
 * top card for a soft bounce, long-press to edit.
 */
export const UpNextStack = React.memo(function UpNextStack({ items, now, onOpen, onAdd, imageFor }: {
  items: Occurrence[]; now: Date; onOpen: (entry: Entry) => void; onAdd: () => void; imageFor?: (entry: Entry) => { uri: string; frost: boolean } | undefined;
}) {
  const stage = useScreenOffset();
  const { reduceTransparency } = useAccessibility();
  const theme = useTheme();
  const ui = useUI();
  const { reduceMotion } = useAccessibility();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [active, setActiveState] = useState(0);
  const position = useSharedValue(0);
  const start = useSharedValue(0);
  const step = useSharedValue(200);
  const suppressPress = useRef(0);
  const count = items.length;
  const keys = items.map(keyOf);
  const anchor = useRef<string | null>(keys[0] ?? null);
  const setActive = (index: number) => { anchor.current = keys[index] ?? null; setActiveState(index); };

  // Keep the reader's place when the list changes (a class finishes, an entry is edited):
  // the card they were looking at stays at the top instead of jumping back to the start.
  const keySignature = keys.join('|');
  useEffect(() => {
    const next = anchoredIndex(keys, anchor.current, active);
    anchor.current = keys[next] ?? null;
    if (next !== active) { setActiveState(next); cancelAnimation(position); position.set(next); }
  }, [keySignature]);

  const cardWidth = Math.max(0, Math.min(size.width - SIDE * 2, 520));
  const cardHeight = Math.max(118, Math.min(cardWidth / RATIO, size.height - STACK.TOP - 56));
  const stepPx = cardHeight + STACK.GAP;
  useEffect(() => { step.set(stepPx); }, [stepPx, step]);
  const below = Math.ceil(Math.max(0, size.height - STACK.TOP) / stepPx) + 1;

  function goTo(next: number) {
    const target = Math.max(0, Math.min(count - 1, next));
    setActive(target);
    position.set(reduceMotion ? target : withSpring(target, springs.card));
  }
  const latest = useRef({ goTo, open: () => {}, count });
  latest.current = { goTo, open: () => { const item = items[Math.min(active, count - 1)]; if (item) onOpen(item.entry); }, count };

  const landed = (target: number) => {
    suppressPress.current = Date.now() + 250;
    setActive(target);
  };
  // A detent tick every time a card reaches the top, including while coasting.
  const tick = (kind: 'tick' | 'edge') => haptic(kind);
  useAnimatedReaction(() => {
    const p = position.get();
    return p < -0.15 || p > count - 0.85 ? -1 : Math.round(p);
  }, (slot, previous) => {
    if (previous === null || slot === previous) return;
    scheduleOnRN(tick, slot === -1 ? 'edge' : 'tick');
  }, [count]);

  const pan = Gesture.Pan().enabled(count > 1).activeOffsetY([-8, 8]).failOffsetX([-16, 16])
    .onStart(() => { cancelAnimation(position); start.set(position.get()); })
    .onUpdate(event => {
      let next = start.get() - event.translationY / step.get();
      if (next < 0) next *= 0.25;
      if (next > count - 1) next = count - 1 + (next - count + 1) * 0.25;
      position.set(next);
    })
    .onEnd(event => {
      const velocity = -event.velocityY / step.get();
      const target = settleIndex(position.get(), velocity, count);
      position.set(reduceMotion ? target : withSpring(target, { ...springs.card, velocity }));
      scheduleOnRN(landed, target);
    });

  // Mouse wheel / trackpad and keyboard on the web (native keyboards use the accessibility actions).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = stage.ref.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const wheel = (event: WheelEvent) => {
      const { count: total, goTo: go } = latest.current;
      if (total < 2 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? step.get() : 1;
      const current = position.get();
      const next = Math.max(0, Math.min(total - 1, current + event.deltaY * unit / step.get()));
      event.preventDefault();
      if (next === current) return;
      cancelAnimation(position);
      position.set(next);
      clearTimeout(settle);
      settle = setTimeout(() => go(Math.round(position.get())), 140);
    };
    const key = (event: KeyboardEvent) => {
      const { count: total, goTo: go, open } = latest.current;
      const here = Math.round(position.get());
      const moves: Record<string, number> = { ArrowDown: here + 1, PageDown: here + 1, ArrowUp: here - 1, PageUp: here - 1, Home: 0, End: total - 1, ' ': event.shiftKey ? here - 1 : here + 1 };
      if (event.key === 'Enter') { event.preventDefault(); open(); return; }
      if (!(event.key in moves)) return;
      event.preventDefault();
      go(moves[event.key]);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('keydown', key);
    return () => { clearTimeout(settle); node.removeEventListener('wheel', wheel); node.removeEventListener('keydown', key); };
  }, [count > 0, position, step]);

  if (!count) {
    return <Pressable accessibilityRole="button" accessibilityLabel="近期没有安排，添加一项" onPress={onAdd}
      style={({ pressed }) => [styles.empty, { borderColor: theme.line, backgroundColor: theme.soft }, pressed && { opacity: 0.7 }]}>
      <Icon name="coffee" size={30} color={theme.muted} />
      <Text style={[ui.title, { fontSize: 17 }]}>接下来没有课程或待办</Text>
      <Text style={[ui.label, { textAlign: 'center' }]}>导入课表，或点这里添加一项安排</Text>
    </Pressable>;
  }

  const current = items[Math.min(active, count - 1)];
  const left = (size.width - cardWidth) / 2;
  const hint = count > 1 ? (Platform.OS === 'web' ? ' · 滚轮或拖动 · 长按编辑' : ' · 上下滑动 · 长按编辑') : ' · 长按编辑';
  return <View style={styles.wrap}>
    <GestureDetector gesture={pan} touchAction="none">
      <View ref={stage.ref} testID="up-next-stack" focusable style={styles.stage}
        onLayout={event => { setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }); stage.onLayout(event); }}
        accessible accessibilityRole="adjustable" accessibilityLabel={`接下来，第 ${active + 1} 项，共 ${count} 项：${current.entry.title}，${describeOccurrence(current, now).status}`}
        accessibilityHint="上下轻扫切换，双击编辑" accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'increment') goTo(active + 1);
          else if (event.nativeEvent.actionName === 'decrement') goTo(active - 1);
          else onOpen(current.entry);
        }}>
        {cardWidth > 0 && items.map((item, index) => index >= active - STACK.MAX_DEPTH - 2 && index <= active + below + 1 && <StackCard key={keyOf(item)}
          item={item} now={now} image={imageFor?.(item.entry)} index={index} position={position} step={stepPx} width={cardWidth} height={cardHeight} left={left}
          front={index === active} interactive={index >= active - STACK.MAX_DEPTH} glass={!reduceTransparency} frame={{ x: stage.offset.x + left, y: stage.offset.y }}
          onPress={() => {
            if (Date.now() < suppressPress.current) return;
            if (index !== active) goTo(index); else haptic('light');
          }}
          onLongPress={() => {
            if (Date.now() < suppressPress.current || index < active) return;
            haptic('heavy');
            onOpen(item.entry);
          }} />)}
      </View>
    </GestureDetector>
    <View style={styles.footer}>
      <View style={styles.dots}>{items.map((item, index) => <View key={keyOf(item)}
        style={[styles.dot, { backgroundColor: index === active ? theme.blue : theme.line }, index === active && styles.dotActive]} />)}</View>
      <Text maxFontSizeMultiplier={1.2} style={[ui.label, { fontVariant: ['tabular-nums'] }]}>{active + 1} / {count}{hint}</Text>
    </View>
  </View>;
});

function StackCard({ item, now, image, index, position, step, width, height, left, front, interactive, glass, frame, onPress, onLongPress }: {
  item: Occurrence; now: Date; image?: { uri: string; frost: boolean }; index: number; position: SharedValue<number>; step: number; width: number; height: number; left: number;
  front: boolean; interactive: boolean; glass: boolean; frame: { x: number; y: number }; onPress: () => void; onLongPress: () => void;
}) {
  const { entry } = item;
  const info = describeOccurrence(item, now);
  const plan = entry.kind === 'plan';
  const tap = useTapGuard();
  const { reduceMotion } = useAccessibility();
  const squish = useSharedValue(1);
  const pressedAt = useRef(0);
  const look = useGlass();
  const px = look.style === 'pixel';
  // Text: the chosen font; pixel style adds a hard one-step shadow.
  const ink = [{ fontFamily: fontFamily(look.font) }, px && styles.pixelText];
  const motion = useAnimatedStyle(() => {
    const pose = stackPose(index - position.get(), index, step);
    return { zIndex: pose.zIndex, transform: [{ translateY: pose.translateY }, { scale: pose.scale }] };
  });
  // The whole card fades as one layer (see needsOffscreenAlphaCompositing below).
  const fade = useAnimatedStyle(() => ({ opacity: stackPose(index - position.get(), index, step).opacity }));
  // The frosted backdrop moves against the card so the glass stays lined up with the page behind it.
  const backdrop = useAnimatedStyle(() => ({ transform: [{ translateY: -stackPose(index - position.get(), index, step).translateY }] }));
  const press = useAnimatedStyle(() => ({ transform: [{ scale: squish.get() }] }));
  const shade = useAnimatedStyle(() => ({ opacity: stackPose(index - position.get(), index, step).shade }));
  const content = useAnimatedStyle(() => ({ opacity: stackPose(index - position.get(), index, step).content }));
  const time = `${formatTime(entry.start)} – ${formatTime(entry.end)}`;
  const compact = height < 170;
  const tiny = height < 150;

  // Tap: a soft squeeze and a jelly-like bounce back. Holding stays pressed until the long press opens the editor.
  const pressIn = () => { pressedAt.current = Date.now(); if (!reduceMotion) squish.set(withSpring(0.95, springs.squeeze)); };
  const release = (bounce: boolean) => {
    if (reduceMotion) return;
    const quick = Date.now() - pressedAt.current < 120;
    squish.set(bounce && quick
      ? withSequence(withTiming(0.94, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, springs.jelly))
      : withSpring(1, bounce ? springs.jelly : springs.squeeze));
  };

  return <Animated.View pointerEvents={interactive ? 'auto' : 'none'} aria-hidden={!front} accessibilityElementsHidden={!front}
    importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}
    style={[styles.card, { width, height, left, transformOrigin: 'center top' }, motion]}>
    <Animated.View style={[{ flex: 1 }, press]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shadow, px && styles.pixelShadow, !px && look.glow && glass && { boxShadow: `0 12px 28px rgba(20,30,70,0.18), 0 0 22px rgba(${GLASS[entry.color][0]},0.45)` }, fade]} />
      <Animated.View needsOffscreenAlphaCompositing style={[{ flex: 1 }, fade]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${plan ? '待办' : '课程'}，${entry.title}`} accessibilityHint="长按编辑"
          unstable_pressDelay={Platform.OS === 'web' ? undefined : PRESS_DELAY} delayLongPress={420}
          onPressIn={event => { tap.start(event); pressIn(); }}
          onPressOut={() => release(true)}
          onPress={event => { if (tap.isTap(event)) onPress(); }}
          onLongPress={() => { release(false); onLongPress(); }} style={{ flex: 1 }}>
          <View style={[styles.face, { padding: compact ? 14 : 20 }, px && styles.pixelFace]}>
            {/* Frosted base: the page background, blurred and lined up with the screen, so the card reads as glass. */}
            {glass && !px ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdrop]}><Backdrop offset={frame} /></Animated.View> : null}
            {image ? <>
              <Image testID="card-image" source={{ uri: image.uri }} blurRadius={image.frost ? Math.max(6, look.blur) : 0} resizeMode="cover" style={StyleSheet.absoluteFill} />
              {image.frost && <View testID="card-frost" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />}
              {/* Scrim keeps white text readable on any photo. */}
              <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.6)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
            </> : px
              // Pixel block: two flat bands of the course colour instead of a gradient.
              ? <LinearGradient pointerEvents="none" colors={[GRADIENTS[entry.color][0], GRADIENTS[entry.color][0], GRADIENTS[entry.color][1], GRADIENTS[entry.color][1]]} locations={[0, 0.64, 0.64, 1]} style={StyleSheet.absoluteFill} />
              : <LinearGradient pointerEvents="none" colors={glass ? glassTint(entry.color, look.card) : GRADIENTS[entry.color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
            {px && !image && <View pointerEvents="none" style={styles.pixelSparkle}>
              {[[0, 0], [12, 0], [0, 12], [24, 12], [12, 24]].map(([x, y]) => <View key={`${x}-${y}`} style={[styles.pixelDot, { left: x, top: y }]} />)}
            </View>}
            {!px && !image && <View pointerEvents="none" style={[styles.orb, { width: height * 1.1, height: height * 1.1, borderRadius: height, right: -height * 0.45, top: -height * 0.55 }]} />}
            {!px && !image && <View pointerEvents="none" style={[styles.orb, { width: height * 0.7, height: height * 0.7, borderRadius: height, right: height * 0.2, bottom: -height * 0.45 }]} />}
            {/* Glass sheen and rim. */}
            {!px && <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.06)']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />}
            <Animated.View style={[styles.content, content]}>
              {!tiny && <View style={styles.topRow}>
                <View style={[styles.badge, px && styles.pixelBadge]}>
                  <Icon name={plan ? 'leaf' : 'book'} size={13} color="#ffffff" />
                  <Text style={[styles.badgeText, ...ink]}>{plan ? '待办' : '课程'}</Text>
                </View>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.status, { flexShrink: 1 }, ...ink]}>{info.status}</Text>
              </View>}
              <Text numberOfLines={compact ? 1 : 2} maxFontSizeMultiplier={1.25} style={[styles.title, { fontSize: compact ? 19 : 24, marginTop: tiny ? 0 : 4 }, ...ink]}>{entry.title}</Text>
              <View style={{ flex: 1 }} />
              <Text maxFontSizeMultiplier={1.2} style={[styles.time, { fontSize: compact ? 20 : 27 }, ...ink]}>{time}</Text>
              {info.progress !== null && <View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.round(info.progress * 100)}%` }]} /></View>}
              <View style={styles.bottomRow}>
                <View style={[styles.meta, { flex: 1 }]}>
                  {!!entry.location && <Icon name="pin" size={13} color="rgba(255,255,255,0.85)" />}
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.metaText, ...ink]}>{[entry.location, entry.teacher].filter(Boolean).join(' · ') || (plan ? '个人安排' : '课程')}</Text>
                </View>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.metaText, ...ink]}>{tiny ? info.status : `${info.dateLabel} · 第 ${item.week} 周`}</Text>
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, shade]} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rim, !px && look.glow && styles.glow, px && styles.pixelRim]} />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, gap: 6 },
  // Clipped like a scroll view; widened by SIDE so card shadows are not cut at the edges.
  stage: { flex: 1, minHeight: 0, overflow: 'hidden', marginHorizontal: -SIDE },
  card: { position: 'absolute', top: 0, borderRadius: metrics.radius.lg },
  shadow: { borderRadius: metrics.radius.lg, boxShadow: '0 12px 28px rgba(20,30,70,0.24)' },
  rim: { borderRadius: metrics.radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)' },
  // Edge light: a brighter rim with a soft inner halo, like light caught in the glass edge.
  // Pixel style: square corners, thick dark outline with a bevel, hard drop shadow, blocky sparkle.
  pixelFace: { borderRadius: 4 },
  pixelShadow: { borderRadius: 4, boxShadow: '5px 5px 0 rgba(0,0,0,0.32)' },
  pixelRim: { borderRadius: 4, borderWidth: 3, borderColor: 'rgba(20,16,30,0.7)', boxShadow: 'inset 3px 3px 0 rgba(255,255,255,0.35), inset -3px -3px 0 rgba(0,0,0,0.22)' },
  pixelBadge: { borderRadius: 2 },
  pixelText: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  pixelSparkle: { position: 'absolute', bottom: '38%', right: 20, width: 36, height: 36, marginBottom: 10, opacity: 0.3 },
  pixelDot: { position: 'absolute', width: 12, height: 12, backgroundColor: '#ffffff' },
  glow: { borderColor: 'rgba(255,255,255,0.75)', boxShadow: 'inset 0 0 16px rgba(255,255,255,0.38), inset 0 1px 0 rgba(255,255,255,0.7)' },
  face: { flex: 1, borderRadius: metrics.radius.lg, overflow: 'hidden', gap: 6 },
  orb: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.09)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: metrics.radius.full, backgroundColor: 'rgba(255,255,255,0.2)' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  status: { color: '#ffffff', fontSize: 13, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
  content: { flex: 1, gap: 6 },
  shade: { backgroundColor: '#0b1020' },
  // A soft shadow keeps white text readable on very transparent glass.
  title: { color: '#ffffff', fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.32)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  time: { color: '#ffffff', fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  progress: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: '#ffffff' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  metaText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, overflow: 'hidden' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 16 },
  empty: { flex: 1, minHeight: 140, borderRadius: metrics.radius.lg, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
});
