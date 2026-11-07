import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { clampFrame, type WallpaperFrame } from '../domain/appearance';
import { Button, useUI } from '../ui/primitives';
import { metrics } from '../ui/theme';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const DIM = 'rgba(0,0,0,0.55)';

/**
 * Choose which part of a photo fills the screen: the whole picture is shown, a box with the
 * screen's shape is dragged (and pinched) over it. Only the rectangle is stored; the file is
 * never rewritten. Lives inside the appearance sheet, not a second Modal.
 */
export function WallpaperFramer({ uri, initial, onCancel, onDone }: {
  uri: string; initial: WallpaperFrame | null; onCancel: () => void; onDone: (frame: WallpaperFrame | null) => void;
}) {
  const ui = useUI();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const screenAspect = screenW / Math.max(1, screenH);
  const [area, setArea] = useState({ width: 1, height: 1 });
  const [ratio, setRatio] = useState(0.75);
  // Box width as a fraction of the shown picture, and its centre offset from the picture centre.
  const [fraction, setFraction] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState(false);
  useEffect(() => { Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setRatio(w / h); }, () => {}); }, [uri]);

  // The picture shown whole (contain) inside the framing area.
  const shown = useMemo(() => {
    const width = Math.min(area.width, area.height * ratio);
    const height = width / ratio;
    return { width, height, left: (area.width - width) / 2, top: (area.height - height) / 2 };
  }, [area, ratio]);
  const maxFraction = Math.min(1, shown.height * screenAspect / Math.max(1, shown.width));
  const boxWidth = Math.max(24, shown.width * Math.min(fraction, maxFraction));
  const boxHeight = boxWidth / screenAspect;
  const limitX = Math.max(0, (shown.width - boxWidth) / 2);
  const limitY = Math.max(0, (shown.height - boxHeight) / 2);
  const centerX = shown.left + shown.width / 2 + clamp(center.x, -limitX, limitX);
  const centerY = shown.top + shown.height / 2 + clamp(center.y, -limitY, limitY);
  const boxLeft = centerX - boxWidth / 2;
  const boxTop = centerY - boxHeight / 2;
  const frame = clampFrame({
    x: (boxLeft - shown.left) / Math.max(1, shown.width), y: (boxTop - shown.top) / Math.max(1, shown.height),
    w: boxWidth / Math.max(1, shown.width), h: boxHeight / Math.max(1, shown.height),
  })!;

  // Start from the stored frame once the picture has been measured.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initial || area.width <= 1 || shown.width <= 1) return;
    seeded.current = true;
    setFraction(initial.w);
    setCenter({ x: (initial.x + initial.w / 2 - 0.5) * shown.width, y: (initial.y + initial.h / 2 - 0.5) * shown.height });
  }, [initial, area.width, shown.width, shown.height]);

  const live = useRef({ center, fraction });
  live.current = { center, fraction };
  const start = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ distance: number; fraction: number } | null>(null);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // The sheet scrolls; while framing, the box keeps the finger.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = live.current.center; pinch.current = null; },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        const distance = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
        if (!pinch.current) { pinch.current = { distance: Math.max(1, distance), fraction: live.current.fraction }; return; }
        setFraction(clamp(pinch.current.fraction * distance / pinch.current.distance, 0.2, 1));
        return;
      }
      pinch.current = null;
      setCenter({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy });
    },
  }), []);

  return <View style={{ gap: 10 }}>
    <View testID="wallpaper-framer" style={[styles.area, { aspectRatio: screenAspect }]} onLayout={event => setArea({ width: Math.max(1, event.nativeEvent.layout.width), height: Math.max(1, event.nativeEvent.layout.height) })}
      {...(preview ? {} : pan.panHandlers)}>
      {preview
        ? <Image source={{ uri }} resizeMode="stretch" style={{ position: 'absolute', width: `${100 / frame.w}%`, height: `${100 / frame.h}%`, left: `${-(frame.x / frame.w) * 100}%`, top: `${-(frame.y / frame.h) * 100}%` }} />
        : <>
          <Image source={{ uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[styles.shade, { left: 0, right: 0, top: 0, height: Math.max(0, boxTop) }]} />
          <View pointerEvents="none" style={[styles.shade, { left: 0, right: 0, top: boxTop + boxHeight, bottom: 0 }]} />
          <View pointerEvents="none" style={[styles.shade, { left: 0, width: Math.max(0, boxLeft), top: boxTop, height: boxHeight }]} />
          <View pointerEvents="none" style={[styles.shade, { left: boxLeft + boxWidth, right: 0, top: boxTop, height: boxHeight }]} />
          <View pointerEvents="none" style={[styles.box, { left: boxLeft, top: boxTop, width: boxWidth, height: boxHeight }]} />
        </>}
    </View>
    <Text style={ui.label}>{preview ? '这是铺满屏幕后的样子' : '拖动白框选择位置，双指捏合调整大小'}</Text>
    <View style={styles.row}>
      <Button small icon="sparkles" selected={preview} onPress={() => setPreview(value => !value)}>{preview ? '看选框' : '看效果'}</Button>
      <Button small icon="refresh" onPress={() => { setFraction(1); setCenter({ x: 0, y: 0 }); }}>居中</Button>
    </View>
    <View style={styles.row}>
      <Button style={{ flex: 1 }} onPress={onCancel}>取消</Button>
      <Button style={{ flex: 1 }} variant="primary" icon="check" onPress={() => onDone(frame.w >= 0.999 && frame.h >= 0.999 ? null : frame)}>使用这个区域</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  area: { width: '100%', maxHeight: 460, alignSelf: 'center', borderRadius: metrics.radius.md, overflow: 'hidden', backgroundColor: '#0b0d12' },
  shade: { position: 'absolute', backgroundColor: DIM },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#ffffff', borderRadius: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
