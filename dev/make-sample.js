// Builds dev/sample-dashboard.json from the test fixtures so Index.html can be
// previewed in a normal browser (it falls back to this file outside Apps Script).
const fs = require('fs');
const path = require('path');
const { load, fakeSpreadsheet } = require('../test/harness');
const fx = require('../test/fixtures');

const books = { g: fx.garage(), f: fx.finance(), w: fx.flow(), v: fx.vault(), d: fx.dashboard(), c: fx.career(), y: fx.voyage(), n: fx.nest() };
// Investments: EPF every month, ASB dividends and a loan, shares and gold revalued
const addF = (date, desc, cat, acc, amt) => books.f.Transactions.push([date, desc, cat, '', acc, amt, '', '']);
for (let i = 0; i < 40; i++) { const m = new Date(Date.UTC(2023, 7 + i, 25)).toISOString().slice(0, 10); if (m <= fx.TODAY) addF(m, 'Employer EPF', '🏢 Employer contributions', 'KWSP', 325 + Math.floor(i / 12) * 26); }
[['2024-01-02', 410], ['2025-01-02', 520], ['2026-01-02', 1180]].forEach(([d, a]) => addF(d, 'Interests, dividends', '🪙 Interests, dividends', 'ASB', a));
[['2024-03-01', 310], ['2025-03-01', 420], ['2026-03-01', 560]].forEach(([d, a]) => addF(d, 'Interests, dividends', '🪙 Interests, dividends', 'KWSP', a));
addF('2025-08-01', 'ASB financing', '', 'ASB', 10000);
addF('2026-06-19', 'Transfer, withdraw', '', 'ASB', 500);
addF('2026-04-10', 'Buy shares', '', 'Bursa', 1000);
addF('2026-11-03', 'Balance adjustment', '⚖️ Balance adjustment', 'Bursa', 85.5);
addF('2026-09-12', 'Buy gold', '', 'Gold', 600);
addF('2026-11-01', 'Balance adjustment', '⚖️ Balance adjustment', 'Gold', -24);
books.f.Accounts.push(['Bursa', 'shares', 1085.5, ''], ['Gold', 'gold', 576, ''], ['ASB LOAN', 'borrow', '', 9400]);

// Show the newer app features too: tolls/parking, a shared wallet, a licence, rent and a house budget
const addG = (id, o) => books.g.Sheet1.push([id, JSON.stringify(Object.assign({ id, updated: 1 }, o)), o.kind, o.date || '', '', '', o.cost || '', '', '']);
addG('x1', { kind: 'exp', carId: 'car1', date: '2026-10-21', cost: 34, cat: 'toll', pay: 'w' });
addG('x2', { kind: 'exp', carId: 'car1', date: '2026-11-10', cost: 18, cat: 'parking' });
addG('w0', { kind: 'wal', typ: 'cfg', name: 'Family wallet', date: '2026-10-01' });
addG('w1', { kind: 'wal', typ: 'in', cost: 200 });
addG('d1', { kind: 'doc', dtype: 'licence', name: 'Driving licence', date: '2026-12-20', lead: 30 });
books.n._meta.find(r => r[0] === 'settings')[1] = JSON.stringify({ moveIn: fx.TODAY, budget: 4000, homeType: 'rent', rent: 1500, rentDay: 18, leaseEnd: '2027-01-10', budgets: { Groceries: 600, Utilities: 250 } });
books.n.exps = [['id', 'date', 'amount', 'cat', 'u'], ['e1', '2026-11-03', 420, 'Groceries', 1], ['e2', '2026-11-09', 96, 'Utilities', 1]];
books.n.pays = [['id', 'month', 'amount', 'date', 'paid', 'u'], ['p1', '2026-10', 1500, '2026-10-17', '', 1]];
const gs = load({ GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w', VAULT_SHEET_ID: 'v', DASHBOARD_SHEET_ID: 'd', NEXTROLE_SHEET_ID: 'c', VOYAGE_SHEET_ID: 'y', NEST_SHEET_ID: 'n',
  NEST_APP_URL: 'https://example.com/nest',
  FLOW_APP_URL: 'https://example.com/flow', GARAGE_APP_URL: 'https://example.com/garage' }); // Finance left unset to show the 'Link app' button
const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(books[id]));
Object.keys(d.sources).forEach(k => { d.sources[k].url = 'https://docs.google.com/spreadsheets/d/sample-' + k + '/edit'; });
const out = path.join(__dirname, 'sample-dashboard.json');
fs.writeFileSync(out, JSON.stringify(d, null, 2));
console.log('Wrote', out, '-', d.counts);
