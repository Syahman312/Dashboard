/**
 * Flow (Flow Data sheet): tasks, habits, ACCA study, month-end close and the
 * app's own _Log tab. Every list tab starts with ID + Updated.
 */

var FLOW_COLUMNS = {
  'Tasks': ['ID', 'Updated', 'Task', 'Date', 'Time', 'Duration (min)', 'Done', 'Done At', 'Priority', 'Area', 'Top 3', 'Paper ID'],
  'ACCA Papers': ['ID', 'Updated', 'Code', 'Paper', 'Exam Date', 'Target Hours', 'Status'],
  'ACCA Topics': ['ID', 'Updated', 'Topic', 'Paper ID', 'Confidence (0-3)'],
  'Study Log': ['ID', 'Updated', 'Date', 'Paper ID', 'Topic ID', 'Minutes'],
  'Close Checklist': ['ID', 'Updated', 'WD', 'Task', 'Active'],
  'Close Log': ['ID', 'Updated', 'Period', 'Item ID', 'Done'],
  'Habits': ['ID', 'Updated', 'Icon', 'Habit', 'Days per Week', 'Archived'],
  'Habit Log': ['ID', 'Updated', 'Date', 'Habit ID', 'Done'],
  '_Log': ['Time', 'Source', 'Level', 'Area', 'Message']
};

function readFlow_(ss, ctx) {
  var issues = makeIssues_('flow');
  var T = {};
  Object.keys(FLOW_COLUMNS).forEach(function (name) {
    T[name] = readTable_(ss, name);
    checkColumns_(T[name], FLOW_COLUMNS[name], issues, 'structure');
  });

  var papers = readPapers_(T['ACCA Papers'], T['ACCA Topics'], T['Study Log'], ctx, issues);
  var tasks = readTasks_(T['Tasks'], papers.byId, ctx, issues);
  var habits = readHabits_(T['Habits'], T['Habit Log'], ctx, issues);
  var close = readClose_(T['Close Checklist'], T['Close Log'], ctx, issues);
  var log = summariseLog_(T['_Log'], { time: 'Time', msg: 'Message', area: 'Area', level: 'Level', source: 'Source' }, ctx, issues, 7);
  if (log.dateOnlyRows) {
    issues.add('info', 'formats', log.dateOnlyRows + ' _Log entr(ies) record only a date, without the time',
      'Some clients write "11/15/2026" instead of a full timestamp. Write ISO timestamps everywhere (see CONVENTIONS.md).', { gid: T['_Log'].gid });
  }

  var lastChange = null;
  Object.keys(T).forEach(function (name) {
    if (!T[name].exists || name.charAt(0) === '_') return;
    var t = latestTimestamp_(T[name].rows, 'Updated');
    if (t !== null && t <= ctx.now + 864e5 && (lastChange === null || t > lastChange)) lastChange = t;
  });

  return {
    summary: { tasks: tasks, habits: habits, habitStats: habits.stats, study: papers.summary, close: close, log: log, lastChange: lastChange },
    issues: issues.list
  };
}

