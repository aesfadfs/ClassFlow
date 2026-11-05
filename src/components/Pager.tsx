import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic, useAccessibility } from '../ui/primitives';
import { springs } from '../ui/theme';

const FLICK_VELOCITY = 450;

/**
 * Horizontal pager: the whole page follows the finger, a release carries its
 * velocity and snaps to one neighbouring page. `position` is shared with the
 * navigation indicator so both move in the same frame.
 */
export function Pager({ index, count, position, pending, enabled, onIndexChange, children, style }: {
  index: number; count: number; position: SharedValue<number>; enabled: boolean;
  /** Page a slide is heading to (−1: none). It is committed once the slide is almost there. */
  pending: SharedValue<number>;
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
    // Already there (the slide finished before the page was committed): nothing to animate.
    if (reduceMotion || Math.abs(position.get() - index) < 0.02) { position.set(index); return; }
    position.set(withSpring(index, springs.page));
  }, [index, reduceMotion, position]);

  // The page the UI thread believes is committed. Compared on release so a
  // swipe that returns to the current page never leaves state out of sync.
  const committed = useSharedValue(index);
  useEffect(() => { committed.set(index); }, [index, committed]);
  const atEdge = useSharedValue(false);
  const settle = (next: number) => { target.current = next; onIndexChange(next); };
  const feedback = () => haptic();
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
      if (next === committed.get()) {
        position.set(reduceMotion ? next : withSpring(next, { ...springs.page, velocity: -event.velocityX / w }));
        return;
      }
      // Commit the new page only after the slide lands: re-rendering the app mid-slide made it hitch.
      committed.set(next);
      scheduleOnRN(feedback);
      pending.set(next);
      position.set(reduceMotion ? next : withSpring(next, { ...springs.page, velocity: -event.velocityX / w }));
    });

  // Commit a pending page when the slide is within a few pixels of it: the spring's long tail
  // would otherwise delay taps on the new page, and committing mid-slide made the motion hitch.
  useAnimatedReaction(() => {
    const goal = pending.get();
    return goal >= 0 && Math.abs(position.get() - goal) < 0.02 ? goal : -1;
  }, (ready, previous) => {
    if (ready < 0 || ready === previous) return;
    pending.set(-1);
    scheduleOnRN(settle, ready);
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
