/**
 * Finance (Finance tracker sheet). Reads the readable tabs the Wallet app
 * writes: Transactions, Accounts, Payslips, Goals, Statements and Log.
 * (_data is the app's private store and is never touched.)
 */

var FINANCE_COLUMNS = {
  Transactions: ['Date', 'Description', 'Category', 'Account', 'Amount'],
  Accounts: ['Account', 'Type', 'Balance', 'Owed'],
  Payslips: ['Pay date', 'Employer', 'Basic', 'Allowances', 'Gross', 'Deductions', 'Net'],
  Goals: ['Goal', 'Type', 'Target', 'Target date'],
  Log: ['Time', 'Device', 'App version', 'Area', 'What happened']
};

var ACCOUNT_GROUPS = {
  cash: 'liquid', bank: 'liquid', ewallet: 'liquid',
  kwsp: 'savings', asnb: 'savings', shares: 'savings', gold: 'savings', fd: 'savings',
  card: 'debt', bnpl: 'debt', borrow: 'debt', loan: 'debt'
};

function isTransfer_(t) {
  return /transfer/i.test(t.catName) || (!t.catName && /transfer|withdraw/i.test(t.desc));
}
function isAdjustment_(t) {
  return /adjustment/i.test(t.catName) || /adjustment/i.test(t.desc);
}

function readFinance_(ss, ctx) {
  var issues = makeIssues_('finance');
  var T = {};
  Object.keys(FINANCE_COLUMNS).forEach(function (name) {
    T[name] = readTable_(ss, name);
    checkColumns_(T[name], FINANCE_COLUMNS[name], issues, 'structure');
  });

  var empty = ss.getSheets().filter(function (s) { return s.getName() !== '_data' && s.getLastRow() === 0; });
  empty.forEach(function (s) { issues.add('info', 'housekeeping', 'Tab "' + s.getName() + '" is empty and can be deleted', '', { gid: s.getSheetId() }); });

  var accounts = readAccounts_(T.Accounts, issues);
  var tx = readTransactions_(T.Transactions, accounts, ctx, issues);
  var pay = readPayslips_(T.Payslips, ctx, issues);
  var goals = readGoals_(T.Goals, ctx);
  var log = summariseLog_(T.Log, { time: 'Time', msg: 'What happened', area: 'Area', source: 'Device' }, ctx, issues, 7);
  var lastChange = lastAppWrite_(ss, ctx);

  return {
    summary: {
      netWorth: accounts.netWorth,
      groups: accounts.groups,
      debts: accounts.debts,
      month: tx.month,
      trend: tx.trend,
      daily: tx.daily,
      catsByMonth: tx.catsByMonth,
      accounts: accounts.list.map(function (a) { return { name: a.name, type: a.type, group: a.group, balance: a.balance, owed: a.owed === null ? null : Math.abs(a.owed) }; }),
      topCategories: tx.topCategories,
      recent: tx.recent,
      monthCats: tx.monthCats,
      recurring: tx.recurring,
      spendDays: tx.spendDays,
      catHistory: tx.catHistory,
      latestDate: tx.latestDate,
      payslip: pay,
      goals: goals,
      log: log,
      lastChange: lastChange
    },
    issues: issues.list
  };
}

/**
 * When did the Wallet app last save? Its _data tab stores records with a
 * "u" (updated, epoch ms) stamp. We only scan for those numbers; the store
 * itself is never parsed or changed.
 */
function lastAppWrite_(ss, ctx) {
  var sh = ss.getSheetByName('_data');
  if (!sh || !sh.getLastRow()) return null;
  var text = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().join('');
  var re = /"u":(\d{13})/g, m, max = null;
  while ((m = re.exec(text))) {
    var t = +m[1];
    if (t <= ctx.now + 864e5 && (max === null || t > max)) max = t;
  }
  return max;
}

