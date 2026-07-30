// CMU EMS Operations — form intake.
// One spreadsheet, one tab per form, plus a Restock worklist the script keeps up
// to date. No email is sent from here on purpose: the mail scope makes Google
// throw a warning at whoever deploys, and the Restock tab is where the work
// actually happens.
//
// Only // comments are used: a paste that starts one line late costs you a
// comment, not a SyntaxError on line 1.

var BRAND = '#8c1c2b';

// name -> columns, widths, and how many left columns stay frozen.
var SHEETS = {
  'Room Checks': {
    name: 'Room Checks', freeze: 3,
    keys:    ['date','time','name','andrew','subject','result','missingCount','missing','restock','maint','sid'],
    headers: ['Date','Time','Name','Andrew ID','Room','Result','Missing','What Was Missing','Restock Needed','Maintenance','Submission ID'],
    widths:  [95, 70, 150, 100, 150, 150, 80, 320, 260, 260, 120]
  },
  'Checkouts': {
    name: 'Checkouts', freeze: 3,
    keys:    ['date','time','name','andrew','radio','subject','result','missingCount','expired','expiringSoon','detail','sid'],
    headers: ['Date','Time','Name','Andrew ID','Radio','Bag','Result','Missing','Expired','Expiring Soon','Damaged','Submission ID'],
    widths:  [95, 70, 150, 100, 90, 160, 150, 80, 220, 220, 260, 120]
  },
  'Bag Checks': {
    name: 'Bag Checks', freeze: 3,
    keys:    ['date','time','name','andrew','subject','result','missingCount','expired','expiringSoon','seal','sid'],
    headers: ['Date','Time','Name','Andrew ID','Bag','Result','Missing','Expired','Expiring Soon','Seal','Submission ID'],
    widths:  [95, 70, 150, 100, 150, 150, 80, 220, 220, 100, 120]
  },
  'Post-Call': {
    name: 'Post-Call', freeze: 3,
    keys:    ['date','time','name','callnum','result','usageCount','usageText','short','usageJson','sid'],
    headers: ['Date','Time','Name','Call Number','Result','Units Used','What Was Used','Could Not Replace','Used (data)','Submission ID'],
    widths:  [95, 70, 150, 110, 150, 90, 380, 260, 200, 120]
  },
  'Reports': {
    name: 'Reports', freeze: 3,
    keys:    ['date','time','name','area','urgency','what','where','sid'],
    headers: ['Date','Time','Name','Area','Urgency','What Is Wrong','Where','Submission ID'],
    widths:  [95, 70, 150, 120, 110, 380, 180, 120]
  }
};

// One row per item per submission. This is what replaces a cell with 24 items
// pipe-joined into it: filter by Bag, or by Present = FALSE, and you have the
// worklist for that bag.
var ITEMS = {
  name: 'Items',
  headers: ['Date','Time','Form','Bag','Item','Present','Who','Submission ID'],
  widths:  [95, 70, 110, 160, 320, 80, 150, 120]
};

var RESTOCK = {
  name: 'Restock',
  headers: ['Got','Item','Category','Qty','Times Asked','First Reported','Last Reported','Where','Who'],
  widths:  [55, 280, 110, 70, 100, 120, 120, 160, 150]
};

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// Creates the tab if missing. If the header row does not match what this version
// writes, it is rewritten and the formatting reapplied — otherwise adding a
// column silently shifts every later value one place left.
function ensureSheet(conf) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(conf.name);
  if (!sh) {
    sh = ss.insertSheet(conf.name);
    sh.appendRow(conf.headers);
    formatSheet(sh, conf);
    return sh;
  }
  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (have.join('|') !== conf.headers.join('|')) {
    sh.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
    formatSheet(sh, conf);
  }
  return sh;
}

function formatSheet(sh, conf) {
  var n = conf.headers.length;
  sh.getRange(1, 1, 1, n)
    .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(conf.freeze || 0);
  conf.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setRowHeight(1, 34);
  // Long free text is clipped, not wrapped: one submission stays one line, and
  // the whole value is still there when you click the cell.
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), n)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('top');
  sh.hideColumns(n);                     // Submission ID is machinery, not information
  if (!sh.getFilter()) sh.getRange(1, 1, sh.getMaxRows(), n).createFilter();
}

// Colour is backed by the Result text rather than being the only signal.
function styleRow(sh, rowIdx, conf, bad, soon) {
  var n = conf.headers.length;
  sh.getRange(rowIdx, 1, 1, n)
    .setBackground(bad ? '#fce8e6' : (soon ? '#fef7e0' : '#e6f4ea'))
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setVerticalAlignment('top');
}

