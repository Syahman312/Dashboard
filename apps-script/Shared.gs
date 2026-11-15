/**
 * Shared foundations used by every reader (Garage, Finance, Flow) and,
 * later, by the next apps. See docs/CONVENTIONS.md for the rules.
 *
 *   Dates    -> 'yyyy-MM-dd' strings (ISO), in Asia/Kuala_Lumpur
 *   Times    -> epoch milliseconds (numbers)
 *   Amounts  -> plain numbers in RM, negative = money out
 *   Booleans -> true / false
 */

var DASH = {
  TZ: 'Asia/Kuala_Lumpur',
  TZ_OFFSET_H: 8, // Malaysia has no daylight saving, so a fixed offset is safe
  CURRENCY: 'RM'
};

/* ---------- Dates ---------- */

function pad_(n, w) {
  var s = String(Math.abs(n));
  while (s.length < (w || 2)) s = '0' + s;
  return s;
}

function fmtDate_(d, pattern) {
  return Utilities.formatDate(d, DASH.TZ, pattern || 'yyyy-MM-dd');
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function validYMD_(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  var dt = new Date(Date.UTC(2000, 0, 1));
  dt.setUTCFullYear(y, m - 1, d);
  if (dt.getUTCDate() !== d || dt.getUTCMonth() !== m - 1) return null;
  return pad_(y, 4) + '-' + pad_(m) + '-' + pad_(d);
}

/**
 * Turns whatever a Sheet gives us into 'yyyy-MM-dd' or null.
 * Accepts Date objects, epoch ms, 'yyyy-MM-dd...', and 'M/D/yyyy...'
 * (the Sheets in this account use US locale, e.g. 11/15/2026).
 */
function toISODate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (isDate_(v)) return isNaN(v.getTime()) ? null : fmtDate_(v);
  if (typeof v === 'number') return v > 1e11 ? fmtDate_(new Date(v)) : null;
  var s = String(v).trim();
  var m = s.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYMD_(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return validYMD_(+m[3], +m[1], +m[2]);
  return null;
}

/** Epoch ms or null. Strings without a zone are read as Malaysia time. */
function toTimestamp_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (isDate_(v)) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return v > 1e11 ? v : null;
  var s = String(v).trim();
  if (/T.*(Z|[+-]\d\d:?\d\d)$/.test(s)) {
    var p = Date.parse(s);
    return isNaN(p) ? null : p;
  }
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/) ||
          null;
  var y, mo, d, h, mi, se;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
  } else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    y = +m[3]; mo = +m[1]; d = +m[2]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0);
  }
  if (!validYMD_(y, mo, d)) return null;
  return Date.UTC(y, mo - 1, d, h - DASH.TZ_OFFSET_H, mi, se);
}

/** True when a timestamp-like cell only carries a date (no clock time). */
function isDateOnly_(v) {
  if (isDate_(v) || typeof v === 'number') return false;
  var s = String(v || '').trim();
  return /^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}$/.test(s);
}

function isoToUTC_(iso) {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

function daysBetween_(fromIso, toIso) {
  return Math.round((isoToUTC_(toIso) - isoToUTC_(fromIso)) / 864e5);
}

function addDays_(iso, n) {
  var d = new Date(isoToUTC_(iso) + n * 864e5);
  return pad_(d.getUTCFullYear(), 4) + '-' + pad_(d.getUTCMonth() + 1) + '-' + pad_(d.getUTCDate());
}

function monthKey_(iso) {
  return iso ? iso.slice(0, 7) : null;
}

function addMonths_(monthKey, n) {
  var y = +monthKey.slice(0, 4), m = +monthKey.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return pad_(y, 4) + '-' + pad_(m + 1);
}

/** Monday of the week containing iso. */
function weekStart_(iso) {
  var dow = new Date(isoToUTC_(iso)).getUTCDay(); // 0 = Sun
  return addDays_(iso, -((dow + 6) % 7));
}

/** A date is plausible if it is after 2000 and not more than 10 years ahead. */
function isPlausibleDate_(iso, ctx) {
  return !!iso && iso >= '2000-01-01' && iso <= addDays_(ctx.today, 3650);
}

/* ---------- Amounts, numbers, booleans, text ---------- */

/** Numbers like 1,234.50 / RM 12 / (12.00) / -5 -> number, else null. */
function toAmount_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
  var s = String(v).trim();
  var neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/RM/gi, '').replace(/[,\s]/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
  var n = parseFloat(s);
  return Math.round((neg ? -n : n) * 100) / 100;
}

