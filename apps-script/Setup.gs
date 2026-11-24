/**
 * One-click setup. Run setupDashboard once from the Apps Script editor.
 *
 * It finds each app's sheet in your Drive by what is inside it (not by its name,
 * which can change) and saves the IDs in Script Properties:
 *   Flow     - tabs Tasks, Habits and Study Log
 *   Finance  - tabs Transactions and Accounts
 *   Garage   - columns "json (do not edit)" and "odometer"
 *   Vault    - tabs Documents and Categories
 *   NextRole - columns "json (do not edit)" and "progress / score"
 *   Voyage   - tabs _voyage, Trips and Itinerary
 *   Nest     - tabs rooms, items, tasks and bills
 * When several sheets match (e.g. an old copy), the most recently updated wins.
 * It also links the "Dashboard" sheet for the budget and creates the Budget tab.
 * Run it again any time an app moves to a new sheet. It never changes app sheets.
 */

var SHEET_FINDERS = [
  { prop: 'FLOW_SHEET_ID', name: 'Flow', tabs: ['Tasks', 'Habits', 'Study Log'] },
  { prop: 'FINANCE_SHEET_ID', name: 'Finance', tabs: ['Transactions', 'Accounts'] },
  { prop: 'GARAGE_SHEET_ID', name: 'Garage', headers: ['json (do not edit)', 'odometer'] },
  { prop: 'VAULT_SHEET_ID', name: 'Vault', tabs: ['Documents', 'Categories'] },
  { prop: 'NEXTROLE_SHEET_ID', name: 'NextRole', headers: ['json (do not edit)', 'progress / score'] },
  { prop: 'VOYAGE_SHEET_ID', name: 'Voyage', tabs: ['_voyage', 'Trips', 'Itinerary'] },
  { prop: 'NEST_SHEET_ID', name: 'Nest', tabs: ['rooms', 'items', 'tasks', 'bills'] }
];

function setupDashboard() {
  editorOnly_();
  var props = PropertiesService.getScriptProperties();
  var report = findAppSheets_(listMySpreadsheets_(), function (id) { return SpreadsheetApp.openById(id); }, props);
  report.forEach(function (line) { Logger.log(line); });

  // The dashboard's own sheet (budget). Use the one called "Dashboard", or make it.
  var dashId = props.getProperty('DASHBOARD_SHEET_ID');
  if (!dashId) {
    var own = listMySpreadsheets_().filter(function (f) { return f.name === 'Dashboard'; })[0];
    dashId = own ? own.id : SpreadsheetApp.create('Dashboard').getId();
    props.setProperty('DASHBOARD_SHEET_ID', dashId);
    Logger.log('Budget: using the "Dashboard" sheet' + (own ? '' : ' (newly created)'));
  }
  CacheService.getScriptCache().remove(CACHE_KEY);   // next load reads the new sheets
  createBudgetTab();
  Logger.log('Done. Press Refresh on the dashboard.');
}

/** Spreadsheets you own, most recently updated first. */
function listMySpreadsheets_() {
  var it = DriveApp.searchFiles("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and 'me' in owners");
  var out = [];
  while (it.hasNext() && out.length < 60) {
    var f = it.next();
    out.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().getTime() });
  }
  return out.sort(function (a, b) { return b.updated - a.updated; });
}

/** Matches sheets to apps and saves the IDs. Returns a readable report. */
function findAppSheets_(files, open, props) {
  var report = [], taken = {};
  var looks = files.map(function (f) {
    try {
      var ss = open(f.id);
      var tabs = ss.getSheets().map(function (s) { return s.getName(); });
      var first = ss.getSheets()[0], header = [];
      if (first && first.getLastRow()) header = first.getDataRange().getValues()[0].map(function (h) { return String(h).trim(); });
      return { file: f, tabs: tabs, header: header };
    } catch (e) { return { file: f, tabs: [], header: [] }; }
  });
  SHEET_FINDERS.forEach(function (finder) {
    var match = looks.filter(function (l) {
      if (taken[l.file.id]) return false;
      if (finder.tabs) return finder.tabs.every(function (t) { return l.tabs.indexOf(t) >= 0; });
      return finder.headers.every(function (h) { return l.header.indexOf(h) >= 0; });
    })[0];
    var old = props.getProperty(finder.prop);
    if (!match) { report.push(finder.name + ': no matching sheet found' + (old ? ' (kept the current one)' : '')); return; }
    taken[match.file.id] = true;
    if (old === match.file.id) report.push(finder.name + ': "' + match.file.name + '" (unchanged)');
    else {
      props.setProperty(finder.prop, match.file.id);
      report.push(finder.name + ': now "' + match.file.name + '"' + (old ? ' (was a different sheet)' : ''));
    }
  });
  return report;
}
