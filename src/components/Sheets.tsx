import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, DAYS, findConflicts, formatTime, parseDate, parseTime, validateEntry, dayOfWeek, type Entry, type Preferences } from '../domain/schedule';
import { CSV_TEMPLATE, analyzeImport, parseDemoImport, parseImport, type ImportResult } from '../domain/import';
import { exportText, pickScheduleFile } from '../services/files';
import { Button, Icon, PressSurface, Reveal, haptic, useAccessibility, useUI, type IconName } from '../ui/primitives';
import { metrics, springs, useTheme } from '../ui/theme';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { hainnu } from '../features/schools';
import { version as APP_VERSION } from '../../package.json';
import { GAP_LEVELS, LEAD_LEVELS } from '../domain/reminders';
import { BLUR_LEVELS, CARD_LEVELS, DIM_LEVELS, PANEL_LEVELS, type Appearance, type CardImageScope } from '../domain/appearance';
import { LinearGradient } from 'expo-linear-gradient';
import { SchoolBrowser } from './SchoolBrowser';
import { normalizeZhengfang, requiredSectionTimes, resolveSchoolPeriodTimes, type SectionTime, type TimetableCapture } from '../features/zhengfang';

const panelSpring = { ...springs.sheet, energyThreshold: 0.00001 };

export function Sheet({ closingRequested = false, title, subtitle, notice, onClose, children, footer, stableHeight }: { closingRequested?: boolean; title: string; subtitle?: string; notice?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode | ((close: () => void) => React.ReactNode); stableHeight?: boolean }) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mobile = width < 700 || height < 520;
  const compact = width < 380 || fontScale > 1.25;
  const padding = compact ? 16 : 24;
  const bottomPadding = mobile ? Math.max(insets.bottom, 12) + 8 : 18;
  const theme = useTheme();
  const ui = useUI();
  const styles = useSheetStyles();
  const { reduceMotion } = useAccessibility();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const panelHeight = useSharedValue(height);
  const origin = useSharedValue(0);
  const closing = useSharedValue(false);

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
    } else {
      progress.set(withSpring(1, panelSpring));
    }
  }, [progress, reduceMotion]);

  const finishClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const close = useCallback(() => {
    if (reduceMotion) {
      finishClose();
      return;
    }
    if (closing.get()) return;
    closing.set(true);
    Keyboard.dismiss();
    progress.set(withSpring(0, { ...panelSpring, overshootClamping: true }, done => {
      if (done) scheduleOnRN(finishClose);
    }));
  }, [closing, finishClose, progress, reduceMotion]);

  useEffect(() => { if (closingRequested) close(); }, [closingRequested, close]);

  const pan = useMemo(() => Gesture.Pan().enabled(mobile && !reduceMotion && !closingRequested).activeOffsetY([-10, 10])
    .onStart(() => {
      cancelAnimation(progress);
      closing.set(false);
      origin.set(progress.get());
    })
    .onUpdate(event => {
      progress.set(Math.max(0, Math.min(1, origin.get() - event.translationY / panelHeight.get())));
    })
    .onEnd(event => {
      const velocity = -event.velocityY / panelHeight.get();
      if (progress.get() + velocity * 0.16 < 0.66) {
        closing.set(true);
        progress.set(withSpring(0, { ...panelSpring, velocity, overshootClamping: true }, done => {
          if (done) scheduleOnRN(finishClose);
        }));
      } else {
        progress.set(withSpring(1, { ...panelSpring, velocity }));
      }
    })
    .onFinalize((_event, success) => {
      if (!success && !closing.get()) progress.set(withSpring(1, panelSpring));
    }), [closing, closingRequested, finishClose, mobile, origin, panelHeight, progress, reduceMotion]);

  const motionStyle = useAnimatedStyle(() => {
    const visible = Math.max(0, Math.min(1, progress.get()));
    const offset = 1 - visible;
    return {
      opacity: mobile ? 1 : visible,
      transform: [{ translateY: offset * (mobile ? panelHeight.get() : 14) }, { scale: mobile ? 1 : 1 - offset * 0.035 }],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, progress.get())) }));

  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}
    accessibilityLabel={Platform.OS === 'web' ? title : undefined}>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, {
      justifyContent: mobile ? 'flex-end' : 'center',
      paddingTop: insets.top + (mobile ? 8 : 16),
      paddingLeft: Math.max(insets.left, mobile ? 0 : 20),
      paddingRight: Math.max(insets.right, mobile ? 0 : 20),
      paddingBottom: mobile ? 0 : insets.bottom + 16,
    }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, backdropStyle]}>
        <Pressable accessible={false} importantForAccessibility="no" tabIndex={-1} style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={event => panelHeight.set(Math.max(1, event.nativeEvent.layout.height))}
        style={[styles.sheet, motionStyle, mobile && styles.bottomSheet, stableHeight && styles.workflowSheet]}
      >
        <GestureDetector gesture={pan}><View collapsable={false}>
          {mobile && <View style={styles.handle} />}
          <View style={[styles.sheetHeader, { paddingHorizontal: padding }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
              {subtitle && <Text style={ui.body}>{subtitle}</Text>}
            </View>
            <Button icon="close" label="关闭面板" variant="ghost" onPress={close} />
          </View>
        </View></GestureDetector>
        <ScrollView style={stableHeight ? styles.workflowScroll : styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={[styles.sheetContent, { paddingHorizontal: padding, paddingBottom: footer ? 22 : bottomPadding }]}>
          {!footer && !!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>}
          {children}
        </ScrollView>
        {footer && <View style={[styles.footer, { paddingHorizontal: padding, paddingBottom: bottomPadding }]}>
          {!!notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{notice}</Text>}
          <View style={styles.footerRow}>{typeof footer === 'function' ? footer(close) : footer}</View>
        </View>}
      </Animated.View>
    </KeyboardAvoidingView>
    </GestureHandlerRootView>
  </Modal>;
}

export function Field({ label, value, onChange, placeholder, multiline, numeric }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean }) {
  const theme = useTheme();
  const styles = useSheetStyles();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      cursorColor={theme.blue}
      selectionColor={theme.accentLine}
      keyboardAppearance={theme.dark ? 'dark' : 'light'}
      multiline={multiline}
      keyboardType={numeric ? 'number-pad' : 'default'}
      style={[styles.input, focused && styles.inputFocused, multiline && styles.inputMultiline]}
    />
  </View>;
}

export function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  const theme = useTheme();
  const ui = useUI();
  const { reduceMotion } = useAccessibility();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => { on.set(reduceMotion ? Number(value) : withSpring(Number(value), springs.press)); }, [on, reduceMotion, value]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: on.get() * 20 }] }));
  return <PressSurface accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} aria-checked={value} scale={0.99}
    onPress={() => { haptic(value ? 'toggleOff' : 'toggleOn'); onChange(!value); }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: metrics.touch }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: metrics.type.body, color: theme.ink, fontWeight: '600' }}>{label}</Text>
        {!!detail && <Text style={ui.label}>{detail}</Text>}
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? theme.blue : theme.line }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }, knob]} />
      </View>
    </View>
  </PressSurface>;
}

