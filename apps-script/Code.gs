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

// ---- the bike site's tabs ---------------------------------------------------
// The Bike Ops site used to write to a spreadsheet of its own, which meant no
// formula could put a bike check beside a room check and the two sites had to be
// opened separately to answer one question. Its forms are tabs in THIS file now.
//
// Keyed by the id the bike site sends ('jumpkit'/'safety'), not by tab name — the
// ops forms send their tab name as `form` and these send a short id, so the two
// naming schemes cannot collide in SHEETS.
//
// These rows are built positionally by bikeRow(), not through `keys`, because the
// bike site posts a different payload shape (firstName/lastName rather than name,
// arrays rather than pipe-joined strings). Both builders check their own width
// against the header row before writing.
var BIKE_SHEETS = {
  jumpkit: {
    name: 'Bike Jumpkit Checks', freeze: 3,
    // Tabs this has been called before, in the standalone file. ensureSheet
    // renames rather than opening an empty tab beside the old one.
    was: ['Jumpkit Checks'],
    headers: ['Date','Time','Name','Andrew ID','Bag','Radio','Result','Missing',
              'What Was Missing','Expiry Flag','Expiration Dates','Notes','Submission ID'],
    widths:  [95, 70, 150, 100, 96, 90, 210, 74, 320, 190, 220, 260, 120]
  },
  safety: {
    name: 'Bike Safety Checks', freeze: 3,
    was: ['Bicycle Checks','Bike Checks','Safety Checks'],
    headers: ['Date','Time','Name','Andrew ID','Bike','Result','Missing',
              'What Was Missing','Weather Grounded','Conditions Flagged','Notes','Submission ID'],
    widths:  [95, 70, 150, 100, 96, 210, 74, 320, 130, 240, 260, 120]
  }
};

