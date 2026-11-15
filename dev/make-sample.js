// Builds dev/sample-dashboard.json from the test fixtures so Index.html can be
// previewed in a normal browser (it falls back to this file outside Apps Script).
const fs = require('fs');
const path = require('path');
const { load, fakeSpreadsheet } = require('../test/harness');
const fx = require('../test/fixtures');

const books = { g: fx.garage(), f: fx.finance(), w: fx.flow() };
const gs = load({ GARAGE_SHEET_ID: 'g', FINANCE_SHEET_ID: 'f', FLOW_SHEET_ID: 'w' });
const d = gs.buildDashboard_(fx.NOW, id => fakeSpreadsheet(books[id]));
Object.values(d.sources).forEach(s => { s.url = null; });
const out = path.join(__dirname, 'sample-dashboard.json');
fs.writeFileSync(out, JSON.stringify(d, null, 2));
console.log('Wrote', out, '-', d.counts);
