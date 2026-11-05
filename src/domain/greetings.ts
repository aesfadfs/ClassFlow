// Greetings shown on the curtain when the app opens, by time of day.
export type DayPeriod = 'morning' | 'noon' | 'afternoon' | 'evening';

export const GREETINGS: Record<DayPeriod, string[]> = {
  morning: [
    '早上好，新的一天从第一节课开始',
    '早安，今天也要元气满满',
    '早上好，记得吃了早餐再出门',
    '早安，阳光正好，适合出发',
    '早上好，慢慢来，一切都来得及',
    '早安，今天的你会比昨天更好',
    '早上好，深呼吸，开始今天的安排',
    '早安，带上好心情去上课吧',
    '早上好，愿今天的每节课都有收获',
    '早安，先喝口水，醒一醒',
    '早上好，今天也请对自己温柔一点',
    '早安，新的一页，等你来写',
    '早上好，出门前看一眼今天的课表',
    '早安，清晨出发的人最可爱',
  ],
  noon: [
    '中午好，记得按时吃午饭',
    '午安，上午辛苦了',
    '中午好，歇一会儿，下午更有精神',
    '午安，小睡二十分钟也很好',
    '中午好，吃点喜欢的犒劳自己',
    '午安，半天过去了，你做得很好',
    '中午好，放下手机，让眼睛歇一歇',
    '午安，下午的课已经在等你了',
    '中午好，晒晒太阳，充个电',
    '午安，午饭别将就',
    '中午好，给自己留一点安静的时间',
    '午安，补充能量，继续出发',
    '中午好，喝杯水，伸个懒腰',
  ],
  afternoon: [
    '下午好，再坚持一下就到傍晚了',
    '下午好，犯困的话起来走一走',
    '下午好，泡杯茶，继续加油',
    '下午好，今天的进度怎么样了',
    '下午好，专心一会儿，效率会很高',
    '下午好，别忘了看看接下来的课',
    '下午好，阳光斜了，你也辛苦了',
    '下午好，一步一步来，不着急',
    '下午好，给自己一点小小的奖励',
    '下午好，状态不错，保持住',
    '下午好，累了就停下来喘口气',
    '下午好，离今天的目标又近了一步',
    '下午好，愿你整个下午都有好心情',
  ],
  evening: [
    '晚上好，今天辛苦了',
    '晚上好，看看明天有什么课吧',
    '晚上好，今天的你已经很棒了',
    '晚上好，复习一会儿就早点休息',
    '晚上好，给今天画个句号',
    '晚上好，记得让眼睛放松一下',
    '晚上好，别熬太晚，明天见',
    '晚上好，安排好明天，安心入睡',
    '晚上好，今天有什么开心的事吗',
    '晚上好，忙完了就好好休息',
    '晚上好，夜色很温柔，你也是',
    '晚上好，把烦恼留在今天',
    '晚上好，睡个好觉就是最好的准备',
    '夜深了，早点睡，明天还有课',
  ],
};

export const PERIOD_TITLES: Record<DayPeriod, string> = { morning: '早上', noon: '中午', afternoon: '下午', evening: '晚上' };

/** 05:00–10:59 morning, 11:00–13:59 noon, 14:00–17:59 afternoon, otherwise evening. */
export function dayPeriod(date: Date): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Curtain colours by time of day (top → bottom gradient). All are deep enough
 * for white text: dawn blues and peaches in the morning, clear sky and warm
 * gold at noon, amber and lavender in the afternoon, night blues at evening.
 */
export const CURTAIN_COLORS: Record<DayPeriod, [string, string][]> = {
  morning: [['#4f6f99', '#9a7a8e'], ['#b0705a', '#b97a58'], ['#55786a', '#6c8a62'], ['#5d6fa8', '#6f7fb0']],
  noon: [['#2f6f9f', '#3f84a8'], ['#9a6b24', '#a8762c'], ['#2f7f74', '#438a7c'], ['#4b5fa8', '#5b76b8']],
  afternoon: [['#a3583f', '#ad7042'], ['#6d5a99', '#8a68a3'], ['#4a7486', '#5d8488'], ['#9b4f63', '#a86662']],
  evening: [['#262d4f', '#4f3f6e'], ['#1b3442', '#335f66'], ['#33283f', '#6a4460'], ['#2b2f3a', '#4d5566']],
};

const pick = <T>(items: T[], random: number) => items[Math.min(items.length - 1, Math.max(0, Math.floor(random * items.length)))];

/** `random` in [0, 1) picks one line of the current period; `tone` picks its colours. */
export function greetingFor(date: Date, random: number, tone = random) {
  const period = dayPeriod(date);
  return { period, title: PERIOD_TITLES[period], text: pick(GREETINGS[period], random), colors: pick(CURTAIN_COLORS[period], tone) };
}