function readAccounts_(table, issues) {
  var out = { list: [], byName: {}, groups: { liquid: 0, savings: 0, debt: 0 }, debts: [], netWorth: null };
  if (!table.exists) return out;
  table.rows.forEach(function (r) {
    var name = text_(r.Account);
    if (!name) return;
    var type = text_(r.Type).toLowerCase();
    var group = ACCOUNT_GROUPS[type];
    var balance = toAmount_(r.Balance), owed = toAmount_(r.Owed);
    if (!group) issues.add('info', 'accounts', 'Account "' + name + '" has unknown type "' + type + '"', 'row ' + r.__row, r);
    if (group === 'debt' && owed !== null && owed < 0) {
      issues.add('warn', 'amounts', 'Account "' + name + '" shows amount owed as negative (' + owed + ')',
        'Other debts are positive. Use one sign for "Owed" so totals add up. Row ' + r.__row, r);
    }
    var a = { name: name, type: type, group: group || 'other', balance: balance, owed: owed };
    out.list.push(a);
    out.byName[name] = a;
    if (group === 'debt') {
      var o = Math.abs(owed || 0);
      out.groups.debt += o;
      if (o) out.debts.push({ name: name, type: type, owed: round2_(o) });
    } else if (group) {
      out.groups[group] += balance || 0;
    }
  });
  Object.keys(out.groups).forEach(function (k) { out.groups[k] = round2_(out.groups[k]); });
  out.netWorth = round2_(out.groups.liquid + out.groups.savings - out.groups.debt);
  out.debts.sort(function (a, b) { return b.owed - a.owed; });
  return out;
}

