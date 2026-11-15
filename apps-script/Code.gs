/**
 * Morning Dashboard — read-only view over the Garage, Finance and Flow Sheets.
 *
 * The code only ever reads. Apps Script needs the full "spreadsheets" scope for
 * SpreadsheetApp.openById (the readonly scope is not accepted for it).
 *
 * Deploy as a Web App: Execute as "Me", Who has access "Only myself".
 * Sheet IDs live in Script Properties (Project Settings → Script Properties):
 *   GARAGE_SHEET_ID, FINANCE_SHEET_ID, FLOW_SHEET_ID
 */

var DASH_VERSION = '1.2.0';
var CACHE_KEY = 'dashboard:v2';
var CACHE_SECONDS = 1800;     // 30 min; the warm-up trigger refreshes it every 15
var CACHE_CHUNK = 90000;      // CacheService values max out at 100KB

var SOURCES = [
  { key: 'flow', name: 'Flow', prop: 'FLOW_SHEET_ID', reader: function (ss, ctx) { return readFlow_(ss, ctx); } },
  { key: 'finance', name: 'Finance', prop: 'FINANCE_SHEET_ID', reader: function (ss, ctx) { return readFinance_(ss, ctx); } },
  { key: 'garage', name: 'Garage', prop: 'GARAGE_SHEET_ID', reader: function (ss, ctx) { return readGarage_(ss, ctx); } }
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Called from the page. Returns a JSON string (Dates can't cross google.script.run). */
function getDashboard(force) {
  if (!force) {
    var hit = cacheGet_();
    if (hit) return hit;
  }
  return refreshCache_();
}

function refreshCache_() {
  var json = JSON.stringify(buildDashboard_(new Date()));
  cachePut_(json);
  return json;
}

function cachePut_(json) {
  var cache = CacheService.getScriptCache(), parts = {}, n = Math.ceil(json.length / CACHE_CHUNK);
  for (var i = 0; i < n; i++) parts[CACHE_KEY + ':' + i] = json.substr(i * CACHE_CHUNK, CACHE_CHUNK);
  parts[CACHE_KEY] = String(n);
  try { cache.putAll(parts, CACHE_SECONDS); } catch (e) { /* cache is best-effort */ }
}

function cacheGet_() {
  var cache = CacheService.getScriptCache();
  var n = +cache.get(CACHE_KEY);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(CACHE_KEY + ':' + i);
  var got = cache.getAll(keys), out = '';
  for (var j = 0; j < n; j++) {
    if (got[keys[j]] === undefined) return null;
    out += got[keys[j]];
  }
  return out;
}

/**
 * Optional: run installWarmUp once from the editor. Every 15 minutes between
 * 6am and midnight it re-reads the Sheets, so the page opens instantly.
 */
function installWarmUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'warmUp') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('warmUp').timeBased().everyMinutes(15).create();
  Logger.log('Warm-up installed: the dashboard will refresh every 15 minutes from 6am.');
}

function warmUp() {
  var hour = +Utilities.formatDate(new Date(), DASH.TZ, 'H');
  if (hour >= 6) refreshCache_();
}

function buildDashboard_(now, openById) {
  openById = openById || function (id) { return SpreadsheetApp.openById(id); };
  var props = PropertiesService.getScriptProperties();
  var ctx = { now: now.getTime(), today: fmtDate_(now) };
  var out = { version: DASH_VERSION, generatedAt: ctx.now, today: ctx.today, sources: {}, issues: [] };

  SOURCES.forEach(function (src) {
    var t0 = Date.now();
    var id = props.getProperty(src.prop);
    var s = { name: src.name, ok: false, url: id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : null };
    try {
      if (!id) throw new Error('Script Property ' + src.prop + ' is not set');
      var ss = openById(id);
      var res = src.reader(ss, ctx);
      s.ok = true;
      s.summary = res.summary;
      out.issues = out.issues.concat(res.issues);
    } catch (e) {
      s.error = String(e && e.message || e);
      out.issues.push({ source: src.key, level: 'error', area: 'connection', message: 'Could not read the ' + src.name + ' sheet', detail: s.error });
    }
    s.ms = Date.now() - t0;
    out.sources[src.key] = s;
  });

  out.issues = out.issues.concat(crossChecks_(out.sources, ctx));
  var rank = { error: 0, warn: 1, info: 2 };
  out.issues.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  out.counts = { error: 0, warn: 0, info: 0 };
  out.issues.forEach(function (i) { out.counts[i.level]++; });
  out.brief = brief_(out.sources, out.issues, ctx);
  out.upcoming = upcoming_(out.sources, ctx);
  return out;
}

