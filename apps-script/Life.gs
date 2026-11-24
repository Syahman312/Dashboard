/**
 * NextRole (career), Voyage (trips) and Nest (home setup).
 *
 * Privacy: only what the Life tab shows is read and sent to the page.
 *   NextRole - never salary, pay slips, contact details, CV text, notes or files.
 *   Voyage   - never essentials (hotel address, phone, embassy), booking refs, links or files.
 *   Nest     - item names, rooms, status and costs; never links or notes.
 */

/** 'yyyy-mm-dd' + n months, clamped to the month's last day ('' when not a date). */
function addMonthsIso_(iso, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  var p = iso.split('-').map(Number), total = p[0] * 12 + (p[1] - 1) + Math.round(Number(n) || 0);
  var y = Math.floor(total / 12), mo = total % 12;
  var last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return y + '-' + pad_(mo + 1) + '-' + pad_(Math.min(p[2], last));
}

function isoOrEmpty_(v) {
  if (isDate_(v)) return toISODate_(v) || '';
  var s = text_(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** When the sheet file itself last changed (for apps that keep no save time). */
function fileUpdated_(ss) {
  try { return DriveApp.getFileById(ss.getId()).getLastUpdated().getTime(); } catch (e) { return null; }
}

/* =========================================================
 * NextRole: one "Data" tab, one row per record, JSON in column B
 * ======================================================= */

var CAREER_COLUMNS = ['id', 'json (do not edit)', 'type'];

function readCareer_(ss, ctx) {
  var issues = makeIssues_('career');
  var table = readTable_(ss, 'Data');
  if (!table.exists) table = readTable_(ss, null);
  if (!checkColumns_(table, CAREER_COLUMNS, issues, 'structure')) return { summary: null, issues: issues.list };

  var items = [], badJson = [], lastChange = null;
  table.rows.forEach(function (r) {
    var rec;
    try { rec = JSON.parse(text_(r['json (do not edit)'])); } catch (e) { badJson.push(r); return; }
    if (!rec || typeof rec !== 'object') { badJson.push(r); return; }
    var upd = toNumber_(rec.updated);
    if (upd && upd > 1e11 && upd <= ctx.now + 864e5 && (lastChange === null || upd > lastChange)) lastChange = upd;
    if (rec.deleted) return;
    rec.__row = r.__row; rec.__gid = r.__gid;
    items.push(rec);
  });
  if (badJson.length) issues.rows('warn', 'json', badJson.length + ' row(s) in the Data tab cannot be read', badJson);

  var of = function (k) { return items.filter(function (i) { return i.kind === k; }); };
  var year = ctx.today.slice(0, 4);
  var days = function (iso) { return iso ? daysBetween_(ctx.today, iso) : null; };
  var me = of('me')[0] || {};

  var papers = of('acca');
  var passed = papers.filter(function (p) { return p.st === 'Passed' || p.st === 'Exempt'; });
  var booked = papers.filter(function (p) { return p.st === 'Booked' && isoOrEmpty_(p.date) && days(p.date) >= 0; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
    .map(function (p) { return { code: text_(p.c), name: text_(p.n), date: p.date, daysLeft: days(p.date) }; });

  var goals = of('goal').map(function (g) {
    var due = isoOrEmpty_(g.due);
    return { title: text_(g.title) || '(untitled goal)', area: text_(g.area), due: due || null, daysLeft: days(due), pct: Math.max(0, Math.min(100, +g.pct || 0)), next: text_(g.next) };
  });
  var open = goals.filter(function (g) { return g.pct < 100; })
    .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });

  var ACTIVE = ['Saved', 'Applied', 'Interview', 'Offer'];
  var apps = of('app'), byStatus = {};
  apps.forEach(function (a) { var s = text_(a.st) || 'Saved'; byStatus[s] = (byStatus[s] || 0) + 1; });
  var steps = apps.filter(function (a) { var d = isoOrEmpty_(a.due); return ACTIVE.indexOf(a.st) >= 0 && d && days(d) >= 0 && days(d) <= 30; })
    .map(function (a) { return { title: text_(a.title) || 'Role', company: text_(a.co), status: text_(a.st), date: a.due, daysLeft: days(a.due), interview: a.st === 'Interview' }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var followUp = apps.filter(function (a) {
    var sent = isoOrEmpty_(a.date), due = isoOrEmpty_(a.due);
    return a.st === 'Applied' && sent && days(sent) <= -7 && !(due && days(due) >= 0);
  }).map(function (a) { return { title: text_(a.title) || 'Role', company: text_(a.co), daysAgo: -days(a.date) }; });

  var cpd = of('cpd').filter(function (c) { return String(c.date || '').slice(0, 4) === year; });
  var wins = of('win'), winDates = wins.map(function (w) { return isoOrEmpty_(w.date); }).filter(String).sort();
  var skills = of('skill');

  return {
    summary: {
      role: text_(me.role), target: text_(me.target),
      acca: { passed: passed.map(function (p) { return text_(p.c); }), count: passed.length, total: papers.length, booked: booked },
      goals: { open: open.slice(0, 8), openCount: open.length, done: goals.length - open.length,
        avg: goals.length ? Math.round(goals.reduce(function (t, g) { return t + g.pct; }, 0) / goals.length) : null,
        overdue: open.filter(function (g) { return g.due && g.daysLeft < 0; }).length },
      jobs: { active: apps.filter(function (a) { return ACTIVE.indexOf(a.st) >= 0; }).length, byStatus: byStatus, steps: steps.slice(0, 6), followUp: followUp.slice(0, 6), total: apps.length },
      cpd: { hours: round2_(sum_(cpd, function (c) { return +c.hrs || 0; })), count: cpd.length, year: year },
      wins: { year: wins.filter(function (w) { return String(w.date || '').slice(0, 4) === year; }).length, last: winDates.pop() || null },
      skills: { total: skills.length, atTarget: skills.filter(function (s) { return +s.lvl >= +s.tgt; }).length,
        gaps: skills.filter(function (s) { return +s.tgt > +s.lvl; }).sort(function (a, b) { return (b.tgt - b.lvl) - (a.tgt - a.lvl); }).slice(0, 3)
          .map(function (s) { return { name: text_(s.name), lvl: +s.lvl || 0, tgt: +s.tgt || 0 }; }) },
      lastChange: lastChange
    },
    issues: issues.list
  };
}

/* =========================================================
 * Voyage: full app state as JSON, split over column A of the hidden "_voyage" tab
 * ======================================================= */

function readVoyage_(ss, ctx) {
  var issues = makeIssues_('voyage');
  var sh = ss.getSheetByName('_voyage');
  if (!sh) {
    issues.add('error', 'structure', 'Tab "_voyage" is missing', 'Voyage keeps its data there. Open Voyage and sync once.');
    return { summary: null, issues: issues.list };
  }
  var raw = sh.getDataRange().getValues().map(function (r) { return text_(r[0]); }).join('');
  var data = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch (e) {
      issues.add('error', 'json', 'Voyage data in the "_voyage" tab cannot be read', 'It may have been edited by hand. Open Voyage and sync to rewrite it.', { gid: sh.getSheetId() });
      return { summary: null, issues: issues.list };
    }
  }
  var trips = Array.isArray(data.trips) ? data.trips : [];
  var days = function (iso) { return iso ? daysBetween_(ctx.today, iso) : null; };
  var toHome = function (t, e) {
    var amt = Number(e.amt) || 0;
    return e.cur && e.cur !== t.ccy && e.cur === t.lcy && t.fx > 0 ? amt / t.fx : amt;
  };

  var all = trips.map(function (t) {
    var start = isoOrEmpty_(t.start), end = isoOrEmpty_(t.end) || start;
    var todo = Array.isArray(t.todo) ? t.todo : [], pack = Array.isArray(t.pack) ? t.pack : [], book = Array.isArray(t.book) ? t.book : [];
    var openTodo = todo.filter(function (x) { return !x.ok; });
    var nextBook = book.map(function (b) { return { type: text_(b.type), date: isoOrEmpty_(b.date), time: text_(b.time) }; })
      .filter(function (b) { return b.date && b.date >= ctx.today; }).sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; })[0] || null;
    return {
      name: text_(t.name) || 'Trip', dest: text_(t.dest), start: start || null, end: end || null,
      daysToGo: days(start), nights: start && end ? Math.max(0, daysBetween_(start, end)) : null,
      now: !!(start && start <= ctx.today && end >= ctx.today),
      ccy: text_(t.ccy) || 'MYR', budget: Number(t.budget) || 0,
      spent: round2_(sum_(Array.isArray(t.exp) ? t.exp : [], function (e) { return toHome(t, e); })),
      todoOpen: openTodo.length, todoTotal: todo.length,
      todoOverdue: openTodo.filter(function (x) { var d = isoOrEmpty_(x.due); return d && d < ctx.today; }).length,
      todoNext: openTodo.map(function (x) { return { task: text_(x.t), due: isoOrEmpty_(x.due) || null }; })
        .sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; }).slice(0, 4),
      packed: pack.filter(function (p) { return p.ok; }).length, packTotal: pack.length,
      bookings: book.length, nextBooking: nextBook
    };
  });
  var ahead = all.filter(function (t) { return t.end && t.end >= ctx.today; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  var past = all.filter(function (t) { return t.end && t.end < ctx.today; }).sort(function (a, b) { return a.end > b.end ? -1 : 1; });
  var year = ctx.today.slice(0, 4);

  return {
    summary: {
      trips: ahead.slice(0, 4),
      next: ahead[0] || null,
      past: past.slice(0, 4).map(function (t) { return { name: t.name, dest: t.dest, start: t.start, end: t.end, spent: t.spent, budget: t.budget, ccy: t.ccy }; }),
      count: { ahead: ahead.length, past: past.length,
        thisYear: all.filter(function (t) { return String(t.start || '').slice(0, 4) === year; }).length },
      lastChange: fileUpdated_(ss)
    },
    issues: issues.list
  };
}

/* =========================================================
 * Nest: tabs rooms, items, tasks, bills and _meta
 * ======================================================= */

var NEST_COLUMNS = {
  items: ['id', 'roomId', 'name', 'priority', 'status', 'est', 'actual'],
  tasks: ['id', 'name', 'roomId', 'interval', 'lastDone'],
  bills: ['id', 'name', 'amount', 'freq']
};

function readNest_(ss, ctx) {
  var issues = makeIssues_('nest');
  var T = {};
  ['rooms', 'items', 'tasks', 'bills', '_meta'].forEach(function (n) { T[n] = readTable_(ss, n); });
  var ok = checkColumns_(T.items, NEST_COLUMNS.items, issues, 'structure');
  if (T.tasks.exists) checkColumns_(T.tasks, NEST_COLUMNS.tasks, issues, 'structure');
  if (T.bills.exists) checkColumns_(T.bills, NEST_COLUMNS.bills, issues, 'structure');
  if (!ok) return { summary: null, issues: issues.list };

  var meta = { settings: {} };
  if (T._meta.exists) {
    // key/value rows, usually under a "key | value" header (older copies have no header)
    var h0 = T._meta.headers[0], h1 = T._meta.headers[1];
    var kv = [[h0, h1]].concat(T._meta.rows.map(function (r) { return [text_(r[h0]), r[h1]]; }));
    kv.forEach(function (p) {
      if (p[0] === 'updatedAt') meta.updatedAt = toNumber_(p[1]);
      if (p[0] === 'settings') { try { meta.settings = JSON.parse(text_(p[1]) || '{}') || {}; } catch (e) { meta.settings = {}; } }
    });
  }
  var rooms = {};
  if (T.rooms.exists) T.rooms.rows.forEach(function (r) { rooms[text_(r.id)] = (text_(r.icon) ? text_(r.icon) + ' ' : '') + text_(r.name); });

  var lastChange = meta.updatedAt && meta.updatedAt > 1e11 ? meta.updatedAt : null;
  var seen = function (r) { var u = toNumber_(r.u); if (u && u > 1e11 && u <= ctx.now + 864e5 && (lastChange === null || u > lastChange)) lastChange = u; };

  var items = T.items.rows.map(function (r) {
    seen(r);
    var actual = toAmount_(r.actual), est = toAmount_(r.est) || 0;
    return { name: text_(r.name) || '(item)', room: rooms[text_(r.roomId)] || '', priority: text_(r.priority), status: text_(r.status) || 'idea',
      est: est, actual: actual, cost: actual !== null ? actual : est };
  });
  var by = function (st) { return items.filter(function (i) { return i.status === st; }); };
  var spent = round2_(sum_(by('delivered'), function (i) { return i.cost; }));
  var committed = round2_(sum_(by('ordered'), function (i) { return i.cost; }));
  var planned = round2_(sum_(by('idea').concat(by('shortlist')), function (i) { return i.est; }));
  var must = items.filter(function (i) { return i.priority === 'must'; });
  var ORDER = { ordered: 0, shortlist: 1, idea: 2 };

  var tasks = T.tasks.exists ? T.tasks.rows.map(function (r) {
    seen(r);
    var last = isoOrEmpty_(r.lastDone), next = last ? addMonthsIso_(last, r.interval) : '';
    return { name: text_(r.name) || '(task)', room: rooms[text_(r.roomId)] || '', every: toNumber_(r.interval) || 0, lastDone: last || null,
      due: next || null, daysLeft: next ? daysBetween_(ctx.today, next) : null };
  }).filter(function (t) { return t.due; }).sort(function (a, b) { return a.due < b.due ? -1 : 1; }) : [];

  var bills = T.bills.exists ? T.bills.rows.map(function (r) {
    seen(r);
    var amt = toAmount_(r.amount) || 0, f = text_(r.freq) || 'monthly';
    return { name: text_(r.name), amount: amt, freq: f, monthly: round2_(f === 'yearly' ? amt / 12 : f === 'quarterly' ? amt / 3 : amt) };
  }) : [];

  var s = meta.settings || {}, moveIn = isoOrEmpty_(s.moveIn), budget = toAmount_(s.budget) || 0;
  return {
    summary: {
      moveIn: moveIn || null, daysToMoveIn: moveIn ? daysBetween_(ctx.today, moveIn) : null,
      budget: budget, spent: spent, committed: committed, planned: planned,
      left: budget ? round2_(budget - spent - committed) : null,
      status: { idea: by('idea').length, shortlist: by('shortlist').length, ordered: by('ordered').length, delivered: by('delivered').length },
      must: { done: must.filter(function (i) { return i.status === 'delivered'; }).length, total: must.length,
        next: must.filter(function (i) { return i.status !== 'delivered'; }).sort(function (a, b) { return (a.status in ORDER ? ORDER[a.status] : 3) - (b.status in ORDER ? ORDER[b.status] : 3); })
          .slice(0, 6).map(function (i) { return { name: i.name, room: i.room, status: i.status, cost: i.cost }; }) },
      tasks: { overdue: tasks.filter(function (t) { return t.daysLeft < 0; }).slice(0, 8), soon: tasks.filter(function (t) { return t.daysLeft >= 0 && t.daysLeft <= 30; }).slice(0, 6), total: tasks.length },
      bills: { monthly: round2_(sum_(bills, function (b) { return b.monthly; })), count: bills.length },
      lastChange: lastChange
    },
    issues: issues.list
  };
}

/* =========================================================
 * Life apps in the Overview: alerts, Coming up and the morning brief
 * ======================================================= */

function lifeAlerts_(sources, add) {
  var c = sources.career && sources.career.ok ? sources.career.summary : null;
  if (c) {
    c.jobs.steps.filter(function (s) { return s.daysLeft <= 7; }).forEach(function (s) {
      add(s.daysLeft <= 2 ? 'warn' : 'info', 'career', (s.interview ? 'Interview: ' : 'Next step: ') + s.title, s.company, s.date, 'life');
    });
    if (c.jobs.followUp.length) add('info', 'career', 'Follow up on ' + c.jobs.followUp.length + ' job application' + (c.jobs.followUp.length > 1 ? 's' : ''),
      'No reply after a week: ' + c.jobs.followUp.slice(0, 2).map(function (f) { return f.company || f.title; }).join(', '), null, 'life');
    c.goals.open.filter(function (g) { return g.due && g.daysLeft < 0; }).slice(0, 3).forEach(function (g) {
      add('warn', 'career', 'Goal past its date: ' + g.title, g.pct + '% done', g.due, 'life');
    });
  }
  var v = sources.voyage && sources.voyage.ok ? sources.voyage.summary : null;
  if (v) v.trips.forEach(function (t) {
    if (t.todoOverdue) add('warn', 'voyage', t.name + ': ' + t.todoOverdue + ' trip to-do' + (t.todoOverdue > 1 ? 's' : '') + ' overdue', t.dest, null, 'life');
    else if (t.daysToGo !== null && t.daysToGo >= 0 && t.daysToGo <= 14 && t.todoOpen) add('info', 'voyage', t.name + ' in ' + t.daysToGo + ' days', t.todoOpen + ' to-do' + (t.todoOpen > 1 ? 's' : '') + ' left', t.start, 'life');
  });
  var n = sources.nest && sources.nest.ok ? sources.nest.summary : null;
  if (n) {
    n.tasks.overdue.slice(0, 3).forEach(function (t) { add('warn', 'nest', 'Home: ' + t.name, (t.room ? t.room + ' · ' : '') + 'every ' + t.every + ' month' + (t.every === 1 ? '' : 's'), t.due, 'life'); });
    if (n.tasks.overdue.length > 3) add('warn', 'nest', (n.tasks.overdue.length - 3) + ' more home tasks overdue', '', null, 'life');
    if (n.left !== null && n.left < 0) add('warn', 'nest', 'Home budget over by ' + rmWhole_(n.left), 'Bought and ordered: ' + rmWhole_(n.spent + n.committed) + ' of ' + rmWhole_(n.budget), null, 'life');
  }
}

function lifeUpcoming_(sources, add) {
  var c = sources.career && sources.career.ok ? sources.career.summary : null;
  if (c) {
    c.jobs.steps.forEach(function (s) { add(s.date, (s.interview ? 'Interview: ' : 'Next step: ') + s.title, 'career', s.interview ? 'warn' : ''); });
    c.goals.open.forEach(function (g) { add(g.due, 'Goal: ' + g.title, 'career'); });
    var f = sources.flow && sources.flow.ok ? sources.flow.summary : null, flowExam = f && f.study && f.study.next ? f.study.next.code : '';
    c.acca.booked.forEach(function (b) { if (b.code !== flowExam) add(b.date, b.code + ' exam', 'career', 'warn'); });
  }
  var v = sources.voyage && sources.voyage.ok ? sources.voyage.summary : null;
  if (v) v.trips.forEach(function (t) { add(t.start, 'Trip: ' + t.name + (t.dest && t.dest !== t.name ? ' (' + t.dest + ')' : ''), 'voyage', 'good'); });
  var n = sources.nest && sources.nest.ok ? sources.nest.summary : null;
  if (n) {
    add(n.moveIn, 'Move-in day', 'nest', 'good');
    n.tasks.soon.forEach(function (t) { add(t.due, 'Home: ' + t.name, 'nest'); });
  }
}

function lifeBrief_(sources, push) {
  var c = sources.career && sources.career.ok ? sources.career.summary : null;
  var iv = c ? c.jobs.steps.filter(function (s) { return s.interview && s.daysLeft <= 7; })[0] : null;
  if (iv) push('warn', 'career', 'Interview ' + (iv.daysLeft === 0 ? 'today' : iv.daysLeft === 1 ? 'tomorrow' : 'in ' + iv.daysLeft + ' days') + ': ' + iv.title + (iv.company ? ' at ' + iv.company : ''));
  var v = sources.voyage && sources.voyage.ok ? sources.voyage.summary : null;
  var t = v && v.next;
  if (t && t.now) push('good', 'voyage', 'On your trip: ' + t.name + ' until ' + t.end);
  else if (t && t.daysToGo <= 30) push('info', 'voyage', t.name + ' in ' + t.daysToGo + ' days' + (t.todoOpen ? ' · ' + t.todoOpen + ' to-dos left' : ''));
  var n = sources.nest && sources.nest.ok ? sources.nest.summary : null;
  if (n && n.daysToMoveIn !== null && n.daysToMoveIn >= 0 && n.daysToMoveIn <= 60) {
    push(n.must.total > n.must.done ? 'warn' : 'info', 'nest', 'Move-in in ' + n.daysToMoveIn + ' days' + (n.must.total ? ' · ' + n.must.done + ' of ' + n.must.total + ' must-haves in' : ''));
  }
}