function readTasks_(table, paperIds, ctx, issues) {
  var out = { today: [], overdue: [], top3: [], inbox: 0, doneToday: 0, openTotal: 0, upcoming: [], doneDays: {}, doneByMonth: {} };
  if (!table.exists) return out;
  var noTitle = [], badTime = [], badDate = [], doneNoStamp = [], badPaper = [];
  var weekAhead = addDays_(ctx.today, 7), since14 = addDays_(ctx.today, -13);

  table.rows.forEach(function (r) {
    var title = text_(r.Task);
    var date = toISODate_(r.Date);
    var done = toBool_(r.Done);
    var time = text_(isDate_(r.Time) ? fmtDate_(r.Time, 'HH:mm') : r.Time);
    if (!title) noTitle.push(r);
    if (r.Date !== '' && r.Date !== null && !date) badDate.push(r);
    if (time && !/^\d{1,2}:\d{2}$/.test(time)) badTime.push(r);
    if (done && !text_(r['Done At'])) doneNoStamp.push(r);
    if (text_(r['Paper ID']) && paperIds && !paperIds[text_(r['Paper ID'])]) badPaper.push(r);

    if (done) {
      var doneOn = toISODate_(r['Done At']);
      if (doneOn === ctx.today) out.doneToday++;
      if (doneOn && doneOn <= ctx.today) {
        if (doneOn >= since14) out.doneDays[doneOn] = (out.doneDays[doneOn] || 0) + 1;
        var dm = monthKey_(doneOn);
        out.doneByMonth[dm] = (out.doneByMonth[dm] || 0) + 1;
      }
      return;
    }
    out.openTotal++;
    var t = {
      id: text_(r.ID), task: title || '(untitled)', date: date, time: time,
      duration: toNumber_(r['Duration (min)']), priority: text_(r.Priority), area: text_(r.Area),
      top3: toBool_(r['Top 3'])
    };
    if (!date) out.inbox++;
    else if (date < ctx.today) out.overdue.push(t);
    else if (date === ctx.today) out.today.push(t);
    else if (date <= weekAhead) out.upcoming.push(t);
    if (t.top3) out.top3.push(t);
  });

  var byTime = function (a, b) { return (a.date || '') + (a.time || '99') < (b.date || '') + (b.time || '99') ? -1 : 1; };
  out.today.sort(byTime); out.overdue.sort(byTime); out.upcoming.sort(byTime);
  out.overdueCount = out.overdue.length;
  out.overdue = out.overdue.slice(0, 8);
  out.upcoming = out.upcoming.slice(0, 5);

  if (noTitle.length) issues.rows('warn', 'fields', noTitle.length + ' task(s) have no title', noTitle);
  if (badDate.length) issues.rows('warn', 'dates', badDate.length + ' task(s) have an unreadable date', badDate);
  if (badTime.length) issues.rows('warn', 'formats', badTime.length + ' task(s) have a time not in HH:mm', badTime);
  if (doneNoStamp.length) issues.rows('info', 'fields', doneNoStamp.length + ' done task(s) have no "Done At" time', doneNoStamp);
  if (badPaper.length) issues.rows('warn', 'links', badPaper.length + ' task(s) point to an ACCA paper that does not exist', badPaper);
  if (out.overdueCount >= 5) issues.add('info', 'planning', out.overdueCount + ' overdue tasks — reschedule or drop some?', '', { gid: table.gid });
  if (!table.rows.length) issues.add('info', 'freshness', 'Tasks tab is empty — has Flow synced yet?', '', { gid: table.gid });
  return out;
}

function readHabits_(habitsT, logT, ctx, issues) {
  var out = [];
  out.stats = null;
  if (!habitsT.exists) return out;
  var week = weekStart_(ctx.today);
  var habits = {};
  habitsT.rows.forEach(function (r) {
    var id = text_(r.ID);
    if (!id) return;
    habits[id] = {
      id: id, icon: text_(r.Icon), habit: text_(r.Habit), target: toNumber_(r['Days per Week']) || 7,
      order: toNumber_(r.Order) || 0, archived: toBool_(r.Archived), doneToday: false, week: 0, streak: 0, days: {}
    };
  });
  var orphan = [];
  if (logT.exists) {
    logT.rows.forEach(function (r) {
      var h = habits[text_(r['Habit ID'])];
      if (!h) { orphan.push(r); return; }
      var d = toISODate_(r.Date);
      if (!d || !toBool_(r.Done)) return;
      h.days[d] = true;
    });
  }
  if (orphan.length) issues.rows('warn', 'links', orphan.length + ' habit log entr(ies) point to a habit that does not exist', orphan);

  Object.keys(habits).forEach(function (id) {
    var h = habits[id];
    if (h.archived) return;
    h.doneToday = !!h.days[ctx.today];
    for (var d = week; d <= ctx.today; d = addDays_(d, 1)) if (h.days[d]) h.week++;
    var cur = h.doneToday ? ctx.today : addDays_(ctx.today, -1);
    while (h.days[cur]) { h.streak++; cur = addDays_(cur, -1); }
    var grid = [];
    for (var g = 34; g >= 0; g--) grid.push(h.days[addDays_(ctx.today, -g)] ? 1 : 0);
    out.push({ icon: h.icon, habit: h.habit, target: h.target, week: h.week, doneToday: h.doneToday, streak: h.streak, order: h.order, days: grid });
  });
  out.sort(function (a, b) { return a.order - b.order; });
  out.stats = habitStats_(habits, ctx);
  return out;
}

