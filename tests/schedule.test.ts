import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactLocation, createEntry, demoState, emptyState, restoreScheduleState, findConflicts, freeWindows, isScheduleState, layoutDay, occursInWeek, parseDate, parseTime, weekDates, weekNumber, dateKey, validateEntry, dayOfWeek } from '../src/domain/schedule.ts';
import { analyzeImport, CSV_TEMPLATE, parseCSV, parseImport } from '../src/domain/import.ts';

test('fresh installs start empty and legacy examples do not return on upgrade', () => {
  const initial = emptyState(new Date(2026, 10, 4));
  assert.deepEqual(initial.entries, []);
  assert.equal(initial.demo, false);
  assert.equal(isScheduleState(initial), true);
  assert.equal(initial.preferences.semesterStart, '2026-08-31');
  const legacy = demoState();
  const migrated = restoreScheduleState(JSON.stringify(legacy));
  assert.deepEqual(migrated.entries, []);
  assert.equal(migrated.demo, false);
  assert.deepEqual(migrated.preferences, legacy.preferences);
  const saved = { ...initial, entries: [createEntry({ title: '已保存的课程' }), createEntry({ title: '个人安排', kind: 'plan' })] };
  assert.deepEqual(restoreScheduleState(JSON.stringify(saved)), saved);
  assert.deepEqual(restoreScheduleState(JSON.stringify(initial)), initial);
  assert.throws(() => restoreScheduleState('broken'));
  assert.throws(() => restoreScheduleState('{}'));
});

test('semester boundaries use local calendar dates', () => {
  assert.equal(weekNumber(parseDate('2026-10-30'), '2026-08-31'), 9);
  assert.equal(weekNumber(parseDate('2026-08-30'), '2026-08-31'), 0);
  assert.equal(dateKey(weekDates('2026-08-31', 9)[6]), '2026-11-01');
  assert.throws(() => parseDate('2026-02-30'));
  assert.throws(() => parseTime('25:10'));
  assert.throws(() => parseTime('08:99'));
});
test('odd and even weeks never report a false collision', () => {
  const odd = createEntry({ title: '单周课', parity: 'odd' });
  const even = createEntry({ title: '双周课', parity: 'even' });
  assert.equal(findConflicts(odd, [even]).length, 0);
  assert.equal(occursInWeek(odd, 2), false);
  assert.equal(occursInWeek(odd, 3), true);
  assert.equal(validateEntry({ ...odd, startWeek: 2, endWeek: 2 }), '所选周次内没有符合单双周的日期');
});
test('adjacent courses do not conflict, real overlaps do', () => {
  const a = createEntry({ title: 'A', start: 480, end: 580 });
  const b = createEntry({ title: 'B', start: 580, end: 680 });
  assert.equal(findConflicts(a, [a, b]).length, 0);
  assert.equal(findConflicts({ ...b, start: 579 }, [a]).length, 1);
});
test('free time merges overlapping occupied intervals and clips to day', () => {
  const a = createEntry({ title: 'A', start: 450, end: 580 });
  const b = createEntry({ title: 'B', start: 540, end: 660 });
  const c = createEntry({ title: 'C', start: 1200, end: 1320 });
  assert.deepEqual(freeWindows([b, c, a], 1, 0), [{ start: 660, end: 1200 }]);
});
test('chain overlaps occupy stable non-overlapping lanes', () => {
  const entries = [createEntry({ title: 'A', start: 480, end: 600 }), createEntry({ title: 'B', start: 540, end: 660 }), createEntry({ title: 'C', start: 600, end: 720 })];
  assert.deepEqual(layoutDay(entries).map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 2]]);
});
test('CSV supports UTF-8 BOM, quoted commas, escaped quotes and multiline notes', () => {
  assert.deepEqual(parseCSV('\uFEFF课程,备注\r\n"数学, A","第一行\n第二行 ""重点"""'), [['课程', '备注'], ['数学, A', '第一行\n第二行 "重点"']]);
  assert.throws(() => parseCSV('a,b\n"unclosed'));
  const parsed = parseImport('\uFEFF' + CSV_TEMPLATE, '课程.CSV');
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries[0].day, 0);
});
test('invalid rows are reported instead of silently dropped', () => {
  const parsed = parseImport('课程名称,星期,开始时间,结束时间\n数学,周九,08:00,09:40\n英语,周一,10:00,09:00', '课程.csv');
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.errors.length, 2);
  assert.throws(() => parseImport('a,b\n1,2', '课程.csv'));
});
test('backup roundtrip retains times, days and independent identifiers', () => {
  const original = demoState();
  const parsed = parseImport(JSON.stringify(original), 'backup.json');
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.entries.length, original.entries.length);
  assert.equal(parsed.entries[0].day, original.entries[0].day);
  assert.equal(parsed.entries[0].start, original.entries[0].start);
  assert.notEqual(parsed.entries[0].id, original.entries[0].id);
  assert.deepEqual(parsed.preferences, original.preferences);
  assert.equal(isScheduleState(original), true);
  assert.equal(isScheduleState({ ...original, preferences: { ...original.preferences, semesterWeeks: 10 } }), true);
  assert.equal(isScheduleState({ ...original, entries: [null] }), false);
});

