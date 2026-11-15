// Runs the .gs files in Node with small stand-ins for the Apps Script services.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'apps-script');

function formatDate(date, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return pattern
    .replace('yyyy', parts.year).replace('MMM', MON[+parts.month - 1]).replace('MM', parts.month)
    .replace('dd', parts.day).replace(/\bd\b/, String(+parts.day))
    .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

/** tabs: { 'Tab name': [[header...], [row...], ...] } */
function fakeSpreadsheet(tabs) {
  const sheets = Object.keys(tabs).map((name, i) => ({
    getName: () => name,
    getSheetId: () => 1000 + i,
    getRange: (r, c, nr, nc) => ({ getValues: () => tabs[name].slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)) }),
    getLastRow: () => tabs[name].length,
    getDataRange: () => ({ getValues: () => tabs[name].map(r => r.slice()) })
  }));
  return {
    getSheets: () => sheets,
    getSheetByName: n => sheets.find(s => s.getName() === n) || null
  };
}

function load(props) {
  const context = {
    console,
    Utilities: { formatDate, getUuid: () => require('crypto').randomUUID() },
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props || {})[k] || null,
      setProperty: (k, v) => { props[k] = v; }
    }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: body => ({ body, setMimeType() { return this; } })
    },
    Session: { getActiveUser: () => ({ getEmail: () => (props || {}).__user || '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, getAll: () => ({}), putAll: () => {} }) }
  };
  vm.createContext(context);
  ['Shared.gs', 'Garage.gs', 'Finance.gs', 'Flow.gs', 'Fixes.gs', 'Code.gs'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), context, { filename: f });
  });
  return context;
}

module.exports = { load, fakeSpreadsheet, formatDate };
