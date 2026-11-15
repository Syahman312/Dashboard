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

var DASH_VERSION = '1.0.0';
var CACHE_KEY = 'dashboard:v1';
var CACHE_SECONDS = 300;

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
  var cache = CacheService.getUserCache();
  if (!force) {
    var hit = cache.get(CACHE_KEY);
    if (hit) return hit;
  }
  var json = JSON.stringify(buildDashboard_(new Date()));
  try { cache.put(CACHE_KEY, json, CACHE_SECONDS); } catch (e) { /* payload over 100KB: skip cache */ }
  return json;
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
  return out;
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
