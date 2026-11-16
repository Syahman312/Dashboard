const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeSpreadsheet } = require('./harness');
const fx = require('./fixtures');

const PROPS = { GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w' };
const BOOKS = { g: fx.garage(), f: fx.finance(), w: fx.flow() };

function build() {
  const gs = load(PROPS);
  return gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(BOOKS[id]));
}
const has = (issues, src, re) => issues.some(i => i.source === src && re.test(i.message));

test('shared: date parsing', () => {
  const gs = load();
  assert.equal(gs.toISODate_('2026-11-15'), '2026-11-15');
  assert.equal(gs.toISODate_('11/15/2026 13:08:41'), '2026-11-15');
  assert.equal(gs.toISODate_(new Date('2026-11-15T00:30:00+08:00')), '2026-11-15'); // Malaysia midnight, not UTC
  assert.equal(gs.toISODate_('0021-03-02'), '0021-03-02');
  assert.equal(gs.toISODate_('2026-02-30'), null);
  assert.equal(gs.toISODate_('hello'), null);
  assert.equal(gs.toTimestamp_('11/15/2026 08:00:00'), Date.parse('2026-11-15T08:00:00+08:00'));
  assert.equal(gs.isDateOnly_('11/15/2026'), true);
  assert.equal(gs.weekStart_('2026-11-15'), '2026-11-09'); // Sunday -> Monday before
});

test('shared: amounts and booleans', () => {
  const gs = load();
  assert.equal(gs.toAmount_('RM 1,234.50'), 1234.5);
  assert.equal(gs.toAmount_('(12.00)'), -12);
  assert.equal(gs.toAmount_('-0.68'), -0.68);
  assert.equal(gs.toAmount_('abc'), null);
  assert.equal(gs.toBool_('TRUE'), true);
  assert.equal(gs.toBool_('yes'), true);
  assert.equal(gs.toBool_(''), false);
  assert.equal(gs.stripIcon_('🍽️ Food & Drinks'), 'Food & Drinks');
});

test('all three sources load', () => {
  const d = build();
  for (const k of ['flow', 'finance', 'garage']) assert.ok(d.sources[k].ok, k + ': ' + d.sources[k].error);
  assert.equal(d.today, fx.TODAY);
  JSON.stringify(d); // must be serialisable
});

test('garage summary and checks', () => {
  const d = build();
  const car = d.sources.garage.summary.cars[0];
  assert.equal(car.name, 'Demo Car');
  assert.equal(car.renewals[0].daysLeft, 24);
  assert.equal(car.lastService.date, '2026-06-20');
  assert.ok(car.fuel.economy.kmPerL > 0);
  assert.equal(car.fuel.monthCost, 100); // 2 fills in November so far
  const i = d.issues;
  assert.ok(has(i, 'garage', /typo year/), 'typo year');
  assert.ok(has(i, 'garage', /Road tax expires in 24 days/), 'road tax');
  assert.ok(has(i, 'garage', /odometer goes backwards/), 'odometer');
  const pre = i.find(x => /before the car was made \(2015\)/.test(x.message));
  assert.ok(pre, 'pre-car-year date');
  assert.equal(pre.level, 'error');
  assert.match(pre.detail, /between 2026-08-24 and 2026-08-31/);
  assert.ok(has(i, 'garage', /Wiper blades.*not in the service list/), 'unknown item');
  assert.ok(has(i, 'garage', /deleted row/), 'deleted rows');
});

