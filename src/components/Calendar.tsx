import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { snapPlacement, type Placement } from '../domain/canvas';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { COLORS, DAYS, compactLocation, dateKey, entriesForWeek, formatTime, layoutDay, type Entry } from '../domain/schedule';
import { minuteToY, periodRows, placeRows, type PeriodTime } from '../domain/periods';
import { GlassSheen, haptic, Icon, PRESS_DELAY, Reveal, useAccessibility } from '../ui/primitives';
import { metrics, springs, useTheme } from '../ui/theme';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const HOUR_HEIGHT = 64;
const DARK_COURSES: Record<Entry['color'], { bg: string; accent: string; text: string }> = {
  blue: { bg: '#172b46', accent: '#82afff', text: '#bcd5ff' },
  purple: { bg: '#2d2244', accent: '#bc9af9', text: '#dcc7ff' },
  green: { bg: '#153429', accent: '#72c69d', text: '#a7e0c4' },
  orange: { bg: '#382a1e', accent: '#e7a969', text: '#ffd2a1' },
  pink: { bg: '#392536', accent: '#e793b4', text: '#f6b9d0' },
};

type DateSelectorProps = { dates: Date[]; day: number; now: Date; onDay: (day: number) => void };

function DateButton({ date, index, selected, today, short, onPress }: {
  date: Date; index: number; selected: boolean; today: boolean; short?: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${date.getMonth() + 1}月${date.getDate()}日 ${DAYS[index]}${today ? '，今天' : ''}`}
    accessibilityState={{ selected }}
    onPress={onPress}
    unstable_pressDelay={Platform.OS === 'web' ? undefined : PRESS_DELAY}
    style={({ pressed }) => [styles.dateButton, pressed && { opacity: 0.65 }]}
  >
    <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.dayLabel, { color: selected || today ? theme.blue : theme.secondary }]}>
      {short ? DAYS[index].slice(1) : DAYS[index]}
    </Text>
    <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.dateNumber, { color: selected || today ? theme.blue : theme.ink }]}>{date.getDate()}</Text>
    {today && <View style={[styles.todayDot, { backgroundColor: theme.blue }]} />}
  </Pressable>;
}

export function DayStrip({ dates, day, now, onDay }: DateSelectorProps) {
  const theme = useTheme();
  const { reduceMotion } = useAccessibility();
  const [width, setWidth] = useState(0);
  const selectedDay = useSharedValue(day);
  const cellWidth = width / WEEKDAYS.length;
  const today = dateKey(now);

  useEffect(() => {
    selectedDay.set(reduceMotion ? day : withSpring(day, springs.settle));
  }, [day, reduceMotion, selectedDay]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: selectedDay.get() * cellWidth }] }));

  return <View style={[styles.dayStrip, { backgroundColor: theme.soft }]}>
    <View style={styles.dayStripRow} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        pointerEvents="none"
        style={[styles.stripIndicator, { width: cellWidth, opacity: width ? 1 : 0 }, indicator]}
      >
        <View style={[styles.stripSelection, { backgroundColor: theme.surface, borderColor: theme.accentLine }]} />
      </Animated.View>
      {dates.map((date, index) => <DateButton
        key={index}
        date={date}
        index={index}
        selected={index === day}
        today={dateKey(date) === today}
        short
        onPress={() => { if (index !== day) { haptic(); onDay(index); } }}
      />)}
    </View>
  </View>;
}

function CourseBlock({ entry, height, singleDay, lanes, style, onPress, columnWidth, hourHeight, peers, onMove, onDrag, dragEnabled }: {
  entry: Entry; height: number; singleDay: boolean; lanes: number; dragEnabled: boolean; style: StyleProp<ViewStyle>; onPress: () => void;
  columnWidth: number; hourHeight: number; peers: Entry[]; onMove: (entry: Entry) => void; onDrag: (placement: Placement | null) => void;
}) {
  const theme = useTheme();
  const { reduceMotion } = useAccessibility();
  const scale = useSharedValue(1);
  const x = useSharedValue(0), y = useSharedValue(0), extraHeight = useSharedValue(0);
  const landing = useSharedValue({ x: 0, y: 0, height: 0, width: 0 });
  const settle = useSharedValue(0);
  const settling = useRef(false);
  const mounted = useRef(true);
  const active = useSharedValue(false);
  const dragging = useRef(false);
  const activeGesture = useRef<'move' | 'resize' | null>(null);
  const suppressPress = useRef(0);
  const target = useRef<Placement | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Placement | null>(null);
  const frame = StyleSheet.flatten(style);
  const baseLeft = Number(frame.left), baseWidth = Number(frame.width);
  useLayoutEffect(() => { x.set(0); y.set(0); extraHeight.set(0); settle.set(0); }, [entry.day, entry.start, entry.end, baseLeft, baseWidth]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(settle); };
  }, [settle]);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() + (landing.get().x - x.get()) * settle.get() },
      { translateY: y.get() + (landing.get().y - y.get()) * settle.get() }, { scale: scale.get() }],
    height: height + extraHeight.get() + (landing.get().height - extraHeight.get()) * settle.get(),
    width: baseWidth + landing.get().width * settle.get(), zIndex: active.get() ? 100 : 2,
    elevation: active.get() ? 12 : 0,
    boxShadow: active.get() ? '0 10px 28px rgba(25,40,80,0.22)' : '0 0 0 transparent',
  }));
  function finishLanding(next: Placement | null) {
    if (!mounted.current) return;
    if (next && (next.day !== entry.day || next.start !== entry.start || next.end !== entry.end)) onMove({ ...entry, ...next });
    else { x.set(0); y.set(0); extraHeight.set(0); settle.set(0); }
    settling.current = false; dragging.current = false; active.set(false);
    target.current = null; setPreview(null); onDrag(null);
    suppressPress.current = Date.now() + 120;
  }
  function land(next: Placement | null) {
    settling.current = true;
    const moved = next ? { ...entry, ...next } : entry;
    const layout = layoutDay([...peers.filter(other => other.id !== entry.id), moved].filter(other => other.day === moved.day));
    const placement = layout.find(item => item.entry.id === entry.id)!;
    landing.set(next ? {
      x: columnWidth * ((singleDay ? 0 : moved.day) + placement.lane / placement.lanes) - baseLeft,
      y: (moved.start - entry.start) / 60 * hourHeight,
      height: Math.max(12, (moved.end - moved.start) / 60 * hourHeight - 3) - height,
      width: columnWidth / placement.lanes - baseWidth,
    } : { x: 0, y: 0, height: 0, width: 0 });
    scale.set(reduceMotion ? 1 : withSpring(1, springs.settle));
    if (reduceMotion) { settle.set(1); finishLanding(next); }
    else settle.set(withSpring(1, springs.snap, done => { if (done) scheduleOnRN(finishLanding, next); }));
  }
  function gesture(resize: boolean) {
    const mode = resize ? 'resize' : 'move';
    return Gesture.Pan().runOnJS(true).enabled(dragEnabled).minDistance(4).activateAfterLongPress(Platform.OS === 'web' ? 0 : 220)
      .onBegin(event => { origin.current = { x: event.absoluteX, y: event.absoluteY }; })
      .onStart(() => {
        if (settling.current) return;
        settle.set(0);
        activeGesture.current = mode;
        dragging.current = true; active.set(true); haptic('drag');
        scale.set(reduceMotion ? 1 : withSpring(1.025, springs.press));
        onDrag({ day: entry.day, start: entry.start, end: entry.end });
      })
      .onUpdate(event => {
        if (activeGesture.current !== mode) return;
        const dx = event.absoluteX - origin.current.x, dy = event.absoluteY - origin.current.y;
        const day = singleDay || resize ? entry.day : Math.max(0, Math.min(6, entry.day + Math.round(dx / columnWidth)));
        const next = snapPlacement(entry, day, (resize ? entry.end : entry.start) + dy / hourHeight * 60, peers, resize);
        // A light detent each time the card snaps to a new day or 5-minute slot.
        const previous = target.current;
        if (previous && (previous.day !== next.day || previous.start !== next.start || previous.end !== next.end)) haptic('tick');
        target.current = next; setPreview(next); onDrag(next);
        // Motion.Lab physics-spring: follow the pointer freely, attract only on release.
        if (resize) extraHeight.set(Math.max(12 - height, dy));
        else { x.set(dx); y.set(dy); }
      })
      .onEnd((_event, success) => {
        if (activeGesture.current === mode) land(success ? target.current : null);
      })
      .onFinalize(() => {
        if (activeGesture.current !== mode) return;
        activeGesture.current = null;
        if (dragging.current) suppressPress.current = Date.now() + 300;
        if (!settling.current) land(null);
      });
  }
  const { bg, accent, text } = (theme.dark ? DARK_COURSES : COLORS)[entry.color];
  const roomy = singleDay && lanes < 3;
  const plan = entry.kind === 'plan';
  const time = `${formatTime(preview?.start ?? entry.start)}–${formatTime(preview?.end ?? entry.end)}`;

  return <GestureDetector gesture={gesture(false)} touchAction={dragEnabled ? 'none' : 'auto'}><Animated.View style={[style, dragStyle]}><Pressable
    accessibilityRole="button"
    accessibilityLabel={[`${plan ? '安排' : '课程'}，${entry.title}`, `${DAYS[entry.day]} ${time}`, entry.location, entry.teacher].filter(Boolean).join('，')}
    accessibilityHint={dragEnabled ? '点按编辑；长按拖动调整时间，拖动底边调整时长' : '点按编辑'}
    hitSlop={height < metrics.touch ? { top: 4, bottom: 4, left: 0, right: 0 } : undefined}
    onPress={() => { if (!dragging.current && Date.now() > suppressPress.current) onPress(); }}
    onPressIn={() => { if (!reduceMotion) scale.set(withSpring(0.98, springs.press)); }}
    onPressOut={() => scale.set(reduceMotion ? 1 : withSpring(1, springs.settle))}
    style={{ flex: 1 }}
  >
    {({ pressed }) => <Animated.View style={[
      styles.course,
      { backgroundColor: bg, borderColor: `${accent}38`, borderLeftColor: accent, paddingHorizontal: roomy ? 11 : baseWidth < 65 ? 3 : 6 },
      height <= 30 && styles.shortCourse,
      reduceMotion && pressed && { opacity: 0.72 },
    ]}>
      <GlassSheen radius={metrics.radius.sm} strength={0.55} />
      <View style={styles.courseLabel}>
        {plan && roomy && <Icon name="leaf" size={13} color={text} />}
        <Text numberOfLines={height > 78 ? 3 : 2} maxFontSizeMultiplier={1.3} style={[styles.courseTitle, { fontSize: roomy ? 15 : baseWidth < 65 ? 10 : metrics.type.caption, color: theme.ink }]}>
          {entry.title}
        </Text>
      </View>
      {height >= 40 && baseWidth >= 65 && <Text numberOfLines={1} style={[styles.courseTime, { color: roomy ? theme.secondary : theme.ink }]}>{time}</Text>}
      {height >= (roomy ? 65 : 46) && !!entry.location && <View style={styles.courseLocation}>
        {roomy && <Icon name="pin" size={12} color={text} />}
        {/* Narrow week cells drop the campus prefix so the room number survives. */}
        {roomy
          ? <Text numberOfLines={1} style={[styles.courseDetail, { color: theme.secondary }]}>{entry.location}</Text>
          : <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={[styles.courseDetail, styles.narrowDetail, { color: theme.secondary }]}>{compactLocation(entry.location)}</Text>}
      </View>}
      {roomy && height >= 102 && !!entry.teacher && <Text numberOfLines={1} style={[styles.courseDetail, { color: theme.secondary }]}>{entry.teacher}</Text>}
    </Animated.View>}
  </Pressable>
    {dragEnabled && <GestureDetector gesture={gesture(true)} touchAction="none">
      <View accessibilityLabel={`调整${entry.title}时长`} style={styles.resizeHandle}>
        <View style={[styles.resizeGrip, { backgroundColor: accent }]} />
      </View>
    </GestureDetector>}
  </Animated.View></GestureDetector>;
}

export function Calendar({ entries, week, dates, day, mobile, singleDay, dragEnabled = true, now = new Date(), layout = 'timeline', periods = null, onDay, onEdit, onEmpty, onMove }: {
  entries: Entry[]; week: number; dates: Date[]; day: number; mobile: boolean; singleDay: boolean; dragEnabled?: boolean; now?: Date;
  /** 'timeline': proportional time axis. 'periods': equal rows per period / course time, aligned across the week. */
  layout?: 'timeline' | 'periods'; periods?: PeriodTime[] | null;
  onDay: (day: number) => void; onEdit: (entry: Entry) => void; onEmpty: (day: number, start: number) => void;
  onMove: (entry: Entry) => void;
}) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [canvasWidth, setCanvasWidth] = useState(0);
  const canvasScroll = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [drag, setDrag] = useState<Placement | null>(null);
  const peers = useMemo(() => entriesForWeek(entries, week), [entries, week]);
  const onDrag = (placement: Placement | null) => setDrag(placement);
  const hourHeight = HOUR_HEIGHT * Math.min(1.4, Math.max(1, fontScale));
  const rowsRef = useRef<ReturnType<typeof placeRows>>([]);
  useEffect(() => {
    const shown = peers.filter(entry => !singleDay || entry.day === day);
    const firstMinute = shown.length ? Math.min(...shown.map(entry => entry.start)) : 480;
    const y = layout === 'periods' && rowsRef.current.length ? Math.max(0, minuteToY(rowsRef.current, firstMinute) - 12) : Math.max(0, firstMinute - 45) / 60 * hourHeight;
    canvasScroll.current?.scrollTo({ y, animated: false });
  }, [singleDay, day, week, hourHeight, layout]);
  const gutter = (mobile ? 48 : 54) * Math.min(1.45, Math.max(1, fontScale));
  const today = dateKey(now);
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const visibleDays = singleDay ? [day] : WEEKDAYS;
  const trackWidth = Math.max(1, viewportWidth);
  const calendar = useMemo(() => {
    const weekEntries = entriesForWeek(entries, week);
    let firstHour = 0;
    let lastHour = 24;
    for (const entry of weekEntries) {
      firstHour = Math.min(firstHour, Math.floor(entry.start / 60));
      lastHour = Math.max(lastHour, Math.ceil(entry.end / 60));
    }
    const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
    const days = WEEKDAYS.map(index => layoutDay(weekEntries.filter(entry => entry.day === index)));
    return { firstHour, lastHour, hours, days };
  }, [entries, week]);
  const { firstHour, lastHour, hours, days } = calendar;
  // Period mode: rows from the chosen bell schedule and this week's times; falls back to the time axis when empty.
  const rows = useMemo(() => layout === 'periods' ? placeRows(periodRows(entriesForWeek(entries, week), periods), hourHeight * 1.15, 6) : [], [layout, entries, week, periods, hourHeight]);
  const byPeriod = rows.length > 0;
  rowsRef.current = rows;
  const height = byPeriod ? rows[rows.length - 1].top + rows[rows.length - 1].height : (lastHour - firstHour) * hourHeight;
  const minuteOffset = (minute: number) => byPeriod ? minuteToY(rows, minute) : (minute / 60 - firstHour) * hourHeight;
  const canDrag = dragEnabled && !byPeriod;
  const selectDay = (index: number) => { if (index !== day) { haptic(); onDay(index); } };

  return <View style={styles.shell}>
    {singleDay ? <View style={styles.stripWrap}>
      <DayStrip dates={dates} day={day} now={now} onDay={onDay} />
      <View style={styles.daySummary}>
        <Text accessibilityRole="header" style={[styles.summaryTitle, { color: theme.ink }]}>
          {dates[day].getMonth() + 1}月{dates[day].getDate()}日 · {DAYS[day]}
        </Text>
        <Text style={[styles.summaryCount, { color: theme.secondary }]}>
          {days[day].length ? `${days[day].length} 项日程` : '当天暂无日程'}
        </Text>
      </View>
    </View> : <View style={styles.weekHeader}>
      <View style={{ width: gutter }} />
      <View style={{ flex: 1, height: 58 }}>
      <View style={{ flexDirection: 'row', width: trackWidth }}>
      {dates.map((date, index) => <View key={index} style={styles.weekDate}>
        {day === index && <View pointerEvents="none" style={[styles.weekSelection, { backgroundColor: theme.tint }]} />}
        <DateButton date={date} index={index} short={mobile} selected={index === day} today={dateKey(date) === today} onPress={() => selectDay(index)} />
      </View>)}
      </View>
      </View>
    </View>}
    <ScrollView testID="calendar-scroll" ref={canvasScroll} nestedScrollEnabled scrollEnabled={!drag} style={{ flex: 1, minHeight: 0 }}>
    <View style={styles.grid}>
      <View style={{ width: gutter, height: height + 20 }} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        {byPeriod ? rows.map(row => <View key={row.start} style={[styles.periodLabel, { top: row.top, height: row.height }]}>
          {row.label !== undefined && <Text style={[styles.periodNumber, { color: theme.ink }]}>{row.label}</Text>}
          <Text style={[styles.periodTime, { color: theme.secondary }]}>{formatTime(row.start)}</Text>
          <Text style={[styles.periodTime, { color: theme.secondary }]}>{formatTime(row.end)}</Text>
        </View>) : hours.map(hour => <Text key={hour} style={[styles.hour, { top: minuteOffset(hour * 60) - 8, color: theme.secondary }]}>{formatTime(hour * 60)}</Text>)}
      </View>
      <View style={{ flex: 1, minWidth: 0 }} onLayout={event => setViewportWidth(event.nativeEvent.layout.width)}>
      <View onLayout={event => setCanvasWidth(event.nativeEvent.layout.width)} style={[styles.columns, { width: trackWidth, height, borderBottomColor: theme.line }]}>
        {visibleDays.map(index => {
          const currentDay = dateKey(dates[index]) === today;
          const showCurrentTime = currentDay && (byPeriod ? currentMinute >= rows[0].start && currentMinute <= rows[rows.length - 1].end
            : currentMinute >= firstHour * 60 && currentMinute < lastHour * 60);
          const Column = singleDay ? Reveal : View;
          return <Column
            key={index}
            {...(singleDay ? { distance: 0 } : {})}
            style={[styles.dayColumn, { borderColor: theme.line }]}
          >
            {/* Today in the week view: no filled band, just the column's outline glowing softly. */}
            {currentDay && !singleDay && <View pointerEvents="none" style={[styles.todayGlow, theme.dark
              ? { borderColor: 'rgba(176,186,255,0.55)', boxShadow: '0 0 14px rgba(150,165,255,0.35), inset 0 0 12px rgba(150,165,255,0.16)' }
              : { borderColor: 'rgba(54,75,182,0.42)', boxShadow: '0 0 14px rgba(84,110,255,0.26), inset 0 0 12px rgba(84,110,255,0.10)' }]} />}
            {byPeriod ? rows.map(row => <Pressable
              key={row.start}
              accessibilityRole="button"
              accessibilityLabel={`添加安排，${DAYS[index]} ${row.label ? `第 ${row.label} 节 ` : ''}${formatTime(row.start)}`}
              onPress={() => onEmpty(index, row.start)}
              style={({ pressed }) => [styles.emptySlot, { height: row.height, top: row.top, borderColor: theme.line }, pressed && { backgroundColor: theme.tint }]}
            />) : hours.slice(0, -1).map(hour => <Pressable
              key={hour}
              accessibilityRole="button"
              accessibilityLabel={`添加安排，${DAYS[index]} ${formatTime(hour * 60)}`}
              onPress={event => onEmpty(index, Math.min(1434, hour * 60 + Math.floor(event.nativeEvent.locationY / hourHeight * 12) * 5))}
              style={({ pressed }) => [
                styles.emptySlot,
                { height: hourHeight, top: minuteOffset(hour * 60), borderColor: theme.line },
                pressed && { backgroundColor: theme.tint },
              ]}
            />)}
            {showCurrentTime && <View pointerEvents="none" style={[styles.nowLine, { top: minuteOffset(currentMinute), backgroundColor: theme.blue }]}>
              <View style={[styles.nowDot, { backgroundColor: theme.blue }]} />
            </View>}
          </Column>;
        })}
        {visibleDays.flatMap((index, dayPosition) => days[index].map(({ entry, lane, lanes }) => {
          const cardHeight = Math.max(12, byPeriod ? minuteOffset(entry.end) - minuteOffset(entry.start) - 3 : (entry.end - entry.start) / 60 * hourHeight - 3);
          const columnWidth = canvasWidth / visibleDays.length;
          return <CourseBlock key={entry.id} entry={entry} height={cardHeight} singleDay={singleDay} lanes={lanes}
            columnWidth={columnWidth} hourHeight={hourHeight} peers={peers} onMove={onMove} onDrag={onDrag} dragEnabled={canDrag}
            onPress={() => onEdit(entry)} style={{ position: 'absolute', top: minuteOffset(entry.start) + 1.5,
              left: columnWidth * (dayPosition + lane / lanes), width: columnWidth / lanes,
              height: cardHeight, paddingHorizontal: singleDay ? 5 : 2 }} />;
        }))}
        {drag && <View pointerEvents="none" style={[styles.snapGuide, { top: minuteOffset(drag.start), height: Math.max(12, minuteOffset(drag.end) - minuteOffset(drag.start)),
          left: singleDay ? 0 : drag.day * canvasWidth / 7, width: canvasWidth / visibleDays.length, borderColor: theme.blue }]}>
          <Text style={[styles.snapLabel, { color: theme.onAccent, backgroundColor: theme.blue }]}>{formatTime(drag.start)}–{formatTime(drag.end)}</Text>
        </View>}
      </View>
      </View>
    </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  todayGlow: { position: 'absolute', top: 0, bottom: 0, left: 1, right: 1, borderWidth: 1, borderRadius: metrics.radius.md },
  canvasHint: { fontSize: 11, paddingLeft: 16, paddingTop: 5, paddingBottom: 7 },
  resizeHandle: { position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 14, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  resizeGrip: { width: 20, height: 3, borderRadius: 2, opacity: 0.6 },
  snapGuide: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, zIndex: 110 },
  snapLabel: { position: 'absolute', top: -23, left: 0, fontSize: 11, paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, minWidth: 82 },
  shell: { flex: 1, minHeight: 0, paddingRight: 6 },
  stripWrap: { paddingLeft: 6, flexShrink: 0 },
  dayStrip: { padding: 3, borderRadius: metrics.radius.lg },
  dayStripRow: { flexDirection: 'row' },
  stripIndicator: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  stripSelection: { flex: 1, borderRadius: metrics.radius.md, borderWidth: StyleSheet.hairlineWidth },
  dateButton: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayLabel: { fontSize: metrics.type.caption, fontWeight: '600' },
  dateNumber: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  todayDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 3 },
  daySummary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, paddingTop: metrics.space.md, paddingBottom: 12, paddingHorizontal: 2 },
  summaryTitle: { fontSize: metrics.type.label, fontWeight: '600' },
  summaryCount: { fontSize: metrics.type.caption },
  weekHeader: { flexDirection: 'row', alignItems: 'center', height: 70, flexShrink: 0, paddingTop: 4, paddingBottom: 8 },
  weekDate: { flex: 1, flexDirection: 'row' },
  weekSelection: { position: 'absolute', left: 4, right: 4, top: 0, bottom: 0, borderRadius: metrics.radius.md },
  grid: { flexDirection: 'row', marginTop: 9 },
  hour: { position: 'absolute', fontSize: 10, width: '100%', textAlign: 'center', fontVariant: ['tabular-nums'] },
  periodLabel: { position: 'absolute', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 1 },
  periodNumber: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  periodTime: { fontSize: 10, lineHeight: 13, fontVariant: ['tabular-nums'] },
  columns: { flexShrink: 0, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  dayColumn: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  emptySlot: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  course: { flex: 1, justifyContent: 'flex-start', gap: 3, paddingVertical: 6, borderRadius: metrics.radius.sm, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 2, overflow: 'hidden' },
  shortCourse: { paddingVertical: 0, justifyContent: 'center' },
  courseLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  courseTitle: { fontWeight: '700', flexShrink: 1 },
  courseTime: { fontSize: 10, fontVariant: ['tabular-nums'] },
  courseLocation: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  courseDetail: { fontSize: 11, flexShrink: 1 },
  narrowDetail: { fontSize: 9, lineHeight: 11 },
  nowLine: { height: StyleSheet.hairlineWidth, position: 'absolute', left: 0, right: 0 },
  nowDot: { position: 'absolute', top: -2.5, left: 0, width: 6, height: 6, borderRadius: 3 },
});