// Kept apart from 'Restock'. What a bike check asks for is a tire lever, and what
// a bag check asks for is a bag valve mask; one list of both is a list neither
// person can shop from. Same machinery, different tab.
var BIKE_RESTOCK = {
  name: 'Bike Restock',
  headers: ['Got','Item','Times Asked','First Reported','Last Reported','Where','Who'],
  widths:  [55, 320, 100, 120, 120, 120, 150]
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
  // A tab this form used to write to, under an older name. Rename it rather than
  // starting a fresh empty one beside it, which would strand every row already in
  // there where nobody would think to look.
  if (!sh && conf.was) {
    for (var w = 0; w < conf.was.length; w++) {
      var old = ss.getSheetByName(conf.was[w]);
      if (old) { old.setName(conf.name); sh = old; break; }
    }
  }
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
    // Two sites post here, and they spell a content save differently: the ops
    // site sends form:'__content', the bike site sends type:'content'. Both are
    // accepted rather than making one of them change, because a deployment that
    // silently ignores the other site's publishes is exactly the failure that is
    // hardest to notice — it looks like the edit saved.
    if (p.form === '__content' || p.type === 'content') return saveContent(p);
    if (p.form === '__restock') return setRestockGot(p);

    // The bike site's forms, which post a different payload shape.
    if (BIKE_SHEETS[p.form]) return writeBikeRow(p);

    // Every form on either site names a tab that exists above, so an unknown one
    // is a mistake and not something to guess at. It used to fall back to
    // 'Reports', which quietly turned a payload this script did not understand
    // into a row of mostly empty cells in a real tab — the submission looked
    // filed and the data was gone. The window this actually matters in is the one
    // between the bike site being pointed here and this script being redeployed:
    // a bike check arriving at an older copy is exactly this case.
    var conf = SHEETS[p.form];
    if (!conf) {
      logError('unknown form "' + p.form + '" — nothing written. If this is a bike ' +
               'check, this deployment predates the merge: paste the current ' +
               'Code.gs and redeploy.', e && e.postData ? e.postData.contents : '');
      return json({ result: 'unknown form: ' + p.form });
    }
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

// ---- the bike site's intake -------------------------------------------------
// Its payload is shaped differently from the ops forms: a first and last name
// rather than one `name`, arrays where the ops site sends pipe-joined strings,
// and `submissionId` rather than `sid`. Rather than bend either site to the
// other, the difference is absorbed here, in the one place that already knows
// about both.

// 'YES' when any date on the check has passed, blank when none has. Read as a
// filter, so it is a flag and not a sentence.
function expiryFlag(expiries) {
  if (!expiries) return '';
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var flagged = false;
  Object.keys(expiries).forEach(function (k) {
    var v = String(expiries[k] || '');
    if (v && v <= today) flagged = true;
  });
  return flagged ? 'YES' : '';
}

function formatExpiries(expiries) {
  if (!expiries) return '';
  return Object.keys(expiries)
    .filter(function (k) { return String(expiries[k] || '') !== ''; })
    .map(function (k) { return k + ': ' + expiries[k]; })
    .join('\n');
}

function writeBikeRow(p) {
  var conf = BIKE_SHEETS[p.form];
  var sh = ensureSheet(conf);
  // Same duplicate guard as the ops forms, reading the bike site's id field.
  if (alreadySeen(sh, conf, p.submissionId)) return json({ result: 'duplicate ignored' });

  var missing = p.missing || [];
  var conditions = p.conditions || [];
  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var isJk = p.form === 'jumpkit';

  var row = [
    Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    Utilities.formatDate(now, tz, 'HH:mm'),
    ((p.firstName || '') + ' ' + (p.lastName || '')).trim(),
    p.andrewId || '',
    isJk ? (p.bag || '') : (p.bike || '')
  ];
  // Only the jumpkit check asks which radio you are carrying, so only that tab
  // gets the column. A column that is always empty reads as a question somebody
  // forgot to answer.
  if (isJk) row.push(p.radio || '');
  row = row.concat([
    p.verdict || '',
    missing.length,                     // a NUMBER, so it sorts and filters
    missing.join('\n'),
    isJk ? expiryFlag(p.expiries) : (conditions.length ? 'YES' : ''),
    isJk ? formatExpiries(p.expiries) : conditions.join('\n'),
    p.notes || '',
    p.submissionId || ''
  ]);

  // The row and the header row are built in two different places, so they can
  // drift. When they do, every value lands one column off, which reads as a
  // data-entry mistake rather than a code one. Refuse instead of writing it.
  if (row.length !== conf.headers.length) {
    logError('built ' + row.length + ' values for "' + conf.name + '", which has ' +
             conf.headers.length + ' columns', JSON.stringify(p));
    return json({ result: 'column count mismatch, nothing written' });
  }

  sh.appendRow(row);
  var bad = missing.length > 0 || /not|fail|ground|out of service/i.test(String(p.verdict || ''));
  styleRow(sh, sh.getLastRow(), conf, bad, !bad && conditions.length > 0);
  addToBikeRestock(p, missing);
  return json({ result: 'saved' });
}

function ensureBikeRestock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BIKE_RESTOCK.name);
  if (sh) return sh;
  sh = ss.insertSheet(BIKE_RESTOCK.name);
  sh.appendRow(BIKE_RESTOCK.headers);
  sh.getRange(1, 1, 1, BIKE_RESTOCK.headers.length)
    .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 34);
  BIKE_RESTOCK.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(1, 1, sh.getMaxRows(), BIKE_RESTOCK.headers.length).createFilter();
  return sh;
}