function alreadySeen(sh, conf, sid) {
  if (!sid) return false;
  var col = conf.headers.length;
  var last = sh.getLastRow();
  if (last < 2) return false;
  var start = Math.max(2, last - 100);
  var ids = sh.getRange(start, col, last - start + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(sid)) return true;
  return false;
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.form === '__content') return saveContent(p);
    var conf = SHEETS[p.form] || SHEETS['Reports'];
    var sh = ensureSheet(conf);
    if (alreadySeen(sh, conf, p.sid)) return json({ result: 'duplicate ignored' });

    var now = new Date();
    var tz = Session.getScriptTimeZone();
    p.time = Utilities.formatDate(now, tz, 'HH:mm');
    if (!p.date) p.date = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

    var missingCount = Number(p.missingCount) || 0;
    if (!p.result) {
      if (p.expired) p.result = 'Expired stock';
      else if (conf.name === 'Post-Call') p.result = p.short ? 'Could not replace' : 'Complete';
      else p.result = missingCount > 0 ? (missingCount + ' missing') : 'Complete';
    }

    sh.appendRow(conf.keys.map(function (k) {
      var v = p[k];
      return (v === undefined || v === null) ? '' : v;
    }));

    var row = sh.getLastRow();
    var bad = missingCount > 0 || p.condition === 'Broken' || p.urgency === 'Blocking' ||
              !!p.short;
    var soon = !bad && (p.condition === 'Missing' || !!p.maint || !!p.restock);
    styleRow(sh, row, conf, bad, soon);

    writeItems(p);
    addToRestock(p);
    return json({ result: 'saved' });
  } catch (err) {
    // Never throw: the site cannot read the response anyway, and throwing just
    // loses the submission. Log it where you can find it.
    try {
      var es = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Errors') ||
               SpreadsheetApp.getActiveSpreadsheet().insertSheet('Errors');
      es.appendRow([new Date(), String(err),
        e && e.postData ? e.postData.contents : '(no body)']);
    } catch (ignored) {}
    return json({ result: 'error logged' });
  }
}

// The restock worklist. One row per ITEM. Reporting the same item again bumps
// its counter, quantity and last-reported date rather than adding a duplicate,
// so the length of this list is the length of the actual job. Ticking Got greys
// the row out; if it is reported again afterwards the row reopens.
function ensureItems() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ITEMS.name);
  if (sh) return sh;
  sh = ss.insertSheet(ITEMS.name);
  sh.appendRow(ITEMS.headers);
  sh.getRange(1, 1, 1, ITEMS.headers.length)
    .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);
  ITEMS.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(1, 1, sh.getMaxRows(), ITEMS.headers.length).createFilter();
  return sh;
}

// Every ticked and unticked item, one row each, so nothing is buried in a cell.
function writeItems(p) {
  var present = p.done ? String(p.done).split(' | ') : [];
  var absent  = p.missing ? String(p.missing).split(' | ') : [];
  if (!present.length && !absent.length) return;
  var sh = ensureItems();
  var rows = [];
  var push = function (item, ok) {
    if (!item) return;
    rows.push([p.date, p.time, p.form, p.subject || '', item, ok, p.name || '', p.sid || '']);
  };
  present.forEach(function (i) { push(i, true); });
  absent.forEach(function (i) { push(i, false); });
  if (!rows.length) return;
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, ITEMS.headers.length).setValues(rows);
  // Red only where something is actually missing.
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][5] === false) {
      sh.getRange(start + i, 1, 1, ITEMS.headers.length).setBackground('#fce8e6');
    }
  }
  sh.getRange(start, 6, rows.length, 1).setHorizontalAlignment('center');
}

function ensureRestock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RESTOCK.name);
  if (sh) return sh;
  sh = ss.insertSheet(RESTOCK.name);
  sh.appendRow(RESTOCK.headers);
  sh.getRange(1, 1, 1, RESTOCK.headers.length)
    .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);
  RESTOCK.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(1, 1, sh.getMaxRows(), RESTOCK.headers.length).createFilter();
  return sh;
}

