/**
 * Weekly trend and month review, built from what the app readers return.
 *
 * Weekly: the last 7 days (today included) against the 7 days before, so it
 * never resets to zero on a Monday.
 * Month review: the last 3 full months, newest first.
 */

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "RM 2,500" (whole ringgit, with thousands commas) */
function rmWhole_(n) { return 'RM ' + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function monthName_(mk) { return MONTH_NAMES[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4); }

function sumDays_(map, from, to) {
  var t = 0;
  Object.keys(map || {}).forEach(function (d) { if (d >= from && d <= to) t += map[d]; });
  return round2_(t);
}

/**
 * One row per measure: { key, src, view, label, unit, cur, prev, delta, dir, good }
 * unit: rm | n | pct | h · dir: up | down | flat · good: true | false | null (flat)
 */
function weekly_(sources, ctx) {
  var out = [];
  var d6 = addDays_(ctx.today, -6), d7 = addDays_(ctx.today, -7), d13 = addDays_(ctx.today, -13);
  var add = function (key, src, view, label, unit, cur, prev, better) {
    if (cur === null || cur === undefined || prev === null || prev === undefined) return;
    var delta = round2_(cur - prev);
    var small = unit === 'rm' ? Math.abs(delta) < Math.max(5, prev * 0.05) : unit === 'pct' ? Math.abs(delta) < 5 : unit === 'h' ? Math.abs(delta) < 0.5 : delta === 0;
    var dir = small ? 'flat' : delta > 0 ? 'up' : 'down';
    out.push({ key: key, src: src, view: view, label: label, unit: unit, cur: cur, prev: prev, delta: delta,
      pct: prev ? Math.round(delta / prev * 100) : null, dir: dir, good: dir === 'flat' ? null : (dir === better) });
  };

  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  if (f) {
    add('tasks', 'flow', 'flow', 'Tasks done', 'n', sumDays_(f.tasks.doneDays, d6, ctx.today), sumDays_(f.tasks.doneDays, d13, d7), 'up');
    var hs = f.habitStats;
    if (hs && hs.last7.expected) add('habits', 'flow', 'flow', 'Habits kept', 'pct', hs.last7.rate, hs.prev7.rate, 'up');
    var days = {};
    (f.study && f.study.daily || []).forEach(function (x) { days[x.date] = x.minutes; });
    var s7 = sumDays_(days, d6, ctx.today), sp = sumDays_(days, d13, d7);
    if (s7 || sp) add('study', 'flow', 'flow', 'Study', 'h', round2_(s7 / 60), round2_(sp / 60), 'up');
  }
  var fin = sources.finance && sources.finance.ok ? sources.finance.summary : null;
  if (fin && fin.spendDays) add('spend', 'finance', 'money', 'Spending', 'rm', sumDays_(fin.spendDays, d6, ctx.today), sumDays_(fin.spendDays, d13, d7), 'down');
  var g = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  if (g.length && g[0].week) {
    add('car', 'garage', 'garage', 'Car costs', 'rm', round2_(sum_(g, function (c) { return c.week.cur; })), round2_(sum_(g, function (c) { return c.week.prev; })), 'down');
  }
  return out;
}

/** The last 3 full months: money, budget, Flow and car, with a few plain wins and watch-outs. */
function review_(sources, ctx) {
  var f = sources.flow && sources.flow.ok ? sources.flow.summary : null;
  var fin = sources.finance && sources.finance.ok ? sources.finance.summary : null;
  var cars = sources.garage && sources.garage.ok ? sources.garage.summary.cars : [];
  var thisMonth = monthKey_(ctx.today), months = [];
  var key = function (c) { return stripIcon_(c).toLowerCase(); };

  var moneyFor = function (mk) {
    if (!fin) return null;
    var t = (fin.trend || []).filter(function (x) { return x.month === mk; })[0];
    if (!t) return null;
    return { spent: t.spent, income: round2_(t.income), saved: round2_(t.income - t.spent),
      rate: t.income > 0 ? Math.round((t.income - t.spent) / t.income * 100) : null };
  };
  var carFor = function (mk) {
    if (!cars.length) return null;
    var fuel = 0, service = 0, km = 0, litres = 0, any = false;
    cars.forEach(function (c) {
      (c.monthly || []).forEach(function (m) {
        if (m.month !== mk) return;
        any = true; fuel += m.fuel; service += m.service; litres += m.litres || 0;
        if (m.km) km += m.km;
      });
    });
    if (!any) return null;
    return { fuel: round2_(fuel), service: round2_(service), cost: round2_(fuel + service), km: km || null,
      kmPerL: km && litres ? round2_(km / litres) : null };
  };

  for (var i = 1; i <= 3; i++) {
    var mk = addMonths_(thisMonth, -i), pk = addMonths_(mk, -1);
    var r = { month: mk, name: monthName_(mk), money: moneyFor(mk), budget: null, flow: null, car: carFor(mk), wins: [], watch: [] };
    var prevMoney = moneyFor(pk);
    if (r.money && prevMoney) r.money.prevSpent = prevMoney.spent;

    if (fin && r.money) {
      r.money.top = (fin.catsByMonth[mk] || []).filter(function (c) { return !c.other; }).slice(0, 3)
        .map(function (c) { return { category: c.category, spent: c.spent }; });
      if (fin.budget && fin.budget.rows && fin.budget.rows.length) {
        var idx = (fin.trend || []).map(function (x) { return x.month; }).indexOf(mk), spentBy = {};
        Object.keys(fin.catHistory || {}).forEach(function (c) { spentBy[key(c)] = (spentBy[key(c)] || 0) + (fin.catHistory[c][idx] || 0); });
        var over = fin.budget.rows.filter(function (b) { return b.budget > 0 && (spentBy[key(b.category)] || 0) > b.budget; })
          .map(function (b) { var s = round2_(spentBy[key(b.category)]); return { category: b.category, budget: b.budget, spent: s, over: round2_(s - b.budget) }; })
          .sort(function (a, b) { return b.over - a.over; });
        var kept = fin.budget.rows.filter(function (b) { return b.budget > 0; }).length - over.length;
        r.budget = { total: fin.budget.total, spent: r.money.spent, over: over, kept: kept };
      }
    }
    if (f) {
      var hb = f.habitStats && f.habitStats.byMonth[mk];
      var study = f.study && f.study.byMonth ? f.study.byMonth[mk] || 0 : null;
      var prevStudy = f.study && f.study.byMonth ? f.study.byMonth[pk] || 0 : null;
      r.flow = { tasksDone: (f.tasks.doneByMonth || {})[mk] || 0, prevTasksDone: (f.tasks.doneByMonth || {})[pk] || 0,
        habitRate: hb && hb.expected ? hb.rate : null,
        studyHours: study === null ? null : round2_(study / 60), prevStudyHours: prevStudy === null ? null : round2_(prevStudy / 60) };
    }

    // Plain-language highlights
    var m = r.money;
    if (m && m.prevSpent) {
      var ch = Math.round((m.spent - m.prevSpent) / m.prevSpent * 100);
      if (ch <= -5) r.wins.push('Spent ' + (-ch) + '% less than ' + MONTH_NAMES[+pk.slice(5, 7) - 1]);
      else if (ch >= 10) r.watch.push('Spent ' + ch + '% more than ' + MONTH_NAMES[+pk.slice(5, 7) - 1]);
    }
    if (m && m.rate !== null) {
      if (m.rate >= 20) r.wins.push('Saved ' + m.rate + '% of income (' + rmWhole_(m.saved) + ')');
      else if (m.saved < 0) r.watch.push('Spent ' + rmWhole_(m.saved) + ' more than came in');
    }
    if (r.budget) {
      if (r.budget.total && m.spent <= r.budget.total) r.wins.push('Within the ' + rmWhole_(r.budget.total) + ' budget');
      else if (r.budget.total) r.watch.push('Over the total budget by ' + rmWhole_(m.spent - r.budget.total));
      r.budget.over.slice(0, 2).forEach(function (o) { r.watch.push(stripIcon_(o.category) + ' over budget by ' + rmWhole_(o.over)); });
    }
    if (r.flow) {
      if (r.flow.habitRate !== null && r.flow.habitRate >= 80) r.wins.push('Habits kept ' + r.flow.habitRate + '% of the time');
      else if (r.flow.habitRate !== null && r.flow.habitRate < 50) r.watch.push('Habits kept only ' + r.flow.habitRate + '% of the time');
      if (r.flow.studyHours && r.flow.prevStudyHours !== null && r.flow.studyHours > r.flow.prevStudyHours + 1) r.wins.push('Studied ' + r.flow.studyHours + ' h, up from ' + r.flow.prevStudyHours + ' h');
      if (r.flow.tasksDone > r.flow.prevTasksDone && r.flow.prevTasksDone) r.wins.push(r.flow.tasksDone + ' tasks done, up from ' + r.flow.prevTasksDone);
    }
    var has = r.money || r.flow && (r.flow.tasksDone || r.flow.studyHours || r.flow.habitRate !== null) || r.car;
    if (has) months.push(r);
  }
  return months;
}