/**
 * How often habits were done against their weekly targets: the last 7 days, the
 * 7 days before, and each of the last 4 months. rate = done / expected (0–100).
 */
function habitStats_(habits, ctx) {
  var live = Object.keys(habits).map(function (id) { return habits[id]; }).filter(function (h) { return !h.archived; });
  var span = function (from, to) {
    var hits = 0, expected = 0;
    live.forEach(function (h) {
      // A habit only counts from the first day it was ticked
      var start = Object.keys(h.days).sort()[0];
      if (!start || start > to) return;
      var a = start > from ? start : from;
      for (var d = a; d <= to; d = addDays_(d, 1)) if (h.days[d]) hits++;
      expected += Math.min(h.target, 7) * (daysBetween_(a, to) + 1) / 7;
    });
    return { hits: hits, expected: Math.round(expected), rate: expected ? Math.min(100, Math.round(hits / expected * 100)) : null };
  };
  var out = { last7: span(addDays_(ctx.today, -6), ctx.today), prev7: span(addDays_(ctx.today, -13), addDays_(ctx.today, -7)), byMonth: {} };
  var month = monthKey_(ctx.today);
  for (var i = 1; i <= 4; i++) {
    var mk = addMonths_(month, -i);
    var end = addDays_(addMonths_(month, -i + 1) + '-01', -1);
    out.byMonth[mk] = span(mk + '-01', end);
  }
  return out;
}

function readPapers_(papersT, topicsT, studyT, ctx, issues) {
  var byId = {}, list = [];
  if (papersT.exists) {
    papersT.rows.forEach(function (r) {
      var id = text_(r.ID);
      if (!id) return;
      var p = {
        id: id, code: text_(r.Code), paper: text_(r.Paper), exam: toISODate_(r['Exam Date']),
        targetHours: toNumber_(r['Target Hours']), status: text_(r.Status), minutes: 0, topics: 0, confSum: 0,
        __row: r.__row, __gid: r.__gid
      };
      byId[id] = p; list.push(p);
    });
  }
  if (topicsT.exists) {
    var badConf = [];
    topicsT.rows.forEach(function (r) {
      var p = byId[text_(r['Paper ID'])];
      var c = toNumber_(r['Confidence (0-3)']);
      if (c !== null && (c < 0 || c > 3)) badConf.push(r);
      if (p && c !== null) { p.topics++; p.confSum += c; }
    });
    if (badConf.length) issues.rows('warn', 'fields', badConf.length + ' topic(s) have confidence outside 0–3', badConf);
  }
  var week = weekStart_(ctx.today), since7 = addDays_(ctx.today, -6), since30 = addDays_(ctx.today, -29);
  var study = { today: 0, week: 0, last7: 0, days: {}, byMonth: {} };
  if (studyT.exists) {
    var orphan = [], badMin = [];
    studyT.rows.forEach(function (r) {
      var min = toNumber_(r.Minutes), d = toISODate_(r.Date);
      if (min === null) { badMin.push(r); return; }
      var pid = text_(r['Paper ID']);
      if (pid && !byId[pid]) orphan.push(r);
      if (byId[pid]) byId[pid].minutes += min;
      if (!d) return;
      if (d <= ctx.today) study.byMonth[monthKey_(d)] = (study.byMonth[monthKey_(d)] || 0) + min;
      if (d === ctx.today) study.today += min;
      if (d >= week && d <= ctx.today) study.week += min;
      if (d >= since7 && d <= ctx.today) study.last7 += min;
      if (d >= since30 && d <= ctx.today) study.days[d] = (study.days[d] || 0) + min;
    });
    if (orphan.length) issues.rows('warn', 'links', orphan.length + ' study session(s) point to a paper that does not exist', orphan);
    if (badMin.length) issues.rows('warn', 'fields', badMin.length + ' study session(s) have no minutes', badMin);
  }
  var daily = [];
  for (var i = 29; i >= 0; i--) { var dd = addDays_(ctx.today, -i); daily.push({ date: dd, minutes: study.days[dd] || 0 }); }

  var upcoming = list.filter(function (p) { return p.exam && p.exam >= ctx.today && !/pass|done|complete|exempt/i.test(p.status); })
    .sort(function (a, b) { return a.exam < b.exam ? -1 : 1; });
  var next = upcoming[0] || null;
  var nextOut = next ? {
    code: next.code, paper: next.paper, exam: next.exam, daysLeft: daysBetween_(ctx.today, next.exam),
    hours: round2_(next.minutes / 60), targetHours: next.targetHours,
    confidence: next.topics ? round2_(next.confSum / next.topics) : null, status: next.status
  } : null;
  if (nextOut && nextOut.targetHours && nextOut.daysLeft <= 30 && nextOut.hours < nextOut.targetHours * 0.6) {
    issues.add('warn', 'study', next.code + ' exam in ' + nextOut.daysLeft + ' days with ' + nextOut.hours + ' of ' + nextOut.targetHours + ' target hours', '', next);
  }
  return {
    byId: byId,
    summary: {
      next: nextOut, today: study.today, week: study.week, last7: study.last7, daily: daily, byMonth: study.byMonth,
      papers: list.map(function (p) {
        return { code: p.code, paper: p.paper, exam: p.exam, daysLeft: p.exam ? daysBetween_(ctx.today, p.exam) : null,
          hours: round2_(p.minutes / 60), targetHours: p.targetHours, status: p.status,
          confidence: p.topics ? round2_(p.confSum / p.topics) : null };
      }).sort(function (a, b) { return (a.exam || '9999') < (b.exam || '9999') ? -1 : 1; })
    }
  };
}