test('import preview and commit share a deduplicated merge and count real conflicts', () => {
  const manual = createEntry({ title: '手动课程', endWeek: 5, parity: 'odd' });
  const duplicate = createEntry({ ...manual, id: 'duplicate', weeks: [1, 3, 5], parity: 'all' });
  const separateWeeks = createEntry({ title: '离散周课程', startWeek: 2, endWeek: 4, weeks: [2, 4] });
  const overlap = createEntry({ title: '重叠课程', startWeek: 1, endWeek: 1 });
  const result = analyzeImport([duplicate, separateWeeks, overlap, separateWeeks], [manual], false);
  assert.deepEqual(result.entries, [separateWeeks, overlap]);
  assert.deepEqual(result.nextEntries, [manual, separateWeeks, overlap]);
  assert.equal(result.duplicateCount, 2);
  assert.equal(result.conflictCount, 1);
  assert.equal(analyzeImport([duplicate, separateWeeks, overlap], result.nextEntries, false).entries.length, 0);
  const plan = createEntry({ title: '个人安排', kind: 'plan' });
  assert.deepEqual(analyzeImport([separateWeeks], [manual, plan], true).nextEntries, [plan, separateWeeks]);
  assert.deepEqual(analyzeImport([separateWeeks], [manual, plan], true, true).nextEntries, [separateWeeks]);
});

test('backup roundtrip preserves explicit weeks and import source', () => {
  const entry = createEntry({ title: '实验课', startWeek: 1, endWeek: 9, weeks: [1, 5, 9], importSource: 'demo' });
  const state = { ...demoState(), entries: [entry] };
  const parsed = parseImport(JSON.stringify(state), 'backup.json');
  assert.deepEqual(parsed.entries[0].weeks, entry.weeks);
  assert.equal(parsed.entries[0].importSource, entry.importSource);
});

test('up-next stack lists unfinished sessions from now in order and respects week rules', async () => {
  const { upcomingOccurrences, describeOccurrence } = await import('../src/domain/schedule.ts');
  const preferences = { semesterStart: '2026-08-31', semesterWeeks: 20, school: '' };
  const now = new Date(2026, 10, 5, 9, 0); // Thursday of week 10
  const entries = [
    createEntry({ id: 'done', title: '已结束', day: 3, start: 420, end: 480 }),
    createEntry({ id: 'live', title: '进行中', day: 3, start: 480, end: 580 }),
    createEntry({ id: 'later', title: '稍后', day: 3, start: 600, end: 650, kind: 'plan' }),
    createEntry({ id: 'odd', title: '单周', day: 4, start: 480, end: 580, parity: 'odd' }),
    createEntry({ id: 'even', title: '双周', day: 4, start: 600, end: 700, parity: 'even' }),
    createEntry({ id: 'discrete', title: '指定周', day: 0, start: 480, end: 580, startWeek: 12, endWeek: 12, weeks: [12] }),
  ];
  const items = upcomingOccurrences(entries, preferences, now, { days: 14 });
  assert.deepEqual(items.map(item => `${item.entry.id}@${item.offset}`), ['live@0', 'later@0', 'even@1', 'done@7', 'live@7', 'later@7', 'odd@8', 'discrete@11']);
  assert.equal(describeOccurrence(items[0], now).status, '进行中 · 还剩 40 分钟');
  assert.equal(describeOccurrence(items[0], now).progress, 0.6);
  assert.equal(describeOccurrence(items[1], now).status, '1 小时后开始');
  assert.equal(describeOccurrence(items[2], now).status, '明天 10:00');
  assert.equal(describeOccurrence(items[6], now).status, '11月13日 周五 08:00');
  assert.equal(upcomingOccurrences(entries, preferences, now, { limit: 2 }).length, 2);
  // Home cards: every entry once, at its next session, in start order.
  const once = upcomingOccurrences(entries, preferences, now, { days: 14, once: true });
  assert.equal(new Set(once.map(item => item.entry.id)).size, once.length);
  assert.deepEqual(once.map(item => item.entry.id), [...new Set(items.map(item => item.entry.id))]);
  assert.ok(once.every((item, index) => !index || item.date.getTime() > once[index - 1].date.getTime() || (item.offset === once[index - 1].offset && item.entry.start >= once[index - 1].entry.start)));
  assert.deepEqual(upcomingOccurrences(entries, { ...preferences, semesterWeeks: 9 }, now), []);
});

