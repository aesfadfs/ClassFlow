import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { UpNextStack } from './src/components/Overview';
import { Pager } from './src/components/Pager';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Calendar, DayStrip } from './src/components/Calendar';
import { EntrySheet, INLINE_SHEETS, ImportSheet, SettingsSheet } from './src/components/Sheets';
import { COLORS, DAYS, createEntry, dateKey, parseTime, uid, dayOfWeek, emptyState, restoreScheduleState, entriesForDay, upcomingOccurrences, entriesForWeek, formatTime, freeWindows, isScheduleState, weekDates, weekNumber, type Entry, type Preferences, type ScheduleState } from './src/domain/schedule';
import { analyzeImport } from './src/domain/import';
import { exportText } from './src/services/files';
import { cleanUpImages, pickImage } from './src/services/images';
import { requestReminderPermission, sendTestReminder, stopAlarmRinging, syncReminders } from './src/services/notifications';
import { planReminders } from './src/domain/reminders';
import { hainnu } from './src/features/schools';
import { APPEARANCE_KEY, WALLPAPERS, wallpaperScheme, applyPreset, deletePreset, savePreset, cardImageFor, forgetEntryImage, referencedImages, restoreAppearance, setCardImage, type Appearance, type CardImageScope } from './src/domain/appearance';
import { AccessibilityProvider, BlurTargetContext, Button, Icon, LiquidGlass, PressSurface, Reveal, haptic, setHapticsEnabled, useAccessibility, useUI, type IconName } from './src/ui/primitives';
import { SchemeContext, metrics, springs, useTheme } from './src/ui/theme';
import { AppBackground, BackgroundContext, GlassContext, GlassFill, fontFamily, pixelize, useGlass, usePixelStyles } from './src/ui/glass';
import { GreetingCurtain } from './src/components/Greeting';
import { LookSheet } from './src/components/LookSheet';
import { GUIDE_STEPS, ONBOARDING_KEY, Onboarding } from './src/components/Onboarding';

const STORAGE_KEY = 'classflow.schedule.v1';
/** Newest timetable that still had entries: the fallback when the live copy is missing or unreadable. */
const BACKUP_KEY = 'classflow.schedule.backup.v1';
/** An unreadable live copy is parked here before a backup replaces it, so nothing is lost for good. */
const DAMAGED_KEY = 'classflow.schedule.damaged.v1';
type Tab = 'timetable' | 'planner' | 'tools';
const NAV: { key: Tab; title: string; icon: IconName }[] = [
  { key: 'timetable', title: '我的课表', icon: 'calendar' },
  { key: 'planner', title: '时间规划', icon: 'planner' },
  { key: 'tools', title: '工具箱', icon: 'grid' },
];

export default function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><AccessibilityProvider><View style={{ flex: 1 }}><ClassFlow /><GreetingCurtain /></View></AccessibilityProvider></SafeAreaProvider></GestureHandlerRootView>;
}