function toNumber_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function toBool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  return /^(true|yes|y|1|x|done|✓|✔)$/i.test(String(v).trim());
}

function text_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** '🍽️ Food & Drinks' -> 'Food & Drinks' */
function stripIcon_(s) {
  return text_(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

function sum_(arr, fn) {
  var t = 0;
  for (var i = 0; i < arr.length; i++) t += fn ? (fn(arr[i]) || 0) : (arr[i] || 0);
  return round2_(t);
}

/* ---------- Reading sheets ---------- */

/**
 * Reads a tab as a list of objects keyed by the header row.
 * Every row gets __row (1-based sheet row) for pointing at problems.
 */
function readTable_(ss, name) {
  var sheet = name ? ss.getSheetByName(name) : ss.getSheets()[0];
  if (!sheet) return { exists: false, name: name, headers: [], rows: [] };
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { exists: true, name: sheet.getName(), headers: [], rows: [] };
  var headers = values[0].map(function (h) { return text_(h); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r], blank = true, obj = { __row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = row[c];
      if (v !== '' && v !== null) blank = false;
      obj[headers[c]] = v;
    }
    if (!blank) rows.push(obj);
  }
  return { exists: true, name: sheet.getName(), headers: headers, rows: rows };
}

/** Reports missing tabs / columns. Returns false when the tab is unusable. */
function checkColumns_(table, expected, issues, area) {
  if (!table.exists) {
    issues.add('error', area, 'Tab "' + table.name + '" is missing');
    return false;
  }
  var missing = expected.filter(function (h) { return table.headers.indexOf(h) < 0; });
  if (missing.length) {
    issues.add('error', area, 'Tab "' + table.name + '" is missing column(s): ' + missing.join(', '),
      'Found: ' + table.headers.filter(String).join(', '));
  }
  return missing.length < expected.length;
}

/* ---------- Issues ---------- */

/**
 * Every reader returns problems in the same shape:
 *   { source, level: 'error'|'warn'|'info', area, message, detail }
 */
function makeIssues_(source) {
  var list = [];
  return {
    list: list,
    add: function (level, area, message, detail) {
      list.push({ source: source, level: level, area: area, message: message, detail: detail || '' });
    }
  };
}

/** Lists the first few sheet rows, e.g. "rows 4, 9, 12 (+3 more)". */
function rowList_(rows, max) {
  max = max || 5;
  var nums = rows.slice(0, max).map(function (r) { return r.__row; });
  var more = rows.length > max ? ' (+' + (rows.length - max) + ' more)' : '';
  return (nums.length === 1 ? 'row ' : 'rows ') + nums.join(', ') + more;
}

/**
 * Turns an app's own log tab into grouped issues for the last `days` days.
 * cols: { time, msg, area, level?, source? }
 */
function summariseLog_(table, cols, ctx, issues, days) {
  var out = { total: 0, recent: 0, lastProblemAt: null, dateOnlyRows: 0 };
  if (!table.exists) return out;
  var since = ctx.now - (days || 7) * 864e5;
  var groups = {};
  table.rows.forEach(function (r) {
    out.total++;
    if (isDateOnly_(r[cols.time])) out.dateOnlyRows++;
    var ts = toTimestamp_(r[cols.time]);
    if (ts === null || ts < since) return;
    var level = cols.level ? text_(r[cols.level]).toLowerCase() : guessLogLevel_(r[cols.msg]);
    if (level !== 'error' && level !== 'warn' && level !== 'warning') return;
    out.recent++;
    var area = text_(r[cols.area]) || 'log';
    var msg = text_(r[cols.msg]);
    var key = area + '|' + msg;
    var g = groups[key] || (groups[key] = { area: area, msg: msg, level: level, count: 0, last: 0, sources: {} });
    g.count++;
    if (ts > g.last) g.last = ts;
    if (cols.source && r[cols.source]) g.sources[text_(r[cols.source])] = 1;
    if (!out.lastProblemAt || ts > out.lastProblemAt) out.lastProblemAt = ts;
  });
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    var lvl = g.level === 'error' || /sync/i.test(g.area) ? 'error' : 'warn';
    var who = Object.keys(g.sources);
    issues.add(lvl, g.area,
      g.msg + ' — ' + g.count + '× in the last ' + (days || 7) + ' days',
      'Last at ' + fmtDate_(new Date(g.last), 'd MMM HH:mm') + (who.length ? ' · from ' + who.join(', ') : ''));
  });
  return out;
}

function guessLogLevel_(msg) {
  return /fail|error|could not|no connection|timeout|unable/i.test(text_(msg)) ? 'error' : 'info';
}