test('finance summary and checks', () => {
  const d = build();
  const s = d.sources.finance.summary;
  assert.equal(s.netWorth, Math.round((75.9 + 1880.21 + 402.32 + 11.88 + 0.59 + 16000 + 20000 - 1231.21 - 9800 - 15000) * 100) / 100);
  assert.equal(s.trend.length, 12);
  assert.ok(s.month.spent > 0);
  assert.ok(!s.topCategories.some(c => /Balance adjustment/.test(c.category)), 'adjustments excluded');
  assert.equal(s.payslip.date, '2026-10-23');
  const i = d.issues;
  assert.ok(has(i, 'finance', /Study Loan.*negative/), 'owed sign');
  assert.ok(has(i, 'finance', /positive amount.*Food/), 'income in spending category');
  assert.ok(has(i, 'finance', /no category/), 'no category');
  assert.ok(has(i, 'finance', /"Old Wallet"/), 'unknown account');
  assert.ok(has(i, 'finance', /written 2 ways/), 'icon variants');
  assert.ok(has(i, 'finance', /Similar categories "🍜 Food" and "🍽️ Food & Drinks"/), 'similar categories');
  assert.ok(!has(i, 'finance', /Belanja GF/), 'no false match on shared first word');
  assert.equal(i.find(x => /Gold price/.test(x.message)).level, 'warn', 'gold failures are warnings');
  assert.ok(has(i, 'finance', /duplicate/), 'duplicates');
  assert.ok(has(i, 'finance', /Gross − Deductions ≠ Net/), 'payslip maths');
  assert.ok(has(i, 'finance', /No connection to the script.*6×/), 'sync log');
  assert.ok(has(i, 'finance', /Tab "Sheet1" is empty/), 'empty tab');
  assert.ok(has(i, 'finance', /balance adjustments this month/), 'adjustments');
});

test('flow summary and checks', () => {
  const d = build();
  const s = d.sources.flow.summary;
  assert.deepEqual(JSON.parse(JSON.stringify(s.tasks.today.map(t => t.id))), ['t1', 't2', 't3', 't10']);
  assert.equal(s.tasks.overdueCount, 2);
  assert.equal(s.tasks.doneToday, 1);
  assert.equal(s.tasks.top3.length, 2);
  assert.equal(s.study.next.code, 'FR');
  assert.equal(s.study.next.daysLeft, 19);
  assert.equal(s.study.today, 120); // 90 + 30 (orphan still counts as time studied)
  const read = s.habits.find(h => h.habit === 'Read');
  assert.equal(read.doneToday, true);
  assert.equal(read.streak, 3);
  assert.ok(!s.habits.some(h => h.habit === 'Old habit'), 'archived hidden');
  assert.equal(s.close.period, '2026-10');
  assert.equal(s.close.total, 4);
  assert.equal(s.close.done, 1);
  const i = d.issues;
  assert.ok(has(i, 'flow', /no title/), 'no title');
  assert.ok(has(i, 'flow', /not in HH:mm/), 'time format');
  assert.ok(has(i, 'flow', /"Done At"/), 'done at');
  assert.ok(has(i, 'flow', /ACCA paper that does not exist/), 'bad paper link');
  assert.ok(has(i, 'flow', /habit that does not exist/), 'bad habit link');
  assert.ok(has(i, 'flow', /confidence outside/), 'confidence range');
  assert.ok(has(i, 'flow', /Could not reach the server.*2×/), 'sync log');
  assert.ok(has(i, 'flow', /only a date/), 'date-only log');
});

test('missing columns and missing sheets are reported, not crashed', () => {
  const gs = load(PROPS);
  const books = { g: { Sheet1: [['id', 'type']] }, f: fx.finance(), w: fx.flow() };
  const d = gs.buildDashboard_(fx.NOW, id => {
    if (id === 'f') throw new Error('No access');
    return fakeSpreadsheet(books[id]);
  });
  assert.equal(d.sources.finance.ok, false);
  assert.ok(has(d.issues, 'finance', /Could not read/));
  assert.ok(has(d.issues, 'garage', /missing column/));
  assert.equal(d.issues[0].level, 'error'); // errors sorted first
});

test('unset sheet ID is a clear error', () => {
  const gs = load({});
  const d = gs.buildDashboard_(fx.NOW, () => { throw new Error('should not open'); });
  assert.match(d.sources.flow.error, /FLOW_SHEET_ID/);
});

