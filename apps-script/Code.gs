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

var DASH_VERSION = '2.2.0';
var CACHE_KEY = 'dashboard:v2';
var CACHE_SECONDS = 1800;     // 30 min; the warm-up trigger refreshes it every 15
var CACHE_CHUNK = 90000;      // CacheService values max out at 100KB

var SOURCES = [
  { key: 'flow', name: 'Flow', prop: 'FLOW_SHEET_ID', appProp: 'FLOW_APP_URL', reader: function (ss, ctx) { return readFlow_(ss, ctx); } },
  { key: 'finance', name: 'Finance', prop: 'FINANCE_SHEET_ID', appProp: 'FINANCE_APP_URL', reader: function (ss, ctx) { return readFinance_(ss, ctx); } },
  { key: 'garage', name: 'Garage', prop: 'GARAGE_SHEET_ID', appProp: 'GARAGE_APP_URL', reader: function (ss, ctx) { return readGarage_(ss, ctx); } },
  { key: 'vault', name: 'Vault', prop: 'VAULT_SHEET_ID', appProp: 'VAULT_APP_URL', optional: true, reader: function (ss, ctx) { return readVault_(ss, ctx); } }
];

// Home-screen / tab icon, served from the public repo (docs/icons). Apps Script needs a URL ending in .png.
var ICON_URL = 'https://raw.githubusercontent.com/Syahman312/Dashboard/claude/quirky-albattani-2xi1ko/docs/icons/icon-192.png';

/**
 * Two ways in, and the access key is never part of an address:
 *   GET  /exec          the dashboard page; it asks for the key once and keeps it on the device
 *   POST /exec          the data, for the home-screen app; body is {"key": "...", "force": true}
 * Addresses end up in browser history, bookmarks, chats and logs, so a key in a
 * link (…?key=) is refused rather than checked.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.format === 'json' || p.key) {
    return jsonOut_({ ok: false, error: 'locked: keys in links are not accepted. Update the dashboard app and enter the key in it.' });
  }
  var page = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  // Nice-to-haves: never let them stop the page from loading.
  try { page.setFaviconUrl(ICON_URL); } catch (err) { /* icon unavailable */ }
  try { page.addMetaTag('mobile-web-app-capable', 'yes'); } catch (err) { /* tag not allowed */ }
  return page;
}