function ClassFlow() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = width - insets.left - insets.right;
  const mobile = contentWidth < 850 || height < 360;
  const compactHeight = height - insets.top - insets.bottom < 650;
  const landscape = height - insets.top - insets.bottom < 450;
  const [state, setState] = useState<ScheduleState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const writeQueue = useRef(Promise.resolve());
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState<Tab>('timetable');
  const [week, setWeek] = useState(() => Math.min(state.preferences.semesterWeeks, Math.max(1, weekNumber(new Date(), state.preferences.semesterStart))));
  const [day, setDay] = useState(dayOfWeek(new Date()));
  const [view, setView] = useState<'week' | 'day'>(() => mobile ? 'day' : 'week');
  const [detail, setDetail] = useState(false);
  const pagerPosition = useSharedValue(0);
  const pagerPending = useSharedValue(-1);
  const { reduceMotion } = useAccessibility();
  const transition = useSharedValue(1);
  const navigating = useRef(false);
  const pageMotion = useAnimatedStyle(() => ({ opacity: transition.get(), transform: [{ translateY: (1 - transition.get()) * 12 }, { scale: 0.99 + transition.get() * 0.01 }] }));
  // The tools tab has nothing to add, so the dock's "+" folds away there and the tab bar takes the room.
  const [dockIntent, setDockIntent] = useState<Tab>(tab);
  useEffect(() => { setDockIntent(tab); }, [tab]);
  const hidePlus = dockIntent === 'tools' && !detail;
  const plusOpen = useSharedValue(hidePlus ? 0 : 1);
  useEffect(() => {
    const target = hidePlus ? 0 : 1;
    plusOpen.set(reduceMotion ? target : withTiming(target, { duration: 160, easing: Easing.out(Easing.cubic) }));
  }, [plusOpen, hidePlus, reduceMotion]);
  const plusReveal = useAnimatedStyle(() => {
    const open = Math.max(0, Math.min(1, plusOpen.get()));
    return { width: open * 64, marginLeft: (open - 1) * 10, opacity: Math.max(0, open * 1.6 - 0.6) };
  });
  const [editor, setEditor] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [editorClosing, setEditorClosing] = useState(false);
  const [sheet, setSheet] = useState<'import' | 'settings' | 'look' | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [storageWarning, setStorageWarning] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(() => restoreAppearance(null));
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  // A colour wallpaper (or the user's choice over a photo) can ask for one palette; everything below follows it.
  const scheme = wallpaperScheme(appearance);
  const theme = useTheme(scheme);
  const blurTarget = useRef<View>(null);
  useEffect(() => { setHapticsEnabled(appearance.haptics); }, [appearance.haptics]);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { setEditorClosing(false); }, [editor?.entry.id]);
  useEffect(() => { setSheetClosing(false); }, [sheet]);
  /** Step of the first-run guide, or null when it is not showing. */
  const [guide, setGuide] = useState<number | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    transition.set(reduceMotion ? 1 : withSpring(1, springs.settle));
    navigating.current = false;
  }, [tab, detail, reduceMotion, transition]);

  function navigate(nextTab: Tab, nextDetail: boolean) {
    if (navigating.current || (nextTab === tab && nextDetail === detail)) return;
    haptic();
    const finish = () => { setTab(nextTab); setDetail(nextDetail); };
    if (reduceMotion) { finish(); return; }
    navigating.current = true;
    transition.set(withTiming(0, { duration: 120, easing: Easing.in(Easing.quad) }, done => {
      if (done) scheduleOnRN(finish);
    }));
  }
  useEffect(() => {
    // Back walks up one level: open sheet → detail → overview → 课表 tab → leave the app.
    // On phones sheets live inside the app window (no Modal), so their back press lands here too;
    // on the web the Modal handles its own Escape.
    const back = () => {
      if (editor || sheet) {
        if (!INLINE_SHEETS) return false;
        if (editor) setEditorClosing(true); else setSheetClosing(true);
        return true;
      }
      if (guide !== null) {
        if (guide > 0) { setGuide(guide - 1); return true; }
        return false;
      }
      if (detail) { navigate(tab, false); return true; }
      if (Platform.OS !== 'web' && tab !== 'timetable') { selectTab('timetable'); return true; }
      return false;
    };
    if (Platform.OS !== 'web') {
      const subscription = BackHandler.addEventListener('hardwareBackPress', back);
      return () => subscription.remove();
    }
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') back(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [detail, tab, editor, sheet, reduceMotion, guide]);

  // First-run guide: only on a real first launch. Anyone who already has a saved timetable
  // (an upgrade) is marked as done without seeing it.
  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([ONBOARDING_KEY, STORAGE_KEY]).then(([[, done], [, saved]]) => {
      if (!active || done) return;
      if (saved) { void AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {}); return; }
      setGuide(0);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  // A sheet opened from the guide moves it on once that sheet closes.
  const guideWaiting = useRef(false);
  useEffect(() => {
    if (sheet !== null || !guideWaiting.current) return;
    guideWaiting.current = false;
    setGuide(current => current === null ? null : Math.min(GUIDE_STEPS - 1, current + 1));
  }, [sheet]);
  function openFromGuide(next: 'import' | 'look') { guideWaiting.current = true; setSheet(next); }
  function finishGuide() { haptic('success'); setGuide(null); void AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {}); }

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_KEY).then(raw => {
      if (!active) return;
      const restored = restoreAppearance(raw);
      setAppearance(restored);
      void cleanUpImages(referencedImages(restored));
    }).catch(() => {}).finally(() => { if (active) setAppearanceLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!appearanceLoaded) return;
    AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)).catch(() => notify('外观设置保存失败：图片可能太大，请换一张小一些的图片'));
  }, [appearance, appearanceLoaded]);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(async raw => {
      if (!active) return;
      let parsed: ScheduleState | null = null;
      try { parsed = raw ? restoreScheduleState(raw) : null; } catch { parsed = null; }
      if (!parsed) {
        // Live copy missing or damaged: fall back to the newest non-empty snapshot. A first launch has
        // neither, so it still opens blank.
        const backup = await AsyncStorage.getItem(BACKUP_KEY);
        let restored: ScheduleState | null = null;
        try { restored = backup ? restoreScheduleState(backup) : null; } catch { restored = null; }
        if (!restored || !restored.entries.length) {
          if (raw) throw new Error('unreadable schedule');
          return;
        }
        if (raw) await AsyncStorage.setItem(DAMAGED_KEY, raw);
        parsed = restored;
        if (active) setToast({ message: `本地课表无法读取，已从自动备份恢复 ${restored.entries.length} 条记录` });
      }
      if (!active) return;
      setState(parsed);
      setWeek(Math.min(parsed.preferences.semesterWeeks, Math.max(1, weekNumber(new Date(), parsed.preferences.semesterStart))));
    }).catch(() => { if (active) { setStorageEnabled(false); setStorageWarning('本地课表暂时无法读取。当前显示空白课表；原数据未被覆盖。'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (loading || !storageEnabled) return;
    setSaveStatus('saving');
    const snapshot = JSON.stringify(state);
    // Only non-empty timetables become the backup, so clearing everything can still be walked back.
    const keepBackup = state.entries.length > 0;
    writeQueue.current = writeQueue.current.then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot))
      .then(() => keepBackup ? AsyncStorage.setItem(BACKUP_KEY, snapshot).catch(() => {}) : undefined).then(() => { setSaveStatus('saved'); setStorageWarning(''); }).catch(() => { setSaveStatus('error'); setStorageWarning('本地保存失败。请导出备份，避免丢失本次修改。'); });
  }, [state, loading, storageEnabled]);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.undo ? 7000 : 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = '课序 ClassFlow';
    document.documentElement.lang = 'zh-CN';
    document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
    const style = document.createElement('style');
    style.textContent = 'html,body,#root{height:100%;width:100%;margin:0;overflow:hidden;color-scheme:light dark}body{overscroll-behavior-y:none}*{-webkit-tap-highlight-color:transparent}button,input,textarea{font-family:inherit}*:focus-visible{outline:2px solid #739ef6;outline-offset:3px}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#dce1eb;border-radius:6px}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const dates = useMemo(() => weekDates(state.preferences.semesterStart, week), [state.preferences.semesterStart, week]);
  const weekly = entriesForWeek(state.entries, week);
  const daily = entriesForDay(state.entries, week, day);
  const windows = freeWindows(state.entries, week, day);
  const courses = weekly.filter(entry => entry.kind === 'course');
  const plans = weekly.filter(entry => entry.kind === 'plan');
  const freeMinutes = windows.reduce((total, window) => total + window.end - window.start, 0);
  const notify = (message: string) => setToast({ message });

  function commit(next: ScheduleState) { setStorageEnabled(true); setState(next); }
  function add(kind: Entry['kind'] = 'course', selectedDay = day, start = 480, end?: number) {
    setEditor({ isNew: true, entry: createEntry({ kind, day: selectedDay, start, end: end ?? Math.min(start + 60, 1439), color: kind === 'plan' ? 'green' : 'blue', startWeek: kind === 'plan' ? week : 1, endWeek: kind === 'plan' ? week : state.preferences.semesterWeeks }) });
  }
  function saveEntry(entry: Entry, image?: { scope: CardImageScope; uri: string | null; frost?: boolean }) {
    const exists = state.entries.some(item => item.id === entry.id);
    commit({ ...state, demo: false, entries: exists ? state.entries.map(item => item.id === entry.id ? entry : item) : [...state.entries, entry] });
    if (image) setAppearance(current => setCardImage(current, entry, image.scope, image.uri, image.frost));
    haptic('success');
    setEditorClosing(true); notify(exists ? '修改已保存' : '已加入课表');
  }
  function moveEntry(entry: Entry) {
    const previous = state.entries.find(item => item.id === entry.id);
    if (!previous || (previous.day === entry.day && previous.start === entry.start && previous.end === entry.end)) return;
    commit({ ...state, demo: false, entries: state.entries.map(item => item.id === entry.id ? entry : item) });
    haptic('drop');
    setToast({ message: `已调整至${DAYS[entry.day]} ${formatTime(entry.start)}–${formatTime(entry.end)} · 应用于该卡片全部周次`,
      undo: () => { haptic('light'); setState(current => ({ ...current, entries: current.entries.map(item => item.id === previous.id ? previous : item) })); setToast(null); } });
  }
  function deleteEntry(id: string) {
    const deleted = state.entries.find(entry => entry.id === id);
    commit({ ...state, entries: state.entries.filter(entry => entry.id !== id), demo: false });
    const previousLook = appearance;
    setAppearance(current => forgetEntryImage(current, id));
    haptic('warning');
    setEditorClosing(true);
    setToast({ message: '已移除这条安排', undo: () => { haptic('light'); if (deleted) setState(current => ({ ...current, entries: [...current.entries, deleted] })); setAppearance(previousLook); setToast(null); } });
  }
  function importEntries(entries: Entry[], replace: boolean, preferences?: Preferences) {
    const result = analyzeImport(entries, state.entries, replace, state.demo);
    const previous = state;
    const next = { ...state, demo: false, entries: result.nextEntries, preferences: preferences ?? state.preferences };
    if (!isScheduleState(next)) return '导入后的课表超出本地存储限制或格式无效，请减少所选条目后重试。';
    if (!result.entries.length && !preferences) {
      setSheetClosing(true);
      notify('所选课程已在课表中');
      return;
    }
    commit(next);
    if (preferences) setWeek(Math.max(1, Math.min(preferences.semesterWeeks, weekNumber(now, preferences.semesterStart))));
    setSheetClosing(true);
    haptic('success');
    setToast({ message: result.entries.length ? `已导入 ${result.entries.length} 条${result.duplicateCount ? '，重复内容已跳过' : ''}` : '学期设置已恢复', undo: () => { setState(previous); setWeek(week); setToast(null); } });
  }
  function updateAppearance(patch: Partial<Appearance>) { setAppearance(current => ({ ...current, ...patch })); }
  function setCalendarLayout(calendarLayout: Appearance['calendarLayout']) {
    if (calendarLayout === appearance.calendarLayout) return;
    haptic();
    updateAppearance({ calendarLayout });
  }
  async function enableReminders() {
    if (Platform.OS === 'web') { notify('网页版不支持系统通知，请在手机 App 中开启上课提醒'); return false; }
    try {
      if (await requestReminderPermission()) { haptic('toggleOn'); notify('已开启上课提醒'); return true; }
      notify('没有通知权限：请在系统设置 → 应用 → 课序 → 通知中允许');
    } catch { notify('无法开启通知，请稍后重试'); }
    return false;
  }
  async function chooseImage(purpose: 'background' | 'card') {
    try { return await pickImage(purpose); }
    catch (error) { notify(error instanceof Error ? error.message : '无法读取这张图片'); return null; }
  }
  function toggleDrag() {
    const next = !appearance.dragEnabled;
    haptic(next ? 'toggleOn' : 'toggleOff');
    updateAppearance({ dragEnabled: next });
    notify(next ? '已开启拖动调整' : '已关闭拖动，课程卡片只能点开编辑');
  }
  function savePreferences(preferences: Preferences) { haptic('success'); commit({ ...state, preferences }); setWeek(current => Math.min(current, preferences.semesterWeeks)); setSheetClosing(true); notify('学期设置已更新'); }
  function clearDemo() {
    const previous = state;
    commit({ ...state, demo: false, entries: [] }); setSheetClosing(true);
    setToast({ message: '示例课表已清空', undo: () => { setState(previous); setToast(null); } });
  }
  /** Brings back the newest non-empty snapshot kept on this device, with undo. */
  async function restoreLocalBackup() {
    let restored: ScheduleState;
    try {
      const raw = await AsyncStorage.getItem(BACKUP_KEY);
      if (!raw) { notify('这台设备上还没有自动备份'); return; }
      restored = restoreScheduleState(raw);
    } catch { notify('自动备份读取失败'); return; }
    if (!restored.entries.length) { notify('自动备份里没有课程'); return; }
    if (JSON.stringify(restored) === JSON.stringify(state)) { notify('当前课表已经和自动备份一致'); return; }
    const previous = state;
    const previousWeek = week;
    commit(restored);
    setWeek(Math.min(restored.preferences.semesterWeeks, Math.max(1, weekNumber(now, restored.preferences.semesterStart))));
    setSheetClosing(true);
    haptic('success');
    setToast({ message: `已从自动备份恢复 ${restored.entries.length} 条记录`, undo: () => { setState(previous); setWeek(previousWeek); setToast(null); } });
  }
  function writeBackup() {
    return exportText(JSON.stringify(state, null, 2), `课序-备份-${dateKey(now)}.json`);
  }
  async function exportBackup() {
    try { await writeBackup(); notify(Platform.OS === 'web' ? '备份文件已生成' : '备份已准备好'); }
    catch (error) { notify(error instanceof Error ? error.message : '导出失败，请重试'); }
  }
  function goToday() { const current = weekNumber(now, state.preferences.semesterStart); setWeek(Math.max(1, Math.min(state.preferences.semesterWeeks, current))); setDay(dayOfWeek(now)); if (current < 1 || current > state.preferences.semesterWeeks) notify('当前日期不在本学期，已显示最近的周次'); }
  const monthLabel = dates[0].getMonth() === dates[6].getMonth() ? `${dates[0].getFullYear()}年 ${dates[0].getMonth() + 1}月` : `${dates[0].getMonth() + 1}月 – ${dates[6].getMonth() + 1}月`;


  const gutter = contentWidth < 360 ? 12 : mobile ? 16 : 32;
  const tabIndex = NAV.findIndex(item => item.key === tab);
  const selectTab = (next: Tab) => {
    // Fold the dock's "+" on the tap itself; the page slide commits `tab` only once it lands.
    setDockIntent(next);
    if (detail) { navigate(next, false); return; }
    if (next === tab) return;
    haptic();
    const index = NAV.findIndex(item => item.key === next);
    if (reduceMotion || Math.abs(pagerPosition.get() - index) < 0.02) { setTab(next); return; }
    // Slide first, commit the tab when the slide lands, so the re-render never interrupts the motion.
    pagerPending.set(index);
    pagerPosition.set(withSpring(index, springs.page));
  };
  const glassLook = useMemo(() => ({ panel: appearance.glassPanel, blur: appearance.glassBlur, card: appearance.glassCard, glow: appearance.glow, style: appearance.uiStyle, font: appearance.font }),
    [appearance.glassPanel, appearance.glassBlur, appearance.glassCard, appearance.glow, appearance.uiStyle, appearance.font]);
  const pixel = appearance.uiStyle === 'pixel';
  // This component sits outside GlassContext, so it squares its own styles from the setting.
  const styles = useMemo(() => pixel ? pixelize(baseStyles) : baseStyles, [pixel]);
  // Segmented controls sit on glass: a light translucent tray instead of a solid grey one.
  const tray = pixel ? theme.soft : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.38)';
  const face = fontFamily(appearance.font);
  const ui = useUI(glassLook, scheme);
  // Keep a week of class reminders scheduled: after any timetable or setting change, and whenever the app comes back.
  const reminderSettings = appearance.reminders;
  useEffect(() => {
    if (loading || !appearanceLoaded || Platform.OS === 'web') return;
    const sync = () => { void syncReminders(planReminders(state.entries, state.preferences, new Date(), reminderSettings), reminderSettings).catch(() => {}); };
    const timer = setTimeout(sync, 800);
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') { stopAlarmRinging(); sync(); } });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [loading, appearanceLoaded, state.entries, state.preferences, reminderSettings]);
  const narrowToolbar = contentWidth < 520;
  // Numbered periods only when the user picked a bell schedule in settings; never inferred.
  const periodTimes = useMemo(() => appearance.periodPreset === 'guilinyang' && hainnu.periodTimeProfile
    ? hainnu.periodTimeProfile.times.map(time => ({ start: parseTime(time.start), end: parseTime(time.end) })) : null, [appearance.periodPreset]);
  const background = useMemo(() => ({
    uri: appearance.background, dim: appearance.backgroundDim, kind: appearance.backgroundKind, frame: appearance.backgroundFrame,
    fill: WALLPAPERS.find(item => item.id === appearance.backdrop)?.colors ?? null,
  }), [appearance.background, appearance.backgroundDim, appearance.backgroundKind, appearance.backgroundFrame, appearance.backdrop]);
  const cardImageLookup = useCallback((entry: Entry) => cardImageFor(appearance, entry) ?? undefined, [appearance.cardImages, appearance.cardFrost]);
  const openEditor = useCallback((entry: Entry) => setEditor({ entry, isNew: false }), []);
  const addLatest = useRef(add);
  addLatest.current = add;
  const addCourse = useCallback(() => addLatest.current('course'), []);
  const openImport = useCallback(() => setSheet('import'), []);
  const upcoming = useMemo(() => upcomingOccurrences(state.entries, state.preferences, now, { once: true }), [state.entries, state.preferences, now]);
  // 「第 10 周」 carries its date range underneath, so you know where you are at a glance.
  const weekRange = `${dates[0].getMonth() + 1}/${dates[0].getDate()}–${dates[6].getMonth() + 1}/${dates[6].getDate()}`;
  const weekControl = <View style={[ui.row, styles.controlGroup, { backgroundColor: tray }]}>
    <Button small icon="left" label="上一周" variant="ghost" disabled={week <= 1} onPress={() => { haptic(); setWeek(week - 1); }} />
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`第 ${week} 周，${weekRange.replace('–', ' 到 ')}`} style={styles.weekLabel}>
      <Text style={[styles.weekNumber, { color: theme.ink }]}>第 {week} 周</Text>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={[styles.weekRange, { color: theme.muted }]}>{weekRange}</Text>
    </View>
    <Button small icon="right" label="下一周" variant="ghost" disabled={week >= state.preferences.semesterWeeks} onPress={() => { haptic(); setWeek(week + 1); }} />
  </View>;

  if (loading) return <View style={[styles.loading, { backgroundColor: theme.bg }]}>
    <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
    <ActivityIndicator color={theme.blue} />
    <Text accessibilityLiveRegion="polite" style={ui.body}>正在加载课表</Text>
  </View>;

  return <SchemeContext.Provider value={scheme}><GlassContext.Provider value={glassLook}><BackgroundContext.Provider value={background}><BlurTargetContext.Provider value={blurTarget}><View style={[styles.shell, { backgroundColor: theme.bg }]}>
    <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
    <BlurTargetView ref={blurTarget} style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
    <AppBackground testID={appearance.background ? 'custom-background' : undefined} />
    {!mobile && <View style={[styles.sidebar, { backgroundColor: theme.surface, borderColor: theme.line, paddingBottom: Math.max(insets.bottom, 24) }]}>
      <Brand />
      <View accessibilityRole="tablist" style={{ gap: 8 }}>{NAV.map(item =>
        <NavItem key={item.key} item={item} selected={tab === item.key} onPress={() => selectTab(item.key)} />
      )}</View>
      <View style={{ flex: 1 }} />
      <Button variant="ghost" icon="settings" onPress={() => setSheet('settings')}>偏好设置</Button>
    </View>}
    <View testID="app-main" style={[styles.main, { paddingHorizontal: gutter, paddingBottom: (mobile && !(detail && landscape) ? 80 : 8) + insets.bottom }]}>
      <View style={[styles.topline, { marginBottom: landscape ? 4 : 10 }]}>
        {detail ? <View style={[ui.row, { gap: 8, flex: 1, minWidth: 0 }]}>
          <Button icon="left" label="返回概览" variant="ghost" onPress={() => navigate(tab, false)} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={ui.title}>{tab === 'timetable' ? '课表详情' : '完整时间线'}</Text>
        </View> : <Brand />}
        <View style={[ui.row, { gap: 6 }]}>
          {!mobile && <Text style={ui.label}>{saveStatus === 'saving' ? '正在保存' : storageWarning ? '本地存储异常' : '已在本地保存'}</Text>}
          <Button icon="settings" label="偏好设置" small onPress={() => setSheet('settings')} />
          <Button icon="import" label="导入课表" small onPress={() => setSheet('import')} />
          {!mobile && <Button icon="plus" label="添加课程或安排" variant="primary" onPress={() => add(tab === 'planner' ? 'plan' : 'course')} />}
        </View>
      </View>
      {!!storageWarning && <PressSurface accessibilityRole="button" accessibilityLabel="本地存储异常，导出备份" onPress={exportBackup} style={[styles.notice, { backgroundColor: theme.warningBg }]}>
        <Text numberOfLines={2} style={[ui.label, { color: theme.warning, padding: 8 }]}>{storageWarning} · 点此导出备份</Text>
      </PressSurface>}
      <Animated.View style={[styles.page, pageMotion]}>
        {!detail ? <Pager index={tabIndex} count={NAV.length} position={pagerPosition} pending={pagerPending} enabled={mobile}
          onIndexChange={index => setTab(NAV[index].key)} style={{ marginHorizontal: -gutter }}>
          {NAV.map(item => <View key={item.key} style={[styles.pagerPage, { paddingHorizontal: gutter }]}>
            {!landscape && <View style={styles.pageHeader}>
              <View style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[styles.heading, { color: theme.ink, fontSize: compactHeight ? 24 : 30, fontFamily: face }, pixel && styles.pixelHeading]}>{item.title}</Text>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={ui.label}>{item.key === 'timetable' ? '本周 ' + courses.length + ' 节课程 · ' + plans.length + ' 项个人安排' + (state.demo ? ' · 示例' : '') : item.key === 'planner' ? '留一点时间，给自己的计划' : '导入、备份与学期设置'}</Text>
              </View>
            </View>}
            {item.key === 'timetable' && <>
              <UpNextStack items={upcoming} now={now} imageFor={cardImageLookup} onOpen={openEditor} onAdd={addCourse} onImport={openImport} />
              <Button icon="calendar" label="打开完整课表" style={{ alignSelf: 'stretch' }} onPress={() => navigate('timetable', true)}>查看完整课表</Button>
            </>}
            {item.key === 'planner' && <>
              {!landscape && <View style={[ui.card, { overflow: 'hidden', flexShrink: 0 }]}><GlassFill radius={metrics.radius.lg} /><DayStrip dates={dates} day={day} now={now} onDay={setDay} /></View>}
              <PressSurface accessibilityRole="button" accessibilityLabel="打开完整时间线" onPress={() => navigate('planner', true)} style={[ui.card, { flex: 1, minHeight: 0, overflow: 'hidden' }]}>
                <GlassFill radius={metrics.radius.lg} />
                <View style={{ flex: 1, minHeight: 0, padding: compactHeight ? 12 : 20, gap: 12 }}>
                  <View style={[ui.row, { justifyContent: 'space-between' }]}>
                    <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[ui.title, { color: theme.success, flex: 1 }]}>{DAYS[day]}空闲 {Math.floor(freeMinutes / 60)} 小时</Text>
                    <Icon name="arrow" color={theme.blue} />
                  </View>
                  {!landscape && <Text style={ui.label}>08:00–21:00 · {windows.length} 段可安排时间</Text>}
                  {!landscape && daily.slice(0, compactHeight ? 2 : 4).map(entry => <View key={entry.id} style={[ui.row, { gap: 10, minHeight: 40 }]}>
                    <View style={[styles.colorBar, { backgroundColor: COLORS[entry.color].accent }]} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text numberOfLines={1} style={[ui.body, { color: theme.ink }]}>{entry.title}</Text><Text style={ui.label}>{formatTime(entry.start)}–{formatTime(entry.end)}</Text></View>
                  </View>)}
                  {!daily.length && !landscape && <Text style={ui.body}>这一天暂无安排</Text>}
                  <View style={{ flex: 1 }} />
                  <Text numberOfLines={1} style={[ui.label, { color: theme.blue }]}>点开完整时间线，规划空闲时段</Text>
                </View>
              </PressSurface>
            </>}
            {item.key === 'tools' && <View style={{ flex: 1, minHeight: 0, gap: compactHeight ? 8 : 12, flexDirection: landscape ? 'row' : 'column' }}>
              {([
                { icon: 'import', title: '课表导入', detail: '登录学校教务自动识别，或导入课表文件', action: () => setSheet('import') },
                { icon: 'file', title: '课表备份', detail: '导出课程、个人安排和学期设置', action: exportBackup },
                { icon: 'sparkles', title: '外观与壁纸', detail: '壁纸（图片 / 动图 / 视频）、玻璃质感、风格与字体', action: () => setSheet('look') },
                { icon: 'settings', title: '偏好设置', detail: '管理学期起始日期与周数', action: () => setSheet('settings') },
              ] satisfies { icon: IconName; title: string; detail: string; action?: () => void }[]).map(tool => {
                const row = <View style={[styles.toolRow, { padding: compactHeight ? 12 : 16, minHeight: compactHeight ? 60 : 80, flexDirection: landscape ? 'column' : 'row' }]}>
                  <View style={[styles.toolIcon, { backgroundColor: theme.tint }]}>
                    <Icon name={tool.icon} size={22} color={theme.blue} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[ui.body, { color: theme.ink, fontWeight: '600', fontSize: 16 }]}>{tool.title}</Text>
                    <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={ui.label}>{tool.detail}</Text>
                  </View>
                  <Icon name="right" size={17} color={theme.muted} />
                </View>;
                return <PressSurface key={tool.title} style={[ui.card, { flex: 1, maxHeight: landscape ? undefined : 120, minHeight: 0, overflow: 'hidden' }]} accessibilityRole="button" onPress={tool.action}><GlassFill radius={metrics.radius.lg} />{row}</PressSurface>;
              })}
            </View>}
          </View>)}
        </Pager> : <>
        {tab === 'timetable' && <>
          <View style={[styles.overviewToolbar, { gap: contentWidth < 360 ? 2 : 8 }]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[ui.label, { flex: 1 }]}>{monthLabel}</Text>
            {weekControl}
            <Button small variant="ghost" onPress={goToday}>本周</Button>
          </View>
          {/* Same transparent glass as the other panels; the course blocks carry their own colour. */}
          <View style={[ui.card, styles.calendar]}>
            <GlassFill radius={metrics.radius.lg} />
            <View style={styles.detailToolbar}>
              <View style={[ui.row, styles.controlGroup, { backgroundColor: tray }]}>
                <Button small variant="ghost" label="按周查看" selected={view === 'week'} onPress={() => setView('week')}>{narrowToolbar ? '周' : '周视图'}</Button>
                <Button small variant="ghost" label="按日查看" selected={view === 'day'} onPress={() => setView('day')}>{narrowToolbar ? '日' : '日视图'}</Button>
              </View>
              <View style={[ui.row, styles.controlGroup, { backgroundColor: tray }]}>
                <Button small variant="ghost" label="按时间轴排列" selected={appearance.calendarLayout === 'timeline'} onPress={() => setCalendarLayout('timeline')}>时间轴</Button>
                <Button small variant="ghost" label="按节次对齐" selected={appearance.calendarLayout === 'periods'} onPress={() => setCalendarLayout('periods')}>节次</Button>
              </View>
              {appearance.calendarLayout === 'timeline' && <PressSurface testID="drag-toggle" accessibilityRole="switch" accessibilityLabel="允许拖动调整课程" accessibilityState={{ checked: appearance.dragEnabled }} aria-checked={appearance.dragEnabled}
                onPress={toggleDrag} style={[styles.dragToggle, { backgroundColor: appearance.dragEnabled ? theme.tint : theme.soft, borderColor: appearance.dragEnabled ? theme.accentLine : theme.line }]}>
                <View style={[ui.row, { gap: 6, paddingHorizontal: 10 }]}>
                  <Icon name={appearance.dragEnabled ? 'unlock' : 'lock'} size={15} color={appearance.dragEnabled ? theme.blue : theme.muted} />
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[ui.label, { fontSize: 12, fontWeight: '600', color: appearance.dragEnabled ? theme.blue : theme.muted }]}>
                    {appearance.dragEnabled ? (landscape || narrowToolbar ? '拖动开' : Platform.OS === 'web' ? '拖动调整：开' : '长按拖动：开') : (landscape || narrowToolbar ? '拖动关' : '拖动调整：关')}
                  </Text>
                </View>
              </PressSurface>}
            </View>
            <Calendar entries={state.entries} week={week} dates={dates} day={day} now={now} mobile={mobile} singleDay={view === 'day'} dragEnabled={appearance.dragEnabled} layout={appearance.calendarLayout} periods={periodTimes} onDay={setDay} onMove={moveEntry}
              onEdit={entry => setEditor({ entry, isNew: false })} onEmpty={(selectedDay, start) => add('plan', selectedDay, start)} />
          </View>
        </>}
        {tab === 'planner' && <ScrollView ref={scrollRef} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
          <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }]}>
            {weekControl}
            <Button small onPress={goToday}>本周</Button>
          </View>
          <View style={[ui.card, { overflow: 'hidden' }]}><DayStrip dates={dates} day={day} now={now} onDay={setDay} /></View>
          <View style={[styles.summary, { backgroundColor: theme.successBg }]}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text accessibilityRole="header" style={[ui.title, { color: theme.success }]}>{DAYS[day]}空闲 {Math.floor(freeMinutes / 60)} 小时{freeMinutes % 60 ? ` ${freeMinutes % 60} 分钟` : ''}</Text>
              <Text style={[ui.body, { color: theme.success }]}>统计 08:00–21:00 内至少 30 分钟的空闲时段</Text>
            </View>
            <Icon name="clock" size={26} color={theme.success} />
          </View>
          <Text accessibilityRole="header" style={ui.title}>时间线</Text>
          <View style={{ gap: 8 }}>
            {[...daily.map(entry => ({ start: entry.start, end: entry.end, entry })), ...windows.map(window => ({ ...window, entry: null }))].sort((a, b) => a.start - b.start).map(slot => (
              <PressSurface key={slot.entry?.id ?? `free-${slot.start}`} accessibilityRole="button"
                onPress={() => slot.entry ? setEditor({ entry: slot.entry, isNew: false }) : add('plan', day, slot.start, Math.min(slot.end, slot.start + 60))}
                style={[ui.card, !slot.entry && { backgroundColor: theme.soft }]}>
                <View style={[styles.slot, { paddingHorizontal: gutter }]}>
                  <Text style={[ui.label, { minWidth: mobile ? 42 : 100, fontVariant: ['tabular-nums'] }]}>{formatTime(slot.start)}{mobile ? '\n' : '–'}{formatTime(slot.end)}</Text>
                  <View style={[styles.colorBar, { backgroundColor: slot.entry ? COLORS[slot.entry.color].accent : theme.success }]} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[ui.body, { color: theme.ink, fontWeight: '600' }]}>{slot.entry?.title ?? '空闲时段'}</Text>
                    <Text style={ui.label}>{slot.entry ? slot.entry.location || (slot.entry.kind === 'plan' ? '个人安排' : '课程') : `${slot.end - slot.start} 分钟 · 添加安排`}</Text>
                  </View>
                  <Icon name={slot.entry ? 'right' : 'plus'} color={theme.muted} size={18} />
                </View>
              </PressSurface>
            ))}
          </View>
        </ScrollView>}
        </>}
      </Animated.View>
    </View>
    </BlurTargetView>
    {mobile && !(detail && landscape) && <View pointerEvents="box-none" style={[styles.navWrap, { left: insets.left + 14, right: insets.right + 14, bottom: Math.max(insets.bottom, 10) + 4 }]}>
      <View style={styles.dockRow}>
        <LiquidGlass interactive style={styles.dockBar}>
          <DockTabs tab={tab} position={pagerPosition} pending={pagerPending} enabled={!detail} onSelect={selectTab} />
        </LiquidGlass>
        {/* The glass button keeps a fixed size inside a clipping wrapper whose width animates. */}
        <Animated.View pointerEvents={hidePlus ? 'none' : 'auto'} importantForAccessibility={hidePlus ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={hidePlus} aria-hidden={hidePlus}
          style={[styles.dockAction, styles.dockActionClip, !pixel && styles.dockActionRound, plusReveal]}>
          <View style={styles.dockActionFixed}>
            <LiquidGlass interactive accent={theme.dark ? 'rgba(150,165,255,0.5)' : 'rgba(54,75,182,0.55)'} style={styles.dockAction}>
              <PressSurface accessibilityRole="button" accessibilityLabel={tab === 'planner' ? '添加个人安排' : '添加课程'} scale={0.9} style={[styles.dockActionPress, pixel && { borderRadius: 0 }]}
                onPress={() => { haptic('medium'); add(tab === 'planner' ? 'plan' : 'course'); }}>
                <Icon name="plus" size={26} strokeWidth={2.2} color={theme.onAccent} />
              </PressSurface>
            </LiquidGlass>
          </View>
        </Animated.View>
      </View>
    </View>}
    {toast && <View pointerEvents="box-none" style={[styles.toastWrap, { bottom: (mobile ? 86 : 24) + insets.bottom }]}>
      <Reveal style={{ maxWidth: 520, width: '100%' }}>
        <View style={[ui.card, styles.toast, { backgroundColor: theme.raised, boxShadow: `0 4px 20px ${theme.shadow}` }]}>
          <Icon name="info" size={19} color={theme.blue} />
          <Text accessibilityLiveRegion="polite" style={[ui.body, { flex: 1 }]}>{toast.message}</Text>
          {toast.undo && <Button small variant="ghost" onPress={toast.undo}>撤销</Button>}
          <Button icon="close" label="关闭提示" small variant="ghost" onPress={() => setToast(null)} />
        </View>
      </Reveal>
    </View>}
    {/* Under the sheets it opens, above everything else. */}
    {guide !== null && <Onboarding step={guide} remindersOn={appearance.reminders.enabled} onStep={setGuide} onFinish={finishGuide}
      onImport={() => openFromGuide('import')} onWallpaper={() => openFromGuide('look')}
      onReminders={async () => { if (await enableReminders()) updateAppearance({ reminders: { ...appearance.reminders, enabled: true } }); }} />}
    {editor && <EntrySheet key={editor.entry.id} {...editor} closingRequested={editorClosing} entries={state.entries} semesterWeeks={state.preferences.semesterWeeks} onClose={() => setEditor(null)} onSave={saveEntry} onDelete={deleteEntry}
      cardImage={cardImageFor(appearance, editor.entry)} onPickImage={() => chooseImage('card')} />}
    {sheet === 'look' && <LookSheet closingRequested={sheetClosing} appearance={appearance} onClose={() => setSheet(null)} onAppearance={updateAppearance}
      onApply={preset => setAppearance(current => applyPreset(current, preset))}
      onSavePreset={name => {
        // Validate here, outside the state updater: an error thrown inside setAppearance(current => …)
        // runs during React's render and is not caught by this try, which crashed the app.
        try {
          const next = savePreset(appearance, name, `custom:${uid()}`);
          setAppearance(next);
          notify(`已保存预设「${name.trim().slice(0, 20)}」`);
          return null;
        } catch (error) { return error instanceof Error ? error.message : '保存失败'; }
      }}
      onDeletePreset={id => { const previous = appearance; setAppearance(current => deletePreset(current, id)); setToast({ message: '已删除预设', undo: () => { setAppearance(previous); setToast(null); } }); }} />}
    {sheet === 'import' && <ImportSheet closingRequested={sheetClosing} semesterWeeks={state.preferences.semesterWeeks} existingEntries={state.entries} demo={state.demo} onClose={() => setSheet(null)} onImport={importEntries} />}
    {sheet === 'settings' && <SettingsSheet closingRequested={sheetClosing} preferences={state.preferences} onSave={savePreferences} onClose={() => setSheet(null)} onExport={writeBackup} onRestoreLocal={restoreLocalBackup} demo={state.demo} onClearDemo={clearDemo}
      appearance={appearance} onAppearance={updateAppearance} onEnableReminders={enableReminders}
      onTestReminder={() => { void sendTestReminder(appearance.reminders).then(sent => notify(sent ? '3 秒后会响一次测试提醒，锁屏等几秒试试' : '没有通知权限，无法发送测试提醒')).catch(() => notify('测试提醒发送失败')); }} />}
  </View></BlurTargetContext.Provider></BackgroundContext.Provider></GlassContext.Provider></SchemeContext.Provider>;
}