// One row per item, the same way the ops Restock tab works: reporting the same
// thing again bumps its counter rather than adding a duplicate, so the length of
// the list is the length of the actual job.
function addToBikeRestock(p, missing) {
  if (!missing || !missing.length) return;
  var sh = ensureBikeRestock();
  var tz = Session.getScriptTimeZone();
  var when = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var who = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
  var where = p.form === 'jumpkit' ? (p.bag || 'Jumpkit') : (p.bike || 'Bike');
  var n = BIKE_RESTOCK.headers.length;

  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var index = {};
  for (var i = 0; i < existing.length; i++) index[String(existing[i][1])] = i + 2;

  var fresh = [];
  missing.forEach(function (item) {
    if (!item) return;
    var atRow = index[String(item)];
    if (atRow && atRow > 0) {
      var wasDone = sh.getRange(atRow, 1).getValue() === true;
      var times = Number(sh.getRange(atRow, 3).getValue()) || 0;
      sh.getRange(atRow, 1).setValue(false);          // reported again: reopen it
      sh.getRange(atRow, 3).setValue(wasDone ? 1 : times + 1);
      if (wasDone) sh.getRange(atRow, 4).setValue(when);
      sh.getRange(atRow, 5).setValue(when);
      sh.getRange(atRow, 6).setValue(where);
      sh.getRange(atRow, 7).setValue(who);
    } else if (!atRow) {
      fresh.push([false, item, 1, when, when, where, who]);
      index[String(item)] = -1;   // do not add the same item twice from one payload
    }
  });

  if (fresh.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, fresh.length, n).setValues(fresh);
    sh.getRange(start, 1, fresh.length, 1).insertCheckboxes();
  }
  paintBikeRestock(sh);
}

function paintBikeRestock(sh) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var n = BIKE_RESTOCK.headers.length;
  var vals = sh.getRange(2, 1, last - 1, n).getValues();
  for (var i = 0; i < vals.length; i++) {
    var r = i + 2;
    var done = vals[i][0] === true;
    sh.getRange(r, 1, 1, n)
      .setBackground(done ? '#f1f3f4' : '#ffffff')
      .setFontColor(done ? '#9aa0a6' : '#202124')
      .setFontLine(done ? 'line-through' : 'none');
    sh.getRange(r, 3).setHorizontalAlignment('center')
      .setFontWeight(!done && Number(vals[i][2]) > 1 ? 'bold' : 'normal');
  }
}

// Somewhere to put a failure that is not the caller's fault and that nobody is
// watching for. doPost already refuses to throw; this is where the detail goes.
function logError(what, body) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var es = ss.getSheetByName('Errors') || ss.insertSheet('Errors');
    es.appendRow([new Date(), String(what), String(body || '')]);
  } catch (ignored) {}
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

/* Who may write manager-level data — publishing content, and ticking Restock.
   Returns the name to record, or '' for refused.

   Two ways in, and the endpoint is public, so BOTH have to be real checks.

   1. A Google ID token, verified with Google and matched against the people the
      site says are managers. Strongest: it names a person, and removing them
      under People takes the access away.

   2. A PUBLISH_KEY script property, matched against a key the officer types into
      Site Settings. Weaker on purpose — it says "whoever holds this", not "who
      you are" — but the key is never in the public repo or the page source; it
      lives in one browser's localStorage. Set the property only while you want
      this route open, and delete it to close it again.

   If neither is configured, nothing may write. That is the safe default: an
   unauthenticated write here would let any visitor rewrite the site. */
/* Two sites publish through this one deployment, and each has its own People
   list and its own body of content. They must not share a storage slot: the ops
   site's published content and the bike site's are entirely different objects,
   so one slot would mean each publish wiped the other site's entire copy — and
   the site that got wiped would show the built-in defaults again with no error
   anywhere. That is what the `site` field prevents.

   Anything that does not name a site is the ops site. Its content was written
   under the bare 'CONTENT' key before this split existed, and that key is still
   read as a fallback so an existing deployment keeps working across the upgrade
   instead of appearing to lose everything the moment the script is pasted. */
function siteOf(p) { return String((p && p.site) || '') === 'bike' ? 'bike' : 'ops'; }
function contentKey(site) { return site === 'bike' ? 'CONTENT_BIKE' : 'CONTENT_OPS'; }

