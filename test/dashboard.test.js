const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fakeSpreadsheet } = require('./harness');
const fx = require('./fixtures');

const PROPS = { GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w', VAULT_SHEET_ID: 'v', DASHBOARD_SHEET_ID: 'd',
  NEXTROLE_SHEET_ID: 'c', VOYAGE_SHEET_ID: 'y', NEST_SHEET_ID: 'n' };
const BOOKS = { g: fx.garage(), f: fx.finance(), w: fx.flow(), v: fx.vault(), d: fx.dashboard(), c: fx.career(), y: fx.voyage(), n: fx.nest() };

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
  const dates = d.upcoming.map(u => u.date).join(',');
  assert.equal(dates, d.upcoming.map(u => u.date).sort().join(','), 'sorted by date');

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

test('vault: expiring documents, lead times and privacy', () => {
  const d = build();
  const v = d.sources.vault;
  assert.ok(v.ok, v.error);
  const s = v.summary;
  assert.equal(s.total, 6, 'archived document ignored');
  assert.deepEqual(JSON.parse(JSON.stringify(s.expired.map(x => x.title))), ['Car insurance']);
  assert.deepEqual(JSON.parse(JSON.stringify(s.expiring30.map(x => x.title))), ['Medical (encrypted)', 'Driving licence']);
  const json = JSON.stringify(d);
  assert.ok(!json.includes('SECRET-'), 'document numbers never sent');
  assert.ok(!json.includes('private note'), 'notes never sent');
  assert.ok(!json.includes('EncryptedTitle'), 'encrypted titles never sent');
  const i = d.issues.filter(x => x.source === 'vault');
  assert.ok(i.some(x => x.level === 'error' && /Car insurance expired 3 days ago/.test(x.message)));
  assert.ok(i.some(x => /Passport expires in 120 days/.test(x.message)), 'travel lead time is 180 days');
  assert.ok(i.some(x => /expiry date that cannot be read/.test(x.message)));
  assert.ok(i.every(x => x.fix), 'every vault problem has fix steps');
});

test('vault is optional', () => {
  const gs = load({ GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w' });
  const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(BOOKS[id]));
  assert.equal(d.sources.vault.off, true);
  assert.ok(!d.issues.some(i => i.source === 'vault'));
  assert.equal(d.todayStrip.vault, null);
});

test('money: budget and recurring payments', () => {
  const d = build();
  const f = d.sources.finance.summary;
  const b = f.budget;
  assert.equal(b.total, 600);
  assert.equal(b.spent, f.month.spent);
  const food = b.rows.find(r => r.category === '🍜 Food');
  assert.ok(food.spent > food.budget, 'over budget');
  assert.ok(d.issues.some(i => i.area === 'budget' && /Food: RM .*over by/.test(i.message)));
  assert.ok(b.rows[0].pct >= b.rows[b.rows.length - 1].pct, 'most-used budget first');
  const netflix = f.recurring.find(r => /netflix/i.test(r.name));
  assert.ok(netflix, 'Netflix detected as recurring');
  assert.equal(netflix.amount, 54.9);
  assert.ok(!f.recurring.some(r => /food/i.test(r.name)), 'everyday spending is not recurring');
});

test('today strip, sync health and alerts', () => {
  const d = build();
  const t = d.todayStrip;
  assert.equal(t.tasks.due, 4);
  assert.equal(t.tasks.overdue, 2);
  assert.ok(t.habits.items.some(h => h.habit === 'Read' && h.done));
  assert.ok(t.habits.items.some(h => h.habit === 'Run' && h.due));
  assert.equal(t.garage.label, 'Road tax');
  assert.equal(t.vault.count, 3);
  assert.equal(t.vault.expired, 1);

  const sync = Object.fromEntries(d.sync.map(r => [r.key, r]));
  assert.equal(sync.flow.status, 'ok', 'Flow saved after its last failure');
  assert.equal(sync.finance.status, 'broken', 'Finance failed after its last save');
  assert.equal(sync.vault.status, 'ok');

  const a = d.alerts;
  const levels = a.map(x => x.level);
  assert.deepEqual(levels, levels.slice().sort((x, y) => ['bad', 'warn', 'info'].indexOf(x) - ['bad', 'warn', 'info'].indexOf(y)), 'most urgent first');
  const titles = a.map(x => x.title).join(' | ');
  assert.match(titles, /Finance sync is failing/);
  assert.equal(a[0].title, 'Finance sync is failing', 'broken sync leads the list');
  assert.match(titles, /Overdue: Call insurer/);
  assert.match(titles, /Car insurance has expired/);
  assert.match(titles, /Demo Car road tax renewal/);
  assert.match(titles, /Over budget: 🍜 Food/);
  assert.match(titles, /Driving licence expires/);
});

test('setup finds each app sheet by its contents, newest copy first', () => {
  const props = { FLOW_SHEET_ID: 'old-flow', FINANCE_SHEET_ID: 'f' };
  const gs = load(props);
  const books = {
    'new-flow': fx.flow(), 'old-flow': fx.flow(), f: fx.finance(), g: fx.garage(), v: fx.vault(), dash: fx.dashboard()
  };
  const files = [ // already sorted newest first, as listMySpreadsheets_ returns them
    { id: 'g', name: 'Car Tracker', updated: 9 }, { id: 'dash', name: 'Dashboard', updated: 8 },
    { id: 'f', name: 'Finance tracker', updated: 7 }, { id: 'v', name: 'Vault Data', updated: 6 },
    { id: 'new-flow', name: 'Flow Data', updated: 5 }, { id: 'old-flow', name: 'Flow Data Source Script', updated: 1 }
  ];
  const report = gs.findAppSheets_(files, id => fakeSpreadsheet(books[id]), {
    getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }
  });
  assert.equal(props.FLOW_SHEET_ID, 'new-flow', 'moved to the newer Flow sheet');
  assert.equal(props.FINANCE_SHEET_ID, 'f');
  assert.equal(props.GARAGE_SHEET_ID, 'g');
  assert.equal(props.VAULT_SHEET_ID, 'v');
  const text = report.join(' | ');
  assert.match(text, /Flow: now "Flow Data" \(was a different sheet\)/);
  assert.match(text, /Finance: "Finance tracker" \(unchanged\)/);
  assert.match(text, /Garage: now "Car Tracker"/);
});