function readTransactions_(table, accounts, ctx, issues) {
  var out = { month: null, trend: [], topCategories: [], recent: [], latestDate: null, daily: null, catsByMonth: {}, monthCats: [], recurring: [] };
  if (!table.exists) return out;

  var month = monthKey_(ctx.today);
  var prevMonth = addMonths_(month, -1);
  var since30 = addDays_(ctx.today, -30);
  var since90 = addDays_(ctx.today, -90);

  var list = [], badDate = [], badAmount = [], noCat = [], unknownAcc = {};
  table.rows.forEach(function (r) {
    var t = {
      date: toISODate_(r.Date),
      desc: text_(r.Description),
      cat: text_(r.Category),
      catName: stripIcon_(r.Category),
      account: text_(r.Account),
      amount: toAmount_(r.Amount),
      __row: r.__row,
      __gid: r.__gid
    };
    if (!t.date) { badDate.push(r); return; }
    if (t.amount === null) { badAmount.push(r); return; }
    t.transfer = isTransfer_(t);
    t.adjust = isAdjustment_(t);
    if (!t.cat && !t.transfer && t.date >= since90) noCat.push(t);
    if (t.account && accounts.list.length && !accounts.byName[t.account]) {
      (unknownAcc[t.account] = unknownAcc[t.account] || []).push(t);
    }
    list.push(t);
  });

  if (badDate.length) issues.rows('error', 'dates', badDate.length + ' transaction(s) have a missing or unreadable date', badDate);
  if (badAmount.length) issues.rows('error', 'amounts', badAmount.length + ' transaction(s) have a missing or unreadable amount', badAmount);
  if (noCat.length) issues.rows('warn', 'categories', noCat.length + ' transaction(s) in the last 90 days have no category', noCat);
  Object.keys(unknownAcc).forEach(function (a) {
    issues.rows('warn', 'accounts', unknownAcc[a].length + ' transaction(s) use account "' + a + '", which is not in the Accounts tab', unknownAcc[a]);
  });

  // Category consistency
  checkCategories_(list, since30, issues);

  // Possible duplicates (same day, account, amount, category, description) in last 60 days
  var since60 = addDays_(ctx.today, -60), seen = {}, dups = [];
  list.forEach(function (t) {
    if (t.date < since60 || t.adjust) return;
    var k = [t.date, t.account, t.amount, t.cat, t.desc].join('|');
    if (seen[k]) dups.push(t); else seen[k] = true;
  });
  if (dups.length) issues.rows('info', 'duplicates', dups.length + ' possible duplicate transaction(s) in the last 60 days', dups);

  // Balance adjustments are a sign the app and the bank drifted apart
  var adjMonth = list.filter(function (t) { return t.adjust && monthKey_(t.date) === month; });
  if (adjMonth.length >= 3) {
    issues.add('info', 'reconciliation', adjMonth.length + ' balance adjustments this month (net RM ' +
      sum_(adjMonth, function (t) { return t.amount; }).toFixed(2) + ')',
      'Frequent adjustments mean some spending is not being recorded.', adjMonth[0]);
  }

  // Freshness
  list.forEach(function (t) { if (t.date <= ctx.today && (!out.latestDate || t.date > out.latestDate)) out.latestDate = t.date; });
  if (out.latestDate) {
    var gap = daysBetween_(out.latestDate, ctx.today);
    if (gap > 3) issues.add('warn', 'freshness', 'No transactions recorded for ' + gap + ' days (last ' + out.latestDate + ')', '', { gid: table.gid });
  }
  var future = list.filter(function (t) { return t.date > ctx.today; });
  if (future.length) issues.rows('info', 'dates', future.length + ' transaction(s) are dated in the future', future);

  // Totals
  var real = list.filter(function (t) { return !t.transfer && !t.adjust; });
  function totals(key) {
    var inMonth = real.filter(function (t) { return monthKey_(t.date) === key; });
    return {
      month: key,
      spent: round2_(-sum_(inMonth.filter(function (t) { return t.amount < 0; }), function (t) { return t.amount; })),
      income: sum_(inMonth.filter(function (t) { return t.amount > 0; }), function (t) { return t.amount; })
    };
  }
  var cur = totals(month), prev = totals(prevMonth);
  var dayOfMonth = +ctx.today.slice(8, 10);
  // Same point last month, for a fair comparison
  var prevSamePoint = round2_(-sum_(real.filter(function (t) {
    return monthKey_(t.date) === prevMonth && +t.date.slice(8, 10) <= dayOfMonth && t.amount < 0;
  }), function (t) { return t.amount; }));
  var daysInMonth = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  out.month = {
    month: month, spent: cur.spent, income: cur.income,
    projected: dayOfMonth >= 3 ? round2_(cur.spent / dayOfMonth * daysInMonth) : null,
    prevSpent: prev.spent, prevSamePoint: prevSamePoint,
    today: round2_(-sum_(real.filter(function (t) { return t.date === ctx.today && t.amount < 0; }), function (t) { return t.amount; }))
  };
  for (var i = 11; i >= 0; i--) out.trend.push(totals(addMonths_(month, -i)));

  // Spending per day for this month and last month (the page draws them cumulatively)
  var prevDays = new Date(Date.UTC(+prevMonth.slice(0, 4), +prevMonth.slice(5, 7), 0)).getUTCDate();
  var cumCur = [], cumPrev = [];
  for (var dc = 0; dc < dayOfMonth; dc++) cumCur.push(0);
  for (var dp = 0; dp < prevDays; dp++) cumPrev.push(0);
  real.forEach(function (t) {
    if (t.amount >= 0) return;
    var mk = monthKey_(t.date), day = +t.date.slice(8, 10) - 1;
    if (mk === month && day < dayOfMonth) cumCur[day] -= t.amount;
    else if (mk === prevMonth) cumPrev[day] -= t.amount;
  });
  out.daily = { month: month, prevMonth: prevMonth, daysInMonth: daysInMonth,
    cur: cumCur.map(round2_), prev: cumPrev.map(round2_) };

  // Categories for each of the 12 months, so the page can drill into any month
  out.catsByMonth = {};
  var firstMonth = out.trend[0].month, catAcc = {};
  real.forEach(function (t) {
    var mk = monthKey_(t.date);
    if (t.amount >= 0 || mk < firstMonth || mk > month) return;
    var m = catAcc[mk] || (catAcc[mk] = {});
    var k = t.cat || '(no category)';
    var c = m[k] || (m[k] = { spent: 0, count: 0 });
    c.spent -= t.amount; c.count++;
  });
  Object.keys(catAcc).forEach(function (mk) {
    var rows = Object.keys(catAcc[mk]).map(function (k) { return { category: k, spent: round2_(catAcc[mk][k].spent), count: catAcc[mk][k].count }; })
      .sort(function (a, b) { return b.spent - a.spent; });
    if (rows.length > 9) {
      var rest = rows.slice(8);
      rows = rows.slice(0, 8).concat([{ category: 'Other (' + rest.length + ')', spent: sum_(rest, function (r) { return r.spent; }),
        count: rest.reduce(function (n, r) { return n + r.count; }, 0), other: true }]);
    }
    out.catsByMonth[mk] = rows;
  });

  var byCat = {};
  real.forEach(function (t) {
    if (monthKey_(t.date) !== month || t.amount >= 0) return;
    var k = t.cat || '(no category)';
    byCat[k] = (byCat[k] || 0) - t.amount;
  });
  out.topCategories = Object.keys(byCat).map(function (k) { return { category: k, spent: round2_(byCat[k]) }; })
    .sort(function (a, b) { return b.spent - a.spent; }).slice(0, 6);

  // Every category's spending this month (for budgets)
  out.monthCats = (out.catsByMonth[month] || []).filter(function (c) { return !c.other; });
  if ((out.catsByMonth[month] || []).some(function (c) { return c.other; })) {
    var full = {};
    real.forEach(function (t) {
      if (monthKey_(t.date) !== month || t.amount >= 0) return;
      var k = t.cat || '(no category)';
      full[k] = (full[k] || 0) - t.amount;
    });
    out.monthCats = Object.keys(full).map(function (k) { return { category: k, spent: round2_(full[k]) }; });
  }

  out.recurring = detectRecurring_(real, ctx);

  // Every category's spending in each of the 12 months (Budget tab history), same order as trend
  var monthIdx = {};
  out.trend.forEach(function (t, i) { monthIdx[t.month] = i; });
  out.catHistory = {};
  real.forEach(function (t) {
    var i = monthIdx[monthKey_(t.date)];
    if (t.amount >= 0 || i === undefined) return;
    var k = t.cat || '(no category)';
    var row = out.catHistory[k] || (out.catHistory[k] = out.trend.map(function () { return 0; }));
    row[i] = round2_(row[i] - t.amount);
  });

  // Spending per day for the last 14 days (weekly trend)
  var since14 = addDays_(ctx.today, -13);
  out.spendDays = {};
  real.forEach(function (t) {
    if (t.amount >= 0 || t.date < since14 || t.date > ctx.today) return;
    out.spendDays[t.date] = round2_((out.spendDays[t.date] || 0) - t.amount);
  });

  out.recent = list.filter(function (t) { return !t.adjust && t.date <= ctx.today; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.__row - b.__row; })
    .slice(0, 40)
    .map(function (t) { return { date: t.date, desc: t.desc || t.catName, cat: t.cat, account: t.account, amount: t.amount, transfer: t.transfer }; });

  return out;
}

