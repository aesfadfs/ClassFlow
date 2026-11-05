// This script runs only in the school WebView. It sends course fields, never page
// HTML, form values, cookies, credentials or request headers to the app.
export function buildTimetableScript(timetableHosts: string[], force = false): string {
  return `(${installTimetableObserver})(${JSON.stringify(timetableHosts)},${force}); true;`;
}

const installTimetableObserver = String.raw`function (allowedHosts, force) {
  if (window.__classflowScan) { window.__classflowScan(force); return; }
  var installed = new WeakSet();
  var sources = new Map();
  var awaitingQuery = new WeakMap();
  var lastSignature = '';
  var candidate = '';
  var candidateSince = 0;
  var lastStatus = '';
  var pending = 0;
  var requestVersion = 0;
  var sentVersion = 0;
  var promotedFrame = '';
  var manual = !!force;
  // The school's jquery.extends.contact-min.js overwrites Array#filter with
  // an (index, value) callback. Use a private loop even when injected after the
  // school scripts; capturing Array.prototype.filter then is already too late.
  // Never patch the page's prototypes: its own UI depends on those extensions.
  function select(values, predicate) {
    var result = [];
    for (var i = 0; i < values.length; i++) {
      if (predicate(values[i], i, values)) result.push(values[i]);
    }
    return result;
  }
  function allowed(url) {
    try { var u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password && allowedHosts.indexOf(u.host) >= 0; }
    catch (_) { return false; }
  }
  function send(data) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }
  function status(value) {
    if (lastStatus !== value) { lastStatus = value; send({type: 'status', message: value}); }
  }
  function text(node) {
    if (!node) return '';
    var parts = [];
    function walk(current) {
      if (current.nodeType === 3) { parts.push(current.nodeValue || ''); return; }
      if (/^(SCRIPT|STYLE)$/.test(current.nodeName)) return;
      var boundary = /^(BR|P|DIV|LI|TR|TD|TH)$/.test(current.nodeName);
      if (boundary) parts.push(' ');
      Array.from(current.childNodes || []).forEach(walk);
      if (boundary) parts.push(' ');
    }
    walk(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
  }
  function term(doc) {
    return select(['xnm', 'xqm'].map(function (id) {
      var select = doc.getElementById(id);
      return select && select.options ? text(select.options[select.selectedIndex]) : '';
    }), Boolean).join(' · ');
  }
  function field(block, labels) {
    var nodes = block.querySelectorAll('[title], [data-original-title]');
    for (var i = 0; i < nodes.length; i++) {
      var label = (nodes[i].getAttribute('title') || nodes[i].getAttribute('data-original-title') || '').replace(/[:：\s]+$/g, '').trim();
      if (labels.indexOf(label) < 0) continue;
      var node = nodes[i];
      var value = text(node);
      if (!value || labels.indexOf(value) >= 0) value = text(node.parentElement);
      return value.replace(/^(任课教师|教师|校区\/上课地点|上课地点|教室|节\/周)\s*[:：]?\s*/, '').trim();
    }
    // The list view puts multiple labeled <font> nodes inside one paragraph.
    // Read the individual value, including spaces before the Chinese colon.
    var inline = block.querySelectorAll('font, p, li'), best = '';
    for (var n = 0; n < inline.length; n++) {
      var content = text(inline[n]);
      for (var l = 0; l < labels.length; l++) {
        var marker = new RegExp('(?:^|\\s)' + labels[l] + '\\s*[:：]\\s*');
        var found = marker.exec(content);
        if (!found) continue;
        var value = content.slice(found.index + found[0].length)
          .replace(/\s*(?:任课教师|教师|上课地点|校区|教学班组成|选课备注|总学时|学分)\s*[:：][\s\S]*$/, '').trim();
        if (value && (!best || value.length < best.length)) best = value;
      }
    }
    if (best) return best;
    var lines = (block.innerText || text(block)).split(/[\n\r]+/);
    for (var j = 0; j < lines.length; j++) {
      for (var k = 0; k < labels.length; k++) {
        if (lines[j].trim().indexOf(labels[k] + '：') === 0 || lines[j].trim().indexOf(labels[k] + ':') === 0)
          return lines[j].trim().slice(labels[k].length + 1).trim();
      }
    }
    return '';
  }
  // Map physical table cells, including merged morning/afternoon and lesson
  // cells. Do not assume a particular school CSS class or cell ID.
  function tablePositions(doc) {
    var positions = new Map(), detected = false;
    Array.from(doc.querySelectorAll('table')).slice(0, 40).forEach(function (table) {
      var rows = Array.from(table.rows).slice(0, 150), grid = [], items = [], days = {};
      rows.forEach(function (row, r) {
        if (!grid[r]) grid[r] = [];
        var c = 0, rowDays = {};
        Array.from(row.cells).forEach(function (cell) {
          while (grid[r][c]) c++;
          var rs = Math.min(cell.rowSpan || rows.length - r, rows.length - r), cs = Math.min(cell.colSpan || 1, 40);
          var item = {cell: cell, row: r, col: c, span: rs, columns: cs};
          items.push(item);
          for (var y = r; y < r + rs; y++) {
            if (!grid[y]) grid[y] = [];
            for (var x = c; x < c + cs; x++) grid[y][x] = item;
          }
          var label = text(cell).replace(/\s/g, '');
          var match = /^(?:星期|周)([一二三四五六日天])$/.exec(label);
          if (match && cs === 1) rowDays[c] = Math.min(7, '一二三四五六日天'.indexOf(match[1]) + 1);
          c += cs;
        });
        // Weekdays must share a header row. A list has vertical weekday labels;
        // treating those as columns can turn its legend into a bogus course.
        if (Object.keys(rowDays).length >= 2) days = rowDays;
      });
      // List section labels may span multiple course rows (different weeks or
      // rooms). Read the physical grid so subsequent rows inherit the label.
      items.forEach(function (item) {
        if (!item.cell.querySelector('.timetable_con')) return;
        var row = grid[item.row];
        for (var c = 0; c < item.col; c++) {
          var marker = row[c] && /^jc_(\d+)-(\d+)-(\d+)$/.exec(row[c].cell.id);
          if (marker) {
            positions.set(item.cell, {day: Number(marker[1]), sections: marker[2] + '-' + marker[3]});
            detected = true;
          }
        }
      });
      var dayColumns = Object.keys(days).map(Number);
      if (dayColumns.length < 2) return;
      detected = true;
      var firstDay = Math.min.apply(null, dayColumns), sections = {};
      grid.forEach(function (row, r) {
        for (var c = 0; c < firstDay; c++) {
          var item = row[c];
          if (!item || item.row !== r || item.cell.querySelector('.timetable_con')) continue;
          var range = sectionRange(text(item.cell));
          if (range) sections[r] = range;
        }
      });
      items.forEach(function (item) {
        if (!days[item.col] || item.columns !== 1) return;
        var range = [];
        for (var r = item.row; r < item.row + item.span; r++) {
          if (sections[r]) range.push(sections[r].section + (sections[r].endSection !== sections[r].section ? '-' + sections[r].endSection : ''));
        }
        if (range.length) positions.set(item.cell, {day: days[item.col], sections: range.join(',')});
      });
    });
    return {cells: positions, detected: detected};
  }
  function clockRange(value) {
    var match = /(\d{1,2}[:：]\d{2})\s*[-~～—–至－]\s*(\d{1,2}[:：]\d{2})/.exec(value);
    return match ? {start: match[1].replace('：', ':'), end: match[2].replace('：', ':')} : null;
  }
  function sectionRange(value) {
    var match = /^(?:第)?\s*(\d{1,2})(?:\s*[-~～—–至－]\s*(\d{1,2}))?\s*(?:节|$|\s)/.exec(value);
    if (!match) return null;
    var first = Number(match[1]), last = Number(match[2] || match[1]);
    return first >= 1 && last >= first && last <= 30 ? {section: first, endSection: last} : null;
  }
  function timingText(cell) {
    var values = [text(cell)];
    [cell].concat(Array.from(cell.querySelectorAll('[title], [data-original-title], [data-content], [aria-label]'))).forEach(function (node) {
      ['title', 'data-original-title', 'data-content', 'aria-label'].forEach(function (name) { values.push((node.getAttribute(name) || '').replace(/<[^>]*>/g, ' ')); });
    });
    return values.join(' ').replace(/：/g, ':');
  }
  function readTimes(doc) {
    var times = [];
    doc.querySelectorAll('th, td, [data-section]').forEach(function (cell) {
      if (cell.querySelector('.timetable_con')) return;
      var value = timingText(cell);
      var list = /^jc_\d+-(\d+)-(\d+)$/.exec(cell.id);
      var section = sectionRange(cell.getAttribute('data-section') || (list ? list[1] + '-' + list[2] : value));
      if (!section) return;
      var range = clockRange(value);
      if (!range && cell.parentElement && cell.parentElement.tagName === 'TR') {
        var siblings = select(Array.from(cell.parentElement.children), function (other) { return !other.querySelector('.timetable_con'); });
        range = clockRange(siblings.map(timingText).join(' '));
      }
      if (range) {
        var item = {section: section.section, start: range.start, end: range.end};
        if (section.endSection !== section.section) item.endSection = section.endSection;
        times.push(item);
      }
    });
    return select(times, function (value, i) { return times.findIndex(function (other) { return other.section === value.section; }) === i; });
  }
  function apiTimes(data) {
    var rows = data.periodTimes || data.jcsjList || data.jcList || data.sjList;
    if (!Array.isArray(rows)) return [];
    return select(rows.slice(0, 30).map(function (row) {
      if (!row) return null;
      var section = sectionRange(String(row.section || row.jc || row.jcs || row.jcmc || ''));
      var start = String(row.start || row.kssj || row.qssj || '').replace('：', ':');
      var end = String(row.end || row.jssj || '').replace('：', ':');
      if (!section || !/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return null;
      var item = {section: section.section, start: start, end: end};
      if (section.endSection !== section.section) item.endSection = section.endSection;
      return item;
    }), Boolean);
  }
  function readDom(doc) {
    var courses = [];
    var warnings = [];
    var grid = tablePositions(doc);
    var blocks = Array.from(doc.querySelectorAll('.timetable_con'));
    // Zhengfang renders grid and list together. Prefer the complete grid when
    // present, even if the user switches tabs; do not import both copies.
    var gridTables = new Set();
    blocks.forEach(function (block) {
      var cell = block.closest('td');
      if (cell && /^\d+[_-]\d+$/.test(cell.id)) gridTables.add(cell.closest('table'));
    });
    if (gridTables.size) blocks = select(blocks, function (block) { return gridTables.has(block.closest('table')); });
    grid.cells.forEach(function (_, cell) {
      if (gridTables.size && !gridTables.has(cell.closest('table'))) return;
      if (cell.querySelector('.timetable_con')) return;
      // Multiple separately titled lessons inside one cell remain separate.
      var titles = Array.from(cell.querySelectorAll('.title, .kcmc, [title="课程名称"], .course-name'));
      if (titles.length > 1) {
        titles.forEach(function (title) {
          var parent = title.parentElement;
          while (parent && parent !== cell && !/周/.test(text(parent))) parent = parent.parentElement;
          if (parent && parent !== cell && !blocks.includes(parent)) blocks.push(parent);
        });
      } else if ((/周/.test(text(cell)) && text(cell).length > 5) || cell.querySelector('.title, .kcmc, .course-name, font[color]')) blocks.push(cell);
    });
    blocks.forEach(function (block) {
      var cell = block.closest('td');
      var position = cell && /^(\d+)[_-](\d+)$/.exec(cell.id);
      var mapped = cell && grid.cells.get(cell);
      var listPosition = !position && cell && cell.parentElement.querySelector('[id^="jc_"]');
      var listMatch = listPosition && /^jc_(\d+)-(\d+)-(\d+)$/.exec(listPosition.id);
      // Read either the grid or the list, regardless of which is hidden; native
      // normalization deduplicates equivalent records from the two views.
      var name = text(block.querySelector('.title, .kcmc, [title="课程名称"], .course-name'));
      if (!name) name = text(block.querySelector('strong, b, a, font[color]'));
      if (!name) name = field(block, ['课程名称']);
      var time = field(block, ['节/周', '上课时间', '周数', '周次']) || text(block);
      var sectionMatch = /(?:第)?[（(\[]?([\d\s,，、\-－—–~～至]+)节[）)\]]?/.exec(time);
      var weeksText = time.replace(/(?:第)?[（(\[]?[\d\s,，、\-－—–~～至]+节[）)\]]?/g, '');
      var weekMatches = weeksText.match(/(?:第)?\d+(?:\s*[-－—–~～至,，、]\s*\d+)*\s*(?:\([单双]\)|（[单双]）)?周(?:\s*[（(][单双](?:周)?[）)])?/g);
      var weekday = position ? Number(position[1]) : mapped ? mapped.day : listMatch ? Number(listMatch[1]) : 0;
      var sections = sectionMatch ? sectionMatch[1].trim() : listMatch ? listMatch[2] + '-' + listMatch[3] : mapped ? mapped.sections : '';
      if (!name || !weekday || !sections || !weekMatches) {
        var missing = select([!name && '课程名称', !weekday && '星期', !sections && '节次', !weekMatches && '周次'], Boolean);
        warnings.push((name || '未命名课程') + '缺少' + missing.join('、') + '，请检查学校页面');
        return;
      }
      var location = field(block, ['上课地点', '教室', '校区/上课地点']);
      var campus = field(block, ['校区']);
      if (campus && location.indexOf(campus) < 0) location = campus + ' ' + location;
      var course = {name: name, teacher: field(block, ['教师', '任课教师']), location: location, weekday: weekday, sections: sections, weeks: weekMatches.join(',')};
      var range = clockRange(time);
      if (range) { course.start = range.start; course.end = range.end; }
      courses.push(course);
    });
    return {courses: courses, warnings: warnings, periodTimes: readTimes(doc), term: term(doc), detected: grid.detected || !!blocks.length || !!doc.querySelector('#kblist, #kbgrid_table_0, #kbgrid_table_1')};
  }
  function receive(data, win, version) {
    if (version !== requestVersion || !data || !Array.isArray(data.kbList) || data.kbList.length > 1000) return;
    var courses = [], warnings = [];
    data.kbList.forEach(function (row) {
      if (!row || !row.kcmc || row.xqj == null || !row.jcs || !row.zcd) {
        warnings.push('教务接口返回一条缺少必要字段的记录，请核对课表'); return;
      }
      var course = {name: String(row.kcmc), teacher: String(row.xm || ''), location: String(row.cdmc || ''), weekday: Number(row.xqj), sections: String(row.jcs), weeks: String(row.zcd)};
      var range = clockRange(String(row.kssj || row.qssj || '') + '-' + String(row.jssj || '')) || clockRange(String(row.sksj || ''));
      if (range) { course.start = range.start; course.end = range.end; }
      courses.push(course);
    });
    sources.set(win.document, {courses: courses, warnings: warnings, periodTimes: apiTimes(data), term: term(win.document), detected: true, version: version});
    awaitingQuery.delete(win.document);
    candidate = ''; lastSignature = ''; safeScan(false);
  }
  function endpoint(url, win) {
    try { var u = new URL(url, win.location.href); return allowed(u.href) && /\/xskbcx_cxXsKb\.html$/i.test(u.pathname); }
    catch (_) { return false; }
  }
  function rememberQuery(doc) {
    // Extraction is optional instrumentation, and must never prevent the
    // school's original XHR/fetch from being sent when a DOM reader fails.
    try { awaitingQuery.set(doc, JSON.stringify(readDom(doc).courses)); }
    catch (_) { awaitingQuery.set(doc, null); }
  }
  function install(win) {
    var doc = win.document;
    if (installed.has(doc)) return;
    installed.add(doc);
    // Monitor only the timetable response. Original requests and login behavior
    // remain owned by the school page; no credentials are replayed by the app.
    var xhrOpen = win.XMLHttpRequest.prototype.open;
    var requestMeta = new WeakMap();
    win.XMLHttpRequest.prototype.open = function () {
      requestMeta.set(this, endpoint(arguments[1], win));
      return xhrOpen.apply(this, arguments);
    };
    var xhrSend = win.XMLHttpRequest.prototype.send;
    win.XMLHttpRequest.prototype.send = function () {
      if (requestMeta.get(this)) {
        var version = ++requestVersion; pending++; sources.delete(doc); candidate = '';
        rememberQuery(doc);
        this.addEventListener('loadend', function () {
          pending = Math.max(0, pending - 1);
          try { if (this.status >= 200 && this.status < 300) receive(this.responseType === 'json' ? this.response : JSON.parse(this.responseText), win, version); } catch (_) {}
        }, {once: true});
      }
      try { return xhrSend.apply(this, arguments); }
      catch (error) { if (requestMeta.get(this)) pending = Math.max(0, pending - 1); throw error; }
    };
    if (win.fetch) {
      var originalFetch = win.fetch;
      win.fetch = function (input) {
        if (!endpoint(typeof input === 'string' || input instanceof URL ? String(input) : input.url, win)) return originalFetch.apply(this, arguments);
        var version = ++requestVersion; pending++; sources.delete(doc); candidate = '';
        rememberQuery(doc);
        var responsePromise;
        try { responsePromise = originalFetch.apply(this, arguments); }
        catch (error) { pending = Math.max(0, pending - 1); throw error; }
        return responsePromise.then(function (response) {
          try {
            response.clone().json().then(function (data) { if (response.ok) receive(data, win, version); }).catch(function () {}).finally(function () { pending = Math.max(0, pending - 1); });
          } catch (_) { pending = Math.max(0, pending - 1); }
          return response;
        }, function (error) { pending = Math.max(0, pending - 1); throw error; });
      };
    }
    new win.MutationObserver(function () { safeScan(false); }).observe(doc, {childList: true, subtree: true, characterData: true});
    doc.addEventListener('change', function (event) {
      if (event.target && /^(xnm|xqm|zcd|xqj)$/.test(event.target.id)) {
        sources.delete(doc); candidate = ''; lastSignature = '';
        requestVersion++;
        rememberQuery(doc);
      }
    });
  }
  function scan(requested) {
    if (requested) { manual = true; lastStatus = ''; promotedFrame = ''; }
    var captures = [], blocked = false, failed = false, loading = false, waiting = false, frameUrl = '', visited = new Set();
    function visit(win, depth, inheritedUrl) {
      if (depth > 5 || visited.has(win)) return;
      visited.add(win);
      var doc, pageUrl;
      try {
        doc = win.document;
        pageUrl = win.location.href;
        // A readable about:blank/srcdoc frame inherits its trusted parent.
        if (/^about:(blank|srcdoc)(?:[?#]|$)/.test(pageUrl)) pageUrl = inheritedUrl || pageUrl;
      } catch (_) { blocked = true; return; }
      if (allowed(pageUrl)) {
        try {
          try { install(win); } catch (_) { /* DOM extraction still works if hooks are unavailable. */ }
          var data = sources.get(doc) || readDom(doc);
          if (data.version) data = Object.assign({}, data, {periodTimes: select(data.periodTimes.concat(readTimes(doc)), function (value, index, all) {
            return all.findIndex(function (other) { return other.section === value.section; }) === index;
          })});
          var unchangedAfterSelection = awaitingQuery.has(doc) && (awaitingQuery.get(doc) === null || awaitingQuery.get(doc) === JSON.stringify(data.courses));
          if (unchangedAfterSelection) waiting = true;
          if (data.detected && !unchangedAfterSelection) {
            awaitingQuery.delete(doc);
            var source = new URL(pageUrl);
            captures.push({data: data, url: source.origin + source.pathname});
          }
          if (doc.readyState === 'loading') loading = true;
          doc.querySelectorAll('.loading, .datagrid-mask, #loading').forEach(function (el) {
            if (el.getClientRects().length && win.getComputedStyle(el).visibility !== 'hidden') loading = true;
          });
        } catch (_) { failed = true; }
      }
      // Inspect each iframe separately. A blocked unrelated frame must not turn
      // a parser exception into a false "opening embedded timetable" message.
      doc.querySelectorAll('iframe, frame').forEach(function (frame) {
        var target;
        try { target = new URL(frame.getAttribute('src') || 'about:blank', doc.baseURI); } catch (_) {}
        try {
          var child = frame.contentWindow;
          if (!child) return;
          void child.document;
          visit(child, depth + 1, pageUrl);
        } catch (_) {
          blocked = true;
          if (target && allowed(target.href) && /\/kbcx\/xskbcx[^/]*\.html$/i.test(target.pathname)) frameUrl = target.href;
        }
      });
    }
    visit(window, 0, '');
    if (!captures.length) {
      candidate = '';
      if (blocked && frameUrl && promotedFrame !== frameUrl) {
        promotedFrame = frameUrl;
        status('已找到内嵌课表，正在直接打开课程页面…');
        send({type: 'timetable-frame', url: frameUrl});
        return;
      }
      status(waiting ? '已更换查询条件，请点击学校页面的“查询”，等待课表更新。'
        : failed ? '课表页面读取失败，请切换学校页面的“列表”视图，再点“重新识别”。'
        : blocked ? '暂时无法读取内嵌页面。请在学校页面打开“个人课表查询”，或切换“列表”后重新识别。'
        : manual ? '尚未检测到可识别课表。请点击学校页面的“查询”，或切换“列表”后重新识别。'
        : '请登录学校教务系统，进入学生个人课表并选择要导入的学期。'); return;
    }
    if (loading || pending) { candidate = ''; status('课表正在加载，正在等待课程数据完整。'); return; }
    // Prefer the recognized timetable response; otherwise use the fullest DOM
    // table. Do not combine unrelated frames or different semesters.
    captures.sort(function (a, b) { return Number(!!b.data.version) - Number(!!a.data.version) || b.data.courses.length - a.data.courses.length; });
    var chosen = captures[0];
    if (!chosen.data.courses.length) { status(chosen.data.warnings.length ? '检测到课表，但未能识别课程：' + chosen.data.warnings[0] : '当前课表没有课程，请选择正确学期并点击查询。'); return; }
    var payload = {type: 'timetable', version: 1, sourceUrl: chosen.url, courses: chosen.data.courses, periodTimes: chosen.data.periodTimes, term: chosen.data.term, warnings: chosen.data.warnings};
    var signature = JSON.stringify(payload);
    if (candidate !== signature) { candidate = signature; candidateSince = Date.now(); status('已检测到课表，正在核对课程内容…'); return; }
    if (Date.now() - candidateSince < 1200) return;
    if (signature !== lastSignature || manual || sentVersion !== requestVersion) {
      lastSignature = signature; sentVersion = requestVersion; manual = false; send(payload);
    }
  }
  function safeScan(requested) {
    try { scan(requested); }
    catch (_) { status('课表读取未完成，请刷新学校页面，加载后点“重新识别”。'); }
  }
  window.__classflowScan = safeScan;
  safeScan(force);
  window.setInterval(function () { safeScan(false); }, 600);
}`;
