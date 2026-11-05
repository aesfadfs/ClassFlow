import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, DAYS, dateKey, layoutDay, type Entry } from '../domain/schedule';
import { Icon, PressSurface, useUI } from '../ui/primitives';
import { useTheme } from '../ui/theme';

// A fitted overview, not a second scrollable calendar. Details stay in the canvas.
export function WeekPreview({ entries, dates, now, onOpen }: {
  entries: Entry[]; dates: Date[]; now: Date; onOpen: () => void;
}) {
  const theme = useTheme();
  const ui = useUI();
  const start = Math.min(480, ...entries.map(entry => Math.floor(entry.start / 60) * 60));
  const end = Math.max(1260, ...entries.map(entry => Math.ceil(entry.end / 60) * 60));
  const span = end - start;
  return <PressSurface accessibilityRole="button" accessibilityLabel="打开完整课表" onPress={onOpen}
    scale={0.99} style={[ui.card, styles.preview]}>
    <View style={styles.previewHeader}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={[ui.title, { fontSize: 16, flex: 1 }]}>一周概览</Text>
      <Text maxFontSizeMultiplier={1.25} style={[ui.label, { color: theme.blue }]}>点开查看</Text>
      <Icon name="arrow" size={16} color={theme.blue} />
    </View>
    <View pointerEvents="none" style={styles.previewBody}>
      <View style={styles.timeRail}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.hour, { color: theme.muted }]}>{String(start / 60).padStart(2, '0')}</Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.hour, { color: theme.muted }]}>午后</Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.hour, { color: theme.muted }]}>{String(end / 60).padStart(2, '0')}</Text>
      </View>
      {dates.map((date, day) => <View key={day} style={styles.previewColumn}>
        <View style={styles.date}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.weekday, { color: theme.secondary }]}>{DAYS[day].slice(1)}</Text>
          <View style={[styles.dateCircle, dateKey(date) === dateKey(now) && { backgroundColor: theme.blue }]}>
            <Text maxFontSizeMultiplier={1.2} style={[styles.day, { color: dateKey(date) === dateKey(now) ? theme.onAccent : theme.ink }]}>{date.getDate()}</Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: theme.soft }]}>
          {[0.25, 0.5, 0.75].map(fraction => <View key={fraction} style={[styles.rule, { top: `${fraction * 100}%`, backgroundColor: theme.line }]} />)}
          {layoutDay(entries.filter(entry => entry.day === day)).map(({ entry, lane, lanes }) => <View key={entry.id}
            style={[styles.miniCard, { top: `${(entry.start - start) / span * 100}%`, height: `${(entry.end - entry.start) / span * 100}%`,
              left: `${lane / lanes * 100}%`, width: `${100 / lanes}%`, backgroundColor: COLORS[entry.color].bg,
              borderLeftColor: COLORS[entry.color].accent }]}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={[styles.miniTitle, { color: COLORS[entry.color].text }]}>{entry.title}</Text>
          </View>)}
        </View>
      </View>)}
      {!entries.length && <View style={styles.empty} pointerEvents="none"><Text style={ui.body}>本周暂无安排，点开添加</Text></View>}
    </View>
  </PressSurface>;
}

const styles = StyleSheet.create({
  preview: { flex: 1, minHeight: 0, overflow: 'hidden' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 44, flexShrink: 0 },
  previewBody: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingBottom: 10 },
  timeRail: { width: 23, paddingTop: 52, justifyContent: 'space-between' },
  hour: { fontSize: 9, fontVariant: ['tabular-nums'] },
  previewColumn: { flex: 1, minWidth: 0 },
  date: { height: 48, alignItems: 'center', gap: 2, flexShrink: 0 },
  weekday: { fontSize: 10 },
  dateCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 12, fontWeight: '600' },
  track: { flex: 1, minHeight: 0, borderRadius: 6, overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  miniCard: { position: 'absolute', borderRadius: 4, borderLeftWidth: 2, padding: 3, overflow: 'hidden' },
  miniTitle: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  empty: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
});
