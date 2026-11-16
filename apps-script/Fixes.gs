/**
 * How to fix each kind of Health check problem.
 *
 * Each rule matches on source + area + message and gives short steps.
 * `where` says where the fix happens:
 *   app   — in the app itself (Flow, Finance, Garage); the sheet follows on the next sync
 *   sheet — directly in the Google Sheet (only for things the app never edits)
 *   none  — nothing to edit; it clears on its own or is just information
 * Edit data in the app when you can: editing a synced sheet by hand can be
 * overwritten by the app's next sync.
 */

var FIX_RULES = [
  /* ---------- Sync & connections (all apps) ---------- */
  { area: 'sync', where: 'app', steps: function (i, s) {
    return [
      'In Apps Script for the ' + s + ' app, open Deploy → Manage deployments and copy the Web app URL (ends in /exec).',
      'On the device named below, open ' + s + ' → Settings → Sync, paste that URL and save.',
      'Tap Sync now. Once it saves successfully this problem turns into "recovered" on its own.'
    ];
  } },
  { area: 'connection', where: 'none', steps: [
    'In the Apps Script editor, run setupDashboard: it finds each app\'s sheet again and saves the right IDs.',
    'If it still fails, make sure the sheet exists and belongs to the same Google account as the dashboard.'
  ] },
  { area: 'structure', where: 'sheet', steps: [
    'A tab or column header was renamed or deleted. Open the tab and restore the exact header text shown above.',
    'Do not rename headers: the apps and the dashboard find columns by name.'
  ] },
  { source: 'finance', area: 'gold', where: 'none', steps: [
    'Maybank blocks the price check when it runs from the browser, so it fails every time.',
    'Lasting fix: move the gold price fetch into the Finance app\'s Apps Script (ask Claude). Until then, enter the gold price by hand.'
  ] },

  /* ---------- Garage ---------- */
  { source: 'garage', area: 'dates', match: /before the car was made/, where: 'app', steps: [
    'Open the row to see the entry and the date range suggested by the odometer.',
    'In Garage, open that service log, set the correct date and save.'
  ] },
  { source: 'garage', area: 'dates', match: /typo year/, where: 'app', steps: [
    'The year was stored wrongly (e.g. 0021 instead of 2021). The dashboard reads it correctly, but the app may not.',
    'In Garage, open that entry, pick the date again from the date picker and save.'
  ] },
  { source: 'garage', area: 'odometer', where: 'app', steps: [
    'One entry has a date or odometer reading that does not fit with the entries before and after it.',
    'Open the row, compare it with its neighbours, then correct the date or odometer in Garage.'
  ] },
  { source: 'garage', area: 'renewals', where: 'app', steps: [
    'Renew it (MyJPJ / Pos Malaysia for road tax, or your insurer).',
    'Then update the expiry date in Garage → your car → Road tax / Insurance.'
  ] },
  { source: 'garage', area: 'categories', where: 'app', steps: function (i) {
    var m = i.message.match(/"([^"]+)"/);
    return [
      'In Garage, add "' + (m ? m[1] : 'this item') + '" to the service list (Settings → Service items),',
      'or edit the log to use an item that is already in the list.'
    ];
  } },
  { source: 'garage', area: 'housekeeping', where: 'none', steps: [
    'Harmless: deleted entries are kept so other devices learn about the deletion.',
    'Optional tidy-up: in the sheet, filter the "deleted" column for "yes" and delete those rows.'
  ] },
  { source: 'garage', area: 'fields', match: /road tax/, where: 'app', steps: ['In Garage → your car, enter the road tax expiry date.'] },
  { source: 'garage', area: 'fields', where: 'app', steps: ['Open the row to find the entry, then fill in the missing value in Garage.'] },
  { source: 'garage', area: 'records', where: 'app', steps: ['Do not edit the JSON column by hand. Open the entry in Garage and save it again.'] },
  { source: 'garage', area: 'freshness', where: 'app', steps: ['Log your recent fill-ups in Garage (Fuel → Add).'] },

  /* ---------- Finance ---------- */
  { source: 'finance', area: 'amounts', match: /owed as negative/, where: 'app', steps: [
    'In Finance → Accounts, edit this account and enter the amount owed as a positive number.',
    'All debts should use the same sign so totals and net worth add up.'
  ] },
  { source: 'finance', area: 'amounts', match: /positive amount/, where: 'app', steps: [
    'Open the row. If it is a refund, that is fine: hide this problem.',
    'If it is income or a transfer, change its category in Finance (e.g. Income or Transfer). If the sign is wrong, edit the amount.'
  ] },
  { source: 'finance', area: 'categories', match: /written \d+ ways/, where: 'app', steps: [
    'In Finance → Categories, keep one version and merge the other into it (the link opens a transaction that uses the rarer one).',
    'If there is no merge option, edit the category\'s icon so both match.'
  ] },
  { source: 'finance', area: 'categories', match: /Similar categories/, where: 'app', steps: [
    'Decide whether these are really different. If not, merge them in Finance → Categories.',
    'If they are meant to be different, hide this problem.'
  ] },
  { source: 'finance', area: 'categories', where: 'app', steps: ['Open the rows to find them, then give each transaction a category in Finance.'] },
  { source: 'finance', area: 'accounts', match: /not in the Accounts tab/, where: 'app', steps: [
    'Either add this account in Finance → Accounts,',
    'or edit these transactions to use the right existing account.'
  ] },
  { source: 'finance', area: 'accounts', where: 'app', steps: ['In Finance → Accounts, set the account type (bank, card, cash, ewallet, borrow…).'] },
  { source: 'finance', area: 'duplicates', where: 'app', steps: [
    'Open the rows and compare them with your bank statement.',
    'Delete the extra copy in Finance. If both are real (two identical purchases), hide this problem.'
  ] },
  { source: 'finance', area: 'reconciliation', where: 'app', steps: [
    'Each adjustment means the app and the bank disagreed. Look for the spending you missed on the statement.',
    'Record it as normal transactions next time instead of adjusting the balance. This clears at the start of next month.'
  ] },
  { source: 'finance', area: 'freshness', where: 'app', steps: ['Record recent spending in Finance, or import the latest bank CSV.'] },
  { source: 'finance', area: 'dates', where: 'app', steps: ['Open the rows and correct the dates in Finance.'] },
  { source: 'finance', area: 'payslips', match: /days old/, where: 'app', steps: ['Add your latest payslip in Finance → Payslips.'] },
  { source: 'finance', area: 'payslips', where: 'app', steps: ['Open the row and check the figures against the payslip PDF, then correct them in Finance.'] },
  { source: 'finance', area: 'housekeeping', where: 'sheet', steps: ['In the Finance tracker sheet, right-click the empty tab → Delete.'] },

  /* ---------- Flow ---------- */
  { source: 'flow', area: 'study', where: 'app', steps: [
    'Plan study sessions in Flow for the days left (1–2 hours a day closes most gaps).',
    'Log each session in Flow → Study so the hours count. If you study but have not logged it, log it now.'
  ] },
  { source: 'flow', area: 'links', where: 'app', steps: [
    'These point to a paper, topic or habit that was deleted or never synced.',
    'Open the rows, then in Flow pick the right paper or habit again (or delete the entry).'
  ] },
  { source: 'flow', area: 'formats', match: /HH:mm/, where: 'app', steps: ['Open the task in Flow and pick the time again with the time picker (24-hour, e.g. 09:00).'] },
  { source: 'flow', area: 'formats', where: 'none', steps: [
    'This is in Flow\'s code, not your data: some devices log only the date.',
    'Ask Claude to change Flow to write full timestamps. It does no harm meanwhile.'
  ] },
  { source: 'flow', area: 'fields', match: /confidence/, where: 'app', steps: ['Open the row to see the topic, then in Flow set its confidence again (0 = new, 3 = confident).'] },
  { source: 'flow', area: 'fields', match: /Done At/, where: 'none', steps: ['Older tasks were ticked off before Flow recorded the time. Nothing to fix; hide this if it bothers you.'] },
  { source: 'flow', area: 'fields', where: 'app', steps: ['Open the rows to find the entries, then fill in the missing value in Flow.'] },
  { source: 'flow', area: 'dates', where: 'app', steps: ['Open the task in Flow and set its date again with the date picker.'] },
  { source: 'flow', area: 'planning', where: 'app', steps: ['In Flow, move overdue tasks to a new date or delete the ones you no longer need.'] },
  { source: 'flow', area: 'freshness', where: 'app', steps: [
    'Open Flow on your PC and tap Sync. If it fails, see the sync problem above (Web App URL).'
  ] },

  /* ---------- Vault ---------- */
  { source: 'vault', area: 'expiry', where: 'app', steps: [
    'Renew the document with whoever issues it.',
    'Then open it in Vault, attach the new copy and update its expiry date (the old one is kept as history).'
  ] },
  { source: 'vault', area: 'dates', where: 'app', steps: ['Open the document in Vault and pick its expiry date again with the date picker.'] },

  /* ---------- Budget ---------- */
  { source: 'finance', area: 'budget', where: 'sheet', steps: [
    'If the spending is right, raise that category\'s amount in the Budget tab of your Dashboard sheet.',
    'Otherwise it is a nudge to spend less there for the rest of the month.'
  ] },

  /* ---------- Across apps ---------- */
  { source: 'cross', area: 'fuel', where: 'app', steps: [
    'Compare this month\'s fill-ups in Garage with fuel spending in Finance.',
    'Add the missing fill-up to whichever app does not have it.'
  ] }
];