test('brief, coming up, freshness and row links', () => {
  const d = build();
  const texts = d.brief.map(b => b.text).join(' | ');
  assert.doesNotMatch(texts, /Flow is failing to sync/, 'Flow saved after its last failure: recovered');
  assert.match(texts, /Finance is failing to sync \(6 failures/);
  assert.match(texts, /Tasks: 4 due today, 2 overdue/);
  assert.match(texts, /FR exam in 19 days/);
  assert.match(texts, /on pace for RM \d+/);
  assert.match(texts, /Demo Car road tax due in 24 days/);
  assert.equal(d.brief[0].tone, 'bad', 'sync problems lead');

  const up = d.upcoming.map(u => u.date + ' ' + u.label);
  assert.ok(up.includes('2026-11-17 Plan week'));
  assert.ok(up.includes('2026-11-23 Payday (expected)'));
  assert.ok(up.includes('2026-12-04 FR exam'));
  assert.ok(up.includes('2026-12-09 Demo Car road tax'));
  assert.deepEqual(JSON.parse(JSON.stringify(up)), JSON.parse(JSON.stringify(up)).slice().sort());

  assert.equal(d.sources.flow.summary.lastChange, Date.parse('2026-11-15T07:00:00+08:00'));
  assert.equal(d.sources.finance.summary.lastChange, 1794700000000, 'scans _data across cells');
  assert.equal(d.sources.garage.summary.lastChange, Date.parse('2026-11-14T20:00:00+08:00'));

  const noTitle = d.issues.find(i => /have no title/.test(i.message));
  assert.deepEqual(JSON.parse(JSON.stringify(noTitle.ref)), { gid: 1000, row: 9 });
  const typo = d.issues.find(i => /0021-03-02/.test(i.message));
  assert.equal(typo.ref.row, 10);
});

test('cache splits large payloads into chunks and joins them back', () => {
  const gs = load(PROPS);
  const store = {};
  gs.CacheService.getScriptCache = () => ({
    get: k => store[k] === undefined ? null : store[k],
    getAll: ks => Object.fromEntries(ks.filter(k => k in store).map(k => [k, store[k]])),
    putAll: o => Object.assign(store, o)
  });
  const big = JSON.stringify({ x: 'y'.repeat(250000) });
  gs.cachePut_(big);
  assert.equal(store[gs.CACHE_KEY], '3');
  assert.equal(gs.cacheGet_(), big);
});

test('chart data series', () => {
  const d = build();
  const f = d.sources.finance.summary;
  assert.equal(f.daily.cur.length, 15);           // 15 Nov
  assert.equal(f.daily.prev.length, 31);          // October
  assert.equal(f.daily.cur[14], 20.3, 'today spend lands on day 15');
  const nov = f.catsByMonth['2026-11'];
  assert.ok(nov.length > 0 && nov.length <= 9);
  assert.equal(Math.round(nov.reduce((n, c) => n + c.spent, 0) * 100) / 100, f.month.spent, 'categories add up to month total');
  assert.ok(f.accounts.find(a => a.name === 'Study Loan').owed > 0, 'owed shown positive');

  const fl = d.sources.flow.summary;
  assert.equal(fl.study.daily.length, 30);
  assert.equal(fl.study.papers[0].code, 'FR');
  const read = fl.habits.find(h => h.habit === 'Read');
  assert.equal(read.days.length, 35);
  assert.deepEqual(JSON.parse(JSON.stringify(read.days.slice(-3))), [1, 1, 1]);

  const car = d.sources.garage.summary.cars[0];
  assert.equal(car.monthly.length, 12);
  const nov2 = car.monthly[11];
  assert.equal(nov2.month, '2026-11');
  assert.equal(nov2.fuel, 100);
  assert.equal(car.monthly.find(m => m.month === '2026-06').service, 188);
  assert.equal(car.history[0].date, '2026-06-20');
  assert.ok(JSON.stringify(d).length < 200000, 'payload stays small');
});

test('access key protects the data and never travels in a link', () => {
  const props = Object.assign({}, PROPS);
  const gs = load(props);
  gs.SpreadsheetApp = { openById: id => fakeSpreadsheet(BOOKS[id]) };
  const post = body => JSON.parse(gs.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).body);
  const getJson = params => JSON.parse(gs.doGet({ parameter: params }).body);

  // No key set yet: closed, not open
  assert.equal(post({}).ok, false);
  assert.match(post({}).error, /createAccessKey/);

  // createAccessKey only works from the editor (signed-in user), not from a page visitor
  assert.throws(() => gs.createAccessKey(), /editor/);
  assert.throws(() => gs.installWarmUp(), /editor/);
  props.__user = 'owner@example.com';
  gs.createAccessKey();
  const key = props.DASH_KEY;
  assert.equal(key.length, 64);
  assert.match(key, /^[0-9a-f]{64}$/);
  delete props.__user;

  // Wrong, partial, padded or malformed keys are refused
  assert.deepEqual(post({ key: 'wrong' }), { ok: false, error: 'locked' });
  assert.equal(post({ key: key.slice(0, 63) }).ok, false, 'prefix is not enough');
  assert.equal(post({ key: key + 'x' }).ok, false, 'extra characters rejected');
  assert.equal(post('not json').ok, false, 'garbage body refused');

  // The right key in the request body works
  const good = post({ key, force: true });
  assert.equal(good.ok, true);
  assert.ok(good.data.sources.finance.ok);

  // A key in a link is refused outright, even the correct one
  for (const params of [{ format: 'json', key }, { key }, { format: 'json' }]) {
    const r = getJson(params);
    assert.equal(r.ok, false);
    assert.match(r.error, /not accepted/);
    assert.equal(r.data, undefined, 'no data returned for keys in links');
  }

  // Rotating the key locks out the old one at once
  props.__user = 'owner@example.com';
  gs.createAccessKey();
  delete props.__user;
  assert.notEqual(props.DASH_KEY, key);
  assert.equal(post({ key }).ok, false, 'old key stops working');
  assert.equal(post({ key: props.DASH_KEY }).ok, true);

  assert.throws(() => gs.getDashboard(true, 'nope'), /locked/);
  assert.ok(JSON.parse(gs.getDashboard(true, props.DASH_KEY)).sources);
});

