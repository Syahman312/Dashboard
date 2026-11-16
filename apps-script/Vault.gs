/**
 * Vault (Vault Data sheet): personal documents and when they expire.
 *
 * Privacy: only Title, Category, Owner, dates, Status and lead times are read.
 * Document numbers, notes, files, links and the Extra column are never read or
 * sent to the page. Rows marked Encrypted show their category instead of a title.
 */

var VAULT_COLUMNS = {
  'Documents': ['ID', 'Updated', 'Title', 'Category', 'Owner', 'ExpiryDate', 'RenewalLeadDays', 'Status'],
  'Categories': ['Name', 'Icon', 'LeadDays']
};

function readVault_(ss, ctx) {
  var issues = makeIssues_('vault');
  var docsT = readTable_(ss, 'Documents');
  var catT = readTable_(ss, 'Categories');
  checkColumns_(docsT, VAULT_COLUMNS.Documents, issues, 'structure');
  checkColumns_(catT, VAULT_COLUMNS.Categories, issues, 'structure');

  var cats = {};
  if (catT.exists) catT.rows.forEach(function (r) {
    var name = text_(r.Name);
    if (name) cats[name] = { icon: text_(r.Icon), lead: toNumber_(r.LeadDays) };
  });

  var docs = [], badDate = [], lastChange = null;
  if (docsT.exists) docsT.rows.forEach(function (r) {
    var status = text_(r.Status).toLowerCase();
    var upd = toTimestamp_(r.Updated);
    if (upd !== null && upd <= ctx.now + 864e5 && (lastChange === null || upd > lastChange)) lastChange = upd;
    if (/archiv|deleted|replaced|renewed|cancel/.test(status)) return;
    var rawExpiry = r.ExpiryDate;
    var expiry = toISODate_(rawExpiry);
    if (text_(rawExpiry) && !expiry) badDate.push(r);
    var cat = text_(r.Category);
    var encrypted = toBool_(r.Encrypted);
    var lead = toNumber_(r.RenewalLeadDays);
    if (lead === null) lead = cats[cat] && cats[cat].lead !== null ? cats[cat].lead : 30;
    docs.push({
      title: encrypted ? (cat || 'Document') + ' (encrypted)' : (text_(r.Title) || '(untitled)'),
      category: cat, icon: cats[cat] ? cats[cat].icon : '',
      owner: text_(r.Owner), expiry: expiry, lead: lead, pinned: toBool_(r.Pinned),
      daysLeft: expiry ? daysBetween_(ctx.today, expiry) : null,
      __row: r.__row, __gid: r.__gid
    });
  });

  if (badDate.length) issues.rows('warn', 'dates', badDate.length + ' document(s) have an expiry date that cannot be read', badDate);

  var dated = docs.filter(function (d) { return d.expiry; }).sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; });
  dated.forEach(function (d) {
    var who = d.owner && d.owner !== 'Me' ? ' (' + d.owner + ')' : '';
    if (d.daysLeft < 0) issues.add('error', 'expiry', d.title + who + ' expired ' + (-d.daysLeft) + ' days ago (' + d.expiry + ')', '', d);
    else if (d.daysLeft <= d.lead) issues.add(d.daysLeft <= 14 ? 'warn' : 'info', 'expiry', d.title + who + ' expires in ' + d.daysLeft + ' days (' + d.expiry + ')', 'Renewal window for ' + (d.category || 'this category') + ' is ' + d.lead + ' days', d);
  });

  var byCat = {};
  docs.forEach(function (d) { var k = d.category || 'Other'; (byCat[k] = byCat[k] || { category: k, icon: d.icon, count: 0 }).count++; });

  var clean = function (d) { return { title: d.title, category: d.category, icon: d.icon, owner: d.owner, expiry: d.expiry, daysLeft: d.daysLeft, lead: d.lead }; };
  return {
    summary: {
      total: docs.length,
      expiring30: dated.filter(function (d) { return d.daysLeft >= 0 && d.daysLeft <= 30; }).map(clean),
      expired: dated.filter(function (d) { return d.daysLeft < 0; }).map(clean),
      upcoming: dated.filter(function (d) { return d.daysLeft >= 0; }).slice(0, 12).map(clean),
      byCategory: Object.keys(byCat).map(function (k) { return byCat[k]; }).sort(function (a, b) { return b.count - a.count; }),
      lastChange: lastChange
    },
    issues: issues.list
  };
}
