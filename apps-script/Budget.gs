/**
 * Monthly budget, from a "Budget" tab in the Dashboard's own sheet
 * (Script Property DASHBOARD_SHEET_ID). This is the only sheet the dashboard
 * ever writes to, and only when you run createBudgetTab from the editor.
 *
 * Budget tab:  Category | Monthly budget (RM) | Notes
 * Categories are matched to Finance categories by name, ignoring the icon.
 * A row named "Total" sets the overall budget; otherwise the rows are summed.
 */

function readBudget_(ss) {
  var t = readTable_(ss, 'Budget');
  if (!t.exists) return null;
  var amountCol = t.headers.filter(function (h) { return /budget|amount/i.test(h); })[0];
  var catCol = t.headers.filter(function (h) { return /categor/i.test(h); })[0];
  if (!amountCol || !catCol) return { rows: [], total: null, error: 'The Budget tab needs "Category" and "Monthly budget" columns' };
  var rows = [], total = null;
  t.rows.forEach(function (r) {
    var cat = text_(r[catCol]), amt = toAmount_(r[amountCol]);
    if (!cat || amt === null) return;
    if (/^total$/i.test(stripIcon_(cat))) total = amt;
    else rows.push({ category: cat, budget: amt });
  });
  if (total === null && rows.length) total = sum_(rows, function (r) { return r.budget; });
  return { rows: rows, total: total, gid: t.gid };
}

/** Compares this month's spending with the budget. */
function applyBudget_(fin, budget, ctx) {
  var issues = makeIssues_('finance');
  if (!budget || !budget.rows.length && budget.total === null) return { budget: null, issues: [] };
  var key = function (c) { return stripIcon_(c).toLowerCase(); };
  var spentBy = {};
  (fin.monthCats || []).forEach(function (c) { spentBy[key(c.category)] = (spentBy[key(c.category)] || 0) + c.spent; });
  var day = +ctx.today.slice(8, 10);
  var dim = new Date(Date.UTC(+ctx.today.slice(0, 4), +ctx.today.slice(5, 7), 0)).getUTCDate();
  var pace = day / dim;
  var budgeted = {};
  var rows = budget.rows.map(function (b) {
    var k = key(b.category); budgeted[k] = true;
    var spent = round2_(spentBy[k] || 0);
    var row = { category: b.category, budget: b.budget, spent: spent, left: round2_(b.budget - spent),
      pct: b.budget > 0 ? Math.round(spent / b.budget * 100) : null };
    if (b.budget > 0 && spent > b.budget) {
      issues.add('warn', 'budget', b.category + ': RM ' + spent.toFixed(2) + ' spent of RM ' + b.budget.toFixed(2) + ' budget (over by RM ' + (spent - b.budget).toFixed(2) + ')', '', { gid: budget.gid });
    }
    return row;
  }).sort(function (a, b) { return (b.pct || 0) - (a.pct || 0); });
  var spentTotal = fin.month ? fin.month.spent : 0;
  var unbudgeted = round2_(Object.keys(spentBy).filter(function (k) { return !budgeted[k]; }).reduce(function (t, k) { return t + spentBy[k]; }, 0));
  var total = budget.total;
  if (total && spentTotal > total) issues.add('warn', 'budget', 'Spent RM ' + spentTotal.toFixed(2) + ' this month, over the RM ' + total.toFixed(2) + ' budget', '', { gid: budget.gid });
  else if (total && fin.month && fin.month.projected > total * 1.05) issues.add('info', 'budget', 'On pace for RM ' + Math.round(fin.month.projected) + ' this month, above the RM ' + total.toFixed(0) + ' budget', '', { gid: budget.gid });
  return {
    budget: { total: total, spent: spentTotal, left: total !== null ? round2_(total - spentTotal) : null,
      pct: total ? Math.round(spentTotal / total * 100) : null, pacePct: Math.round(pace * 100),
      rows: rows, unbudgeted: unbudgeted },
    issues: issues.list
  };
}

/**
 * Run once from the editor: adds a "Budget" tab to the Dashboard sheet, pre-filled
 * with the categories you spent on in the last 3 months and their average as a
 * starting point. Edit the amounts afterwards. Never overwrites an existing tab.
 */
function createBudgetTab() {
  editorOnly_();
  var id = PropertiesService.getScriptProperties().getProperty('DASHBOARD_SHEET_ID');
  if (!id) throw new Error('Set the Script Property DASHBOARD_SHEET_ID to the ID of your "Dashboard" sheet first.');
  var ss = SpreadsheetApp.openById(id);
  if (ss.getSheetByName('Budget')) { Logger.log('A Budget tab already exists; nothing changed.'); return; }
  var d = buildDashboard_(new Date());
  var fin = d.sources.finance && d.sources.finance.ok ? d.sources.finance.summary : null;
  var avg = {};
  if (fin) {
    var months = fin.trend.slice(-4, -1).map(function (t) { return t.month; }); // last 3 full months
    months.forEach(function (m) {
      (fin.catsByMonth[m] || []).forEach(function (c) { if (!c.other) avg[c.category] = (avg[c.category] || 0) + c.spent / months.length; });
    });
  }
  var rows = Object.keys(avg).sort(function (a, b) { return avg[b] - avg[a]; })
    .map(function (c) { return [c, Math.ceil(avg[c] / 10) * 10, 'average of the last 3 months']; });
  var sh = ss.insertSheet('Budget');
  sh.getRange(1, 1, 1, 3).setValues([['Category', 'Monthly budget (RM)', 'Notes']]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  var tr = rows.length + 2;
  sh.getRange(tr, 1, 1, 3).setValues([['Total', '=SUM(B2:B' + (tr - 1) + ')', 'or type your own overall budget']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 3);
  Logger.log('Budget tab created with ' + rows.length + ' categories. Edit the amounts, then press Refresh on the dashboard.');
}