test('weekly trend: last 7 days against the 7 before', () => {
  const d = build();
  const by = k => d.weekly.find(w => w.key === k);
  const spend = by('spend');
  assert.ok(spend, 'spending is measured');
  assert.equal(spend.unit, 'rm');
  // spending going down is good, going up is bad
  if (spend.dir === 'down') assert.equal(spend.good, true);
  if (spend.dir === 'up') assert.equal(spend.good, false);
  const fin = d.sources.finance.summary;
  const days = Object.keys(fin.spendDays);
  assert.ok(days.every(x => x >= '2026-11-02' && x <= '2026-11-15'), 'only the last 14 days');
  const study = by('study');
  assert.ok(study && study.unit === 'h');
  assert.equal(study.good, study.dir === 'flat' ? null : study.dir === 'up');
  assert.ok(by('car'));
});

test('month review: last 3 full months with budget and plain highlights', () => {
  const d = build();
  assert.equal(d.review.length, 3);
  assert.equal(d.review.map(r => r.month).join(), '2026-10,2026-09,2026-08');
  const oct = d.review[0];
  assert.equal(oct.name, 'October 2026');
  const t = d.sources.finance.summary.trend.find(x => x.month === '2026-10');
  assert.equal(oct.money.spent, t.spent);
  assert.ok(oct.money.top.length <= 3);
  assert.ok(oct.budget && Array.isArray(oct.budget.over));
  oct.budget.over.forEach(o => assert.ok(o.spent > o.budget));
  assert.ok(oct.wins.concat(oct.watch).every(s => !/RM \d{4}/.test(s)), 'amounts use thousands commas');
  assert.ok(oct.car && oct.car.cost >= 0);
  // habits only count from the day they were first ticked: no fake 0% for months before
  d.review.forEach(r => { if (r.flow.habitRate !== null) assert.ok(r.flow.habitRate >= 0 && r.flow.habitRate <= 100); });
});