test('appearance keeps per-item and per-course card pictures apart and restores safely', async () => {
  const { cardImageFor, setCardImage, forgetEntryImage, restoreAppearance, defaultAppearance, referencedImages } = await import('../src/domain/appearance.ts');
  const math = createEntry({ id: 'm1', title: '高等数学 A' });
  const math2 = createEntry({ id: 'm2', title: '高等数学 A ' });
  let look = setCardImage(defaultAppearance(), math, 'title', 'file:///images/card-a.jpg');
  assert.deepEqual(cardImageFor(look, math2), { uri: 'file:///images/card-a.jpg', scope: 'title', frost: false });
  look = setCardImage(look, math2, 'entry', 'file:///images/card-b.jpg', true);
  assert.equal(cardImageFor(look, math2)?.frost, true);
  assert.equal(cardImageFor(look, math)?.frost, false);
  assert.equal(cardImageFor(look, math2)?.uri, 'file:///images/card-b.jpg');
  assert.equal(cardImageFor(look, math)?.uri, 'file:///images/card-a.jpg');
  // Picking a course-wide picture from an item that had its own makes it visible there too.
  const shared = setCardImage(look, math2, 'title', 'file:///images/card-c.jpg');
  assert.equal(cardImageFor(shared, math2)?.uri, 'file:///images/card-c.jpg');
  assert.equal(cardImageFor(forgetEntryImage(look, 'm2'), math2)?.uri, 'file:///images/card-a.jpg');
  assert.equal(cardImageFor(setCardImage(look, math, 'title', null), math), null);
  assert.deepEqual([...referencedImages({ ...look, background: 'data:image/jpeg;base64,AA' })].length, 3);
  const restored = restoreAppearance(JSON.stringify({ ...look, dragEnabled: false, backgroundDim: 9, cardImages: { ...look.cardImages, bad: 'x', 'entry:z': 'javascript:alert(1)' } }));
  assert.equal(restored.dragEnabled, false);
  assert.equal(restored.backgroundDim, 0.25);
  const odd = restoreAppearance(JSON.stringify({ glassPanel: 0.99, glassBlur: 6, glassCard: 'x', glow: false }));
  assert.deepEqual([odd.glassPanel, odd.glassBlur, odd.glassCard, odd.glow], [0.3, 6, 0.4, false]);
  assert.deepEqual(Object.keys(restored.cardImages).sort(), ['entry:m2', 'title:高等数学 A']);
  assert.deepEqual(restored.cardFrost, { 'entry:m2': true });
  assert.equal(restored.greeting, true);
  assert.equal(restoreAppearance(JSON.stringify({ greeting: false, cardFrost: { 'entry:none': true } })).greeting, false);
  assert.deepEqual(restoreAppearance(JSON.stringify({ cardFrost: { 'entry:none': true } })).cardFrost, {});
  assert.deepEqual(restoreAppearance('broken'), defaultAppearance());
});

