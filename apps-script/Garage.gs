/**
 * Garage (Car Tracker sheet). One tab, one row per record.
 * Column "json (do not edit)" holds the full record the app wrote; the other
 * columns are a readable copy. We trust the JSON and cross-check the copy.
 *
 * kinds: car | svc (service item list) | log (service visit) | fuel
 */

var GARAGE_COLUMNS = ['id', 'json (do not edit)', 'type', 'date', 'odometer', 'item', 'cost', 'notes', 'deleted'];

function readGarage_(ss, ctx) {
  var issues = makeIssues_('garage');
  var table = readTable_(ss, null);
  if (!checkColumns_(table, GARAGE_COLUMNS, issues, 'structure')) {
    return { summary: { cars: [] }, issues: issues.list };
  }

  var badJson = [], badDates = [], fixedDates = [], noDate = [], noCost = [], noOdo = [];
  var unknownCar = [], deleted = 0;
  var cars = {}, svcNames = {}, logs = [], fuels = [];

  table.rows.forEach(function (row) {
    var rec = null;
    var raw = text_(row['json (do not edit)']);
    if (raw) {
      try { rec = JSON.parse(raw); } catch (e) { badJson.push(row); }
    }
    rec = rec || {};
    var kind = text_(rec.kind || row.type);
    if (rec.deleted === 1 || rec.deleted === true || toBool_(row.deleted)) { deleted++; return; }

    if (kind === 'svc') { svcNames[text_(rec.name || row.item)] = true; return; }
    if (kind === 'car') {
      cars[text_(rec.id || row.id)] = {
        id: text_(rec.id || row.id),
        name: text_(rec.name || row.item),
        plate: text_(rec.plate),
        year: text_(rec.year),
        odo: toNumber_(rec.odo !== undefined ? rec.odo : row.odometer),
        roadTax: toISODate_(rec.rtax),
        insurance: toISODate_(rec.ins || rec.insurance),
        tank: toNumber_(rec.tank),
        __row: row.__row
      };
      return;
    }
    if (kind !== 'log' && kind !== 'fuel') return;

    // Date: prefer the JSON, but catch typos like "0021-03-02".
    var jsonDate = toISODate_(rec.date), colDate = toISODate_(row.date), date = jsonDate;
    if (!isPlausibleDate_(jsonDate, ctx)) {
      if (isPlausibleDate_(colDate, ctx)) {
        if (jsonDate) fixedDates.push({ row: row, from: text_(rec.date), to: colDate });
        date = colDate;
      } else {
        (jsonDate || colDate ? badDates : noDate).push(row);
        date = null;
      }
    }
    var entry = {
      kind: kind,
      carId: text_(rec.carId),
      date: date,
      odo: toNumber_(rec.odo !== undefined && rec.odo !== '' ? rec.odo : row.odometer),
      cost: toAmount_(rec.cost !== undefined ? rec.cost : row.cost),
      litres: toNumber_(rec.litres),
      place: text_(rec.place),
      items: kind === 'log' ? text_(rec.item || row.item).split(/\s*,\s*/).filter(String) : [],
      __row: row.__row
    };
    if (entry.cost === null) noCost.push(row);
    if (entry.odo === null) noOdo.push(row);
    (kind === 'log' ? logs : fuels).push(entry);
  });

  /* --- data quality --- */
  if (badJson.length) issues.add('error', 'records', badJson.length + ' row(s) have unreadable JSON', rowList_(badJson));
  fixedDates.forEach(function (f) {
    issues.add('warn', 'dates', 'Date saved as "' + f.from + '" (typo year) — using ' + f.to + ' from the date column',
      'row ' + f.row.__row + '. Re-save this entry in Garage to fix the stored date.');
  });
  if (badDates.length) issues.add('error', 'dates', badDates.length + ' entr(ies) have an impossible date', rowList_(badDates));
  if (noDate.length) issues.add('error', 'dates', noDate.length + ' entr(ies) have no date', rowList_(noDate));
  if (noCost.length) issues.add('warn', 'fields', noCost.length + ' entr(ies) have no cost', rowList_(noCost));
  if (noOdo.length) issues.add('warn', 'fields', noOdo.length + ' entr(ies) have no odometer reading', rowList_(noOdo));

  var allEntries = logs.concat(fuels);
  allEntries.forEach(function (e) { if (e.carId && !cars[e.carId]) unknownCar.push(e); });
  if (unknownCar.length) issues.add('warn', 'links', unknownCar.length + ' entr(ies) point to a car that no longer exists', rowList_(unknownCar));

  var unknownItems = {};
  logs.forEach(function (l) {
    l.items.forEach(function (it) { if (!svcNames[it]) unknownItems[it] = (unknownItems[it] || 0) + 1; });
  });
  Object.keys(unknownItems).forEach(function (it) {
    issues.add('info', 'categories', 'Service item "' + it + '" is used in ' + unknownItems[it] + ' log(s) but is not in the service list');
  });
  if (deleted) issues.add('info', 'housekeeping', deleted + ' deleted row(s) are still stored in the sheet');

  /* --- per car summary --- */
  var carList = Object.keys(cars).map(function (id) {
    return summariseCar_(cars[id], logs, fuels, svcNames, ctx, issues, Object.keys(cars).length === 1);
  });
  if (!carList.length) issues.add('warn', 'records', 'No car found in the sheet');

  return {
    summary: {
      cars: carList,
      counts: { logs: logs.length, fuel: fuels.length, deleted: deleted }
    },
    issues: issues.list
  };
}