function readContent(site) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(contentKey(site));
  if (!raw && site === 'ops') raw = props.getProperty('CONTENT');   // pre-split copy
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

// Every address allowed to publish for one site: the permanent root account, plus
// whoever that site's own published People list names. Read from that site's slot
// only — being a bike manager does not make somebody an Operations Officer.
function allowedFor(site) {
  var allowed = MANAGER_EMAILS.map(function (e) { return e.toLowerCase(); });
  var o = readContent(site);
  var c = (o && o.content && o.content.access) || {};
  // `officers` is the list; `officer` is the single-address shape it replaced,
  // and is still read so an older published copy keeps working.
  (c.officers || []).forEach(function (e) { allowed.push(String(e).toLowerCase()); });
  if (c.officer) allowed.push(String(c.officer).toLowerCase());
  (c.people || []).forEach(function (x) {
    if (x && x.email) allowed.push(String(x.email).toLowerCase());
  });
  return allowed;
}

function writerName(p) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('PUBLISH_KEY');
  if (key && p.key && String(p.key) === String(key)) return 'publish key';

  var who = verifiedEmail(p.idToken, props.getProperty('CLIENT_ID'));
  if (!who) return '';
  return allowedFor(siteOf(p)).indexOf(who) < 0 ? '' : who;
}

function saveContent(p) {
  var who = writerName(p);
  var site = siteOf(p);
  // Say WHY it was refused. The browser cannot read this reply, but it lands in
  // the execution log, and "rejected: not on the People list" is the difference
  // between five minutes and an afternoon.
  if (!who) return json({ ok: false, error: 'not allowed: no valid publish key, and the signed-in address is not on the ' + site + ' People list' });
  PropertiesService.getScriptProperties()
    .setProperty(contentKey(site),
      JSON.stringify({ at: Date.now(), by: who, content: p.content }));
  return json({ ok: true, saved: true, site: site });
}

// ---- Restock, read and tick ------------------------------------------------
// The sheet is the shopping list of record: every device's submissions land in
// it, where the site's own To Get only ever saw what that one browser filed.
// These two let the site show the real list and tick it off from a phone.

function restockRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESTOCK.name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    // Written as yyyy-MM-dd strings, but a human editing the cell can turn one
    // back into a real Date, so handle both rather than printing [object Date].
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  return sh.getRange(2, 1, last - 1, RESTOCK.headers.length).getValues()
    .filter(function (r) { return String(r[1] || '').trim() !== ''; })
    .map(function (r) {
      return { got: r[0] === true, item: String(r[1]), cat: String(r[2] || ''),
               qty: Number(r[3]) || 0, times: Number(r[4]) || 0,
               first: asDate(r[5]), last: asDate(r[6]),
               where: String(r[7] || ''), who: String(r[8] || '') };
    });
}