function Choices<T extends string>({ label, items, value, onChange }: { label: string; items: { key: T; title: string; icon?: IconName }[]; value: T; onChange: (value: T) => void }) {
  const styles = useSheetStyles();
  const theme = useTheme();
  return <View style={styles.segment} accessibilityLabel={label}>
    {items.map(item => {
      const selected = value === item.key;
      const color = selected ? theme.blue : theme.secondary;
      return <PressSurface
        key={item.key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => {
          if (selected) return;
          haptic();
          onChange(item.key);
        }}
        style={[styles.segmentItem, selected && styles.segmentSelected]}
      >
        <View style={styles.segmentContent}>
          {item.icon && <Icon name={item.icon} size={17} color={color} />}
          <Text style={[styles.segmentLabel, { color }]}>{item.title}</Text>
        </View>
      </PressSurface>;
    })}
  </View>;
}

export function EntrySheet({ closingRequested = false, entry, entries, semesterWeeks, isNew, onClose, onSave, onDelete, cardImage = null, onPickImage }: {
  closingRequested?: boolean; entry: Entry; entries: Entry[]; semesterWeeks: number; isNew: boolean; onClose: () => void;
  onSave: (entry: Entry, image?: { scope: CardImageScope; uri: string | null; frost?: boolean }) => void; onDelete: (id: string) => void;
  cardImage?: { uri: string; scope: CardImageScope; frost?: boolean } | null; onPickImage?: () => Promise<string | null>;
}) {
  const theme = useTheme();
  const ui = useUI();
  const styles = useSheetStyles();
  const { width, fontScale } = useWindowDimensions();
  const wrapDays = width < 350 || fontScale > 1.25;
  const [draft, setDraft] = useState(entry);
  const [start, setStart] = useState(formatTime(entry.start));
  const [end, setEnd] = useState(formatTime(entry.end));
  const [startWeek, setStartWeek] = useState(String(entry.startWeek));
  const [endWeek, setEndWeek] = useState(String(entry.endWeek));
  const [weekList, setWeekList] = useState(entry.weeks?.join('、') ?? '');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // Picture changes are only applied when the entry is saved.
  const [imageScope, setImageScope] = useState<CardImageScope>(cardImage?.scope ?? 'title');
  const [image, setImage] = useState<string | null>(cardImage?.uri ?? null);
  const [frosted, setFrosted] = useState(!!cardImage?.frost);
  const imageChanged = image !== (cardImage?.uri ?? null) || (!!image && (imageScope !== cardImage?.scope || frosted !== !!cardImage?.frost));
  const clearValidation = () => { setConflict(false); setError(''); };
  const update = (value: Partial<Entry>) => { setDraft(current => ({ ...current, ...value })); clearValidation(); };
  function save() {
    try {
      const next = { ...draft, title: draft.title.trim(), start: parseTime(start), end: parseTime(end), startWeek: Number(startWeek), endWeek: Number(endWeek) };
      if (entry.weeks) {
        const values = weekList.trim().split(/[、，,\s]+/);
        if (!values.every(value => /^\d+$/.test(value))) throw new Error('请填写整数周次，以逗号或顿号分隔');
        next.weeks = [...new Set(values.map(Number))].sort((a, b) => a - b);
        next.startWeek = next.weeks[0];
        next.endWeek = next.weeks[next.weeks.length - 1];
      }
      const invalid = validateEntry(next, semesterWeeks);
      if (invalid) return setError(invalid);
      const conflicts = findConflicts(next, entries);
      if (conflicts.length && !conflict) {
        setConflict(true);
        const firstTitle = conflicts[0].title;
        const title = firstTitle.length > 24 ? `${firstTitle.slice(0, 24)}…` : firstTitle;
        return setError(`与「${title}」${conflicts.length > 1 ? `等 ${conflicts.length} 条安排` : ''}时间重叠。请调整时间，或选择仍然保存。`);
      }
      onSave(next, imageChanged ? { scope: image ? imageScope : (cardImage?.scope ?? imageScope), uri: image, frost: frosted } : undefined);
    } catch (error) { setError(error instanceof Error ? error.message : '请检查填写的信息'); }
  }
  return <Sheet closingRequested={closingRequested} title={`${isNew ? '添加' : '编辑'}${draft.kind === 'course' ? '课程' : '安排'}`} notice={error} onClose={onClose} footer={close => <>
    {!isNew && <Button icon="trash" variant="danger" small onPress={() => deleteConfirm ? onDelete(draft.id) : setDeleteConfirm(true)} label={deleteConfirm ? '确认删除这条安排' : '删除'}>{deleteConfirm ? '确认删除' : undefined}</Button>}
    <View style={styles.footerActions}>
      <Button variant="ghost" small onPress={close}>取消</Button>
      <Button variant="primary" icon="check" small onPress={save}>{conflict ? '仍然保存' : '保存'}</Button>
    </View>
  </>}>
    <Choices<Entry['kind']> label="安排类型" value={draft.kind} onChange={kind => update({ kind, color: kind === 'plan' ? 'green' : 'blue' })}
      items={[{ key: 'course', title: '课程', icon: 'book' }, { key: 'plan', title: '自由安排', icon: 'leaf' }]} />
    <Field label={draft.kind === 'course' ? '课程名称' : '安排名称'} value={draft.title} onChange={title => update({ title })} placeholder={draft.kind === 'course' ? '例如：高等数学 A' : '想用这段时间做些什么？'} />
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>星期</Text>
      <View style={styles.weekdays}>
        {DAYS.map((day, i) => {
          const selected = draft.day === i;
          return <PressSurface
            key={day}
            accessibilityRole="button"
            accessibilityLabel={day}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) { haptic(); update({ day: i }); } }}
            style={[styles.weekday, wrapDays && styles.weekdayWrapped, selected && styles.weekdaySelected]}
          >
            <Text style={[styles.weekdayText, selected && { color: theme.onAccent }]}>{day.slice(1)}</Text>
          </PressSurface>;
        })}
      </View>
    </View>
    <View style={styles.fieldPair}>
      <Field label="开始时间" value={start} placeholder="08:00" onChange={value => { setStart(value); clearValidation(); }} />
      <Field label="结束时间" value={end} placeholder="09:40" onChange={value => { setEnd(value); clearValidation(); }} />
    </View>
    {entry.weeks ? <Field label="上课周次" value={weekList} onChange={value => { setWeekList(value); clearValidation(); }} placeholder="例如：1、3、6、8" /> : <>
      <View style={styles.fieldPair}>
        <Field label="开始周" value={startWeek} numeric onChange={value => { setStartWeek(value); clearValidation(); }} />
        <Field label="结束周" value={endWeek} numeric onChange={value => { setEndWeek(value); clearValidation(); }} />
      </View>
      <Choices<Entry['parity']> label="重复频率" value={draft.parity} onChange={parity => update({ parity })}
        items={[{ key: 'all', title: '每周' }, { key: 'odd', title: '单周' }, { key: 'even', title: '双周' }]} />
    </>}
    <View style={styles.fieldPair}>
      <Field label="地点" value={draft.location} onChange={location => update({ location })} placeholder="选填" />
      {draft.kind === 'course' && <Field label="教师" value={draft.teacher} onChange={teacher => update({ teacher })} placeholder="选填" />}
    </View>
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>标记颜色</Text>
      <View style={styles.swatches}>
        {Object.entries(COLORS).map(([key, color], i) => {
          const selected = draft.color === key;
          return <PressSurface
            key={key}
            accessibilityRole="button"
            accessibilityLabel={['蓝色', '紫色', '绿色', '橙色', '粉色'][i]}
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) { haptic(); update({ color: key as Entry['color'] }); } }}
            style={[styles.swatch, { borderColor: selected ? theme.blue : theme.line }]}
          >
            <View style={[styles.swatchDot, { backgroundColor: color.bg }]}>
              {selected ? <Icon name="check" size={17} color={color.text} strokeWidth={2} /> : <View style={[styles.colorDot, { backgroundColor: color.accent }]} />}
            </View>
          </PressSurface>;
        })}
      </View>
    </View>
    {onPickImage && <View style={styles.field}>
      <Text style={styles.fieldLabel}>首页卡片图片</Text>
      <View style={styles.cardImageRow}>
        <View testID="card-image-preview" style={styles.cardThumb}>
          {image ? <Image source={{ uri: image }} blurRadius={frosted ? 8 : 0} resizeMode="cover" style={StyleSheet.absoluteFill} />
            : <LinearGradient colors={[COLORS[draft.color].accent, COLORS[draft.color].text]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          <Text numberOfLines={1} style={styles.cardThumbText}>{draft.title || '未命名'}</Text>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Button small icon="image" onPress={async () => { const uri = await onPickImage(); if (uri) { haptic('success'); setImage(uri); } }}>{image ? '更换图片' : '选择图片'}</Button>
          {!!image && <Button small variant="ghost" icon="close" onPress={() => { haptic('light'); setImage(null); }}>移除图片</Button>}
        </View>
      </View>
      {!!image && <Choices<CardImageScope> label="图片用于" value={imageScope} onChange={setImageScope}
        items={[{ key: 'title', title: '同名课程全部' }, { key: 'entry', title: '仅这一条' }]} />}
      {!!image && <Toggle label="雾化图片" detail="给图片加一层磨砂玻璃，画面更柔和，文字更清楚" value={frosted} onChange={setFrosted} />}
      <Text style={styles.hint}>{image ? imageScope === 'title' ? `所有「${draft.title.trim() || '同名'}」卡片都会使用这张图片；单独设置过的卡片仍保留自己的图片。` : '只有这一条卡片使用这张图片，会覆盖同名课程的统一图片。' : '未设置图片时使用标记颜色的渐变。'}</Text>
    </View>}
    <Field label="备注" value={draft.notes} onChange={notes => update({ notes })} multiline placeholder="给未来的自己留句话…" />
    <Text style={ui.body}>修改将应用于上述周次内的这条{draft.kind === 'course' ? '课程' : '安排'}。</Text>
  </Sheet>;
}

export function ImportSheet({ closingRequested = false, semesterWeeks, demo, existingEntries, onClose, onImport }: { closingRequested?: boolean; semesterWeeks: number; demo: boolean; existingEntries: Entry[]; onClose: () => void; onImport: (entries: Entry[], replace: boolean, preferences?: Preferences) => string | undefined }) {
  const theme = useTheme();
  const ui = useUI();
  const styles = useSheetStyles();
  const [tab, setTab] = useState<'school' | 'file'>('school');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [replace, setReplace] = useState(true);
  const [restorePreferences, setRestorePreferences] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [visibleRows, setVisibleRows] = useState(20);
  const [browserOpen, setBrowserOpen] = useState(Platform.OS !== 'web');
  const [capture, setCapture] = useState<TimetableCapture | null>(null);
  const [timeSource, setTimeSource] = useState('');
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState<SectionTime[]>([]);
  function receiveTimetable(data: TimetableCapture) {
    setBrowserOpen(false);
    const resolved = resolveSchoolPeriodTimes(data, hainnu);
    setCapture(resolved.capture);
    setTimeSource(resolved.source);
    setTimeDraft(requiredSectionTimes(resolved.capture));
    setTimeEditorOpen(false);
    setTab('school');
    setError('');
    try {
      showPreview(normalizeZhengfang(resolved.capture, resolved.capture.periodTimes, semesterWeeks, hainnu.id), data.term || hainnu.name);
    } catch (error) {
      showPreview(null);
      setError(error instanceof Error ? error.message : '时间识别失败，请重新打开教务课表识别');
    }
  }
  function applyPeriodTimes() {
    if (!capture) return;
    try {
      if (timeDraft.some(time => !time.start.trim() || !time.end.trim())) throw new Error('请补全每一节的开始和结束时间。');
      const next = { ...capture, periodTimes: timeDraft.map(time => ({ ...time, start: time.start.trim(), end: time.end.trim() })) };
      const preview = normalizeZhengfang(next, next.periodTimes, semesterWeeks, hainnu.id);
      setCapture(next); setTimeSource('已使用你核对后的作息时间'); setTimeEditorOpen(false); setError('');
      showPreview(preview, next.term || hainnu.name);
    } catch (error) { setError(error instanceof Error ? error.message : '请检查作息时间'); }
  }
  function showPreview(preview: ImportResult | null, name = '') {
    setResult(preview);
    setFileName(name);
    setSkipped(new Set());
    setVisibleRows(20);
    setReplace(true);
    setRestorePreferences(true);
  }
  function changeTab(value: 'school' | 'file') {
    if (busy) return;
    showPreview(null);
    setError('');
    setNotice('');
    setTab(value);
    setCapture(null);
  }
  async function chooseFile() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { const file = await pickScheduleFile(); if (file) showPreview(parseImport(file.text, file.name, semesterWeeks), file.name); }
    catch (error) { showPreview(null); setError(error instanceof Error ? error.message : '文件读取失败'); }
    finally { setBusy(false); }
  }
  function parsePaste() {
    setNotice('');
    try { showPreview(parseImport(paste, '课表.csv', semesterWeeks), '粘贴的课表'); setError(''); }
    catch (error) { showPreview(null); setError(error instanceof Error ? error.message : '内容无法解析'); }
  }
  function loadDemo() {
    setCapture(null);
    setError('');
    try { showPreview(parseDemoImport(semesterWeeks), '教务导入演示'); }
    catch (error) { showPreview(null); setError(error instanceof Error ? error.message : '演示课表无法识别'); }
  }
  async function template() {
    setNotice('');
    setError('');
    try {
      await exportText('\uFEFF' + CSV_TEMPLATE, '课序-课表模板.csv', 'text/csv');
      setNotice('CSV 模板已准备好');
    }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败'); }
  }
  const preferences = restorePreferences ? result?.preferences : undefined;
  const selected = useMemo(() => result?.entries.filter(entry => !skipped.has(entry.id)) ?? [], [result, skipped]);
  const canReplace = selected.length > 0;
  const shouldReplace = canReplace && replace;
  const analysis = useMemo(() => analyzeImport(selected, existingEntries, shouldReplace, demo), [selected, existingEntries, shouldReplace, demo]);
  const importDisabled = busy || (!analysis.entries.length && !preferences);
  function confirmImport() {
    const failure = onImport(selected, shouldReplace, preferences);
    if (failure) setError(failure);
  }
  if (browserOpen) return <SchoolBrowser school={hainnu} onClose={() => setBrowserOpen(false)} onCapture={receiveTimetable} />;
  return <Sheet closingRequested={closingRequested} title="导入课表" subtitle="选择导入来源，再核对课程、时间和周次。" notice={error} onClose={onClose} stableHeight footer={close => <View style={styles.footerActions}>
    <Button variant="ghost" small onPress={close}>关闭</Button>
    {result && <Button icon="check" variant="primary" small disabled={importDisabled} onPress={confirmImport}>
      {analysis.entries.length ? `导入 ${analysis.entries.length} 条` : preferences ? '恢复学期设置' : '导入'}
    </Button>}
  </View>}>
    <Choices<'school' | 'file'> label="导入方式" value={tab} onChange={changeTab}
      items={[{ key: 'school', title: '学校教务', icon: 'school' }, { key: 'file', title: '课表文件', icon: 'file' }]} />
    {tab === 'school' ? <Reveal key="school" style={styles.group}>
      <View style={styles.school}>
        <View style={styles.schoolLogo}><Icon name="school" size={24} color={theme.blue} /></View>
        <View style={styles.detail}>
          <Text style={styles.itemTitle}>{hainnu.name}</Text>
          <Text style={ui.label}>{hainnu.systemName} · 自动识别个人课表</Text>
        </View>
      </View>
      {!capture && !result && <View style={styles.steps}>{[
        ['登录学校教务', '在内置浏览器中登录，进入学生个人课表。'],
        ['自动识别课表', '选择学期并查询，自动检测课程、时间与节数。'],
        ['核对后保存', '自动生成预览，核对单双周、教室和教师后导入。'],
      ].map(([title, body], i) => <View key={title} style={styles.stepRow}>
        <View style={styles.step}><Text style={styles.stepNumber}>{i + 1}</Text></View>
        <View style={styles.detail}><Text style={styles.itemTitle}>{title}</Text><Text style={ui.body}>{body}</Text></View>
      </View>)}</View>}
      {Platform.OS === 'web' ? <>
        <Text style={ui.body}>网页预览受浏览器跨域限制，无法读取学校登录后的课表。请在 Android / iOS App 使用内置浏览器自动导入，或在此导入课表文件。</Text>
        <Button icon="arrow" onPress={() => { void Linking.openURL(hainnu.authUrl).catch(() => setError('暂时无法打开学校教务系统')); }}>在浏览器打开学校教务</Button>
      </> : <Button variant="primary" icon="globe" onPress={() => setBrowserOpen(true)}>{capture ? '重新打开教务课表' : '打开内置浏览器导入'}</Button>}
      {!capture && <>
        <Button icon="file" onPress={() => changeTab('file')}>继续导入课表文件</Button>
        <Button icon="school" onPress={loadDemo}>体验教务导入演示</Button>
      </>}
      {capture && <View style={styles.group}>
        <Text style={styles.itemTitle}>已识别 {capture.courses.length} 条上课安排{capture.term ? ` · ${capture.term}` : ''}</Text>
        <Text style={ui.body}>请确认这是要导入的完整学期课表。学期起始日期沿用当前设置。</Text>
        <Text style={ui.body}>{timeSource ? `网页未提供的钟点时间已补充：${timeSource}。` : '优先使用学校页面提供的时间。'}已有 {requiredSectionTimes(capture).filter(time => time.start && time.end).length} 段作息，请核对后导入。</Text>
        <Button small variant="ghost" onPress={() => setTimeEditorOpen(value => !value)}>{timeEditorOpen ? '收起作息时间' : '核对或调整作息时间'}</Button>
        {timeEditorOpen && <View style={styles.group}>
          {timeDraft.map((time, index) => <View key={time.section} style={styles.fieldPair}>
            <Field label={`第 ${time.section}${time.endSection ? `–${time.endSection}` : ''} 节开始`} value={time.start} placeholder="08:00"
              onChange={start => setTimeDraft(current => current.map((item, i) => i === index ? { ...item, start } : item))} />
            <Field label="结束时间" value={time.end} placeholder="08:45"
              onChange={end => setTimeDraft(current => current.map((item, i) => i === index ? { ...item, end } : item))} />
          </View>)}
          <Button onPress={applyPeriodTimes}>应用作息并更新预览</Button>
        </View>}
        {!!result?.errors.length && <Text style={ui.body}>缺少时间时可在上方补充作息；其他字段缺失时请重新打开教务课表查询。已完整识别的课程仍可导入。</Text>}
      </View>}
    </Reveal> : <Reveal key="file" style={styles.group}>
      <PressSurface accessibilityRole="button" accessibilityLabel={busy ? '正在读取课表文件' : '选择课表文件'}
        accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={chooseFile} style={styles.dropzone}>
        <View style={styles.dropzoneContent}>
          <View style={styles.importIcon}>
            {busy ? <ActivityIndicator color={theme.blue} /> : <Icon name="import" size={25} color={theme.blue} />}
          </View>
          <Text numberOfLines={2} style={[styles.itemTitle, styles.centerText]}>{busy ? '正在读取…' : fileName || '选择课表文件'}</Text>
          <Text style={[ui.label, styles.centerText]}>{fileName ? '轻触更换文件 · HTML / CSV / JSON' : 'HTML / CSV / JSON · 最大 2 MB'}</Text>
        </View>
      </PressSurface>
      <View style={styles.fileActions}>
        <Button icon="file" variant="ghost" small onPress={template}>下载 CSV 模板</Button>
        <Button variant="ghost" small selected={showPaste} onPress={() => setShowPaste(value => !value)}>{showPaste ? '收起粘贴' : '粘贴 CSV 内容'}</Button>
      </View>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
      <Text style={ui.body}>HTML 请使用课序 HTML 模板。CSV 需包含课程名称、星期、开始时间和结束时间。Excel 可另存为 UTF-8 CSV。</Text>
      {showPaste && <Reveal style={styles.group}>
        <Field label="CSV 内容" value={paste} onChange={value => {
          setPaste(value);
          showPreview(null);
          setError('');
        }} multiline placeholder="在此粘贴 CSV 文本" />
        <Button disabled={busy || !paste.trim()} onPress={parsePaste}>预览内容</Button>
      </Reveal>}
    </Reveal>}
    {result && <View style={styles.preview}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.itemTitle}>导入预览 · 已选 {selected.length}/{result.entries.length} 条</Text>
      {tab === 'school' && <Text style={ui.body}>{capture ? '课程来自学校教务课表，确认后保存到本机。' : '演示数据来自内置模拟课表，确认后会加入本地课表。'}</Text>}
      <Text style={ui.body}>目标学期共 {preferences?.semesterWeeks ?? semesterWeeks} 周，可取消勾选不需要的条目。</Text>
      {canReplace && <Checkbox checked={replace} onChange={checked => { setReplace(checked); setError(''); }} label={demo ? '覆盖全部示例内容' : '覆盖现有课程（保留个人安排）'} />}
      <Text style={ui.body}>{shouldReplace ? '确认后以本次勾选的课程覆盖原课表，导入后可撤销。' : '当前为合并导入：保留现有安排，并跳过重复条目。'}</Text>
      {!!analysis.duplicateCount && <Text accessibilityLiveRegion="polite" style={ui.body}>{analysis.duplicateCount} 条重复安排会自动跳过。</Text>}
      {!!analysis.conflictCount && <Text accessibilityLiveRegion="polite" style={styles.error}>{analysis.conflictCount} 条待导入安排有时间重叠。确认导入将保留这些安排。</Text>}
      {result.entries.slice(0, visibleRows).map(entry => {
        const weeks = entry.weeks
          ? `第 ${entry.weeks.join('、')} 周`
          : `第 ${entry.startWeek}–${entry.endWeek} 周${entry.parity === 'all' ? '' : entry.parity === 'odd' ? ' · 单周' : ' · 双周'}`;
        const label = [entry.title, `${DAYS[entry.day]} ${formatTime(entry.start)}–${formatTime(entry.end)}`, weeks, entry.location, entry.teacher].filter(Boolean).join(' · ');
        return <View key={entry.id} style={styles.previewItem}>
          <Checkbox checked={!skipped.has(entry.id)} label={label} onChange={checked => {
            setError('');
            setSkipped(previous => {
              const next = new Set(previous);
              if (checked) next.delete(entry.id);
              else next.add(entry.id);
              return next;
            });
          }} />
        </View>;
      })}
      {result.entries.length > visibleRows && <Button small variant="ghost" onPress={() => setVisibleRows(count => count + 20)}>显示更多条目</Button>}
      {result.errors.slice(0, 8).map((message, i) => <Text key={i} style={styles.error}>{message}</Text>)}
      {!!result.errors.length && <Text accessibilityLiveRegion="polite" style={ui.body}>{result.errors.length} 条异常记录已排除，可导入有效条目或修正文件后重试。</Text>}
      {!result.entries.length && !result.preferences && !result.errors.length && <Text style={ui.body}>来源中没有可导入的课程或设置。</Text>}
      {result.preferences && <Checkbox checked={restorePreferences} onChange={checked => { setRestorePreferences(checked); setError(''); }} label="同时恢复学期日期和周数" />}
    </View>}
  </Sheet>;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  const theme = useTheme();
  const styles = useSheetStyles();
  return <PressSurface accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}
    onPress={() => { haptic(); onChange(!checked); }}>
    <View style={styles.checkboxRow}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Icon name="check" size={15} color={theme.onAccent} strokeWidth={2} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  </PressSurface>;
}