test('budget: category history and edit link', () => {
  const d = build();
  const fin = d.sources.finance.summary;
  Object.values(fin.catHistory).forEach(h => assert.equal(h.length, fin.trend.length));
  assert.match(fin.budget.url, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/d\/edit#gid=\d+$/);
  const over = d.alerts.filter(a => /^Over budget/.test(a.title));
  over.forEach(a => assert.equal(a.view, 'budget'));
});

test('nextrole: goals, job steps, exams, and nothing private', () => {
  const d = build();
  const c = d.sources.career;
  assert.ok(c.ok, c.error);
  const s = c.summary;
  assert.equal(s.target, 'Assistant Manager, Group Reporting');
  assert.equal(s.acca.count, 2);
  assert.equal(s.acca.booked[0].code, 'SBR');
  assert.equal(s.goals.openCount, 2, 'done and deleted goals left out');
  assert.equal(s.goals.overdue, 1);
  assert.equal(s.jobs.active, 2);
  assert.equal(s.jobs.steps[0].interview, true);
  assert.equal(s.jobs.followUp.length, 1);
  assert.equal(s.cpd.hours, 2.5);
  assert.equal(s.skills.atTarget, 1);
  assert.ok(s.lastChange > 0);
  const json = JSON.stringify(c);
  ['Private Name', 'secret@example.com', '9000', '7000', 'payslip'].forEach(x => assert.ok(!json.includes(x), 'leaked ' + x));
  assert.ok(d.issues.some(i => i.source === 'career' && i.area === 'json' && i.fix), 'unreadable row reported with a fix');
  const titles = d.alerts.map(a => a.title).join(' | ');
  assert.match(titles, /Interview: Assistant Manager/);
  assert.match(titles, /Follow up on 1 job application/);
  assert.match(titles, /Goal past its date: Finish Power BI course/);
  assert.ok(d.brief.some(b => b.src === 'career' && /Interview in 2 days/.test(b.text)));
});

test('voyage: next trip, budget in home currency, to-dos, nothing private', () => {
  const d = build();
  const v = d.sources.voyage;
  assert.ok(v.ok, v.error);
  const t = v.summary.next;
  assert.equal(t.name, 'Japan autumn');
  assert.equal(t.daysToGo, 10);
  assert.equal(t.nights, 7);
  assert.equal(t.spent, 2800, '33000 JPY at 33 = RM 1000');
  assert.equal(t.todoOpen, 2);
  assert.equal(t.todoOverdue, 1);
  assert.equal(t.packed, 1);
  assert.equal(t.nextBooking.type, 'Flight');
  assert.equal(v.summary.count.past, 1);
  const json = JSON.stringify(v);
  ['SECRETREF', 'Private address', 'MH52'].forEach(x => assert.ok(!json.includes(x), 'leaked ' + x));
  assert.ok(d.alerts.some(a => a.src === 'voyage' && /overdue/.test(a.title)));
  assert.ok(d.upcoming.some(u => u.src === 'voyage' && /Japan autumn/.test(u.label)));
  assert.equal(d.sync.find(r => r.key === 'voyage').status, 'stale', 'no file date in tests');
});

test('voyage: save time comes from the app\'s own "updated" stamp', () => {
  const gs = load(PROPS);
  const saved = fx.NOW.getTime() - 2 * 864e5;
  const str = JSON.stringify({ trips: [], updated: saved }), rows = [];
  for (let i = 0; i < str.length; i += 50) rows.push([str.slice(i, i + 50)]);
  const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(id === 'y' ? { _voyage: rows } : BOOKS[id]));
  assert.equal(d.sources.voyage.summary.lastChange, saved);
  assert.equal(d.sync.find(r => r.key === 'voyage').status, 'ok');
});

test('nest: move-in, budget, must-haves, home tasks', () => {
  const d = build();
  const n = d.sources.nest;
  assert.ok(n.ok, n.error);
  const s = n.summary;
  assert.equal(s.daysToMoveIn, 30);
  assert.equal(s.spent, 2300, 'actual price wins over the estimate');
  assert.equal(s.committed, 400);
  assert.equal(s.planned, 1350);
  assert.equal(s.left, 1300);
  assert.equal(s.must.done, 1);
  assert.equal(s.must.total, 3);
  assert.equal(s.must.next[0].name, 'Microwave', 'ordered comes before shortlisted');
  assert.equal(s.tasks.overdue.length, 1);
  assert.equal(s.tasks.overdue[0].name, 'Clean aircon filter');
  assert.equal(s.tasks.overdue[0].due, '2026-10-01');
  assert.equal(s.bills.monthly, 149);
  assert.ok(!JSON.stringify(n).includes('https://private'));
  assert.ok(d.alerts.some(a => a.src === 'nest' && /Home: Clean aircon filter/.test(a.title)));
  assert.ok(d.upcoming.some(u => u.src === 'nest' && u.label === 'Move-in day'));
  assert.equal(d.sync.find(r => r.key === 'nest').status, 'ok');
});

test('life apps are optional', () => {
  const gs = load({ GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w' });
  const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(BOOKS[id]));
  ['career', 'voyage', 'nest'].forEach(k => assert.equal(d.sources[k].off, true));
  assert.ok(!d.issues.some(i => ['career', 'voyage', 'nest'].includes(i.source)));
});

test('setup tells Garage and NextRole apart (both have a json column)', () => {
  const props = {};
  const gs = load(props);
  const books = { g: fx.garage(), c: fx.career(), y: fx.voyage(), n: fx.nest() };
  const files = [{ id: 'c', name: 'NextRole', updated: 9 }, { id: 'g', name: 'Car Tracker', updated: 8 }, { id: 'y', name: 'Voyage', updated: 7 }, { id: 'n', name: 'Nest DB', updated: 6 }];
  gs.findAppSheets_(files, id => fakeSpreadsheet(books[id]), { getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } });
  assert.equal(props.GARAGE_SHEET_ID, 'g');
  assert.equal(props.NEXTROLE_SHEET_ID, 'c');
  assert.equal(props.VOYAGE_SHEET_ID, 'y');
  assert.equal(props.NEST_SHEET_ID, 'n');
});
