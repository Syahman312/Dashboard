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
  assert.ok(has(i, 'garage', /Wiper blades.*not in the service list/), 'unknown item');
  assert.ok(has(i, 'garage', /deleted row/), 'deleted rows');
});

test('finance summary and checks', () => {
  const d = build();
  const s = d.sources.finance.summary;
  assert.equal(s.netWorth, Math.round((75.9 + 1880.21 + 402.32 + 11.88 + 0.59 + 16000 + 20000 - 1231.21 - 9800 - 15000) * 100) / 100);
  assert.equal(s.trend.length, 6);
  assert.ok(s.month.spent > 0);
  assert.ok(!s.topCategories.some(c => /Balance adjustment/.test(c.category)), 'adjustments excluded');
  assert.equal(s.payslip.date, '2026-10-23');
  const i = d.issues;
  assert.ok(has(i, 'finance', /Study Loan.*negative/), 'owed sign');
  assert.ok(has(i, 'finance', /positive amount.*Food/), 'income in spending category');
  assert.ok(has(i, 'finance', /no category/), 'no category');
  assert.ok(has(i, 'finance', /"Old Wallet"/), 'unknown account');
  assert.ok(has(i, 'finance', /written 2 ways/), 'icon variants');
  assert.ok(has(i, 'finance', /Similar categories/), 'similar categories');
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
