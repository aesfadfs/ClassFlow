import type { SectionTime } from './zhengfang.ts';

export type SchoolAdapter = {
  id: string;
  name: string;
  authUrl: string;
  officialGuideUrl: string;
  systemName: string;
  status: 'pending' | 'ready';
  /** 'fixed' locks the browser to the listed school hosts; 'open' lets the
   * user search for and visit their own school, reading only that page. */
  mode?: 'fixed' | 'open';
  browserHosts: string[];
  timetableHosts: string[];
  periodTimeProfile?: { label: string; source: string; campusMarkers: string[]; times: SectionTime[] };
};

// 'pending' means the complete native WebView flow still needs device acceptance.
// The DOM reader is verified on the authenticated page and sanitized fixtures.
export const hainnu: SchoolAdapter = {
  id: 'hainnu',
  name: '海南师范大学',
  authUrl: 'https://auth.hainnu.edu.cn:9443/cas/login',
  officialGuideUrl: 'https://www.hainnu.edu.cn/2025/0630/c4161a156574/page.htm',
  systemName: '正方教务系统',
  status: 'pending',
  browserHosts: ['hainnu.edu.cn', '*.hainnu.edu.cn', 'auth.hainnu.edu.cn:9443'],
  timetableHosts: ['zfjw.hainnu.edu.cn'],
  // Supplied by the account owner on 2026-11-04: periods 1–9 from their
  // reference timetable screenshot, period 10 explicitly confirmed in chat.
  // This is a campus preset, not a claim that the school page returned clocks.
  periodTimeProfile: {
    label: '桂林洋校区作息', source: '用户参考课表及确认（2026-11-04）', campusMarkers: ['桂林洋', '[桂]'],
    times: [
      { section: 1, start: '08:00', end: '08:45' },
      { section: 2, start: '08:55', end: '09:40' },
      { section: 3, start: '10:00', end: '10:45' },
      { section: 4, start: '10:55', end: '11:40' },
      { section: 5, start: '14:30', end: '15:15' },
      { section: 6, start: '15:25', end: '16:10' },
      { section: 7, start: '16:25', end: '17:10' },
      { section: 8, start: '17:20', end: '18:05' },
      { section: 9, start: '19:30', end: '20:15' },
      { section: 10, start: '20:20', end: '21:05' },
    ],
  },
};

// Public build: the user searches for their own school's 教务系统. The browser
// may visit any http(s) page the user opens, but captured courses are accepted
// only from the host of the page that posted them (see readTimetableCapture).
// Supported page families are listed in TIMETABLE_SYSTEMS; all still need
// on-device acceptance against real school deployments.
export const openSchool: SchoolAdapter = {
  id: 'open',
  name: '我的学校',
  authUrl: 'https://www.baidu.com/',
  officialGuideUrl: '',
  systemName: '通用教务识别',
  status: 'pending',
  mode: 'open',
  browserHosts: [],
  timetableHosts: [],
};

export const schoolAdapters = [openSchool, hainnu];

export const TIMETABLE_SYSTEMS = ['正方', '强智', 'URP 综合教务', '金智', '树维', '青果 / 通用表格'] as const;

export type SearchEngine = 'baidu' | 'bing';
export const SEARCH_ENGINES: { key: SearchEngine; title: string }[] = [
  { key: 'baidu', title: '百度' }, { key: 'bing', title: '必应' },
];

export function searchUrl(query: string, engine: SearchEngine = 'baidu'): string {
  const words = query.trim().slice(0, 60);
  const q = encodeURIComponent(words ? (/教务|jw/i.test(words) ? words : `${words} 教务系统`) : '');
  if (engine === 'bing') return q ? `https://cn.bing.com/search?q=${q}` : 'https://cn.bing.com/';
  return q ? `https://www.baidu.com/s?wd=${q}` : 'https://www.baidu.com/';
}

/** An address typed by the user: a URL, a bare domain, or words to search. */
export function resolveAddress(input: string, engine: SearchEngine = 'baidu'): string {
  const value = input.trim();
  if (!value) return searchUrl('', engine);
  if (/^https?:\/\//i.test(value)) return isWebUrl(value) ? value : searchUrl(value, engine);
  if (!/\s/.test(value) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) return `https://${value}`;
  return searchUrl(value, engine);
}

/** Ordinary web pages only: no credentials in the URL, no app or file schemes. */
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
}

/** The capture must come from the page the user is looking at (same host). */
export function sameHost(sourceUrl: string, pageUrl: string): boolean {
  return isWebUrl(sourceUrl) && isWebUrl(pageUrl) && new URL(sourceUrl).host === new URL(pageUrl).host;
}

// Embedded timetable frames that may be opened directly when cross-origin.
export const TIMETABLE_FRAME_PATH = /\/kbcx\/xskbcx[^/]*\.html$|\/xskb\/xskb_list\.do$|courseTableForStd|thisSemesterCurriculum|\/wdkb\//i;

export function matchesSchoolUrl(value: string, hosts: string[]): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      // Wildcards allow standard HTTPS only. Nonstandard ports require an
      // exact host:port entry, such as the school's CAS login on 9443.
      && hosts.some(host => host.startsWith('*.')
        ? !url.port && url.hostname.endsWith(host.slice(1)) : url.host === host);
  } catch { return false; }
}