/** A handful of plain sentences for the top of the page. tone: bad | warn | good | info */
function brief_(sources, issues, ctx) {
  var out = [];
  var push = function (tone, src, text) { out.push({ tone: tone, src: src, text: text }); };

  // 1. Broken syncs come first: nothing else is trustworthy while they fail.
  ['flow', 'finance', 'garage'].forEach(function (k) {
    var s = sources[k];
    if (!s) return;
    if (!s.ok) { push('bad', k, s.name + ' sheet could not be read'); return; }
    var syncFails = issues.filter(function (i) { return i.source === k && i.area === 'sync'; });
    if (syncFails.length) {
      var n = 0;
      syncFails.forEach(function (i) { var m = i.message.match(/(\d+)× in/); if (m) n = Math.max(n, +m[1]); });
      push('bad', k, s.name + ' is failing to sync' + (n ? ' (' + n + ' failures this week)' : '') + ' — check its Web App URL');
    }
  });

  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  if (f) {
    var t = f.tasks, parts = [];
    if (t.today.length) parts.push(t.today.length + ' due today');
    if (t.overdueCount) parts.push(t.overdueCount + ' overdue');
    if (parts.length) push(t.overdueCount ? 'warn' : 'info', 'flow', 'Tasks: ' + parts.join(', '));
    else if (!t.openTotal && !t.doneToday && f.lastChange === null) push('warn', 'flow', 'No tasks have reached the sheet from Flow yet');
    else push('good', 'flow', 'No tasks due today');
    var x = f.study && f.study.next;
    if (x && x.daysLeft <= 60) {
      var behind = x.targetHours && x.hours < x.targetHours * Math.max(0, 1 - x.daysLeft / 90);
      push(behind ? 'warn' : 'info', 'flow', x.code + ' exam in ' + x.daysLeft + ' days' +
        (x.targetHours ? ' — ' + x.hours + ' of ' + x.targetHours + ' h studied' : ''));
    }
    if (f.close && f.close.behind) push('warn', 'flow', 'Month-end close ' + f.close.period + ': ' + f.close.behind + ' item(s) behind (today is WD' + f.close.wd + ')');
  }

  var m = sources.finance && sources.finance.ok ? sources.finance.summary.month : null;
  if (m) {
    var diff = round2_(m.spent - m.prevSamePoint);
    push(diff > 0 ? 'warn' : 'good', 'finance', 'Spent RM ' + m.spent.toFixed(2) + ' this month, RM ' + Math.abs(diff).toFixed(2) +
      (diff > 0 ? ' more' : ' less') + ' than this point last month' + (m.projected ? ' (on pace for RM ' + Math.round(m.projected) + ')' : ''));
  }

  var g = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  g.forEach(function (c) {
    c.renewals.forEach(function (r) {
      if (r.daysLeft <= 45) push(r.daysLeft < 0 ? 'bad' : 'warn', 'garage', c.name + ' ' + r.label.toLowerCase() + (r.daysLeft < 0 ? ' expired' : ' due in ' + r.daysLeft + ' days'));
    });
  });
  return out;
}

/** Dated things in the next 45 days, from every app, in one list. */
function upcoming_(sources, ctx) {
  var out = [], until = addDays_(ctx.today, 45);
  var add = function (date, label, src, tone) {
    if (date && date >= ctx.today && date <= until) out.push({ date: date, days: daysBetween_(ctx.today, date), label: label, src: src, tone: tone || '' });
  };
  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  if (f) {
    (f.tasks.upcoming || []).forEach(function (t) { add(t.date, t.task, 'flow'); });
    if (f.study && f.study.next) add(f.study.next.exam, f.study.next.code + ' exam', 'flow', 'warn');
  }
  var fin = sources.finance && sources.finance.ok ? sources.finance.summary : null;
  if (fin) {
    (fin.goals || []).forEach(function (g) { add(g.due, 'Goal: ' + g.goal, 'finance'); });
    if (fin.payslip) {
      var day = +fin.payslip.date.slice(8, 10), mk = monthKey_(ctx.today);
      for (var i = 0; i < 2; i++) {
        var k = addMonths_(mk, i);
        var last = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).getUTCDate();
        var d = k + '-' + pad_(Math.min(day, last));
        if (d > fin.payslip.date && d >= ctx.today) { add(d, 'Payday (expected)', 'finance', 'good'); break; }
      }
    }
  }
  var g = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  g.forEach(function (c) { c.renewals.forEach(function (r) { add(r.date, c.name + ' ' + r.label.toLowerCase(), 'garage', 'warn'); }); });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return out.slice(0, 8);
}

/** Checks that need two apps at once. */
function crossChecks_(sources, ctx) {
  var issues = makeIssues_('cross');
  var g = sources.garage, f = sources.finance;
  if (g && g.ok && f && f.ok && g.summary.cars.length) {
    var garageFuel = sum_(g.summary.cars, function (c) { return c.fuel.monthCost; });
    var fin = f.summary.topCategories || [];
    var fuelCat = fin.filter(function (c) { return /fuel|petrol|minyak/i.test(c.category); });
    var financeFuel = sum_(fuelCat, function (c) { return c.spent; });
    if (garageFuel > 0 && fuelCat.length && Math.abs(garageFuel - financeFuel) > 5) {
      issues.add('info', 'fuel', 'Fuel this month: RM ' + garageFuel.toFixed(2) + ' in Garage vs RM ' + financeFuel.toFixed(2) + ' in Finance',
        'One of the apps is missing a fill-up.');
    }
  }
  return issues.list;
}

/** Run once from the editor to check access and see the output in the log. */
function testDashboard() {
  var d = buildDashboard_(new Date());
  Object.keys(d.sources).forEach(function (k) {
    var s = d.sources[k];
    Logger.log(s.name + ': ' + (s.ok ? 'OK' : 'FAILED') + ' (' + s.ms + 'ms) ' + (s.error || ''));
  });
  Logger.log('Issues: ' + d.counts.error + ' errors, ' + d.counts.warn + ' warnings, ' + d.counts.info + ' info');
  d.issues.forEach(function (i) {
    Logger.log('[' + i.level + '] ' + i.source + '/' + i.area + ': ' + i.message + (i.detail ? ' — ' + i.detail : ''));
  });
}
