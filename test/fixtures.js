// Synthetic sheets with the same tabs and columns as the real apps.
// The values are made up, but the problems are the kind found in the real
// Sheets (typo year, negative "Owed", income in a spending category, ...).

const TODAY = '2026-11-15';
const NOW = new Date('2026-11-15T08:30:00+08:00');

function d(iso) { return new Date(iso + 'T00:00:00+08:00'); } // Sheets returns date cells as Date
function addDays(iso, n) { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

/* ---------------- Garage ---------------- */
function garage() {
  const header = ['id', 'json (do not edit)', 'type', 'date', 'odometer', 'item', 'cost', 'notes', 'deleted'];
  const rows = [header];
  const svc = ['Engine oil and filter', 'Air filter', 'Brake fluid', 'Spark Plugs', 'Timing Belt', 'Fan Belt', 'Others'];
  svc.forEach(n => {
    const id = 'svc-' + n.toLowerCase().replace(/\s+/g, '-');
    rows.push([id, JSON.stringify({ id, kind: 'svc', name: n, deleted: 0, updated: 1 }), 'svc', '', '', n, '', '', '']);
  });
  const car = { id: 'car1', kind: 'car', name: 'Demo Car', plate: 'ABC1234', year: '2015', odo: 120500, rtax: addDays(TODAY, 24), tank: 40, updated: Date.parse('2026-11-14T20:00:00+08:00') };
  rows.push(['car1', JSON.stringify(car), 'car', '', 120500, 'Demo Car', '', '', '']);

  const log = (id, date, odo, items, cost, extra) => {
    const rec = Object.assign({ id, kind: 'log', carId: 'car1', item: items, date, odo, cost, updated: 1 }, extra || {});
    rows.push([id, JSON.stringify(rec), 'log', (extra && extra.colDate) || date, odo, items, cost, '', rec.deleted ? 'yes' : '']);
  };
  // Typo year in the JSON, correct date in the column (like "0021-03-02")
  log('l1', '0021-03-02', 98000, 'Spark Plugs, Timing Belt, Brake fluid', 540, { colDate: '2021-03-02' });
  log('l2', '2026-06-20', 115200, 'Engine oil and filter, Air filter, Fan Belt, Wiper blades', 188);
  log('l3', '2026-10-18', '', 'Others', 1, { deleted: 1 });
  // Typo year whose date column is before the car was made (2015)
  log('l4', '0009-10-26', 117900, 'Engine oil and filter', 120, { colDate: '2009-10-26' });

  let odo = 117000;
  const fills = [];
  for (let i = 0; i < 14; i++) fills.push(addDays('2026-08-10', i * 7));
  fills.forEach((date, i) => {
    odo += i === 9 ? -150 : 260; // one reading goes backwards
    const litres = 24.4, cost = 50;
    const id = 'f' + i;
    rows.push([id, JSON.stringify({ id, kind: 'fuel', carId: 'car1', date, odo, place: 'Station', ftype: 'RON95', ppl: 2.05, litres, cost, updated: 1 }),
      'fuel', date, odo, '', cost, '', '']);
  });
  return { Sheet1: rows };
}

/* ---------------- Finance ---------------- */
function finance() {
  const tx = [['Date', 'Description', 'Category', 'Shop', 'Account', 'Amount', 'Note', 'Receipts']];
  const add = (date, desc, cat, acc, amt, note) => tx.push([date, desc, cat, '', acc, amt, note || '', '']);
  // Six months of ordinary spending
  for (let m = 0; m < 6; m++) {
    const base = addDays('2026-05-20', m * 30);
    for (let i = 0; i < 12; i++) {
      add(addDays(base, i * 2), 'Food & Drinks', '🍽️ Food & Drinks', 'Maybank', -(12 + (i % 5) * 3.5));
      if (i % 3 === 0) add(addDays(base, i * 2 + 1), 'Petrol', '⛽ Fuel', 'Maybank', -50);
    }
    add(addDays(base, 20), 'Netflix', '📺 Netflix', 'Affin Visa', -54.9, 'Subscription');
    add(addDays(base, 22), 'Salary', '💵 Income', 'Maybank', 3063);
  }
  // This month
  add(TODAY, '', '🍜 Food', 'Aeon Bank', 232);               // positive in a spending category
  add(TODAY, '', '🍜 Food', 'Maybank', -20.3);
  for (let i = 0; i < 10; i++) add(addDays('2026-10-01', i * 4), 'Lunch', '🍜 Food', 'Maybank', -9);
  add('2026-11-14', 'Balance adjustment', '⚖️ Balance adjustment', 'Maybank', -168.95);
  add('2026-11-14', 'Balance adjustment', '⚖️ Balance adjustment', 'TnG', 103.6);
  add('2026-11-13', 'Balance adjustment', '⚖️ Balance adjustment', 'RHB', -1);
  add('2026-11-09', 'Transfer, withdraw', '', 'Maybank', 953);
  add('2026-11-08', 'Something', '', 'Maybank', -30);        // no category
  add('2026-11-07', 'Mystery', '', 'Old Wallet', -12);       // account not in Accounts tab
  add('2026-11-06', 'Food & Drinks', '🍔 Food & Drinks', 'Maybank', -8); // same name, different icon
  add('2026-11-05', 'Coffee', '☕ Coffee', 'Maybank', -9.5);
  add('2026-11-04', 'Belanja GF', '🍰 Belanja GF', 'Maybank', -20);
  add('2026-11-04', 'Belanja Family', '🍣 Belanja Family', 'Maybank', -40);
  add('2026-11-05', 'Coffee', '☕ Coffee', 'Maybank', -9.5);  // duplicate

  const accounts = [['Account', 'Type', 'Balance', 'Owed'],
    ['Cash', 'cash', 75.9, ''], ['Maybank', 'bank', 1880.21, ''], ['Aeon Bank', 'bank', 402.32, ''],
    ['TnG', 'ewallet', 11.88, ''], ['RHB', 'bank', 0.59, ''], ['KWSP', 'kwsp', 16000, ''], ['ASB', 'asnb', 20000, ''],
    ['Affin Visa', 'card', '', 1231.21], ['Study Loan', 'borrow', '', -9800], ['Car Loan', 'borrow', '', 15000]];

  const pay = [['Pay date', 'Employer', 'Basic', 'Allowances', 'Gross', 'Deductions', 'Net', 'Payslip'],
    ['2026-10-23', 'Example Sdn Bhd', 3150, 350, 3500, 437, 3063, ''],
    ['2026-09-25', 'Example Sdn Bhd', 3150, 350, 3500, 437, 3063, ''],
    ['2026-08-25', 'Example Sdn Bhd', 3000, 350, 3350, 420.6, 2939.4, '']]; // net off by 10

  const goals = [['Goal', 'Type', 'Target', 'Target date', 'Set aside (manual goals)', 'Items done', 'Achieved'],
    ['Emergency fund', 'manual', 10000, '2027-06-30', 4200, '', '']];

  const log = [['Time', 'Device', 'App version', 'Area', 'What happened', 'Details']];
  for (let i = 0; i < 6; i++) log.push(['11/15/2026 1' + i + ':30:13', 'Windows browser', '2026-11-15.2', 'sync', 'No connection to the script. Check the Web App URL', 'online: true']);
  for (let i = 0; i < 4; i++) log.push(['11/14/2026 12:0' + i + ':00', 'Windows browser', '2026-11-15.2', 'gold', 'Gold price failed: Failed to fetch', '']);

  return { Sheet1: [], Log: log, Goals: goals, Payslips: pay, _data: [['{"cfg":{},"tx":[{"id":"a","u":1794558494023,"date":"2022-10-09"},{"id":"b","u":17'], ['94700000000,"date":"2026-11-15"}]}']], Transactions: tx, Accounts: accounts,
    Statements: [['Month', 'Account', 'File', 'Link']] };
}

/* ---------------- Flow ---------------- */
function flow() {
  const tasks = [['ID', 'Updated', 'Task', 'Date', 'Time', 'Duration (min)', 'Done', 'Done At', 'Priority', 'Area', 'Repeat', 'Repeat Spawned', 'Paper ID', 'Google Calendar', 'Event ID', 'Top 3', 'Notes']];
  const t = (id, task, date, time, done, doneAt, top3, paper) =>
    tasks.push([id, Date.parse('2026-11-15T07:00:00+08:00'), task, date ? d(date) : '', time || '', 30, done ? true : false, doneAt || '', 'normal', 'Work', '', '', paper || '', '', '', top3 ? true : false, '']);
  t('t1', 'Review bank recs', TODAY, '09:00', false, '', true);
  t('t2', 'Gym', TODAY, '18:30', false, '', false);
  t('t3', 'FR mock exam', TODAY, '', false, '', true, 'p1');
  t('t4', 'Pay credit card', '2026-11-12', '', false, '', false);
  t('t5', 'Call insurer', '2026-11-10', '', false, '', false);
  t('t6', 'Morning email', TODAY, '08:00', true, '11/15/2026 08:10:00');
  t('t7', 'Old task', '2026-11-01', '', true, '');           // done, no Done At
  t('t8', '', '', '', false, '');                             // no title, no date
  t('t9', 'Plan week', '2026-11-17', '9am', false, '');       // bad time format
  t('t10', 'Read notes', TODAY, '', false, '', false, 'p404'); // unknown paper

  const papers = [['ID', 'Updated', 'Code', 'Paper', 'Exam Date', 'Target Hours', 'Status', 'Score'],
    ['p1', 1, 'FR', 'Financial Reporting', d('2026-12-04'), 120, 'studying', ''],
    ['p2', 1, 'AA', 'Audit and Assurance', d('2027-03-05'), 100, 'planned', '']];
  const topics = [['ID', 'Updated', 'Topic', 'Paper ID', 'Confidence (0-3)', 'Order'],
    ['tp1', 1, 'Leases', 'p1', 2, 1], ['tp2', 1, 'Group accounts', 'p1', 1, 2], ['tp3', 1, 'IFRS 15', 'p1', 5, 3]];
  const study = [['ID', 'Updated', 'Date', 'Session', 'Paper ID', 'Topic ID', 'Minutes', 'Kind']];
  for (let i = 0; i < 20; i++) study.push(['s' + i, 1, d(addDays(TODAY, -i * 2)), 'Session', 'p1', 'tp1', 90, 'study']);
  study.push(['s99', 1, d(TODAY), 'Session', 'p9', '', 30, 'study']);

  const checklist = [['ID', 'Updated', 'WD', 'Task', 'Category', 'Entity / Owner', 'Order', 'Active'],
    ['c1', 1, 'WD1', 'Bank reconciliations', 'Cash', 'Me', 1, true],
    ['c2', 1, 'WD2', 'Accruals', 'AP', 'Me', 2, true],
    ['c3', 1, 'WD5', 'Fixed assets', 'FA', 'Me', 3, true],
    ['c4', 1, 'WD20', 'Board pack', 'Reporting', 'Me', 4, true],
    ['c5', 1, 'WD3', 'Old item', 'Other', 'Me', 5, false]];
  const closeLog = [['ID', 'Updated', 'Period', 'Item', 'Item ID', 'Done', 'Done At', 'Note'],
    ['cl1', 1, '2026-10', 'Bank reconciliations', 'c1', true, '', '']];

  const habits = [['ID', 'Updated', 'Icon', 'Habit', 'Days per Week', 'Color', 'Order', 'Archived'],
    ['h1', 1, '🏃', 'Run', 3, '', 1, false], ['h2', 1, '📚', 'Read', 7, '', 2, false], ['h3', 1, '🧘', 'Old habit', 7, '', 3, true]];
  const habitLog = [['ID', 'Updated', 'Date', 'Entry', 'Habit ID', 'Done']];
  [TODAY, addDays(TODAY, -1), addDays(TODAY, -2)].forEach((x, i) => habitLog.push(['hl' + i, 1, d(x), '', 'h2', true]));
  habitLog.push(['hlr', 1, d(addDays(TODAY, -3)), '', 'h1', true]);
  habitLog.push(['hlx', 1, d(TODAY), '', 'h9', true]);

  const log = [['Time', 'Source', 'Level', 'Area', 'Message', 'Detail'],
    ['11/15/2026 12:56:47', 'bridge', 'info', 'setup', 'Setup completed (v2.1.0)', ''],
    ['11/15/2026', 'Windows PC', 'error', 'sync', 'Could not reach the server — check the Web App URL', ''],
    ['11/15/2026', 'Windows PC', 'error', 'sync', 'Could not reach the server — check the Web App URL', '']];

  return { Tasks: tasks, 'ACCA Papers': papers, 'ACCA Topics': topics, 'Study Log': study,
    'Close Checklist': checklist, 'Close Log': closeLog, Habits: habits, 'Habit Log': habitLog, _Log: log,
    _Deleted: [['Time (ms)', 'List', 'ID', 'When']] };
}

/* ---------------- Vault ---------------- */
function vault() {
  const docs = [['ID', 'Created', 'Updated', 'Title', 'Category', 'Owner', 'DocNumber', 'Issuer', 'IssueDate', 'ExpiryDate', 'RenewalLeadDays', 'Tags', 'Files', 'LinkedApp', 'LinkedID', 'Notes', 'Status', 'Pinned', 'Extra', 'PrevID', 'Encrypted']];
  const doc = (id, title, cat, owner, expiry, lead, status, enc) =>
    docs.push([id, 1, Date.parse('2026-11-16T08:00:00+08:00'), title, cat, owner, 'SECRET-' + id, 'Issuer', '', expiry ? d(expiry) : '', lead === undefined ? '' : lead, '', '', '', '', 'private note', status || 'Active', false, '{}', '', enc ? true : false]);
  doc('v1', 'Passport', 'Travel', 'Me', addDays(TODAY, 120));            // inside the 180-day travel window
  doc('v2', 'Driving licence', 'Identity', 'Me', addDays(TODAY, 20));    // within 30 days
  doc('v3', 'Car insurance', 'Insurance', 'Me', addDays(TODAY, -3));     // expired
  doc('v4', 'Wife passport', 'Travel', 'Wife', addDays(TODAY, 400));
  doc('v5', 'Old IC', 'Identity', 'Me', addDays(TODAY, -100), '', 'Archived'); // archived: ignored
  doc('v6', 'gAAAAABl9x2EncryptedTitle', 'Medical', 'Me', addDays(TODAY, 10), '', 'Active', true);
  doc('v7', 'Warranty TV', 'Warranty & Receipts', 'Household', 'soon');  // unreadable date
  const cats = [['Name', 'Icon', 'Colour', 'FolderID', 'LeadDays', 'Fields', 'Encrypt', 'Order'],
    ['Identity', '🪪', '#5B8DEF', 'f1', 30, '', 'ask', 1], ['Travel', '✈️', '#3FB6A8', 'f2', 180, '', '', 2],
    ['Insurance', '🛡️', '#8E7CC3', 'f3', 30, '', '', 4], ['Medical', '🩺', '#E06C75', 'f4', 30, '', '', 9],
    ['Warranty & Receipts', '🧾', '#9AA0A6', 'f5', 30, '', '', 10]];
  return { Documents: docs, Categories: cats, People: [['Name', 'Relationship', 'Colour']], Reminders: [['DocID', 'Date', 'Kind', 'CalendarEventID', 'Done']],
    _Log: [['Time', 'Action', 'DocID', 'Detail'], ['2026-11-16T08:44:04.756Z', 'setup', '', 'Initial setup, version 1.0.0']] };
}

/* ---------------- Dashboard (budget) ---------------- */
function dashboard() {
  return { Budget: [['Category', 'Monthly budget (RM)', 'Notes'],
    ['🍽️ Food & Drinks', 150, ''], ['🍜 Food', 20, 'deliberately low: over budget'], ['⛽ Fuel', 200, ''], ['📺 Netflix', 60, ''], ['Total', 600, '']] };
}


/* ---------------- NextRole (career) ---------------- */
function career() {
  const U = Date.parse('2026-11-10T09:00:00+08:00');
  const rows = [['id', 'json (do not edit)', 'type', 'date', 'title', 'detail', 'progress / score', 'deleted']];
  const rec = (o, extra) => rows.push([o.id, JSON.stringify(Object.assign({ updated: U }, o)), o.kind, '', '', '', '', o.deleted ? 'yes' : '']);
  rec({ id: 'me', kind: 'me', name: 'Private Name', email: 'secret@example.com', phone: '012', role: 'Executive, Group Consolidation', target: 'Assistant Manager, Group Reporting' });
  rec({ id: 'acca-SBR', kind: 'acca', c: 'SBR', n: 'Strategic Business Reporting', l: 'Strategic Professional', st: 'Booked', date: addDays(TODAY, 40) });
  rec({ id: 'acca-FR', kind: 'acca', c: 'FR', n: 'Financial Reporting', l: 'Applied Skills', st: 'Passed' });
  rec({ id: 'acca-BT', kind: 'acca', c: 'BT', n: 'Business & Technology', l: 'Applied Knowledge', st: 'Exempt' });
  rec({ id: 'g1', kind: 'goal', title: 'Cut close to 5 days', area: 'Work', due: addDays(TODAY, 20), pct: 40, next: 'Map recon steps' });
  rec({ id: 'g2', kind: 'goal', title: 'Finish Power BI course', area: 'Skills', due: addDays(TODAY, -5), pct: 70 });
  rec({ id: 'g3', kind: 'goal', title: 'Done goal', due: addDays(TODAY, -30), pct: 100 });
  rec({ id: 'a1', kind: 'app', title: 'Assistant Manager', co: 'Acme', st: 'Interview', date: addDays(TODAY, -10), due: addDays(TODAY, 2), sal: 9000 });
  rec({ id: 'a2', kind: 'app', title: 'Reporting Lead', co: 'Beta', st: 'Applied', date: addDays(TODAY, -12) });
  rec({ id: 'a3', kind: 'app', title: 'Old role', co: 'Gamma', st: 'Rejected', date: addDays(TODAY, -60) });
  rec({ id: 'c1', kind: 'cpd', title: 'IFRS 18 webinar', date: '2026-03-02', hrs: 2.5 });
  rec({ id: 'w1', kind: 'win', title: 'Closed in 6 days', date: addDays(TODAY, -3) });
  rec({ id: 's1', kind: 'skill', name: 'Power BI', lvl: 1, tgt: 4 });
  rec({ id: 's2', kind: 'skill', name: 'Excel', lvl: 4, tgt: 4 });
  rec({ id: 'p1', kind: 'pay', title: 'Nov payslip', sal: 7000, date: addDays(TODAY, -5) });
  rec({ id: 'gx', kind: 'goal', title: 'Deleted goal', due: addDays(TODAY, 3), pct: 0, deleted: 1 });
  rows.push(['bad', '{not json', 'goal', '', '', '', '', '']);
  return { Data: rows };
}

/* ---------------- Voyage (trips) ---------------- */
function voyage() {
  const data = { trips: [
    { name: 'Japan autumn', dest: 'Osaka', start: addDays(TODAY, 10), end: addDays(TODAY, 17), budget: 6000, ccy: 'MYR', lcy: 'JPY', fx: 33,
      exp: [{ amt: 1800, cur: 'MYR', cat: 'Flights' }, { amt: 33000, cur: 'JPY', cat: 'Hotel' }],
      todo: [{ t: 'Buy JR pass', due: addDays(TODAY, -1), ok: false }, { t: 'Book hotel', ok: true }, { t: 'Travel insurance', due: addDays(TODAY, 5), ok: false }],
      pack: [{ t: 'Passport', ok: true }, { t: 'Adapter', ok: false }],
      book: [{ type: 'Flight', date: addDays(TODAY, 10), time: '08:30', ref: 'SECRETREF', detail: 'MH52' }],
      ess: { hotel: 'Hotel X', addr: 'Private address', phone: '123' } },
    { name: 'Penang', dest: 'Penang', start: addDays(TODAY, -60), end: addDays(TODAY, -57), budget: 800, ccy: 'MYR', exp: [{ amt: 650 }] }
  ] };
  const str = JSON.stringify(data), rows = [];
  for (let i = 0; i < str.length; i += 200) rows.push([str.slice(i, i + 200)]);
  return { Trips: [['Trip', 'Destination']], Itinerary: [['Trip', 'Date']], _voyage: rows };
}

/* ---------------- Nest (home) ---------------- */
function nest() {
  const U = Date.parse('2026-11-12T20:00:00+08:00');
  return {
    rooms: [['id', 'name', 'icon', 'u'], ['r1', 'Kitchen', '🍳', U], ['r2', 'Bedroom', '🛏️', U]],
    items: [['id', 'roomId', 'name', 'category', 'priority', 'status', 'est', 'actual', 'shop', 'link', 'date', 'warranty', 'notes', 'u'],
      ['i1', 'r1', 'Fridge', 'Appliance', 'must', 'delivered', 2500, 2300, '', 'https://private', '', '', 'private', U],
      ['i2', 'r1', 'Microwave', 'Appliance', 'must', 'ordered', 400, '', '', '', '', '', '', U],
      ['i3', 'r2', 'Bed frame', 'Furniture', 'must', 'shortlist', 1200, '', '', '', '', '', '', U],
      ['i4', 'r2', 'Lamp', 'Decor', 'nice', 'idea', 150, '', '', '', '', '', '', U]],
    tasks: [['id', 'name', 'roomId', 'interval', 'lastDone', 'notes', 'u'],
      ['t1', 'Clean aircon filter', 'r2', 3, '2026-07-01', '', U],
      ['t2', 'Descale kettle', 'r1', 1, addDays(TODAY, -20), '', U]],
    bills: [['id', 'name', 'amount', 'freq', 'notes', 'u'], ['b1', 'Internet', 129, 'monthly', '', U], ['b2', 'Assessment', 240, 'yearly', '', U]],
    _deleted: [['id', 'at']],
    _meta: [['key', 'value'], ['updatedAt', String(U)], ['settingsAt', '0'], ['settings', JSON.stringify({ moveIn: addDays(TODAY, 30), budget: 4000 })]]
  };
}

module.exports = { TODAY, NOW, garage, finance, flow, vault, dashboard, career, voyage, nest };