/** Data for the home-screen app. Sent as text/plain so browsers need no preflight. */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (err) { body = {}; }
  return jsonResponse_({ key: body.key, force: body.force === true ? '1' : '' });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse_(p) {
  var body;
  try {
    checkKey_(p.key);
    body = '{"ok":true,"data":' + getDashboardJson_(p.force === '1') + '}';
  } catch (err) {
    body = JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Called from the page with google.script.run. Returns a JSON string (Dates can't cross over). */
function getDashboard(force, key) {
  checkKey_(key);
  return getDashboardJson_(force);
}

function getDashboardJson_(force) {
  if (!force) {
    var hit = cacheGet_();
    if (hit) return hit;
  }
  return refreshCache_();
}

/* ---------- Access key ---------- */

function checkKey_(given) {
  var key = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
  if (!key) throw new Error('No access key yet: run createAccessKey in the editor');
  var g = String(given || '');
  // Compare every character so the time taken does not reveal how much matched.
  var diff = g.length ^ key.length;
  for (var i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ g.charCodeAt(i % Math.max(1, g.length));
  if (diff !== 0) throw new Error('locked');
}

/**
 * Run once from the editor (and again any time you want to lock out old links).
 * The new key is printed in the execution log.
 */
function createAccessKey() {
  editorOnly_();
  // 64 hex characters from two random UUIDs (about 244 bits of randomness)
  var key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 64);
  PropertiesService.getScriptProperties().setProperty('DASH_KEY', key);
  Logger.log('Your access key (keep it private): ' + key);
  Logger.log('The previous key stops working now. On each device, open the dashboard → Connection settings and enter this key.');
  Logger.log('Never put the key in a link or bookmark.');
}

/**
 * The web app is open to anyone with its link, and any top-level function can be
 * called from a page. Functions meant for the editor refuse those calls: from the
 * editor you are the active user; an anonymous visitor has no email.
 */
function editorOnly_() {
  var me = '';
  try { me = Session.getActiveUser().getEmail(); } catch (e) { me = ''; }
  if (!me) throw new Error('Run this from the Apps Script editor.');
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
  editorOnly_();
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
    var s = { name: src.name, ok: false, url: id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : null,
      appUrl: safeAppUrl_(props.getProperty(src.appProp)), appProp: src.appProp };
    if (!id && src.optional) { s.off = true; s.ms = 0; out.sources[src.key] = s; return; }
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

  // Budget (Dashboard sheet → Budget tab), compared with this month's spending
  var dashId = props.getProperty('DASHBOARD_SHEET_ID'), fin = out.sources.finance;
  if (dashId && fin && fin.ok) {
    try {
      var b = applyBudget_(fin.summary, readBudget_(openById(dashId)), ctx);
      fin.summary.budget = b.budget;
      if (b.budget) b.budget.url = 'https://docs.google.com/spreadsheets/d/' + dashId + '/edit' + (b.gid !== undefined && b.gid !== null ? '#gid=' + b.gid : '');
      out.issues = out.issues.concat(b.issues);
    } catch (e) {
      out.issues.push({ source: 'finance', level: 'info', area: 'budget', message: 'Could not read the Budget tab', detail: String(e && e.message || e) });
    }
  }

  out.issues = out.issues.concat(crossChecks_(out.sources, ctx));
  markRecovered_(out.issues, out.sources);
  addFixes_(out.issues);
  var rank = { error: 0, warn: 1, info: 2 };
  out.issues.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  out.counts = { error: 0, warn: 0, info: 0 };
  out.issues.forEach(function (i) { out.counts[i.level]++; });
  out.brief = brief_(out.sources, out.issues, ctx);
  out.upcoming = upcoming_(out.sources, ctx);
  out.todayStrip = today_(out.sources, ctx);
  out.sync = syncHealth_(out.sources, out.issues, ctx);
  out.alerts = alerts_(out.sources, out.sync, ctx);
  out.weekly = weekly_(out.sources, ctx);
  out.review = review_(out.sources, ctx);
  return out;
}

/* ---------- Overview building blocks ---------- */

/** Today strip: tasks and habits due, next Garage reminder, Vault documents expiring within 30 days. */
function today_(sources, ctx) {
  var t = { tasks: null, habits: null, garage: null, vault: null };
  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  if (f) {
    t.tasks = { due: f.tasks.today.length, overdue: f.tasks.overdueCount || 0, done: f.tasks.doneToday,
      items: f.tasks.today.slice(0, 4).map(function (x) { return { task: x.task, time: x.time, top3: x.top3 }; }) };
    var active = (f.habits || []);
    t.habits = { total: active.length, done: active.filter(function (h) { return h.doneToday; }).length,
      items: active.map(function (h) { return { icon: h.icon, habit: h.habit, done: h.doneToday, due: !h.doneToday && h.week < h.target }; }) };
  }
  var g = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  var reminders = [];
  g.forEach(function (c) { c.renewals.forEach(function (r) { reminders.push({ car: c.name, label: r.label, date: r.date, daysLeft: r.daysLeft }); }); });
  reminders.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  t.garage = reminders[0] || null;
  var v = sources.vault && sources.vault.ok ? sources.vault.summary : null;
  if (v) t.vault = { count: v.expiring30.length + v.expired.length, expired: v.expired.length, items: v.expired.concat(v.expiring30).slice(0, 4) };
  return t;
}

/**
 * Sync health: when each app last saved to its sheet, and whether its sync is failing.
 * status: ok | stale (no save for 3+ days) | broken (failing since its last save) | error (sheet unreadable) | off
 */
function syncHealth_(sources, issues, ctx) {
  return Object.keys(sources).map(function (k) {
    var s = sources[k];
    var row = { key: k, name: s.name, lastChange: s.summary ? s.summary.lastChange || null : null, lastFailure: null, failures: 0 };
    issues.forEach(function (i) {
      if (i.source !== k || i.area !== 'sync' || !i.at) return;
      if (!row.lastFailure || i.at > row.lastFailure) row.lastFailure = i.at;
      var m = i.message.match(/(\d+)× in/); if (m && !i.recovered) row.failures += +m[1];
    });
    if (s.off) row.status = 'off';
    else if (!s.ok) row.status = 'error';
    else if (row.lastFailure && (!row.lastChange || row.lastFailure > row.lastChange + 60e3)) row.status = 'broken';
    else if (!row.lastChange || ctx.now - row.lastChange > 3 * 864e5) row.status = 'stale';
    else row.status = 'ok';
    return row;
  });
}

/** Everything that needs action, across all apps, in one list (most urgent first). */
function alerts_(sources, sync, ctx) {
  var out = [];
  var add = function (level, src, title, detail, date, view) {
    out.push({ level: level, src: src, title: title, detail: detail || '', date: date || null,
      days: date ? daysBetween_(ctx.today, date) : null, view: view || src });
  };
  sync.forEach(function (r) {
    if (r.status === 'broken') add('bad', r.key, r.name + ' sync is failing', r.failures ? r.failures + ' failures this week' : 'Its last save is older than its last failure', null, 'health');
    if (r.status === 'error') add('bad', r.key, 'Cannot read the ' + r.name + ' sheet', 'Check its Sheet ID in Script Properties', null, 'health');
  });
  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  if (f) {
    f.tasks.overdue.slice(0, 5).forEach(function (t) { add('bad', 'flow', 'Overdue: ' + t.task, '', t.date, 'flow'); });
    if (f.tasks.overdueCount > 5) add('bad', 'flow', (f.tasks.overdueCount - 5) + ' more overdue tasks', '', null, 'flow');
    var x = f.study && f.study.next;
    if (x && x.daysLeft <= 30 && x.targetHours && x.hours < x.targetHours * 0.6) add('warn', 'flow', x.code + ' exam: ' + x.hours + ' of ' + x.targetHours + ' h studied', '', x.exam, 'flow');
  }
  var g = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  g.forEach(function (c) {
    c.renewals.forEach(function (r) {
      if (r.daysLeft < 0) add('bad', 'garage', c.name + ' ' + r.label.toLowerCase() + ' expired', '', r.date, 'garage');
      else if (r.daysLeft <= 60) add(r.daysLeft <= 30 ? 'warn' : 'info', 'garage', c.name + ' ' + r.label.toLowerCase() + ' renewal', '', r.date, 'garage');
    });
  });
  var v = sources.vault && sources.vault.ok ? sources.vault.summary : null;
  if (v) {
    v.expired.forEach(function (d) { add('bad', 'vault', d.title + ' has expired', (d.icon ? d.icon + ' ' : '') + d.category + (d.owner && d.owner !== 'Me' ? ' · ' + d.owner : ''), d.expiry, 'vault'); });
    v.upcoming.filter(function (d) { return d.daysLeft <= Math.max(30, d.lead); }).forEach(function (d) {
      add(d.daysLeft <= 30 ? 'warn' : 'info', 'vault', d.title + ' expires', (d.icon ? d.icon + ' ' : '') + d.category + (d.owner && d.owner !== 'Me' ? ' · ' + d.owner : ''), d.expiry, 'vault');
    });
  }
  var fin = sources.finance && sources.finance.ok ? sources.finance.summary : null;
  if (fin) {
    (fin.recurring || []).filter(function (r) { return r.daysUntil >= -3 && r.daysUntil <= 7; }).forEach(function (r) {
      add('info', 'finance', r.name + ' · RM ' + r.amount.toFixed(2), 'Expected from ' + r.account, r.next, 'money');
    });
    if (fin.budget) fin.budget.rows.filter(function (b) { return b.budget > 0 && b.spent > b.budget; }).forEach(function (b) {
      add('warn', 'finance', 'Over budget: ' + b.category, 'RM ' + b.spent.toFixed(2) + ' of RM ' + b.budget.toFixed(2), null, 'budget');
    });
    if (fin.payslip && fin.payslip.daysAgo > 35) add('info', 'finance', 'Add your latest payslip', 'Last one ' + fin.payslip.date, null, 'money');
  }
  var rank = { bad: 0, warn: 1, info: 2 };
  return out.sort(function (a, b) {
    var byLevel = rank[a.level] - rank[b.level];
    if (byLevel) return byLevel;
    // Sync problems lead: nothing else is trustworthy while an app cannot save.
    var sa = a.view === 'health' ? 0 : 1, sb = b.view === 'health' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    var da = a.date || '9999-99-99', db = b.date || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  });
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
    var syncFails = issues.filter(function (i) { return i.source === k && i.area === 'sync' && !i.recovered; });
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

/**
 * Link to the app itself (Script Properties FLOW_APP_URL, FINANCE_APP_URL, GARAGE_APP_URL).
 * Only https links are passed to the page.
 */
function safeAppUrl_(v) {
  v = String(v || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : null;
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
  editorOnly_();
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