export function SettingsSheet({ closingRequested = false, preferences, onSave, onClose, onExport, onClearDemo, demo, appearance, onAppearance, onPickBackground, onEnableReminders }: {
  closingRequested?: boolean; preferences: Preferences; onSave: (preferences: Preferences) => void; onClose: () => void; onExport: () => Promise<void>; onClearDemo: () => void; demo: boolean;
  appearance?: Appearance; onAppearance?: (patch: Partial<Appearance>) => void; onPickBackground?: () => Promise<string | null>;
  /** Asks for notification permission; resolves to whether reminders can be turned on. */
  onEnableReminders?: () => Promise<boolean>;
}) {
  const theme = useTheme();
  const ui = useUI();
  const styles = useSheetStyles();
  const [start, setStart] = useState(preferences.semesterStart);
  const [weeks, setWeeks] = useState(String(preferences.semesterWeeks));
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  function save() {
    try {
      const date = parseDate(start);
      if (dayOfWeek(date) !== 0) return setError('请选择开学第一周的周一日期');
      if (!Number.isInteger(+weeks) || +weeks < 1 || +weeks > 30) return setError('学期长度应为 1–30 周');
      onSave({ ...preferences, semesterStart: start, semesterWeeks: +weeks });
    } catch (error) { setError(error instanceof Error ? error.message : '日期格式无效'); }
  }
  async function backup() {
    if (exporting) return;
    setExporting(true);
    setBackupReady(false);
    setError('');
    try {
      await onExport();
      setBackupReady(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  }
  return <Sheet closingRequested={closingRequested} title="偏好设置" subtitle="管理学期和本地数据。" notice={error} onClose={onClose} footer={<View style={styles.footerActions}>
    <Button variant="primary" icon="check" onPress={save}>保存设置</Button>
  </View>}>
    <View style={styles.school}>
      <View style={styles.schoolLogo}><Icon name="school" color={theme.blue} /></View>
      <View style={styles.detail}>
        <Text style={styles.itemTitle}>{preferences.school}</Text>
        <Text style={ui.label}>当前学校</Text>
      </View>
    </View>
    <Field label="学期开始日期（第一周的周一）" value={start} onChange={value => { setStart(value); setError(''); }} placeholder="2026-08-31" />
    <Field label="学期周数" value={weeks} onChange={value => { setWeeks(value); setError(''); }} numeric />
    <Text style={ui.body}>课程按学期开始日期计算周次。学期范围外的课程会暂时隐藏。</Text>
    {appearance && onAppearance && <>
      <View style={styles.divider} />
      <View style={styles.group}>
        <Text accessibilityRole="header" style={styles.itemTitle}>外观与操作</Text>
        <View style={styles.cardImageRow}>
          <View testID="background-preview" style={[styles.bgThumb, { backgroundColor: theme.bg }]}>
            {appearance.background ? <>
              <Image source={{ uri: appearance.background }} resizeMode="cover" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: appearance.backgroundDim }]} />
            </> : <Icon name="image" size={24} color={theme.muted} />}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Button small icon="image" onPress={async () => { const uri = await onPickBackground?.(); if (uri) { haptic('success'); onAppearance({ background: uri }); } }}>{appearance.background ? '更换背景图片' : '选择背景图片'}</Button>
            {!!appearance.background && <Button small variant="ghost" icon="close" onPress={() => { haptic('light'); onAppearance({ background: null }); }}>恢复默认背景</Button>}
          </View>
        </View>
        {!!appearance.background && <Choices<string> label="背景遮罩" value={String(appearance.backgroundDim)} onChange={value => onAppearance({ backgroundDim: Number(value) })}
          items={DIM_LEVELS.map(level => ({ key: String(level.value), title: `遮罩${level.title}` }))} />}
        <Choices<string> label="界面透明度" value={String(appearance.glassPanel)} onChange={value => onAppearance({ glassPanel: Number(value) })}
          items={PANEL_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
        <Choices<string> label="雾化强度" value={String(appearance.glassBlur)} onChange={value => onAppearance({ glassBlur: Number(value) })}
          items={BLUR_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
        <Choices<string> label="课程卡片" value={String(appearance.glassCard)} onChange={value => onAppearance({ glassCard: Number(value) })}
          items={CARD_LEVELS.map(level => ({ key: String(level.value), title: level.title }))} />
        <Toggle label="边缘光晕" detail="玻璃边缘带一圈柔和的光" value={appearance.glow} onChange={glow => onAppearance({ glow })} />
        <Toggle label="启动问候" detail="打开时先显示一句问候，再揭开课表；轻点可跳过" value={appearance.greeting} onChange={greeting => onAppearance({ greeting })} />
        <Toggle label="允许拖动调整课程" detail="关闭后，课表详情里的课程只能点开编辑，避免误触移动" value={appearance.dragEnabled} onChange={dragEnabled => onAppearance({ dragEnabled })} />
        <Toggle label="振动反馈" detail="切换页面、翻卡片、拖动吸附和保存时轻微振动" value={appearance.haptics} onChange={haptics => onAppearance({ haptics })} />
      </View>
      <View style={styles.divider} />
      <View style={styles.group}>
        <Text accessibilityRole="header" style={styles.itemTitle}>上课提醒</Text>
        <Toggle label="课前通知" detail={Platform.OS === 'web' ? '网页版不支持系统通知，请在手机 App 中开启' : '每节课开始前，用系统通知弹窗提醒你'} value={appearance.reminders.enabled}
          onChange={async enabled => {
            if (enabled && !(await onEnableReminders?.())) return;
            onAppearance({ reminders: { ...appearance.reminders, enabled } });
          }} />
        {appearance.reminders.enabled && <>
          <Text style={styles.hint}>提前多久提醒</Text>
          <Choices<string> label="提前多久提醒" value={String(appearance.reminders.lead)} onChange={value => onAppearance({ reminders: { ...appearance.reminders, lead: Number(value) } })}
            items={LEAD_LEVELS.map(minutes => ({ key: String(minutes), title: `${minutes} 分钟` }))} />
          <Text style={styles.hint}>上一节下课后不到这么久，就不再提醒下一节</Text>
          <Choices<string> label="连堂不提醒的间隔" value={String(appearance.reminders.gap)} onChange={value => onAppearance({ reminders: { ...appearance.reminders, gap: Number(value) } })}
            items={GAP_LEVELS.map(minutes => ({ key: String(minutes), title: minutes ? `${minutes} 分钟` : '都提醒' }))} />
          <Toggle label="个人安排也提醒" detail="默认只提醒课程" value={appearance.reminders.plans} onChange={plans => onAppearance({ reminders: { ...appearance.reminders, plans } })} />
          <Text style={styles.hint}>提醒会提前排好未来一周；之后打开一次课序即可继续排下去。</Text>
        </>}
      </View>
    </>}
    <View style={styles.divider} />
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.itemTitle}>备份与数据</Text>
      <Text style={ui.body}>数据保存在当前设备。换设备时，可用导出的 JSON 文件恢复课表。</Text>
      <Button icon="import" disabled={exporting} onPress={backup}>{exporting ? '正在准备备份…' : '导出完整备份'}</Button>
      {backupReady && <Text accessibilityLiveRegion="polite" style={styles.success}>备份文件已准备好</Text>}
      {demo && <Button variant="danger" icon="trash" onPress={onClearDemo}>清空示例课表</Button>}
    </View>
    <Text testID="about-publisher" style={[ui.label, { textAlign: 'center', paddingVertical: 8 }]}>课序 ClassFlow {APP_VERSION} · Inno-Mon Studio 出品</Text>
  </Sheet>;
}

function useSheetStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create({
    overlay: { flex: 1, alignItems: 'center' },
    sheet: {
      width: '100%', maxWidth: 560, maxHeight: '100%', flexShrink: 1, backgroundColor: theme.surface,
      borderRadius: metrics.radius.xl, borderWidth: 1, borderColor: theme.line, overflow: 'hidden',
      boxShadow: `0 20px 72px ${theme.shadow}`,
    },
    bottomSheet: { maxWidth: 680, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
    workflowSheet: { height: 620 },
    handle: { width: 36, height: 4, backgroundColor: theme.line, borderRadius: 3, alignSelf: 'center', marginTop: 10 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: metrics.space.sm },
    sheetTitle: { fontSize: 24, fontWeight: '700', color: theme.ink },
    scroll: { flexGrow: 0, flexShrink: 1 },
    workflowScroll: { flex: 1 },
    sheetContent: { paddingTop: metrics.space.xs, gap: metrics.space.md },
    footer: { paddingTop: 10, borderTopWidth: 1, borderColor: theme.line, backgroundColor: theme.surface, gap: metrics.space.sm },
    footerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: metrics.space.sm },
    footerActions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: metrics.space.sm },
    field: { gap: metrics.space.sm, flexGrow: 1, flexShrink: 1, minWidth: 0 },
    fieldPair: { flexDirection: 'row', gap: metrics.space.md },
    fieldLabel: { color: theme.secondary, fontSize: metrics.type.label, fontWeight: '600' },
    input: {
      minHeight: metrics.touch, backgroundColor: theme.soft, paddingHorizontal: 14, paddingVertical: 10, borderRadius: metrics.radius.md,
      fontSize: metrics.type.body, color: theme.ink, borderWidth: 1, borderColor: theme.line,
    },
    inputFocused: { borderColor: theme.blue, backgroundColor: theme.surface },
    inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
    segment: { flexDirection: 'row', backgroundColor: theme.soft, borderRadius: metrics.radius.md, padding: metrics.space.xs, gap: metrics.space.xs },
    segmentItem: { flex: 1, minWidth: 0, borderRadius: metrics.radius.sm, borderWidth: 1, borderColor: 'transparent' },
    segmentSelected: { backgroundColor: theme.raised, borderColor: theme.line, boxShadow: `0 2px 5px ${theme.shadow}` },
    segmentContent: { minHeight: metrics.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
    segmentLabel: { fontSize: metrics.type.label, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
    weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.space.xs },
    weekday: { flex: 1, minHeight: metrics.touch, backgroundColor: theme.soft, borderRadius: metrics.radius.sm, borderWidth: 1, borderColor: theme.line },
    weekdayWrapped: { flexBasis: '20%' },
    weekdaySelected: { backgroundColor: theme.blue, borderColor: theme.blue },
    weekdayText: { color: theme.secondary, fontSize: metrics.type.label, fontWeight: '600', textAlign: 'center' },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.space.sm },
    swatch: { width: metrics.touch, height: metrics.touch, borderRadius: metrics.radius.full, borderWidth: 1.5, backgroundColor: theme.surface },
    swatchDot: { width: 31, height: 31, borderRadius: metrics.radius.full, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
    colorDot: { width: 13, height: 13, borderRadius: metrics.radius.full },
    error: { color: theme.danger, fontSize: metrics.type.label, lineHeight: 20, backgroundColor: theme.dangerBg, padding: 10, borderRadius: metrics.radius.sm },
    success: { color: theme.success, fontSize: metrics.type.label, lineHeight: 20, backgroundColor: theme.successBg, padding: 10, borderRadius: metrics.radius.sm },
    group: { gap: metrics.space.md },
    school: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: theme.soft, borderRadius: metrics.radius.lg, gap: 12 },
    schoolLogo: { width: 46, height: 46, backgroundColor: theme.tint, borderRadius: metrics.radius.md, justifyContent: 'center', alignItems: 'center' },
    detail: { flex: 1, gap: metrics.space.xs },
    itemTitle: { fontSize: metrics.type.body, color: theme.ink, fontWeight: '600' },
    steps: { gap: metrics.space.md, paddingVertical: metrics.space.xs },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    step: { width: 28, height: 28, backgroundColor: theme.tint, borderRadius: metrics.radius.full, alignItems: 'center', justifyContent: 'center' },
    stepNumber: { color: theme.blue, fontSize: metrics.type.caption, fontWeight: '700' },
    dropzone: { borderRadius: metrics.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.accentLine, backgroundColor: theme.soft },
    dropzoneContent: { padding: metrics.space.lg, alignItems: 'center', gap: metrics.space.sm },
    centerText: { textAlign: 'center' },
    fileActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: metrics.space.xs },
    importIcon: { width: 54, height: 54, borderRadius: metrics.radius.lg, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center' },
    preview: { padding: metrics.space.md, backgroundColor: theme.soft, borderRadius: metrics.radius.lg, gap: metrics.space.sm },
    previewItem: { paddingVertical: metrics.space.sm, gap: metrics.space.xs, borderBottomWidth: 1, borderColor: theme.line },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', minHeight: metrics.touch, gap: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: theme.muted, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: theme.blue, borderColor: theme.blue },
    checkboxLabel: { flex: 1, color: theme.secondary, fontSize: metrics.type.label },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.line },
    hint: { color: theme.muted, fontSize: metrics.type.caption, lineHeight: 18 },
    cardImageRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    cardThumb: { width: 128, height: 81, borderRadius: metrics.radius.md, overflow: 'hidden', justifyContent: 'flex-end', padding: 8, backgroundColor: theme.soft },
    cardThumbText: { color: '#ffffff', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4 },
    bgThumb: { width: 72, height: 110, borderRadius: metrics.radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.line },
  }), [theme]);
}