test('opening greeting follows the time of day and always has a line', async () => {
  const { GREETINGS, dayPeriod, greetingFor } = await import('../src/domain/greetings.ts');
  const at = (hour: number, minute = 0) => new Date(2026, 10, 5, hour, minute);
  assert.equal(dayPeriod(at(4, 59)), 'evening');
  assert.equal(dayPeriod(at(5)), 'morning');
  assert.equal(dayPeriod(at(10, 59)), 'morning');
  assert.equal(dayPeriod(at(11)), 'noon');
  assert.equal(dayPeriod(at(14)), 'afternoon');
  assert.equal(dayPeriod(at(18)), 'evening');
  assert.equal(dayPeriod(at(23, 30)), 'evening');
  for (const lines of Object.values(GREETINGS)) {
    assert.ok(lines.length >= 12);
    assert.equal(new Set(lines).size, lines.length);
  }
  assert.equal(greetingFor(at(8), 0).text, GREETINGS.morning[0]);
  assert.equal(greetingFor(at(8), 0.999999).text, GREETINGS.morning.at(-1));
  assert.equal(greetingFor(at(12), 1).text, GREETINGS.noon.at(-1));
  assert.equal(greetingFor(at(20), 0.5).title, '晚上');
  const { CURTAIN_COLORS } = await import('../src/domain/greetings.ts');
  for (const palettes of Object.values(CURTAIN_COLORS)) {
    assert.ok(palettes.length >= 3);
    for (const pair of palettes) for (const color of pair) {
      assert.match(color, /^#[0-9a-f]{6}$/);
      // Deep enough for white text: relative luminance well below mid grey.
      const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b < 0.25, color);
    }
  }
  assert.deepEqual(greetingFor(at(8), 0, 0.99).colors, CURTAIN_COLORS.morning.at(-1));
});

test('up-next stack pins cards at the top and compresses the ones behind', async () => {
  const { STACK, stackPose, settleIndex, anchoredIndex } = await import('../src/ui/stackMath.ts');
  const step = 252;
  // Below the top: a plain list.
  assert.deepEqual([0, 1, 2].map(r => stackPose(r, 0, step).translateY), [STACK.TOP, STACK.TOP + step, STACK.TOP + 2 * step]);
  assert.equal(stackPose(1.5, 3, step).scale, 1);
  // Reaching the top: the card stays pinned and only sinks a little as the next one covers it.
  const half = stackPose(-0.5, 0, step);
  assert.ok(half.translateY < STACK.TOP && half.translateY > STACK.TOP - STACK.LIFT);
  // Deeper cards peek higher, get smaller and darker, monotonically.
  const poses = [0, -1, -2, -3].map(r => stackPose(r, 0, step));
  for (let i = 1; i < poses.length; i++) {
    assert.ok(poses[i].translateY < poses[i - 1].translateY);
    assert.ok(poses[i].scale < poses[i - 1].scale);
    assert.ok(poses[i].shade >= poses[i - 1].shade);
  }
  assert.ok(poses[3].translateY >= 0, 'the deepest visible layer stays inside the stage');
  // Past the visible depth a card fades out gradually instead of vanishing.
  assert.equal(stackPose(-STACK.MAX_DEPTH, 0, step).opacity, 1);
  assert.equal(stackPose(-STACK.MAX_DEPTH - 0.5, 0, step).opacity, 0.5);
  assert.equal(stackPose(-STACK.MAX_DEPTH - 1, 0, step).opacity, 0);
  // Later cards are always drawn over earlier ones.
  assert.ok(stackPose(0, 4, step).zIndex > stackPose(-1, 3, step).zIndex);
  // Release: small drags settle back, flings carry, ends are clamped.
  assert.equal(settleIndex(2.3, 0, 8), 2);
  assert.equal(settleIndex(2.3, 6, 8), 4);
  assert.equal(settleIndex(0.2, -9, 8), 0);
  assert.equal(settleIndex(6.8, 9, 8), 7);
  // Scroll context survives list updates.
  assert.equal(anchoredIndex(['b', 'c', 'd'], 'c', 2), 1);
  assert.equal(anchoredIndex(['a', 'c'], 'b', 1), 1);
  assert.equal(anchoredIndex(['a'], 'z', 5), 0);
  assert.equal(anchoredIndex([], 'a', 3), 0);
});