function Brand() {
  const styles = usePixelStyles(baseStyles);
  const theme = useTheme();
  return <View style={styles.brand}>
    <View style={[styles.mark, { backgroundColor: theme.blue }]}><Icon name="calendar" size={21} color={theme.onAccent} /></View>
    <Text style={{ fontSize: 20, fontWeight: '700', color: theme.ink, fontFamily: fontFamily(useGlass().font) }}>课序</Text>
  </View>;
}

// Bottom navigation with one sliding pill. The pill follows the pager while
// pages are swiped, and can itself be dragged sideways to switch pages.
// Bottom navigation with one liquid-glass lens. The lens follows the pager
// while pages are swiped, can itself be dragged, and swells slightly while
// held, like a drop of glass magnifying the tab beneath it.
function DockTabs({ tab, position, pending, enabled, onSelect }: { tab: Tab; position: SharedValue<number>; pending: SharedValue<number>; enabled: boolean; onSelect: (tab: Tab) => void }) {
  const styles = usePixelStyles(baseStyles);
  const theme = useTheme();
  const pixel = useGlass().style === 'pixel';
  const { reduceMotion } = useAccessibility();
  const slot = useSharedValue(0);
  const start = useSharedValue(0);
  const lift = useSharedValue(0);
  const passed = useSharedValue(-1);
  const count = NAV.length;
  const lens = useAnimatedStyle(() => {
    const p = Math.max(-0.12, Math.min(count - 0.88, position.get()));
    // Stretch a little while travelling between tabs, like a liquid drop.
    const travel = Math.abs(p - Math.round(p));
    return {
      width: slot.get(),
      opacity: slot.get() ? 1 : 0,
      transform: [{ translateX: p * slot.get() }, { scaleX: 1 + travel * 0.18 + lift.get() * 0.08 }, { scaleY: 1 + lift.get() * 0.14 - travel * 0.06 }],
    };
  });
  const tick = () => haptic('tick');
  const drag = Gesture.Pan().enabled(enabled).activeOffsetX([-8, 8]).failOffsetY([-14, 14])
    .onStart(() => {
      cancelAnimation(position); start.set(position.get()); passed.set(Math.round(position.get()));
      lift.set(reduceMotion ? 1 : withSpring(1, springs.press));
    })
    .onUpdate(event => {
      const next = Math.max(-0.12, Math.min(count - 0.88, start.get() + event.translationX / (slot.get() || 1)));
      position.set(next);
      const over = Math.max(0, Math.min(count - 1, Math.round(next)));
      if (over !== passed.get()) { passed.set(over); scheduleOnRN(tick); }
    })
    .onEnd(event => {
      const target = Math.max(0, Math.min(count - 1, Math.round(position.get() + event.velocityX / (slot.get() || 1) * 0.12)));
      const velocity = event.velocityX / (slot.get() || 1);
      if (target === Math.round(start.get())) { position.set(reduceMotion ? target : withSpring(target, { ...springs.page, velocity })); return; }
      // The pager commits the page once the slide has (almost) landed.
      pending.set(target);
      position.set(reduceMotion ? target : withSpring(target, { ...springs.page, velocity }));
    })
    .onFinalize(() => { lift.set(reduceMotion ? 0 : withSpring(0, springs.settle)); });
  return <GestureDetector gesture={drag}>
    <View accessibilityRole="tablist" style={styles.dockTabs} onLayout={event => slot.set(event.nativeEvent.layout.width / count)}>
      <Animated.View pointerEvents="none" style={[styles.dockLens, {
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.72)',
        borderColor: theme.dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)',
        boxShadow: theme.dark ? '0 2px 10px rgba(0,0,0,0.35)' : '0 2px 10px rgba(40,60,120,0.14)',
      }, pixel && { borderRadius: 2, borderWidth: 2, borderColor: theme.dark ? '#101115' : '#3a332b', backgroundColor: theme.dark ? '#555a66' : '#fffaf0', boxShadow: 'inset -2px -2px 0 rgba(0,0,0,0.18)' }, lens]} />
      {NAV.map(item => <NavItem key={item.key} item={item} compact plain selected={tab === item.key} onPress={() => onSelect(item.key)} />)}
    </View>
  </GestureDetector>;
}