// Pulls every "we need this" out of one submission: items used on a call, items
// found missing on a bag check, and free-text restock requests from a room check.
function wantsFrom(p) {
  var out = [];
  if (p.usageJson) {
    var list;
    try { list = JSON.parse(p.usageJson); } catch (err) { list = []; }
    var names = nameMap().items;
    list.forEach(function (u) {
      out.push({ item: names[u.i] || u.i, qty: Number(u.q) || 1, cat: 'Equipment' });
    });
  }
  if ((p.form === 'Bag Checks' || p.form === 'Checkouts') && p.missing) {
    String(p.missing).split(' | ').forEach(function (m) {
      if (m) out.push({ item: m, qty: 1, cat: 'Equipment' });
    });
  }
  if (p.expired) String(p.expired).split(' | ').forEach(function (m) {
    if (m) out.push({ item: m + ' (expired)', qty: 1, cat: 'Equipment' });
  });
  if (p.restock) out.push({ item: String(p.restock), qty: 1, cat: 'Office' });
  if (p.short)   out.push({ item: String(p.short),   qty: 1, cat: 'Equipment' });
  return out;
}

function addToRestock(p) {
  var wants = wantsFrom(p);
  if (!wants.length) return;
  var sh = ensureRestock();
  var tz = Session.getScriptTimeZone();
  var when = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var who = p.name || p.callsign || '';
  var where = p.subject || '';

  var n = RESTOCK.headers.length;
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var index = {};
  for (var i = 0; i < existing.length; i++) index[String(existing[i][1])] = i + 2;

  var fresh = [];
  wants.forEach(function (w) {
    var atRow = index[String(w.item)];
    if (atRow) {
      var wasDone = sh.getRange(atRow, 1).getValue() === true;
      var qty = Number(sh.getRange(atRow, 4).getValue()) || 0;
      var times = Number(sh.getRange(atRow, 5).getValue()) || 0;
      sh.getRange(atRow, 1).setValue(false);
      sh.getRange(atRow, 4).setValue(wasDone ? w.qty : qty + w.qty);
      sh.getRange(atRow, 5).setValue(wasDone ? 1 : times + 1);
      if (wasDone) sh.getRange(atRow, 6).setValue(when);
      sh.getRange(atRow, 7).setValue(when);
      sh.getRange(atRow, 8).setValue(where);
      sh.getRange(atRow, 9).setValue(who);
    } else {
      fresh.push([false, w.item, w.cat, w.qty, 1, when, when, where, who]);
      index[String(w.item)] = -1;      // do not add the same item twice in one payload
    }
  });

  if (fresh.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, fresh.length, n).setValues(fresh);
    sh.getRange(start, 1, fresh.length, 1).insertCheckboxes();
  }
  paintRestock(sh);
}

function paintRestock(sh) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var n = RESTOCK.headers.length;
  var vals = sh.getRange(2, 1, last - 1, n).getValues();
  for (var i = 0; i < vals.length; i++) {
    var r = i + 2;
    var done = vals[i][0] === true;
    sh.getRange(r, 1, 1, n)
      .setBackground(done ? '#f1f3f4' : '#ffffff')
      .setFontColor(done ? '#9aa0a6' : '#202124')
      .setFontLine(done ? 'line-through' : 'none');
    sh.getRange(r, 5).setHorizontalAlignment('center')
      .setFontWeight(!done && Number(vals[i][4]) > 1 ? 'bold' : 'normal');
  }
}

// Display names live in the site, so the sheet stays the record and the site
// stays the vocabulary. The site pushes these with Settings ▸ Send item names.
// ---- shared content ---------------------------------------------------------
// Anyone may READ the content: it is the text of a public website. Writing needs
// a Google ID token, and the token is verified WITH GOOGLE here rather than
// trusted from the browser — a forged one is refused. This is the one real
// permission boundary in the whole system.
var MANAGER_EMAILS = ['bikecmuems@gmail.com'];

function verifiedEmail(idToken, clientId) {
  if (!idToken) return '';
  try {
    var r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return '';
    var c = JSON.parse(r.getContentText());
    if (clientId && c.aud !== clientId) return '';        // token for another app
    if (String(c.email_verified) !== 'true') return '';
    return String(c.email || '').toLowerCase();
  } catch (err) { return ''; }
}

function saveContent(p) {
  var props = PropertiesService.getScriptProperties();
  var who = verifiedEmail(p.idToken, props.getProperty('CLIENT_ID'));
  var allowed = MANAGER_EMAILS.map(function (e) { return e.toLowerCase(); });
  // Anyone the site has been told is a manager may publish; the officer address
  // and the People list travel inside the content itself.
  var stored = props.getProperty('CONTENT');
  if (stored) {
    try {
      var c = JSON.parse(stored).access || {};
      if (c.officer) allowed.push(String(c.officer).toLowerCase());
      (c.people || []).forEach(function (x) { allowed.push(String(x.email).toLowerCase()); });
    } catch (err) {}
  }
  if (!who || allowed.indexOf(who) < 0) return json({ ok: false, error: 'not allowed' });
  props.setProperty('CONTENT', JSON.stringify({ at: Date.now(), by: who, content: p.content }));
  return json({ ok: true, saved: true });
}