test('class reminders fire before each session and skip back-to-back ones', async () => {
  const { planReminders, defaultReminders, restoreReminders } = await import('../src/domain/reminders.ts');
  const preferences = { ...emptyState().preferences, semesterStart: '2026-09-07', semesterWeeks: 20 };
  // Thursday 2026-11-05 is in week 9; day index follows dayOfWeek (Monday = 0).
  const thursday = dayOfWeek(new Date(2026, 10, 5, 12));
  const entries = [
    createEntry({ id: 'a', day: thursday, title: '高等数学', start: 480, end: 580, location: '二教 208' }),
    createEntry({ id: 'b', day: thursday, title: '大学英语', start: 600, end: 700 }),      // 20 min after a
    createEntry({ id: 'c', day: thursday, title: '数据结构', start: 760, end: 860 }),      // 60 min after b
    createEntry({ id: 'p', day: thursday, kind: 'plan', title: '图书馆', start: 1200, end: 1260 }),
  ];
  const now = new Date(2026, 10, 5, 7, 0);
  const on = { ...defaultReminders(), enabled: true };
  const today = (list: { id: string }[]) => list.filter(item => item.id.endsWith('@2026-11-5')).map(item => item.id.split('@')[0]);
  assert.deepEqual(planReminders(entries, preferences, now, defaultReminders()), [], 'off by default');
  const plan = planReminders(entries, preferences, now, on);
  assert.deepEqual(today(plan), ['a', 'c'], 'b follows a within 30 minutes; plans are off');
  const first = plan[0];
  assert.equal(first.fireAt.getTime(), new Date(2026, 10, 5, 7, 50).getTime());
  assert.equal(first.title, '高等数学 · 10 分钟后上课');
  assert.equal(first.body, '08:00–09:40 · 二教 208');
  assert.deepEqual(today(planReminders(entries, preferences, now, { ...on, gap: 0, plans: true })), ['a', 'b', 'c', 'p']);
  assert.deepEqual(today(planReminders(entries, preferences, now, { ...on, gap: 15 })), ['a', 'b', 'c'], '20-minute break is not under 15');
  // Reminders already due are not scheduled again.
  assert.deepEqual(today(planReminders(entries, preferences, new Date(2026, 10, 5, 7, 55), on)), ['c']);
  // A week ahead at most, and the next Thursday repeats.
  assert.ok(plan.every(item => item.fireAt.getTime() - now.getTime() < 9 * 864e5));
  assert.ok(plan.some(item => item.id === 'a@2026-11-12'));
  assert.deepEqual(restoreReminders({ enabled: true, lead: 7, gap: 45, plans: 'x', sound: 'chime', vibration: 'loud' }), { enabled: true, lead: 10, gap: 45, plans: false, sound: 'chime', vibration: 'long', alarm: false });
  const { vibrationPattern } = await import('../src/domain/reminders.ts');
  assert.equal(vibrationPattern('none'), null);
  const long = vibrationPattern('long')!;
  assert.ok(long.reduce((sum, ms) => sum + ms, 0) >= 10000, 'keeps buzzing about ten seconds');
});

test('period layout lines courses up in equal rows without guessing a bell schedule', async () => {
  const { periodRows, placeRows, minuteToY } = await import('../src/domain/periods.ts');
  const t = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const course = (start: string, end: string) => ({ start: t(start), end: t(end) });
  // No schedule chosen: one row per distinct course range, breaks dropped.
  const week = [course('08:00', '09:40'), course('10:00', '11:40'), course('08:00', '09:40'), course('14:30', '16:10')];
  assert.deepEqual(periodRows(week, null), [course('08:00', '09:40'), course('10:00', '11:40'), course('14:30', '16:10')]);
  // A chosen schedule: numbered periods, a double period spans two rows, empty periods still shown.
  const bell = [course('08:00', '08:45'), course('08:55', '09:40'), course('10:00', '10:45'), course('19:30', '20:15')];
  const rows = periodRows([course('08:00', '09:40'), course('12:00', '12:30')], bell);
  assert.deepEqual(rows.map(row => row.label ?? `${row.start}-${row.end}`), [1, 2, 3, '720-750', 4]);
  // A double period just bridges the 08:45–08:55 break: no extra row, the card spans the gap.
  assert.deepEqual(periodRows([course('08:00', '09:40')], bell.slice(0, 2)).map(row => row.label), [1, 2]);
  // Time beyond the schedule still gets its own row.
  assert.deepEqual(periodRows([course('20:00', '21:00')], bell).map(row => row.label ?? `${row.start}-${row.end}`), [1, 2, 3, 4, '1215-1260']);
  // Pixels: equal period rows; times map linearly inside a row and into the gap between rows.
  const placed = placeRows(rows, 60, 6);
  assert.deepEqual(placed.slice(0, 3).map(row => [row.top, row.height]), [[0, 60], [66, 60], [132, 60]]);
  assert.equal(minuteToY(placed, t('08:00')), 0);
  assert.equal(minuteToY(placed, t('09:40')), 126);
  assert.equal(minuteToY(placed, t('08:50')), 63, 'middle of the break');
  assert.equal(minuteToY(placed, t('23:00')), placed.at(-1)!.top + 60);
  assert.deepEqual(periodRows([], null), []);
});