function NavItem({ item, compact, plain, selected, onPress }: { item: typeof NAV[number]; compact?: boolean; plain?: boolean; selected: boolean; onPress: () => void }) {
  const styles = usePixelStyles(baseStyles);
  const theme = useTheme();
  const family = fontFamily(useGlass().font);
  const { reduceMotion } = useAccessibility();
  const active = useSharedValue(selected && !plain ? 1 : 0);
  useEffect(() => {
    const on = Number(selected && !plain);
    active.value = reduceMotion ? on : withSpring(on, springs.settle);
  }, [active, reduceMotion, selected, plain]);
  const highlight = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: reduceMotion ? 1 : 0.92 + active.value * 0.08 }],
  }));
  const color = selected ? theme.blue : theme.secondary;
  return <PressSurface accessibilityRole="tab" accessibilityState={{ selected }} aria-selected={selected} onPress={onPress} style={compact && { flex: 1 }}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, highlight, { backgroundColor: theme.tint, borderRadius: metrics.radius.md }]} />
    <View style={[styles.navItem, compact && styles.compactNavItem]}>
      <Icon name={item.icon} size={21} color={color} />
      <Text numberOfLines={1} style={{ fontSize: compact ? 11 : 14, color, fontWeight: selected ? '700' : '500', fontFamily: family }}>
        {compact ? item.key === 'timetable' ? '课表' : item.key === 'planner' ? '规划' : '工具' : item.title}
      </Text>
    </View>
  </PressSurface>;
}

