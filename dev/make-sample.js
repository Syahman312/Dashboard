// Builds dev/sample-dashboard.json from the test fixtures so Index.html can be
// previewed in a normal browser (it falls back to this file outside Apps Script).
const fs = require('fs');
const path = require('path');
const { load, fakeSpreadsheet } = require('../test/harness');
const fx = require('../test/fixtures');

const books = { g: fx.garage(), f: fx.finance(), w: fx.flow(), v: fx.vault(), d: fx.dashboard(), c: fx.career(), y: fx.voyage(), n: fx.nest() };
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