function summariseCar_(car, logs, fuels, svcNames, ctx, issues, onlyCar) {
  var mine = function (e) { return e.carId === car.id || (!e.carId && onlyCar); };
  var myLogs = logs.filter(mine).filter(function (e) { return e.date; });
  var myFuel = fuels.filter(mine).filter(function (e) { return e.date; });
  var byDate = function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.odo || 0) - (b.odo || 0); };
  myLogs.sort(byDate);
  myFuel.sort(byDate);

  // Odometer must never go backwards.
  var timeline = myLogs.concat(myFuel).filter(function (e) { return e.odo !== null; }).sort(byDate);
  var backwards = [];
  for (var i = 1; i < timeline.length; i++) {
    if (timeline[i].odo < timeline[i - 1].odo) backwards.push(timeline[i]);
  }
  if (backwards.length) {
    issues.add('warn', 'odometer', car.name + ': odometer goes backwards ' + backwards.length + ' time(s)',
      backwards.slice(0, 3).map(function (e) { return e.date + ' (' + e.odo + ' km, row ' + e.__row + ')'; }).join(', '));
  }
  var maxOdo = timeline.reduce(function (m, e) { return Math.max(m, e.odo); }, 0);
  var odo = Math.max(car.odo || 0, maxOdo) || null;
  if (car.odo && maxOdo > car.odo) {
    issues.add('warn', 'odometer', car.name + ': car odometer (' + car.odo + ') is lower than a logged reading (' + maxOdo + ')');
  }

  // Renewals
  var renewals = [];
  [['Road tax', car.roadTax], ['Insurance', car.insurance]].forEach(function (r) {
    if (!r[1]) return;
    var left = daysBetween_(ctx.today, r[1]);
    renewals.push({ label: r[0], date: r[1], daysLeft: left });
    if (left < 0) issues.add('error', 'renewals', car.name + ': ' + r[0] + ' expired ' + (-left) + ' days ago');
    else if (left <= 30) issues.add('warn', 'renewals', car.name + ': ' + r[0] + ' expires in ' + left + ' days (' + r[1] + ')');
  });
  if (!car.roadTax) issues.add('info', 'fields', car.name + ': no road tax expiry date saved');

  // Last time each service item was done
  var lastByItem = {};
  myLogs.forEach(function (l) {
    l.items.forEach(function (it) { lastByItem[it] = l; });
  });
  var services = Object.keys(lastByItem).map(function (it) {
    var l = lastByItem[it];
    return {
      item: it,
      date: l.date,
      daysAgo: daysBetween_(l.date, ctx.today),
      kmSince: odo && l.odo ? odo - l.odo : null
    };
  }).filter(function (s) { return !/labou?r|others/i.test(s.item); })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  var lastLog = myLogs[myLogs.length - 1] || null;

  // Fuel
  var month = monthKey_(ctx.today);
  var last30 = addDays_(ctx.today, -30);
  var recentFills = myFuel.filter(function (f) { return f.odo !== null && f.litres; }).slice(-11);
  var economy = null;
  if (recentFills.length >= 3) {
    var km = recentFills[recentFills.length - 1].odo - recentFills[0].odo;
    var litres = sum_(recentFills.slice(1), function (f) { return f.litres; });
    var cost = sum_(recentFills.slice(1), function (f) { return f.cost; });
    if (km > 0 && litres > 0) economy = { kmPerL: round2_(km / litres), rmPerKm: round2_(cost / km), fills: recentFills.length - 1 };
  }
  var lastFill = myFuel[myFuel.length - 1] || null;
  if (lastFill) {
    var since = daysBetween_(lastFill.date, ctx.today);
    if (since > 30) issues.add('info', 'freshness', car.name + ': no fuel logged for ' + since + ' days (last ' + lastFill.date + ')');
  }

  var spendMonth = sum_(myFuel.concat(myLogs).filter(function (e) { return monthKey_(e.date) === month; }), function (e) { return e.cost; });

  return {
    id: car.id,
    name: car.name,
    plate: car.plate,
    year: car.year,
    odo: odo,
    renewals: renewals,
    lastService: lastLog ? {
      date: lastLog.date, items: lastLog.items, cost: lastLog.cost,
      daysAgo: daysBetween_(lastLog.date, ctx.today),
      kmSince: odo && lastLog.odo ? odo - lastLog.odo : null
    } : null,
    services: services.slice(0, 6),
    fuel: {
      monthCost: sum_(myFuel.filter(function (f) { return monthKey_(f.date) === month; }), function (f) { return f.cost; }),
      last30Cost: sum_(myFuel.filter(function (f) { return f.date >= last30; }), function (f) { return f.cost; }),
      lastFill: lastFill ? { date: lastFill.date, cost: lastFill.cost, litres: lastFill.litres, place: lastFill.place } : null,
      economy: economy
    },
    spendMonth: spendMonth
  };
}