/** Business day number of the month (Mon–Fri), e.g. WD3. */
function workingDay_(iso) {
  var n = 0;
  for (var d = iso.slice(0, 8) + '01'; d <= iso; d = addDays_(d, 1)) {
    var dow = new Date(isoToUTC_(d)).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

function readClose_(checkT, logT, ctx, issues) {
  if (!checkT.exists) return null;
  var items = checkT.rows.filter(function (r) { return text_(r.Active) === '' || toBool_(r.Active); })
    .map(function (r) {
      var wd = toNumber_(String(r.WD).replace(/[^\d.-]/g, ''));
      return { id: text_(r.ID), task: text_(r.Task), wd: wd, __row: r.__row };
    });
  if (!items.length) return null;
  var noWd = items.filter(function (i) { return i.wd === null; });
  if (noWd.length) issues.rows('info', 'fields', noWd.length + ' close checklist item(s) have no working day (WD)', noWd);

  // The close for last month runs in the first working days of this month.
  var period = addMonths_(monthKey_(ctx.today), -1);
  var done = {};
  if (logT.exists) {
    logT.rows.forEach(function (r) {
      var p = text_(isDate_(r.Period) ? fmtDate_(r.Period, 'yyyy-MM') : r.Period).slice(0, 7);
      if (p === period && toBool_(r.Done)) done[text_(r['Item ID'])] = true;
    });
  }
  var wd = workingDay_(ctx.today);
  var doneCount = items.filter(function (i) { return done[i.id]; }).length;
  var behind = items.filter(function (i) { return !done[i.id] && i.wd !== null && i.wd <= wd; });
  return {
    period: period, wd: wd, total: items.length, done: doneCount, behind: behind.length,
    nextItems: items.filter(function (i) { return !done[i.id]; })
      .sort(function (a, b) { return (a.wd || 99) - (b.wd || 99); }).slice(0, 4)
      .map(function (i) { return { task: i.task, wd: i.wd }; })
  };
}