// ---- reports ----------------------------------------------------------------
// Sums the machine-readable usage column, never the prose one: the sheet this
// replaces recorded one item as "glucose stuff", "glucose strip" and
// "glucometer strips", which is why no buy-list could be produced from it.
function periodStartMs(period) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') { d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); }
  else if (period === 'month') { d.setDate(1); }
  else {
    var y = d.getFullYear(), aug = new Date(y, 7, 1);
    d = (d >= aug) ? aug : new Date(y - 1, 7, 1);
  }
  return d.getTime();
}

function rowsSince(name, since) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return { cols: [], rows: [] };
  var cols = SHEETS[name].keys;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
  var iDate = cols.indexOf('date');
  return {
    cols: cols,
    rows: vals.filter(function (r) {
      var t = new Date(r[iDate]).getTime();
      return isNaN(t) ? true : t >= since;
    })
  };
}

function collectReport(period) {
  var since = periodStartMs(period);
  var used = {}, calls = {}, concerns = [];

  var pc = rowsSince('Post-Call', since);
  if (pc.rows.length) {
    var iJson = pc.cols.indexOf('usageJson'), iCall = pc.cols.indexOf('callnum');
    pc.rows.forEach(function (r) {
      if (r[iCall]) calls[r[iCall]] = 1;
      if (!r[iJson]) return;
      var list;
      try { list = JSON.parse(r[iJson]); } catch (err) { return; }
      list.forEach(function (u) {
        var e = used[u.i] || (used[u.i] = { qty: 0, from: {} });
        e.qty += Number(u.q) || 0;
        e.from[u.f] = (e.from[u.f] || 0) + (Number(u.q) || 0);
      });
    });
  }

  // Concerns come from wherever somebody can raise one.
  [['Reports', 'what', 'where', 'urgency'],
   ['Room Checks', 'maint', 'subject', null],
   ['Bag Checks', 'expired', 'subject', null],
   ['Checkouts', 'detail', 'subject', null],
   ['Checkouts', 'expired', 'subject', null]].forEach(function (spec) {
    var d = rowsSince(spec[0], since);
    if (!d.rows.length) return;
    var iw = d.cols.indexOf(spec[1]), il = d.cols.indexOf(spec[2]),
        iu = spec[3] ? d.cols.indexOf(spec[3]) : -1;
    if (iw < 0) return;
    d.rows.forEach(function (r) {
      if (!r[iw]) return;
      concerns.push({ what: String(r[iw]), where: r[il] || '',
                      urgency: iu >= 0 ? (r[iu] || 'Whenever') : 'Soon',
                      source: spec[0] });
    });
  });

  return { period: period, since: since, used: used,
           concerns: concerns, calls: Object.keys(calls).length };
}

function nameMap() {
  var raw = PropertiesService.getScriptProperties().getProperty('NAMES');
  if (!raw) return { items: {}, units: {} };
  try { return JSON.parse(raw); } catch (err) { return { items: {}, units: {} }; }
}

// GET is readable by the browser, so this is what Test connection calls.
// A POST response is opaque and can never confirm anything.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.content) {
    var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
    if (!raw) return json({ ok: true, content: null });
    var o;
    try { o = JSON.parse(raw); } catch (err) { return json({ ok: true, content: null }); }
    return json({ ok: true, content: o.content, at: o.at });
  }
  if (p.report) {
    return json({ ok: true, report: collectReport(p.report) });
  }
  if (p.names) {
    PropertiesService.getScriptProperties().setProperty('NAMES', p.names);
    return json({ ok: true, stored: true });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true, sheet: ss.getName(), tabs: {} };
  Object.keys(SHEETS).forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    out.tabs[nm] = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  });
  var rs = ss.getSheetByName(RESTOCK.name);
  out.restock = rs ? Math.max(0, rs.getLastRow() - 1) : 0;
  return json(out);
}

// Run by hand (Run ▸ tidyUp) after pasting an updated script: reformats every
// tab that already exists and repaints the restock list.
function tidyUp() {
  var it = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ITEMS.name);
  if (it) {
    it.getRange(1, 1, 1, ITEMS.headers.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff');
    ITEMS.widths.forEach(function (w, i) { it.setColumnWidth(i + 1, w); });
  }
  Object.keys(SHEETS).forEach(function (nm) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nm);
    if (sh) formatSheet(sh, SHEETS[nm]);
  });
  var rs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESTOCK.name);
  if (rs) paintRestock(rs);
}
