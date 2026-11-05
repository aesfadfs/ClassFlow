import type { SectionTime } from './zhengfang.ts';

export type SchoolAdapter = {
  id: string;
  name: string;
  authUrl: string;
  officialGuideUrl: string;
  systemName: string;
  status: 'pending' | 'ready';
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

export const schoolAdapters = [hainnu];

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