function checkCategories_(list, since30, issues) {
  // 1. Same name with different icons, e.g. "🍜 Food" vs "🍔 Food"
  var byName = {}, firstOf = {};
  list.forEach(function (t) {
    if (!t.cat) return;
    var k = t.catName.toLowerCase();
    (byName[k] = byName[k] || {})[t.cat] = (byName[k][t.cat] || 0) + 1;
    if (!firstOf[t.cat]) firstOf[t.cat] = t;
  });
  Object.keys(byName).forEach(function (k) {
    var variants = Object.keys(byName[k]);
    if (variants.length > 1) {
      // Link to the less-used spelling: that is usually the one to change.
      var rare = variants.slice().sort(function (a, b) { return byName[k][a] - byName[k][b]; })[0];
      issues.add('warn', 'categories', 'Category written ' + variants.length + ' ways: ' + variants.join(' · '),
        variants.map(function (v) { return v + ' ×' + byName[k][v]; }).join(', '), firstOf[rare]);
    }
  });

  // 2. One name is the start of another, e.g. "Food" and "Food & Drinks"
  //    (but not "Belanja GF" vs "Belanja Family", or "Income" vs "Rental income")
  var names = Object.keys(byName);
  var words = function (s) { return s.split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w && w !== 'and'; }); };
  var pairs = [];
  names.forEach(function (a) {
    var wa = words(a);
    if (!wa.length) return;
    names.forEach(function (b) {
      var wb = words(b);
      if (a === b || wb.length <= wa.length) return;
      if (wa.every(function (w, i) { return wb[i] === w; })) pairs.push([a, b]);
    });
  });
  var label = function (k) { return Object.keys(byName[k])[0]; };
  pairs.slice(0, 6).forEach(function (p) {
    issues.add('info', 'categories', 'Similar categories "' + label(p[0]) + '" and "' + label(p[1]) + '" — merge?', '', firstOf[label(p[0])]);
  });

  // 3. Money coming IN on a category that is almost always money OUT
  var sign = {};
  list.forEach(function (t) {
    if (!t.cat || t.transfer || t.adjust) return;
    var s = sign[t.cat] || (sign[t.cat] = { neg: 0, pos: 0, recentPos: [] });
    if (t.amount < 0) s.neg++;
    else if (t.amount > 0) {
      s.pos++;
      if (t.date >= since30) s.recentPos.push(t);
    }
  });
  Object.keys(sign).forEach(function (c) {
    var s = sign[c];
    if (s.neg >= 5 && s.neg / (s.neg + s.pos) >= 0.9 && s.recentPos.length) {
      var eg = s.recentPos[0];
      issues.add('warn', 'amounts', s.recentPos.length + ' positive amount(s) in spending category "' + c + '" in the last 30 days',
        'Refund, or is the sign wrong? e.g. ' + eg.date + ' RM ' + eg.amount.toFixed(2) + ' on ' + eg.account + ' (' + rowList_(s.recentPos, 3) + ')', eg);
    }
  });
}