test('picked weeks are stored as a range, odd/even weeks or an explicit list', async () => {
  const { weekRule, selectedWeeks } = await import('../src/domain/schedule.ts');
  assert.deepEqual(weekRule([3, 1, 2, 2]), { startWeek: 1, endWeek: 3, parity: 'all', weeks: undefined });
  assert.deepEqual(weekRule([1, 3, 5, 7]), { startWeek: 1, endWeek: 7, parity: 'odd', weeks: undefined });
  assert.deepEqual(weekRule([2, 4, 6]), { startWeek: 2, endWeek: 6, parity: 'even', weeks: undefined });
  assert.deepEqual(weekRule([4, 9, 13, 15, 17, 19]), { startWeek: 4, endWeek: 19, parity: 'all', weeks: [4, 9, 13, 15, 17, 19] });
  assert.deepEqual(weekRule([6]), { startWeek: 6, endWeek: 6, parity: 'all', weeks: undefined });
  assert.throws(() => weekRule([]), /至少选择一周/);
  // Round trip keeps every rule's meaning.
  for (const rule of [{ startWeek: 1, endWeek: 16, parity: 'odd' }, { startWeek: 3, endWeek: 20, parity: 'all' }, { startWeek: 1, endWeek: 19, parity: 'all', weeks: [1, 4, 9, 19] }]) {
    const entry = createEntry({ ...rule, title: "测试课" } as never);
    const picked = selectedWeeks(entry, 20);
    assert.deepEqual(selectedWeeks({ ...entry, ...weekRule(picked) }, 20), picked);
    assert.equal(validateEntry({ ...entry, ...weekRule(picked) }, 20), null);
  }
});

test('look presets: built-in glass and pixel, saved custom looks, safe restore', async () => {
  const { BUILTIN_PRESETS, applyPreset, matchesPreset, savePreset, deletePreset, defaultAppearance, restoreAppearance, referencedImages } = await import('../src/domain/appearance.ts');
  const [glass, pixel] = BUILTIN_PRESETS;
  const start = { ...defaultAppearance(), background: 'file:///images/bg.jpg' };
  assert.ok(matchesPreset(start, glass), 'the current default UI is preset 1');
  const pixelated = applyPreset(start, pixel);
  assert.equal(pixelated.uiStyle, 'pixel');
  assert.equal(pixelated.font, 'mono');
  assert.equal(pixelated.background, 'file:///images/bg.jpg', 'built-in presets keep the photo');
  assert.ok(matchesPreset(pixelated, pixel) && !matchesPreset(pixelated, glass));
  // A saved look remembers the photo too and can be applied back.
  const mine = savePreset({ ...pixelated, font: 'serif' }, '  我的像素  ', 'custom:a1');
  const preset = mine.presets[0];
  assert.deepEqual([preset.name, preset.font, preset.background], ['我的像素', 'serif', 'file:///images/bg.jpg']);
  const back = applyPreset({ ...applyPreset(mine, glass), background: null }, preset);
  assert.ok(matchesPreset(back, preset));
  assert.equal(back.background, 'file:///images/bg.jpg');
  assert.ok(referencedImages({ ...back, background: null }).has('file:///images/bg.jpg'), 'saved preset photos are kept on disk');
  assert.throws(() => savePreset(mine, '   ', 'custom:a2'), /名字/);
  assert.deepEqual(deletePreset(mine, 'custom:a1').presets, []);
  // Restore: only sane presets survive.
  const restored = restoreAppearance(JSON.stringify({ ...mine, presets: [...mine.presets, { id: 'evil', name: 'x' }, { id: 'custom:b', name: '暗色', uiStyle: 'neon', font: 'comic' }] }));
  assert.deepEqual(restored.presets.map(item => [item.id, item.uiStyle, item.font]), [['custom:a1', 'pixel', 'serif'], ['custom:b', 'glass', 'system']]);
  assert.equal(restoreAppearance(JSON.stringify({ uiStyle: 'pixel', font: 'mono' })).uiStyle, 'pixel');
});

test('week cells drop the campus prefix but keep the room and unknown formats', () => {
  assert.equal(compactLocation('桂林洋[桂]地理101'), '地理101');
  assert.equal(compactLocation('桂林洋校区 · 地理101'), '地理101');
  assert.equal(compactLocation('信息楼 · 306'), '信息楼 · 306');
  assert.equal(compactLocation('桂林洋校区'), '桂林洋校区');
  assert.equal(compactLocation('[桂]'), '[桂]');
});
