import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic, useAccessibility } from '../ui/primitives';
import { springs } from '../ui/theme';

const FLICK_VELOCITY = 450;

/**
 * Horizontal pager: the whole page follows the finger, a release carries its
 * velocity and snaps to one neighbouring page. `position` is shared with the
 * navigation indicator so both move in the same frame.
 */
export function Pager({ index, count, position, enabled, onIndexChange, children, style }: {
  index: number; count: number; position: SharedValue<number>; enabled: boolean;
  onIndexChange: (index: number) => void; children: React.ReactNode[]; style?: object;
}) {
  const { reduceMotion } = useAccessibility();
  const width = useSharedValue(0);
  const start = useSharedValue(0);
  const target = useRef(index);

  useLayoutEffect(() => { position.set(index); target.current = index; }, []);
  useEffect(() => {
    if (target.current === index) return;
    target.current = index;
    position.set(reduceMotion ? index : withSpring(index, springs.page));
  }, [index, reduceMotion, position]);

  // The page the UI thread believes is committed. Compared on release so a
  // swipe that returns to the current page never leaves state out of sync.
  const committed = useSharedValue(index);
  useEffect(() => { committed.set(index); }, [index, committed]);
  const atEdge = useSharedValue(false);
  const settle = (next: number) => { target.current = next; onIndexChange(next); };
  const edge = () => haptic('edge');
  const pan = Gesture.Pan().enabled(enabled).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onStart(() => { cancelAnimation(position); start.set(position.get()); atEdge.set(false); })
    .onUpdate(event => {
      const w = width.get() || 1;
      let next = start.get() - event.translationX / w;
      // Rubber band past the first and last page, with one soft tick on contact.
      const outside = next < 0 || next > count - 1;
      if (next < 0) next *= 0.3;
      if (next > count - 1) next = count - 1 + (next - count + 1) * 0.3;
      if (outside && !atEdge.get()) scheduleOnRN(edge);
      atEdge.set(outside);
      position.set(next);
    })
    .onEnd(event => {
      const w = width.get() || 1;
      const origin = Math.round(start.get());
      let next = Math.abs(event.velocityX) > FLICK_VELOCITY ? origin + (event.velocityX < 0 ? 1 : -1) : Math.round(position.get());
      next = Math.max(0, Math.min(count - 1, Math.max(origin - 1, Math.min(origin + 1, next))));
      position.set(reduceMotion ? next : withSpring(next, { ...springs.page, velocity: -event.velocityX / w }));
      if (next !== committed.get()) { committed.set(next); scheduleOnRN(settle, next); }
    });

  const track = useAnimatedStyle(() => ({ transform: [{ translateX: -position.get() * width.get() }] }));

  return <GestureDetector gesture={pan}>
    <View style={[styles.viewport, style]} onLayout={event => width.set(event.nativeEvent.layout.width)}>
      <Animated.View style={[styles.track, { width: `${count * 100}%` }, track]}>
        {children.map((child, page) => {
          const hidden = page !== index;
          return <View key={page} style={styles.page} pointerEvents={hidden ? 'none' : 'auto'}
            aria-hidden={hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
            {child}
          </View>;
        })}
      </Animated.View>
    </View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row' },
  page: { flex: 1, minWidth: 0, minHeight: 0 },
});