const baseStyles = StyleSheet.create({
  shell: { flex: 1, minHeight: 0, overflow: 'hidden' },
  root: { flex: 1, minHeight: 0, overflow: 'hidden', flexDirection: 'row' },
  dockRow: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dockBar: { flex: 1, height: 64, padding: 5 },
  dockAction: { width: 64, height: 64 },
  dockActionClip: { overflow: 'hidden' },
  // Round clip for the glass button, so its shadow is not cut into a square.
  dockActionRound: { borderRadius: metrics.radius.full },
  dockActionFixed: { position: 'absolute', left: 0, top: 0, width: 64, height: 64 },
  dockActionPress: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.radius.full },
  dragToggle: { minHeight: 36, borderRadius: metrics.radius.full, borderWidth: 1, flexShrink: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: metrics.space.md },
  sidebar: { width: 176, borderRightWidth: 1, padding: 16, paddingTop: 24, gap: 28 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, minHeight: 0, paddingTop: 8, maxWidth: 1550, width: '100%', alignSelf: 'stretch' },
  topline: { minHeight: metrics.touch, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  page: { flex: 1, minHeight: 0, gap: 8 },
  pagerPage: { flex: 1, minHeight: 0, gap: 8 },
  dockTabs: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dockLens: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: metrics.radius.full, borderWidth: 1 },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingBottom: 4 },
  // Pixel style: a hard offset text shadow instead of a soft one.
  pixelHeading: { textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0, letterSpacing: 1 },
  heading: { fontWeight: '700', letterSpacing: -0.6 },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: metrics.touch, paddingHorizontal: 12, gap: 8, borderRadius: metrics.radius.md },
  workspace: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  calendar: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  overviewToolbar: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, minHeight: metrics.touch },
  detailToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  calendarToolbar: { paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  calendarFooter: { paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderTopWidth: 1 },
  controlGroup: { borderRadius: metrics.radius.md, alignSelf: 'center', flexShrink: 0 },
  weekLabel: { alignItems: 'center', minWidth: 52, flexShrink: 1 },
  weekNumber: { fontSize: 13, minWidth: 52, textAlign: 'center', fontWeight: '600', fontVariant: ['tabular-nums'] },
  weekRange: { fontSize: 10, textAlign: 'center', fontVariant: ['tabular-nums'] },
  sideCard: { padding: 16, gap: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: metrics.radius.lg, gap: 16 },
  slot: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  colorBar: { width: 3, height: 32, borderRadius: 2 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 80, padding: 16 },
  toolIcon: { width: 44, height: 44, borderRadius: metrics.radius.md, alignItems: 'center', justifyContent: 'center' },
  navWrap: { position: 'absolute', alignItems: 'center' },
  navItem: { minHeight: metrics.touch, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  compactNavItem: { flexDirection: 'column', justifyContent: 'center', gap: 3, paddingHorizontal: 2, paddingVertical: 4 },
  toastWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 4, minHeight: metrics.touch },
});
