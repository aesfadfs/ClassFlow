import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hainnu, isWebUrl, openSchool, resolveAddress, sameHost, searchUrl } from '../src/features/schools.ts';
import { courseSections, parseZhengfangWeeks, readTimetableCapture, type TimetableCapture } from '../src/features/zhengfang.ts';

test('search starts from the school name and adds 教务系统 once', () => {
  assert.equal(searchUrl(''), 'https://www.baidu.com/');
  assert.equal(searchUrl('  示例大学 '), `https://www.baidu.com/s?wd=${encodeURIComponent('示例大学 教务系统')}`);
  assert.equal(searchUrl('示例大学教务处'), `https://www.baidu.com/s?wd=${encodeURIComponent('示例大学教务处')}`);
  assert.equal(searchUrl('示例大学', 'bing'), `https://cn.bing.com/search?q=${encodeURIComponent('示例大学 教务系统')}`);
});

test('the address bar opens web pages and searches everything else', () => {
  assert.equal(resolveAddress('jwxt.example.edu.cn'), 'https://jwxt.example.edu.cn');
  assert.equal(resolveAddress('http://10.1.2.3:8080/jwglxt/'), 'http://10.1.2.3:8080/jwglxt/');
  assert.equal(resolveAddress('jw.example.edu.cn:8080/jsxsd'), 'https://jw.example.edu.cn:8080/jsxsd');
  assert.match(resolveAddress('示例大学 教务'), /^https:\/\/www\.baidu\.com\/s\?wd=/);
  assert.match(resolveAddress('http://user:pass@example.com/'), /^https:\/\/www\.baidu\.com\/s\?wd=/);
  for (const url of ['javascript:alert(1)', 'file:///sdcard/a.html', 'intent://x#Intent;end', 'baiduboxapp://open', 'http://a:b@example.com/']) {
    assert.equal(isWebUrl(url), false, url);
  }
  assert.equal(sameHost('https://jw.example.edu.cn/a', 'https://jw.example.edu.cn/b'), true);
  assert.equal(sameHost('https://jw.example.edu.cn/a', 'https://evil.example.com/'), false);
  assert.equal(sameHost('https://jw.example.edu.cn:8443/a', 'https://jw.example.edu.cn/'), false);
});

test('open captures must come from the page that posted them', () => {
  const capture: TimetableCapture = { type: 'timetable', version: 1, sourceUrl: 'http://jw.example.edu.cn/jsxsd/xskb/xskb_list.do', term: '', warnings: [], periodTimes: [],
    courses: [{ name: '课程', teacher: '', location: '', weekday: 1, sections: '1-2', weeks: '1-16周' }] };
  const raw = JSON.stringify(capture);
  assert.deepEqual(readTimetableCapture(raw, openSchool, 'http://jw.example.edu.cn/jsxsd/framework/main.jsp'), capture);
  assert.throws(() => readTimetableCapture(raw, openSchool));
  assert.throws(() => readTimetableCapture(raw, openSchool, 'https://www.baidu.com/'));
  assert.throws(() => readTimetableCapture(JSON.stringify({ ...capture, sourceUrl: 'javascript:1' }), openSchool, 'javascript:1'));
  // The fixed school adapter is unchanged by the page URL argument.
  assert.throws(() => readTimetableCapture(raw, hainnu, capture.sourceUrl));
});

test('week and period spellings of other systems keep their meaning', () => {
  assert.deepEqual(parseZhengfangWeeks('1-4(周)', 20), [1, 2, 3, 4]);
  assert.deepEqual(parseZhengfangWeeks('2-8(双周)', 20), [2, 4, 6, 8]);
  assert.deepEqual(parseZhengfangWeeks('1,3,5(周)', 20), [1, 3, 5]);
  assert.deepEqual(parseZhengfangWeeks('{第1-7周|单周}', 20), [1, 3, 5, 7]);
  assert.throws(() => parseZhengfangWeeks('1-4(周)除2周', 20));
  assert.deepEqual(courseSections('[01-02-03-04节]'), [1, 2, 3, 4]);
  assert.deepEqual(courseSections('01-02'), [1, 2]);
  assert.deepEqual(courseSections('1,2'), [1, 2]);
});