var APP_NAMES = { flow: 'Flow', finance: 'Finance', garage: 'Garage', vault: 'Vault', cross: 'the apps' };

/** Adds `fix: { where, steps }` to each issue that has a matching rule. */
function addFixes_(issues) {
  issues.forEach(function (i) {
    for (var r = 0; r < FIX_RULES.length; r++) {
      var rule = FIX_RULES[r];
      if (rule.source && rule.source !== i.source) continue;
      if (rule.area && rule.area !== i.area) continue;
      if (rule.match && !rule.match.test(i.message)) continue;
      var steps = typeof rule.steps === 'function' ? rule.steps(i, APP_NAMES[i.source] || i.source) : rule.steps;
      i.fix = { where: rule.where, steps: steps };
      return;
    }
  });
}

/**
 * A sync failure stays in the app's log for days. If the app has saved to its
 * sheet since the last failure, the sync is working again: mark it recovered.
 */
function markRecovered_(issues, sources) {
  issues.forEach(function (i) {
    if (i.area !== 'sync' || !i.at) return;
    var s = sources[i.source];
    var last = s && s.ok && s.summary && s.summary.lastChange;
    if (last && last > i.at + 60e3) {
      i.level = 'info';
      i.recovered = true;
      i.message = 'Recovered: ' + i.message;
      i.detail = (i.detail ? i.detail + ' · ' : '') + 'the app has saved successfully since';
    }
  });
}