function setRestockGot(p) {
  if (!writerName(p)) return json({ ok: false, error: 'not allowed' });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESTOCK.name);
  if (!sh) return json({ ok: false, error: 'no restock tab' });
  var last = sh.getLastRow();
  if (last < 2) return json({ ok: false, error: 'nothing to tick' });
  // Matched on the item text, which is the same key addToRestock indexes on.
  // Not the row number: a sort or an inserted row would tick the wrong thing.
  var names = sh.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]) === String(p.item)) {
      sh.getRange(i + 2, 1).setValue(p.got === true);
      paintRestock(sh);
      return json({ ok: true, set: true });
    }
  }
  return json({ ok: false, error: 'not found' });
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
    // ?site=bike for the bike site, anything else for the ops site. Serving one
    // site the other's content would blank every view it has, so this is read
    // from the same slot the matching publish wrote to and no other.
    var o = readContent(siteOf(p));
    if (!o) return json({ ok: true, content: null });
    // `updatedAt` as well as `at`: the two sites read a different field name for
    // the same number, and this endpoint now answers both of them.
    return json({ ok: true, content: o.content, at: o.at, updatedAt: o.at });
  }
  if (p.report) {
    return json({ ok: true, report: collectReport(p.report) });
  }
  if (p.restock) {
    return json({ ok: true, restock: restockRows() });
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
  // The bike tabs answer here too, so "Test connection" on either site proves it
  // is talking to the one file that holds both.
  Object.keys(BIKE_SHEETS).forEach(function (k) {
    var b = ss.getSheetByName(BIKE_SHEETS[k].name);
    out.tabs[BIKE_SHEETS[k].name] = b ? Math.max(0, b.getLastRow() - 1) : 0;
  });
  // The bike site's Test connection reads `serves` and `expects` to catch two
  // URLs being swapped. One deployment serves both forms now, so say so rather
  // than letting it report a mismatch against a field that is no longer there.
  out.serves = ['jumpkit', 'safety'];
  out.expects = 'jumpkit';
  var rs = ss.getSheetByName(RESTOCK.name);
  out.restock = rs ? Math.max(0, rs.getLastRow() - 1) : 0;
  var brs = ss.getSheetByName(BIKE_RESTOCK.name);
  out.bikeRestock = brs ? Math.max(0, brs.getLastRow() - 1) : 0;
  return json(out);
}

// Run by hand (Run ▸ tidyUp) after pasting an updated script: reformats every
// tab that already exists and repaints the restock list.
/* The order the tabs sit in, left to right. Grouped by whose job it is rather
   than by when they happen to get created, so the file reads as a table of
   contents: the operations forms, then the bike forms, then the two worklists,
   then the machinery nobody opens by choice. */
var TAB_ORDER = ['Room Checks', 'Checkouts', 'Bag Checks', 'Post-Call', 'Reports',
                 'Bike Jumpkit Checks', 'Bike Safety Checks',
                 'Restock', 'Bike Restock', 'Items'];

/* Run by hand (Run ▸ tidyUp) after pasting an updated script.

   Builds EVERY tab, rather than letting each one appear the first time somebody
   happens to submit that form. A file that grows tabs as it goes gives no way to
   tell "nobody has filed a room check yet" from "room checks are not set up" —
   and the second is the one worth worrying about. An empty tab with its headers
   in place answers that question by existing.

   Safe to run as often as you like: every step below either finds the tab and
   reformats it, or creates it. Nothing is cleared. */
function tidyUp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // The five operations forms. ensureSheet rewrites a header row that no longer
  // matches this version of the script, which is what stops a newly added column
  // shifting every later value one place left.
  Object.keys(SHEETS).forEach(function (nm) {
    formatSheet(ensureSheet(SHEETS[nm]), SHEETS[nm]);
  });

  // The two bike forms. This is also what renames a tab carried over from the
  // standalone bike file under its old title, rather than leaving its rows
  // stranded beside a new empty one.
  Object.keys(BIKE_SHEETS).forEach(function (k) {
    formatSheet(ensureSheet(BIKE_SHEETS[k]), BIKE_SHEETS[k]);
  });

  // The worklists and the per-item log.
  ensureItems();
  var it = ss.getSheetByName(ITEMS.name);
  if (it) {
    it.getRange(1, 1, 1, ITEMS.headers.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff');
    ITEMS.widths.forEach(function (w, i) { it.setColumnWidth(i + 1, w); });
  }
  paintRestock(ensureRestock());
  paintBikeRestock(ensureBikeRestock());

  orderTabs();
  return 'All tabs are present. Order: ' + TAB_ORDER.join(', ');
}

// Puts the tabs in TAB_ORDER. Anything not on that list (an Errors tab, or
// something added by hand) is left alone at the end rather than moved or removed.
function orderTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var at = 1;
  TAB_ORDER.forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(at++);
  });
  var first = ss.getSheetByName(TAB_ORDER[0]);
  if (first) ss.setActiveSheet(first);
}