function readPayslips_(table, ctx, issues) {
  if (!table.exists || !table.rows.length) return null;
  var list = [];
  table.rows.forEach(function (r) {
    var p = {
      date: toISODate_(r['Pay date']), employer: text_(r.Employer),
      basic: toAmount_(r.Basic), allowances: toAmount_(r.Allowances) || 0,
      gross: toAmount_(r.Gross), deductions: toAmount_(r.Deductions) || 0, net: toAmount_(r.Net),
      __row: r.__row
    };
    if (!p.date) { issues.add('warn', 'payslips', 'Payslip without a readable pay date', 'row ' + r.__row, r); return; }
    if (p.basic !== null && p.gross !== null && Math.abs(p.basic + p.allowances - p.gross) > 0.05) {
      issues.add('warn', 'payslips', 'Payslip ' + p.date + ': Basic + Allowances ≠ Gross', 'row ' + r.__row, r);
    }
    if (p.gross !== null && p.net !== null && Math.abs(p.gross - p.deductions - p.net) > 0.05) {
      issues.add('warn', 'payslips', 'Payslip ' + p.date + ': Gross − Deductions ≠ Net', 'row ' + r.__row, r);
    }
    list.push(p);
  });
  if (!list.length) return null;
  list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var last = list[0];
  var age = daysBetween_(last.date, ctx.today);
  if (age > 35) issues.add('warn', 'payslips', 'Latest payslip is ' + age + ' days old (' + last.date + ') — add the new one?', '', { gid: table.gid });
  return { date: last.date, employer: last.employer, net: last.net, gross: last.gross, daysAgo: age, prevNet: list[1] ? list[1].net : null };
}

function readGoals_(table, ctx) {
  if (!table.exists) return [];
  return table.rows.map(function (r) {
    var target = toAmount_(r.Target), saved = toAmount_(r['Set aside (manual goals)']);
    var due = toISODate_(r['Target date']);
    return {
      goal: text_(r.Goal), type: text_(r.Type), target: target, saved: saved,
      due: due, daysLeft: due ? daysBetween_(ctx.today, due) : null,
      achieved: toBool_(r.Achieved),
      pct: target && saved !== null ? Math.min(100, Math.round(saved / target * 100)) : null
    };
  }).filter(function (g) { return g.goal && !g.achieved; }).slice(0, 5);
}

/**
 * Payments that come back about once a month for a similar amount (subscriptions,
 * bills, loan instalments). Everyday spending is excluded: it happens many times a
 * month and the amounts vary. Returns the next expected date for each.
 */
function detectRecurring_(real, ctx) {
  var since = addDays_(ctx.today, -185);
  var groups = {};
  real.forEach(function (t) {
    if (t.amount >= 0 || t.date < since || t.date > ctx.today) return;
    var name = t.desc && !/^imported/i.test(t.desc) ? t.desc : t.catName;
    if (!name) return;
    var k = name.toLowerCase().replace(/\s+/g, ' ').trim();
    (groups[k] = groups[k] || { name: name, cat: t.cat, account: t.account, items: [] }).items.push(t);
  });
  var out = [];
  Object.keys(groups).forEach(function (k) {
    var g = groups[k], items = g.items.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var months = {};
    items.forEach(function (t) { months[monthKey_(t.date)] = (months[monthKey_(t.date)] || 0) + 1; });
    var mKeys = Object.keys(months);
    if (mKeys.length < 2) return;                                   // seen in at least two months
    if (items.length / mKeys.length > 1.4) return;                  // about once a month, not daily spending
    var recent = items.slice(-3).map(function (t) { return -t.amount; });
    var lo = Math.min.apply(null, recent), hi = Math.max.apply(null, recent);
    if (lo <= 0 || hi / lo > 1.35) return;                          // similar amount each time
    var last = items[items.length - 1];
    if (daysBetween_(last.date, ctx.today) > 40) return;            // still active
    var day = +last.date.slice(8, 10);
    var nk = addMonths_(monthKey_(last.date), 1);
    var dim = new Date(Date.UTC(+nk.slice(0, 4), +nk.slice(5, 7), 0)).getUTCDate();
    var next = nk + '-' + pad_(Math.min(day, dim));
    out.push({ name: g.name, category: g.cat, account: last.account, amount: round2_(-last.amount),
      last: last.date, next: next, daysUntil: daysBetween_(ctx.today, next), months: mKeys.length });
  });
  return out.sort(function (a, b) { return a.next < b.next ? -1 : 1; });
}