test('no page puts the key into an address', () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');
  const code = html.slice(html.indexOf('<script>'));
  assert.doesNotMatch(code, /['"&?]key=['"]?\s*\+/, 'no "key=" + value concatenation');
  assert.doesNotMatch(code, /loc\.parameter\.key/, 'no reading the key from the address');
  assert.match(code, /method: 'POST'/);
});

test('phone app page is in step with Index.html', () => {
  const fs = require('fs');
  const pages = require('../scripts/build-pages');
  assert.ok(pages.inSync(), 'docs/index.html is out of date: run npm run build:pages');
  assert.ok(!pages.build().includes('\r'), 'build output uses \\n line endings');
  assert.match(pages.build(), /^<!DOCTYPE html>/);
});

test('every problem says how to fix it and where to go', () => {
  const d = build();
  const noFix = d.issues.filter(i => !i.fix || !i.fix.steps.length);
  assert.deepEqual(JSON.parse(JSON.stringify(noFix.map(i => i.source + '/' + i.area + ': ' + i.message))), []);
  const noLink = d.issues.filter(i => !i.ref && i.source !== 'cross');
  assert.deepEqual(JSON.parse(JSON.stringify(noLink.map(i => i.message))), [], 'every problem links to a row or tab');
  const sync = d.issues.find(i => i.source === 'finance' && i.area === 'sync');
  assert.match(sync.fix.steps[1], /Finance → Settings → Sync/);
});

test('a sync failure counts as recovered once the app saves again', () => {
  const books = { g: fx.garage(), f: fx.finance(), w: fx.flow() };
  // Flow failed on 15 Nov at midnight (date-only rows) and saved at 07:00: recovered.
  const gs = load(PROPS);
  const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(books[id]));
  const flowSync = d.issues.find(i => i.source === 'flow' && i.area === 'sync');
  assert.equal(flowSync.recovered, true);
  assert.equal(flowSync.level, 'info');
  assert.match(flowSync.message, /^Recovered: /);
  assert.ok(!d.brief.some(b => /Flow is failing to sync/.test(b.text)), 'brief no longer warns about Flow sync');
  // Finance last failed at 15:30, after its last save: still a live error.
  const finSync = d.issues.find(i => i.source === 'finance' && i.area === 'sync');
  assert.equal(finSync.level, 'error');
  assert.ok(!finSync.recovered);
});

test('app links come from Script Properties and must be https', () => {
  const gs = load(Object.assign({}, PROPS, {
    FLOW_APP_URL: 'https://example.github.io/flow/',
    FINANCE_APP_URL: 'javascript:alert(1)',
    GARAGE_APP_URL: ' https://script.google.com/macros/s/AKfyGarage/exec '
  }));
  const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(BOOKS[id]));
  assert.equal(d.sources.flow.appUrl, 'https://example.github.io/flow/');
  assert.equal(d.sources.finance.appUrl, null, 'non-https rejected');
  assert.equal(d.sources.garage.appUrl, 'https://script.google.com/macros/s/AKfyGarage/exec');
  assert.equal(d.sources.finance.appProp, 'FINANCE_APP_URL');
});
