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
    /* NEW COLUMNS GO ON THE END. Inserting one in the middle does not delete a
       single row, but it moves every existing value one place sideways under
       headers that no longer describe them — which is worse than losing them,
       because it looks like data.

       So `Duty Period` and `Call Sign` are appended, and `Andrew ID` stays in
       its original position holding the room checks already filed under it. The
       room-check form no longer asks for one, so that column simply stops
       filling; the history under it stays readable.

       `Room ID` and `DP Key` are the machine-readable pair the duty-period
       tracker reads back. `Room` and `Duty Period` stay human-readable for
       whoever is looking at the sheet; matching on those would break the moment
       a room is renamed, which is the failure this file has hit more than once.
    */
    keys:    ['date','time','name','andrew','subject','result','missingCount','missing','restock','maint','sid','dp','callsign','roomId','dpKey'],
    headers: ['Date','Time','Name','Andrew ID','Room','Result','Missing','What Was Missing','Restock Needed','Maintenance','Submission ID','Duty Period','Call Sign','Room ID','DP Key'],
    widths:  [95, 70, 150, 100, 150, 150, 80, 320, 260, 260, 120, 120, 90, 110, 90]
  },
  'Checkouts': {
    name: 'Checkouts', freeze: 3,
    // `Bag ID` appended so a flag raised here keys on the unit, not on the name
    // beside it — a rename would otherwise detach every flag against that bag.
    /* `What Was Missing` is appended LAST, so no existing row shifts. It should
       have been here from the beginning: this tab recorded the missing COUNT and
       nothing else, so a checkout reading "2 missing" was the only record that
       anything was wrong and the NAMES of the two things existed nowhere in the
       file. The restock list was the single copy, and anything that went wrong
       between here and there — an older deployment, a wording change — lost a
       report a member had filed correctly. Room Checks has always had this
       column; the two forms members use most did not. */
    keys:    ['date','time','name','andrew','radio','subject','result','missingCount','expired','expiringSoon','detail','sid','unitId','missing'],
    headers: ['Date','Time','Name','Andrew ID','Radio','Bag','Result','Missing','Expired','Expiring Soon','Damaged','Submission ID','Bag ID','What Was Missing'],
    widths:  [95, 70, 150, 100, 90, 160, 150, 80, 220, 220, 260, 120, 110, 340]
  },
  'Bag Checks': {
    name: 'Bag Checks', freeze: 3,
    /* The form stopped asking for a seal number — the agency does not seal its
       kits. The COLUMN stays exactly where it was, because removing it would
       pull Submission ID one place left and every row already filed would show
       its seal value under that heading. It just stops filling. */
    // Same gap as Checkouts, same fix, appended in the same place.
    keys:    ['date','time','name','andrew','subject','result','missingCount','expired','expiringSoon','seal','sid','bagId','missing'],
    headers: ['Date','Time','Name','Andrew ID','Bag','Result','Missing','Expired','Expiring Soon','Seal (no longer used)','Submission ID','Bag ID','What Was Missing'],
    widths:  [95, 70, 150, 100, 150, 150, 80, 220, 220, 100, 120, 110, 340]
  },
  'Post-Call': {
    name: 'Post-Call', freeze: 3,
    // `replaced` reverses the old `short` ("Could Not Replace"). Members do not
    // restock, so the old column asked everybody to account for something that
    // was never their job and the honest answer was always "all of it". This
    // records the exception instead: what they put back themselves.
    /* `Could Not Replace` keeps its original position and its original heading,
       holding the answers already filed under it. The form no longer asks that
       question — it asks the opposite, per item — so the column stops filling
       and `Replaced By Member` is appended instead. Renaming it in place would
       have left old answers meaning the exact reverse of their new heading.

       `Medications Given` is what was given on the call, named and counted but
       with no location: the same drug sits on more than one shelf and the form
       does not ask which, because a guess would be a wrong location against a
       real drug. Optional — most members cannot give medications at all. */
    keys:    ['date','time','name','callnum','result','usageCount','usageText','short','usageJson','sid','replaced','meds'],
    headers: ['Date','Time','Name','Call Number','Result','Units Used','What Was Used','Could Not Replace (no longer used)','Used (data)','Submission ID','Replaced By Member','Medications Given'],
    widths:  [95, 70, 150, 110, 150, 90, 380, 200, 200, 120, 260, 260]
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

/* `Kind` separates a PURCHASE from a REPORT, appended so no existing row moves.

   A consumable logged on a post-call is a purchase: known item, known quantity,
   buy it. A missing tick, an expired flag or a typed note is a report — the
   eyewash was not in Jumpkit A, and whether that becomes a purchase or turns
   out to be "it was on the wrong shelf" is a judgment nobody can make from the
   wording. One list of both is a shopping list containing sentences, which is
   what the site was showing. The site splits them; without this column the
   split collapses the moment the sheet answers, which is the normal case. */
var RESTOCK = {
  name: 'Restock',
  headers: ['Got','Item','Category','Qty','Times Asked','First Reported','Last Reported','Where','Who','Kind'],
  widths:  [55, 280, 110, 70, 100, 120, 120, 160, 150, 90]
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
    /* `Bike ID` and `Status` appended LAST, so nothing already filed shifts. The
       bike site derives a bike's status from its most recent check, and that
       lived only in published content — which a member cannot write. Recording
       the id and the ok/warn/oos class here is what lets the fleet board show
       everybody's checks instead of the viewer's own. */
    headers: ['Date','Time','Name','Andrew ID','Bike','Result','Missing',
              'What Was Missing','Weather Grounded','Conditions Flagged','Notes','Submission ID',
              'Bike ID','Status'],
    widths:  [95, 70, 150, 100, 96, 210, 74, 320, 130, 240, 260, 120, 96, 80]
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

/* ============================================================================
   SHARED STATE THAT MEMBERS CAN WRITE
   ============================================================================
   Publishing site content needs a manager token. Submitting a form does not —
   that is why members can file at all. Anything that has to aggregate across
   everybody therefore cannot live in published content, or it only ever shows
   what the person looking at it filed themselves.

   That was the duty-period tracker, and it is also: which bag is flagged, what
   has been reported, and when things expire. All three ride in on the ordinary
   submission, which every member can make, and are read back from here.

   `Expiry` is a date per bag-and-item. `Concerns` is every problem raised, with
   a Resolved tick a manager can set. Both are upserted, so the same fact filed
   twice is one row. */
/* `Site` is LAST on both, not beside the key it qualifies. Two sites write here
   now, and a column added in the middle would shift every value in every row
   that is already in the file one place left — which does not look like a bug,
   it looks like somebody typed the sheet wrong. Appended, an older row simply
   has the cell empty, and empty reads as 'ops' below, which is what those rows
   are. */
/* WHAT WE DID, as opposed to what came up.

   Every other tab in this file records a PROBLEM: something missing, something
   expired, something somebody typed. None of them records the answer — that a
   manager went and bought the gauze, or looked at the cot and decided it was
   fine. The Restock and Concerns tabs carry a tick, but a tick has no date and
   no name on it, so "what did we actually get through this month" was a question
   the spreadsheet could not answer and the report could not show.

   One row per action, appended, never edited. It is a ledger: ticking something
   and un-ticking it are both events and both stay. */
var ACTIONS = {
  name: 'Actions',
  headers: ['Date','Time','Who','Site','Did','What','Where'],
  widths:  [95, 70, 150, 70, 120, 340, 170]
};

function ensureActions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ACTIONS.name);
  if (!sh) { sh = ss.insertSheet(ACTIONS.name); sh.appendRow(ACTIONS.headers); }
  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (have.join('|') !== ACTIONS.headers.join('|'))
    sh.getRange(1, 1, 1, ACTIONS.headers.length).setValues([ACTIONS.headers]);
  return sh;
}

/* Never throws. A ledger entry is worth having and never worth losing the thing
   it describes over — if this fails the tick still happened. */
function logAction(site, who, did, what, where) {
  try {
    var sh = ensureActions();
    var tz = Session.getScriptTimeZone(), now = new Date();
    sh.appendRow([Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
                  Utilities.formatDate(now, tz, 'HH:mm'),
                  String(who || ''), site === 'bike' ? 'bike' : 'ops',
                  String(did || ''), String(what || ''), String(where || '')]);
  } catch (err) {
    logError('could not record an action: ' + err, [site, who, did, what, where].join(' | '));
  }
}

/* Everything done in a period, newest first. */
function actionRows(site, sinceDay) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACTIONS.name);
  if (!sh || sh.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  return sh.getRange(2, 1, sh.getLastRow() - 1, ACTIONS.headers.length).getValues()
    .map(function (r, i) {
      return { date: asDate(r[0]), time: String(r[1] || ''), who: String(r[2] || ''),
               site: rowSite(r[3]), did: String(r[4] || ''), what: String(r[5] || ''),
               where: String(r[6] || ''), n: i };
    })
    .filter(function (a) {
      if (a.site !== (site === 'bike' ? 'bike' : 'ops')) return false;
      return !sinceDay || !a.date || a.date >= sinceDay;
    })
    /* Newest first, and the row's own position breaks a tie. Several actions
       land in the same minute — ticking a list off is half a dozen taps — and
       sorting on the clock alone put them back in an arbitrary order, so
       "ticked, then un-ticked" could read as the other way round. Rows are only
       ever appended, so position IS the order they happened in. */
    .sort(function (x, y) {
      return (y.date + y.time).localeCompare(x.date + x.time) || (y.n - x.n);
    });
}

var EXPIRY = {
  name: 'Expiry',
  headers: ['Key','Bag','Item','Expires','Last Reported By','Updated','Site'],
  widths:  [220, 150, 320, 100, 150, 120, 70]
};

var CONCERNS = {
  name: 'Concerns',
  headers: ['Resolved','Signature','What','Where','Bag ID','Area','Urgency',
            'Times','First','Last','By','Resolved By','Site'],
  widths:  [80, 240, 340, 160, 120, 110, 100, 70, 110, 110, 140, 140, 70]
};

// Which site a row belongs to. Blank is 'ops': every row written before this
// column existed came from the operations site.
function rowSite(v) { return String(v || '') === 'bike' ? 'bike' : 'ops'; }

function ensureExpiry() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(EXPIRY.name);
  if (!sh) { sh = ss.insertSheet(EXPIRY.name); sh.appendRow(EXPIRY.headers); }
  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (have.join('|') !== EXPIRY.headers.join('|'))
    sh.getRange(1, 1, 1, EXPIRY.headers.length).setValues([EXPIRY.headers]);
  return sh;
}

function ensureConcerns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONCERNS.name);
  if (!sh) { sh = ss.insertSheet(CONCERNS.name); sh.appendRow(CONCERNS.headers); }
  var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  if (have.join('|') !== CONCERNS.headers.join('|'))
    sh.getRange(1, 1, 1, CONCERNS.headers.length).setValues([CONCERNS.headers]);
  return sh;
}

/* Expiry dates carried in on a submission. Keyed exactly as the site keys them
   — `<pick>|<itemId>` — because a date belongs to a physical kit, not to an
   item name shared by six of them. */
function saveExpiry(p) {
  if (!p.expiryJson) return;
  var list;
  try { list = JSON.parse(p.expiryJson); } catch (err) { return; }
  if (!list || !list.length) return;
  putExpiry(list.map(function (e) {
    return e && e.k ? { k: e.k, bag: e.b || '', item: e.i || '', date: e.d || '' } : null;
  }), 'ops', p.name || p.callsign || '');
}

/* The upsert both sites share. Keyed on site AND key: the two sites number their
   kit independently, so one of them happening to reuse an id must not overwrite
   the other's date. A blank date is skipped rather than written — one person
   leaving the field alone must not erase a date somebody else recorded. */
function putExpiry(list, site, who) {
  var rows = (list || []).filter(function (e) { return e && e.k && String(e.date || '').trim(); });
  if (!rows.length) return;
  var sh = ensureExpiry();
  var n = EXPIRY.headers.length;
  var last = sh.getLastRow();
  var have = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var at = {};
  for (var i = 0; i < have.length; i++)
    at[rowSite(have[i][6]) + '\u0001' + String(have[i][0])] = i + 2;
  var when = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fresh = [];
  // Same collapse as putConcerns, for the same reason: a repeated key in one
  // payload would read the -1 sentinel back as a row number.
  rows = dedupeBy(rows, function (e) { return String(e.k); });
  rows.forEach(function (e) {
    var row = [String(e.k), String(e.bag || ''), String(e.item || ''),
               String(e.date), who || '', when, site];
    var ix = site + '\u0001' + String(e.k);
    var r = at[ix];
    if (r > 0) sh.getRange(r, 1, 1, n).setValues([row]);
    else { fresh.push(row); at[ix] = -1; }
  });
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, n).setValues(fresh);
}

function expiryRows(site) {
  site = site === 'bike' ? 'bike' : 'ops';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EXPIRY.name);
  if (!sh || sh.getLastRow() < 2) return {};
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  var out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, EXPIRY.headers.length).getValues()
    .forEach(function (r) {
      var k = String(r[0] || '').trim();
      if (!k || rowSite(r[6]) !== site) return;
      out[k] = { date: asDate(r[3]), by: String(r[4] || ''), at: asDate(r[5]) };
    });
  return out;
}

/* One row per distinct problem. `sig` is what|where lowercased, the same
   signature the site has always used to decide whether two reports are the same
   thing — so a tick on either side means the same tick. */
/* Opening wording of the flag a post-call raises against the bag it used. The
   site matches on this same prefix, so the two must not drift. */
var USED_ON_CALL = 'Used on a call';

/* A bag that came back from a call is not known-complete — something came out
   of it. This raises the amber flag the readiness board reads.

   It belongs HERE and not only on the site, for the reason everything else in
   this file does: the site raises it for the phone that filed the post-call,
   and that phone cannot publish. Without this, a jumpkit used on a call read
   "Check first" to the member who filed and "Ready" to the next person to pick
   it up, which is the single thing that board exists to prevent.

   Which bag types get flagged is configuration only the site holds, so the
   decision arrives already made, in `flagUnits`. */
function noteUsedOnCall(p) {
  if (p.form !== 'Post-Call' || !p.flagUnits) return;
  var list;
  try { list = JSON.parse(p.flagUnits); } catch (err) { return; }
  if (!Array.isArray(list) || !list.length) return;

  var sh = ensureConcerns();
  var n = CONCERNS.headers.length;
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  /* One OPEN flag per bag, matching the site. A jumpkit used on four calls
     before anybody gets to it is still one thing to go and check, and four
     dated rows would bury the real concerns underneath them. A resolved row
     does not count — somebody has been through the bag since. */
  var openFor = {};
  rows.forEach(function (r) {
    if (r[0] === true) return;
    if (rowSite(r[12]) !== 'ops') return;
    if (String(r[2] || '').indexOf(USED_ON_CALL) !== 0) return;
    openFor[String(r[4] || '')] = 1;
  });

  var when = p.date ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var items = [];
  list.forEach(function (u) {
    if (!u || !u.id || openFor[u.id]) return;
    var what = USED_ON_CALL + ' ' + when;
    var where = String(u.name || u.id);
    items.push({ sig: concernSig(what, where), what: what, where: where,
                 unit: String(u.id), area: 'Equipment', urgency: 'Soon' });
  });
  putConcerns(items, 'ops', p.name || p.callsign || '', when);
}

function concernSig(what, where) {
  return String(what || '').trim().toLowerCase() + '|' +
         String(where || '').trim().toLowerCase();
}

/* Everything a submission says is wrong, in the same words and under the same
   rules the site itself uses. The two have to agree: the site builds this list
   for the device that filed, and this builds it for everybody else, so anything
   only one of them files is a report that exists for exactly one person.

   Two things were only ever on the site's side, and both mattered:

   - AN UNTICKED BOX. A checkout saying the stethoscope is missing raised a flag
     against that bag on the phone that filed it and nowhere else — so the
     readiness board showed the bag as Ready to the next person to pick it up.
     That is the whole reason the board exists.
   - A RESTOCK REQUEST. It reached the shopping list but never the problem log,
     so it could be bought and still read as outstanding, or read as handled
     when nobody had touched it. */
function noteConcerns(p) {
  var items = [];
  var subj = p.subject || '';
  // The bag UNIT, which is what the readiness board keys on. A bag-check picks a
  // kit TYPE, and a type id matches no unit — the site leaves it blank there for
  // exactly that reason, so this does too.
  var unit = p.unitId || '';
  // A room's faults are the office's; everything else is equipment's.
  var area = (p.form === 'Room Checks') ? 'Office' : 'Equipment';

  if (p.form === 'Reports' && p.what)
    items.push({ what: p.what, where: p.where || '', area: p.area || 'Other',
                 urgency: p.urgency || 'Whenever', unit: '' });

  /* An unticked box only means a fault where the list describes the WORLD. On a
     room or bag check, "sink empty" and "2 tourniquets present" are claims about
     what is there. On a post-call the list is YOUR TASKS — "kit back where it
     belongs" — and leaving one unticked says you did not do it, which is not an
     equipment fault. Filing those buried the real concerns underneath them. */
  if (p.form !== 'Post-Call' && p.missing)
    String(p.missing).split(' | ').forEach(function (m) {
      if (m) items.push({ what: m + ' missing', where: subj, area: area,
                          urgency: 'Soon', unit: unit });
    });

  // Free text is always a real report — somebody chose to type it.
  ['restock', 'maint', 'detail'].forEach(function (k) {
    if (p[k]) items.push({ what: String(p[k]), where: subj, area: area,
                           urgency: 'Soon', unit: unit });
  });

  /* Expired stock is a fault: the kit is carrying something it must not carry,
     so it blocks. Expiring-soon is NOT a concern — the item is in date today,
     and flagging a bag "Check first" for something that has not happened yet
     teaches people to ignore the board. It goes on the restock list only. */
  if (p.expired) String(p.expired).split(' | ').forEach(function (m) {
    if (m) items.push({ what: m + ' is expired', where: subj, area: area,
                        urgency: 'Blocking', unit: unit });
  });
  if (!items.length) return;
  putConcerns(items.map(function (it) {
    return { sig: concernSig(it.what, it.where), what: it.what, where: it.where,
             unit: it.unit, area: it.area, urgency: it.urgency };
  }), 'ops', p.name || p.callsign || '', p.date);
}

/* The upsert both sites share. Keyed on site AND signature, so the two sites
   cannot land on each other's rows — "missing gauze" is a real thing to report
   on both, and one tick must not silently close the other. */
/* `day` is the date the problem was REPORTED — the submission's own date, not
   the moment this row happened to be written. The same thing for a check filed
   today; they part company for anything backdated, and when they do a concern
   falls in a different week from the form row that raised it, so the weekly
   report disagrees with the tab it came from. */
function putConcerns(items, site, who, day) {
  if (!items || !items.length) return;
  var sh = ensureConcerns();
  var n = CONCERNS.headers.length;
  var last = sh.getLastRow();
  var have = last > 1 ? sh.getRange(2, 1, last - 1, n).getValues() : [];
  var at = {};
  for (var i = 0; i < have.length; i++)
    at[rowSite(have[i][12]) + '\u0001' + String(have[i][1])] = i + 2;
  var when = /^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))
    ? String(day)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fresh = [];
  /* One submission can name the same thing twice — two checklist lines with the
     same wording, or a note that repeats a fault. Collapsed here, because the
     loop below marks a queued row with -1 and would otherwise read that back as
     a row NUMBER on the second sighting. Sheets refuses row -1, so the whole
     batch was lost, quietly, and only for the submissions that happened to
     repeat themselves. */
  items = dedupeBy(items, function (it) { return String(it.sig); });
  items.forEach(function (it) {
    var ix = site + '\u0001' + it.sig;
    var r = at[ix];
    if (r > 0) {
      // Raised again after being ticked off means it is back. Reopen it: a
      // ticked row that is no longer true is worse than no row.
      var wasResolved = sh.getRange(r, 1).getValue() === true;
      var times = Number(sh.getRange(r, 8).getValue()) || 0;
      sh.getRange(r, 1).setValue(false);
      sh.getRange(r, 3).setValue(it.what);   // the wording can change; the fact does not
      sh.getRange(r, 8).setValue(wasResolved ? 1 : times + 1);
      if (wasResolved) sh.getRange(r, 9).setValue(when);
      sh.getRange(r, 10).setValue(when);
      sh.getRange(r, 11).setValue(who || '');
      if (wasResolved) sh.getRange(r, 12).setValue('');
      // Rows written before this column existed have it blank. Blank already
      // reads as 'ops', but filling it in as they are touched means the file
      // itself says which site a row came from.
      sh.getRange(r, 13).setValue(site);
    } else {
      fresh.push([false, it.sig, it.what, it.where, it.unit || '', it.area || 'Other',
                  it.urgency || 'Whenever', 1, when, when, who || '', '', site]);
      at[ix] = -1;
    }
  });
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, n).setValues(fresh);
}

/* ---- the bike site's half ---------------------------------------------------
   The same three things a bike or jumpkit check can report as the site files
   locally — what is missing, what has expired, and anything typed in the notes —
   under the SAME signature the site uses, so one problem is one row whether the
   site put it there or this did.

   It has to happen here rather than being left to the site, for the reason the
   duty-period tracker had to move: filing a check needs no sign-in, publishing
   the site's shared copy needs a manager token, so a member's report reached the
   spreadsheet and never reached the Bike Manager's screen. */
var BIKE_URGENCY = { crit: 'Blocking', warn: 'Soon', minor: 'Whenever' };

// Last mention of a key wins, order otherwise preserved.
function dedupeBy(items, keyOf) {
  var out = [], at = {};
  (items || []).forEach(function (it) {
    if (!it) return;
    var k = keyOf(it);
    if (at[k] === undefined) { at[k] = out.length; out.push(it); }
    else out[at[k]] = it;
  });
  return out;
}

function bikeConcernSig(bike, bag, key) {
  return String(bike || '') + '|' + String(bag || '') + '|' + String(key || '');
}

// Whole days from today, matching the site's daysUntil so both sides agree on
// what "expiring soon" means. Anything that is not a yyyy-MM-dd date is null.
function daysUntilISO(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '').trim());
  if (!m) return null;
  var t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd').split('-');
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) -
                     Date.UTC(+t[0], +t[1] - 1, +t[2])) / 86400000);
}

function noteBikeConcerns(p) {
  var isJk = p.form === 'jumpkit';
  // The stable id, with the display name only as a fallback for a page cached
  // from before this shipped. A signature built on a name would come apart the
  // moment a bike is renamed, which is the one thing renaming is meant to be
  // safe against.
  var bike  = isJk ? '' : String(p.bikeId || p.bike || '');
  var bag   = isJk ? String(p.bagId || p.bag || '') : '';
  var where = isJk ? ('Jumpkit \u2014 ' + String(p.bag || bag)) : String(p.bike || bike);
  var area  = isJk ? 'Jumpkit' : 'Bike';
  var who   = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
  var missing = p.missing || [];
  var items = [];

  // 1. one row per missing item, never a combined "2 missing" — restocking NPAs
  //    and restocking gauze finish at different times.
  missing.forEach(function (m) {
    items.push({ key: 'missing:' + m, what: 'Missing: ' + m, sev: isJk ? 'warn' : 'crit' });
  });

  // 2. anything expired or close to it, named so it can be ordered.
  var exp = [], soon = [], ex = p.expiries || {};
  Object.keys(ex).forEach(function (k) {
    var d = daysUntilISO(ex[k]);
    if (d === null) return;
    if (d < 0) exp.push(k); else if (d <= 30) soon.push(k + ' (' + d + 'd)');
  });
  var expiryBad = !!(exp.length || soon.length);
  if (expiryBad) items.push({ key: 'expiry', sev: exp.length ? 'crit' : 'warn',
    what: (exp.length ? 'EXPIRED: ' + exp.join(', ') : '') +
          (exp.length && soon.length ? ' \u2014 ' : '') +
          (soon.length ? 'expiring soon: ' + soon.join(', ') : '') });

  // 3. free text, deduped on its own words.
  var note = String(p.notes || '').trim();
  if (note) items.push({ key: 'note:' + note.toLowerCase(), what: note, sev: 'minor' });

  putConcerns(items.map(function (it) {
    return { sig: bikeConcernSig(bike, bag, it.key), what: it.what, where: where,
             unit: isJk ? bag : bike, area: area, urgency: BIKE_URGENCY[it.sev] || 'Whenever' };
  }), 'bike', who, p.date);

  retireBikeConcerns(bike, bag, missing, expiryBad);
}

/* A later check that finds the item back in the bag is the only evidence there
   will ever be that somebody restocked it — nobody goes and ticks it off. So a
   check clears what it no longer reports, item by item, for its own subject
   only. Ticked, not deleted: the row stays as history.

   Notes are deliberately NOT retired. A check that does not repeat "chain keeps
   slipping" is a check where nobody typed it again, which is not the same as
   the chain having been fixed. */
function retireBikeConcerns(bike, bag, stillMissing, expiryBad) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONCERNS.name);
  if (!sh || sh.getLastRow() < 2) return;
  var n = CONCERNS.headers.length;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues();
  // The trailing separator is what makes this a safe prefix: "|bag2|" cannot
  // match a row belonging to "bag20".
  var pre = bikeConcernSig(bike, bag, '');
  var keep = {};
  (stillMissing || []).forEach(function (m) { keep['missing:' + m] = 1; });
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === true) continue;
    if (rowSite(rows[i][12]) !== 'bike') continue;
    var sig = String(rows[i][1] || '');
    if (sig.indexOf(pre) !== 0) continue;
    var key = sig.slice(pre.length);
    var gone = (key.indexOf('missing:') === 0 && !keep[key]) ||
               (key === 'expiry' && !expiryBad);
    if (!gone) continue;
    sh.getRange(i + 2, 1).setValue(true);
    sh.getRange(i + 2, 12).setValue('a later check');
  }
}

/* Expiration dates off a bike check. The bike site keys these by item id, one
   date per item across the whole kit, which is how its own form reads them
   back. */
function saveBikeExpiry(p) {
  var by = p.expiryById;
  if (!by || typeof by !== 'object') return;
  var who = ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
  putExpiry(Object.keys(by).map(function (k) {
    var e = by[k] || {};
    return { k: k, bag: String(p.bag || ''), item: String(e.l || k), date: String(e.d || '') };
  }), 'bike', who);
}

/* The most recent check per bike, for the fleet board.

   A bike's status is its last check, and that has only ever lived in published
   content — which a manager can write and a member cannot. So a member's
   pre-ride check reached this spreadsheet and never reached anybody else's
   screen, and every bike read "never checked" to everyone but the person who
   checked it. This is the same rule as everything else in this file: what has
   to aggregate across people is read from here.

   Weather-grounded checks are skipped. Grounding says the conditions are unsafe
   to ride in, not that the bike is — the site does not set a bike's status from
   one either. */
function bikeCheckRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BIKE_SHEETS.safety.name);
  if (!sh || sh.getLastRow() < 2) return {};
  var n = BIKE_SHEETS.safety.headers.length;
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  /* Every check already in this tab predates the two columns above, and
     dropping all of them would mean the fleet board says "never checked" about a
     fleet that has been checked all term — until somebody happens to file again.
     So they are read back as well as can be honestly managed:

       - the bike, by matching the NAME column against the published bike list.
         Names are editable, so this is a guess and only ever used when there is
         no id. A name that matches nothing is skipped rather than invented.
       - the verdict, from the wording the site itself wrote into Result. Also a
         guess, and also only used when the class column is empty.

     New rows carry both explicitly and never reach either fallback. */
  var byName = {};
  var stored = readContent('bike');
  var bikes = (stored && stored.content && stored.content.bikes) || [];
  bikes.forEach(function (b) { if (b && b.name) byName[String(b.name).trim().toLowerCase()] = b.id; });

  var classOf = function (result) {
    var v = String(result || '');
    if (/^Cleared for bike response/i.test(v)) return 'ok';
    if (/Expired item/i.test(v)) return 'oos';
    if (/^Not cleared/i.test(v)) return 'warn';
    if (/^Cleared/i.test(v)) return 'warn';   // cleared, but with something noted
    return '';
  };

  var out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues().forEach(function (r) {
    if (String(r[8] || '') === 'YES') return;
    var id = String(r[12] || '').trim() || byName[String(r[4] || '').trim().toLowerCase()] || '';
    var cls = String(r[13] || '').trim() || classOf(r[5]);
    if (!id || !cls) return;
    var date = asDate(r[0]), time = String(r[1] || '');
    var stamp = date + ' ' + time;
    if (out[id] && out[id].stamp > stamp) return;
    out[id] = { stamp: stamp, date: date, verdict: cls,
                note: String(r[5] || ''), by: String(r[2] || '') };
  });
  return out;
}

function concernRows(site) {
  site = site === 'bike' ? 'bike' : 'ops';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONCERNS.name);
  if (!sh || sh.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  return sh.getRange(2, 1, sh.getLastRow() - 1, CONCERNS.headers.length).getValues()
    .filter(function (r) {
      return String(r[1] || '').trim() !== '' && rowSite(r[12]) === site;
    })
    .map(function (r) {
      return { resolved: r[0] === true, sig: String(r[1]), what: String(r[2] || ''),
               where: String(r[3] || ''), unit: String(r[4] || ''),
               area: String(r[5] || ''), urgency: String(r[6] || 'Whenever'),
               times: Number(r[7]) || 1, first: asDate(r[8]), last: asDate(r[9]),
               by: String(r[10] || ''), resolvedBy: String(r[11] || '') };
    });
}

/* Ticking a concern IS a manager action, so unlike a submission this one is
   checked. A member reporting a problem needs no permission; deciding it is
   dealt with does. */
function setConcernResolved(p) {
  var c = writerCheck(p);
  if (!c.name) return json({ ok: false, error: 'not allowed: ' + c.why });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONCERNS.name);
  if (!sh || sh.getLastRow() < 2) return json({ ok: false, error: 'nothing to tick' });
  var site = siteOf(p);
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, CONCERNS.headers.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    // Site as well as signature: the same words reported on both sites are two
    // different problems, and ticking one must not tick the other.
    if (String(rows[i][1]) === String(p.sig) && rowSite(rows[i][12]) === site) {
      sh.getRange(i + 2, 1).setValue(p.resolved === true);
      sh.getRange(i + 2, 12).setValue(p.resolved === true ? c.name : '');
      logAction(site, c.name, p.resolved === true ? 'Resolved' : 'Reopened',
                String(rows[i][2] || ''), String(rows[i][3] || ''));
      return json({ ok: true, set: true });
    }
  }
  return json({ ok: false, error: 'not found' });
}

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

/* Which column holds the submission id, BY NAME. This used to assume it was the
   last one, which was true right up until a column was appended after it — and
   then the duplicate guard was silently reading the wrong column, matching
   nothing, and every retry on a patchy phone would have written a second row.
   Nothing about that would have looked wrong until the counts were. */
function sidCol(conf) {
  var i = conf.headers.indexOf('Submission ID');
  return i < 0 ? conf.headers.length : i + 1;
}

function alreadySeen(sh, conf, sid) {
  if (!sid) return false;
  var col = sidCol(conf);
  var last = sh.getLastRow();
  if (last < 2) return false;
  var start = Math.max(2, last - 100);
  var ids = sh.getRange(start, col, last - start + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(sid)) return true;
  return false;
}

/* Did this submission land? The site asks straight after filing, so the person
   who filed it gets a plain yes instead of being told to ask a manager to go and
   look in the spreadsheet — which is the single commonest reason anybody opens
   that file at all. Searches the recent rows of every form tab, because the
   answer must not depend on the asker knowing which tab their form writes to. */
function findFiled(sid) {
  if (!sid) return { ok: true, found: false };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var groups = [SHEETS, BIKE_SHEETS];
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var names = Object.keys(group);
    for (var n = 0; n < names.length; n++) {
      var conf = group[names[n]];
      var sh = ss.getSheetByName(conf.name);
      if (!sh || sh.getLastRow() < 2) continue;
      if (alreadySeen(sh, conf, sid)) return { ok: true, found: true, tab: conf.name };
    }
  }
  return { ok: true, found: false };
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
    if (p.form === '__resolve') return setConcernResolved(p);

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
    noteConcerns(p);
    noteUsedOnCall(p);
    saveExpiry(p);
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
    var map = nameMap(), names = map.items || {}, units = map.units || {};
    /* Picked from a list, with a quantity. This is the only one that is a
       purchase; everything below is somebody reporting something.

       `where` is the bag it came OUT of, not p.subject — a post-call has no
       subject, so every purchase on the shared list said "anywhere" while the
       device that filed it knew perfectly well which jumpkit was now short. The
       shopping was right and the putting-away was guesswork. */
    list.forEach(function (u) {
      // `r` means the member put it back on the spot. The bag is whole and the
      // shelf is one down — that is a stock movement, not something to order,
      // and buying another of the one item that is NOT missing is the mistake
      // the refill tick exists to prevent.
      if (u && u.r) return;
      out.push({ item: names[u.i] || u.i, qty: Number(u.q) || 1, cat: 'Equipment',
                 kind: 'buy', where: units[u.f] || u.f || '' });
    });
  }
  if ((p.form === 'Bag Checks' || p.form === 'Checkouts') && p.missing) {
    String(p.missing).split(' | ').forEach(function (m) {
      if (m) out.push({ item: m, qty: 1, cat: 'Equipment', kind: 'report' });
    });
  }
  /* Dated stock. Expired is a fault and expiring-soon is notice, but both are
     the same thing on THIS list: something to go and replace. Expiring-soon used
     to produce nothing anywhere — it reached the check row as a cell and stopped
     there, so the only way to find it was to open the file and read across, and
     by the time anything actionable existed the item had already lapsed.

     The wording matches the site exactly. It has to: the site builds this list
     for the device that filed and this builds it for everybody else, and two
     spellings of one item is two rows for one job. */
  if (p.expired) String(p.expired).split(' | ').forEach(function (m) {
    if (m) out.push({ item: m + ' \u2014 expired', qty: 1, cat: 'Equipment', kind: 'report' });
  });
  if (p.expiringSoon) String(p.expiringSoon).split(' | ').forEach(function (m) {
    if (m) out.push({ item: m + ' \u2014 expiring soon', qty: 1, cat: 'Equipment', kind: 'report' });
  });
  if (p.restock) out.push({ item: String(p.restock), qty: 1, cat: 'Office', kind: 'report' });
  /* Medications given on a call: replace what went out, so a purchase.

     Read from `medsJson`, which carries the quantity as a number. `meds` is the
     readable cell a person skims on the Post-Call tab, and taking the count off
     the end of it by string surgery is how this list ended up with an item
     named "Epinephrine auto-injector 0.3 mg x2" at quantity one. The old field
     is still honoured for a page cached from before this shipped. */
  if (p.medsJson) {
    var meds;
    try { meds = JSON.parse(p.medsJson); } catch (err) { meds = []; }
    if (Array.isArray(meds)) meds.forEach(function (m) {
      if (m && m.n) out.push({ item: String(m.n), qty: Number(m.q) || 1,
                               cat: 'Medication', kind: 'buy', where: '' });
    });
  } else if (p.meds) {
    String(p.meds).split(' | ').forEach(function (m) {
      if (m) out.push({ item: m, qty: 1, cat: 'Medication', kind: 'buy', where: '' });
    });
  }
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

  /* A BUY is one line however many bags asked for it — six gauze is six gauze,
     and the places are context. A REPORT is one line PER PLACE: "eyewash missing
     from Jumpkit A" and "eyewash missing from Jumpkit D" are two cupboards to go
     and open, and merging them is how three people reporting eyewash from three
     different bags became a single row naming only the last one. Whoever
     restocked that bag ticked it off and the other two stayed empty, with
     nothing left in the file to say they had ever been reported.

     This is the same rule the site itself uses when it builds its own copy of
     this list, and the two have to match or one submission produces different
     work depending on who is looking. */
  var keyOf = function (kind, item, place) {
    return (kind === 'report' ? 'report' : 'buy') + '\u0001' + String(item) +
           (kind === 'report' ? '\u0001' + String(place || '') : '');
  };
  var index = {};
  for (var i = 0; i < existing.length; i++)
    index[keyOf(existing[i][9], existing[i][1], existing[i][7])] = i + 2;

  var fresh = [];
  wants.forEach(function (w) {
    var kind = w.kind || 'buy';
    // A want can name its own place (a post-call names the bag the item came out
    // of); everything else belongs to the subject of the check.
    var place = (w.where === undefined || w.where === null) ? where : String(w.where);
    var ix = keyOf(kind, w.item, place);
    var atRow = index[ix];
    if (atRow > 0) {
      var wasDone = sh.getRange(atRow, 1).getValue() === true;
      var qty = Number(sh.getRange(atRow, 4).getValue()) || 0;
      var times = Number(sh.getRange(atRow, 5).getValue()) || 0;
      sh.getRange(atRow, 1).setValue(false);
      sh.getRange(atRow, 4).setValue(wasDone ? w.qty : qty + w.qty);
      sh.getRange(atRow, 5).setValue(wasDone ? 1 : times + 1);
      if (wasDone) sh.getRange(atRow, 6).setValue(when);
      sh.getRange(atRow, 7).setValue(when);
      // Every place that has asked, not only the last one to ask. A buy row
      // covering four bags has to say four bags, or the shopping is right and
      // the putting-away is wrong.
      sh.getRange(atRow, 8).setValue(
        wasDone ? place : addPlace(sh.getRange(atRow, 8).getValue(), place));
      sh.getRange(atRow, 9).setValue(who);
      sh.getRange(atRow, 10).setValue(kind);
    } else {
      fresh.push([false, w.item, w.cat, w.qty, 1, when, when, place, who, kind]);
      index[ix] = -1;      // do not add the same line twice in one payload
    }
  });

  if (fresh.length) {
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, fresh.length, n).setValues(fresh);
    sh.getRange(start, 1, fresh.length, 1).insertCheckboxes();
  }
  paintRestock(sh);
}

/* Places are held in one cell as a comma-separated list, because this column is
   read by a person deciding which cupboards to walk to. Capped so a line that
   gets reported all term does not grow into an unreadable paragraph. */
function addPlace(current, place) {
  place = String(place || '').trim();
  var have = String(current || '').split(',').map(function (x) { return x.trim(); })
             .filter(function (x) { return x; });
  if (!place || have.indexOf(place) >= 0) return have.join(', ');
  have.push(place);
  if (have.length > 6) have = have.slice(have.length - 6);
  return have.join(', ');
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

  // Coerced, not just defaulted. A truncated or garbled body can carry a STRING
  // here, and a string has a length but no join — which threw out of doPost and
  // lost the whole submission. A check somebody really did must survive its own
  // payload being malformed.
  var missing = Array.isArray(p.missing) ? p.missing : [];
  var conditions = Array.isArray(p.conditions) ? p.conditions : [];
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
  // Only the bike check carries these; the jumpkit tab has neither column.
  if (!isJk) row = row.concat([p.bikeId || '', p.statusClass || '']);

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
  // The row is written by this point, so a fault in either of these costs a
  // derived view and never the submission itself.
  try { noteBikeConcerns(p); } catch (err) { logError('bike concerns: ' + err, JSON.stringify(p)); }
  try { saveBikeExpiry(p); }  catch (err) { logError('bike expiry: ' + err, JSON.stringify(p)); }
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

/* The bike kit's shopping list, in the same shape the site already knows how to
   draw. It has no category, quantity or kind of its own — a bike check reports
   that something is missing, which is a report, never a counted purchase. */
function bikeRestockRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BIKE_RESTOCK.name);
  if (!sh || sh.getLastRow() < 2) return [];
  var tz = Session.getScriptTimeZone();
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  return sh.getRange(2, 1, sh.getLastRow() - 1, BIKE_RESTOCK.headers.length).getValues()
    .filter(function (r) { return String(r[1] || '').trim() !== ''; })
    .map(function (r) {
      return { got: r[0] === true, item: String(r[1]), cat: 'Equipment',
               qty: 1, times: Number(r[2]) || 1,
               first: asDate(r[3]), last: asDate(r[4]),
               where: String(r[5] || ''), who: String(r[6] || ''), kind: 'report' };
    });
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
/* Addresses that may always publish, for BOTH sites, whatever the People lists
   say. This is the way back in when a list is empty or wrong — without it there
   is a bootstrap trap: nobody can publish the People list until they are on the
   People list, and a site whose list has never been published has no way to get
   a first one.

   The club account is hardcoded because it is a shared account rather than a
   person, so it survives every handover. Real people are added through the
   ROOT_MANAGERS script property instead of this line, because this file is in a
   public repo and a student's address does not belong in it.

   To add yourself: Apps Script ▸ Project Settings ▸ Script Properties ▸
   Add script property, name ROOT_MANAGERS, value a comma-separated list of
   addresses. Nothing needs redeploying — properties are read live. */
var MANAGER_EMAILS = ['bikecmuems@gmail.com'];

/* The OAuth client both sites sign in with. Kept HERE, in the file, rather than
   in a script property.

   It used to be read from a CLIENT_ID property, and that property had drifted to
   a different client than the sites actually use. The effect was total and
   invisible: every publish, from every account, on both sites, was refused —
   because the token was real, the address was real, and only the audience field
   disagreed. Nothing said so, and it looked exactly like an access-list problem,
   which is where the time went.

   A property that must match a value in another file is a thing that can drift.
   This cannot: the constant sits beside the code that uses it and matches
   GOOGLE_CLIENT_ID in both sites' index.html. It is not a secret either — it
   ships in the page source of a public site by design.

   Verify with: the value below must equal GOOGLE_CLIENT_ID in ems-ops and
   bike-ops index.html. All three are the same string. */
var OAUTH_CLIENT_ID = '56106295898-0if2a9uvtsl0815n3hgtdpph93goq0ck.apps.googleusercontent.com';

function rootManagers() {
  var out = MANAGER_EMAILS.map(function (e) { return String(e).toLowerCase(); });
  var extra = PropertiesService.getScriptProperties().getProperty('ROOT_MANAGERS') || '';
  String(extra).split(',').forEach(function (e) {
    e = String(e).trim().toLowerCase();
    if (e && out.indexOf(e) < 0) out.push(e);
  });
  return out;
}

/* Checks a Google ID token WITH Google, and says why when it says no.

   The reason matters more than it looks. A refused publish is invisible from the
   browser — the reply to a no-cors POST cannot be read — so all the site can say
   is "the server copy does not match yet". Every distinct cause below produces
   that same sentence, and they need completely different fixes: sign in again,
   correct a script property, or add somebody to People. Guessing between them
   from the outside is exactly the loop this is here to end. The answer is written
   to the Errors tab of this spreadsheet by whoever calls this. */
function verifyToken(idToken, clientId) {
  if (!idToken) return { email: '', why: 'no Google sign-in was sent with the request, and no publish key either' };
  try {
    var r = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200)
      return { email: '', why: 'Google refused the sign-in token (HTTP ' + r.getResponseCode() +
                               '). Almost always: it has expired. Sign in again on the site.' };
    var c = JSON.parse(r.getContentText());
    if (clientId && c.aud !== clientId)
      return { email: '', why: 'the token was issued for OAuth client "' + c.aud + '" but this ' +
                               'script expects "' + clientId + '". The two sites and OAUTH_CLIENT_ID ' +
                               'near the top of this file must all name the same client — copy the ' +
                               'value out of GOOGLE_CLIENT_ID in the sites and paste it there.' };
    if (String(c.email_verified) !== 'true')
      return { email: '', why: 'Google does not report ' + (c.email || 'that address') + ' as verified' };
    return { email: String(c.email || '').toLowerCase(), why: '' };
  } catch (err) {
    return { email: '', why: 'could not reach Google to check the token: ' + err };
  }
}

// Kept for callers that only want the address.
function verifiedEmail(idToken, clientId) {
  return verifyToken(idToken, clientId).email;
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

// Pulls every address out of one site's access object, whichever shape it is in.
function addressesIn(access) {
  var c = access || {}, out = [];
  // `officers` is the list; `officer` is the single-address shape it replaced,
  // and is still read so an older published copy keeps working.
  (c.officers || []).forEach(function (e) { out.push(String(e).toLowerCase()); });
  if (c.officer) out.push(String(c.officer).toLowerCase());
  (c.people || []).forEach(function (x) {
    if (x && x.email) out.push(String(x.email).toLowerCase());
  });
  return out;
}

/* Every address allowed to publish for one site.

   Three sources, and the third is what stops a site being unable to get started.

   A site's own People list can only authorise a publish once it EXISTS, and it
   only comes to exist by being published. So a site whose copy has never been
   written could be edited by nobody except the one hardcoded club account, and
   the actual answer to "who runs this" was "go and find the shared password" —
   which is the thing the whole access list is meant to replace.

   So an Operations Officer may publish either site. That is not a special case
   bolted on; it is the org chart. The Operations Officer runs the agency, the
   bike program sits under it, and an officer can already publish the operations
   content that names the officers — so this grants nothing to somebody who was
   not already trusted at the top. It means appointing people happens in one
   place, through the site, and the bike program never needs its own password. */
function allowedFor(site) {
  var allowed = rootManagers();
  var own = readContent(site);
  allowed = allowed.concat(addressesIn(own && own.content && own.content.access));

  if (site !== 'ops') {
    var ops = readContent('ops');
    var opsAccess = (ops && ops.content && ops.content.access) || {};
    // Officers only, not every manager: an Equipment Manager has no business in
    // the bike program's content, and this list is what an appointment means.
    (opsAccess.officers || []).forEach(function (e) { allowed.push(String(e).toLowerCase()); });
    if (opsAccess.officer) allowed.push(String(opsAccess.officer).toLowerCase());
    // Bike Managers appointed on the operations People screen. Added to the bike
    // site's own list rather than replacing it, so somebody already added over
    // there keeps working and there is nothing to migrate.
    (opsAccess.bikeManagers || []).forEach(function (e) { allowed.push(String(e).toLowerCase()); });
  }
  return allowed;
}

/* Returns {name, why}. `name` is who to record, or '' for refused with `why`
   saying which of the several very different causes it was. */
function writerCheck(p) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('PUBLISH_KEY');
  if (key && p.key && String(p.key) === String(key)) return { name: 'publish key', why: '' };

  // The constant, not a script property. A property that has to match a value in
  // another file is a thing that can drift, and when it drifted every publish on
  // both sites was refused with nothing on screen to say why.
  var v = verifyToken(p.idToken, OAUTH_CLIENT_ID);
  if (!v.email) return { name: '', why: v.why };

  var site = siteOf(p);
  var allowed = allowedFor(site);
  if (allowed.indexOf(v.email) < 0) {
    // The commonest real case, and the one whose fix is least obvious: the list
    // for THIS site is empty because this site has never published, so only the
    // root account can get in and start it off.
    var stored = readContent(site);
    return { name: '', why: 'signed in as ' + v.email + ', which is not on the ' + site +
      ' access list. That list currently allows: ' + allowed.join(', ') + '.' +
      (stored ? '' : ' The ' + site + ' site has never published, so its People list does not ' +
                     'exist yet and only the root account can start it off.') };
  }
  return { name: v.email, why: '' };
}

function writerName(p) { return writerCheck(p).name; }

function saveContent(p) {
  var c = writerCheck(p);
  var site = siteOf(p);
  if (!c.name) {
    // Written where it can actually be read. The browser cannot see this reply,
    // so without this the only symptom is "the server copy does not match yet",
    // which is the same sentence for every possible cause.
    logError('Publish REFUSED for the ' + site + ' site: ' + c.why, '');
    return json({ ok: false, error: 'not allowed: ' + c.why });
  }
  /* MERGED PER KEY, not replaced wholesale.

     Publishing used to overwrite the stored copy entire, so two managers
     working at once silently destroyed each other: the Office Manager edits
     room checklists on her phone, the officer edits People on hers, and
     whichever publishes second wipes the first person's work with nothing said.

     A device now sends only the keys it actually changed (see contentPayload),
     and those are laid over what is stored. Two people editing DIFFERENT things
     no longer collide at all. Two editing the SAME key still resolve
     last-writer-wins, which is unavoidable without a real merge — but that is
     one key, not the whole document. */
  var props = PropertiesService.getScriptProperties();
  var prevRaw = props.getProperty(contentKey(site));
  var merged = {};
  if (prevRaw) {
    try {
      var prev = JSON.parse(prevRaw);
      if (prev && prev.content && typeof prev.content === 'object') merged = prev.content;
    } catch (err) { merged = {}; }
  }
  var incoming = p.content || {};
  Object.keys(incoming).forEach(function (k) { merged[k] = incoming[k]; });
  props.setProperty(contentKey(site),
    JSON.stringify({ at: Date.now(), by: c.name, content: merged }));
  // Successes go to the execution log only. Auto-save publishes whenever an edit
  // settles, so putting those in the Errors tab would bury the refusals that
  // actually need reading.
  console.log('Publish accepted for the ' + site + ' site, by ' + c.name);
  return json({ ok: true, saved: true, site: site });
}

// ---- Restock, read and tick ------------------------------------------------
// The sheet is the shopping list of record: every device's submissions land in
// it, where the site's own To Get only ever saw what that one browser filed.
// These two let the site show the real list and tick it off from a phone.

/* Every room check filed, grouped by duty period and room.

   This exists because the tracker cannot be built from synced content. Filing a
   form needs no sign-in — that is why members can file at all — but PUBLISHING
   shared content needs a manager token, so a member's room check reached the
   spreadsheet and never reached anybody else's tracker. The Office Manager would
   open it and see only what she had filed herself, and rooms already done would
   read as outstanding.

   The sheet is the one place every filing lands regardless of who filed it, so
   the sheet is what the tracker reads.

   Keyed on `Room ID` and `DP Key`, never on the display columns beside them: a
   renamed room would otherwise detach every check filed under its old name.
   Rows written before those columns existed are skipped rather than guessed at.

   `sid` rides along so the site can tell its own just-filed check apart from the
   copy that has come back, instead of counting one filing twice. */
function dutyPeriodRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS['Room Checks'].name);
  if (!sh || sh.getLastRow() < 2) return {};
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var cDp = head.indexOf('DP Key'), cRoom = head.indexOf('Room ID');
  var cCs = head.indexOf('Call Sign'), cSid = head.indexOf('Submission ID');
  var cDate = head.indexOf('Date');
  if (cDp < 0 || cRoom < 0) return {};          // sheet predates these columns
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  var out = {};
  rows.forEach(function (r) {
    var dp = String(r[cDp] || '').trim();
    var room = String(r[cRoom] || '').trim();
    if (!dp || !room) return;
    if (!out[dp]) out[dp] = {};
    if (!out[dp][room]) out[dp][room] = [];
    out[dp][room].push({
      cs:   cCs  >= 0 ? String(r[cCs]  || '').trim() : '',
      sid:  cSid >= 0 ? String(r[cSid] || '').trim() : '',
      date: cDate >= 0 ? String(r[cDate] || '').trim() : ''
    });
  });
  return out;
}

function restockRows(site) {
  if (site === 'bike') return bikeRestockRows();
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
               where: String(r[7] || ''), who: String(r[8] || ''),
               // Rows written before this column existed read as purchases,
               // which is what the list meant when they were filed.
               kind: String(r[9] || 'buy') };
    });
}

function setRestockGot(p) {
  var c = writerCheck(p);
  var who = c.name;
  if (!who) {
    /* Written where somebody can actually read it. The browser cannot see this
       reply through no-cors, so a refused tick had no trace anywhere at all:
       the item ticked, untucked itself a second later when the list was read
       back, and there was nothing on the page or in the file saying why. The
       reason is almost always "signed out", which is a thirty-second fix once
       you know that is what it is. */
    logError('Restock tick REFUSED for the ' + siteOf(p) + ' site: ' + c.why,
             String(p.item || ''));
    return json({ ok: false, error: 'not allowed: ' + c.why });
  }
  /* Two lists, the same act. The bike kit is shopped for from its own tab, and
     it had no way to tick anything off at all — the list was written and never
     read back, so it only ever grew. */
  var site = siteOf(p);
  var conf = site === 'bike' ? BIKE_RESTOCK : RESTOCK;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(conf.name);
  if (!sh) return json({ ok: false, error: 'no restock tab' });
  var last = sh.getLastRow();
  if (last < 2) return json({ ok: false, error: 'nothing to tick' });
  if (site === 'bike') {
    // Bike Restock is Got | Item | Times Asked | First | Last | Where | Who
    var brows = sh.getRange(2, 1, last - 1, BIKE_RESTOCK.headers.length).getValues();
    for (var b = 0; b < brows.length; b++) {
      if (String(brows[b][1]) !== String(p.item)) continue;
      sh.getRange(b + 2, 1).setValue(p.got === true);
      logAction('bike', who, p.got === true ? 'Restocked' : 'Put back on the list',
                String(brows[b][1]), String(brows[b][5] || ''));
      paintBikeRestock(sh);
      return json({ ok: true, set: true });
    }
    logError('Restock tick found no bike row to set', String(p.item || ''));
    return json({ ok: false, error: 'not found' });
  }
  /* Matched on item AND place, which together are what addToRestock indexes on
     — anything reported on a check is one line per place, so several rows can
     share an item name and ticking by name alone closed whichever came first.
     Not the row number: a sort or an inserted row would tick the wrong thing.

     `where` absent from the payload means an older page: fall back to the first
     row with that item, which is the behaviour it expects. */
  var rows = sh.getRange(2, 1, last - 1, RESTOCK.headers.length).getValues();
  var want = (p.where === undefined || p.where === null) ? null : String(p.where);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]) !== String(p.item)) continue;
    if (want !== null && String(rows[i][7] || '') !== want) continue;
    sh.getRange(i + 2, 1).setValue(p.got === true);
    logAction('ops', who, p.got === true ? 'Restocked' : 'Put back on the list',
              String(rows[i][1]), String(rows[i][7] || ''));
    paintRestock(sh);
    return json({ ok: true, set: true });
  }
  logError('Restock tick found no row to set for item/place',
           String(p.item || '') + ' | ' + String(p.where === undefined ? '(no place sent)' : p.where));
  return json({ ok: false, error: 'not found' });
}

/* When was each kit last gone through, according to everybody rather than
   according to this phone.

   The site keeps `DB.lastChecked` locally and merges it on the CONTENT publish
   path — which only a manager can write. So a member filing a full contents
   check stamped their own device and nobody else's, and the answer to "has
   anyone been through Jumpkit C this month" was different on every phone that
   asked. That is the same fault the readiness board and the expiry dates were
   both fixed for, still living in one more place.

   Derived here from the rows themselves, which every member can write. Keyed by
   Bag ID where the row has one, because that is the id the site picks by; the
   printed Bag name is the fallback for rows filed before that column existed.
   Newest wins. */
function lastCheckedRows() {
  var conf = SHEETS['Bag Checks'];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(conf.name);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var tz = Session.getScriptTimeZone();
  var iDate = conf.keys.indexOf('date'), iName = conf.keys.indexOf('name');
  var iSubj = conf.keys.indexOf('subject'), iBag = conf.keys.indexOf('bagId');
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, conf.headers.length).getValues();
  rows.forEach(function (r) {
    var raw = r[iDate];
    if (!raw) return;
    var day = (raw instanceof Date) ? Utilities.formatDate(raw, tz, 'yyyy-MM-dd') : String(raw);
    var key = String(r[iBag] || '').trim() || String(r[iSubj] || '').trim();
    if (!key || !day) return;
    if (!out[key] || out[key].on < day) out[key] = { on: day, by: String(r[iName] || '').trim() };
  });
  return out;
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

/* ============================================================================
   ACTIVITY — the raw trail, read rather than recorded
   ============================================================================
   Every submission already lands as a row carrying a date, a time, who filed it
   and what it was about. Nothing has ever needed storing for this: the records
   exist across seven tabs and no view reads ACROSS them, so "who has actually
   been opening Jumpkit C, and when" meant opening the file and scrolling seven
   times.

   So this is a query, never a write. No tab of its own, no column of its own,
   nothing that can drift out of step with the rows it describes — which is the
   fault this file has had to be corrected for repeatedly, in the shape of one
   fact derived two ways.

   Note the difference from the Actions ledger. That records a DECISION somebody
   made — resolved, restocked — which exists nowhere else and therefore has to be
   written down. This records SUBMISSIONS, which are already written down. */

/* One row's worth of trail, whatever form it came off.
   `kind` is 'check' for a checklist, 'usage' for something consumed on a call,
   'report' for a problem filed directly. `summary` is derived at read time from
   fields the row already carries. */
function activitySpec(site) {
  if (site === 'bike') return [
    { form: 'Bike Jumpkit Check', conf: BIKE_SHEETS.jumpkit, kind: 'check',
      iDate:0, iTime:1, iWho:2, iAndrew:3, iSubject:4, iResult:6, iMissing:7, iNotes:11 },
    { form: 'Bike Safety Check', conf: BIKE_SHEETS.safety, kind: 'check',
      iDate:0, iTime:1, iWho:2, iAndrew:3, iSubject:4, iResult:5, iMissing:6, iNotes:10 }
  ];
  return [
    { form: 'Checkout',    conf: SHEETS['Checkouts'],   kind: 'check',
      iDate:0, iTime:1, iWho:2, iAndrew:3, iSubject:5, iResult:6, iMissing:7, iNotes:10 },
    { form: 'Contents check', conf: SHEETS['Bag Checks'], kind: 'check',
      iDate:0, iTime:1, iWho:2, iAndrew:3, iSubject:4, iResult:5, iMissing:6, iNotes:-1 },
    { form: 'Room check',  conf: SHEETS['Room Checks'], kind: 'check',
      iDate:0, iTime:1, iWho:2, iAndrew:3, iSubject:4, iResult:5, iMissing:6, iNotes:9 },
    /* A post-call has no subject column, but it knows which bags were opened —
       `usageJson` carries the unit each item came out of. Resolved to bag names
       below, so "what has Jumpkit C actually been used for" is answerable. That
       is the whole question this screen exists for; leaving it as a bare
       "on a call" would have made the usage rows the one thing you could not
       filter by kit. */
    { form: 'Post-call',   conf: SHEETS['Post-Call'],   kind: 'usage',
      iDate:0, iTime:1, iWho:2, iAndrew:-1, iSubject:-1, iResult:4, iMissing:-1, iNotes:6,
      iUsage:8 },
    { form: 'Report',      conf: SHEETS['Reports'],     kind: 'report',
      iDate:0, iTime:1, iWho:2, iAndrew:-1, iSubject:6, iResult:-1, iMissing:-1, iNotes:5 }
  ];
}

/* Everything filed, newest first.

   Paged on the server. A term across both sites runs to thousands of rows, and
   answering with all of them would make the view slower every week it is used —
   so `offset` and `limit` cut the page here and `more` says whether to ask
   again. Sorting happens before the cut, or page two would not follow page one. */
function activityRows(site, sinceDay, offset, limit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var map = nameMap(), units = map.units || {};
  var asDate = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v);
  };
  var asTime = function (v) {
    if (!v) return '';
    return (v instanceof Date) ? Utilities.formatDate(v, tz, 'HH:mm') : String(v);
  };
  var cell = function (r, i) { return i >= 0 && i < r.length ? r[i] : ''; };

  var out = [];
  activitySpec(site).forEach(function (spec) {
    var sh = ss.getSheetByName(spec.conf.name);
    if (!sh || sh.getLastRow() < 2) return;
    var width = spec.conf.headers.length;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
    vals.forEach(function (r) {
      var date = asDate(cell(r, spec.iDate));
      // A row with no date cannot be placed on a timeline. Skipped rather than
      // dropped at the top or the bottom, where it would read as recent.
      if (!date) return;
      if (sinceDay && date < sinceDay) return;

      var who = String(cell(r, spec.iWho) || '').trim();
      var subject = String(cell(r, spec.iSubject) || '').trim();
      var missing = Number(cell(r, spec.iMissing)) || 0;
      var result = String(cell(r, spec.iResult) || '').trim();
      var notes = String(cell(r, spec.iNotes) || '').trim();

      /* The one line that says what happened, built from what the row already
         holds. A count of what was missing is the most useful thing about a
         check; for a post-call it is what came out of the bag. */
      var summary;
      if (spec.kind === 'usage') {
        summary = notes ? notes.split('\n').join(', ') : (result || 'Nothing logged');
      } else if (spec.kind === 'report') {
        summary = String(cell(r, 5) || '').trim() || 'Reported a problem';
      } else {
        summary = missing > 0 ? (missing + ' missing') : (result || 'Complete');
        if (notes) summary += ' \u00b7 ' + notes.split('\n')[0];
      }

      /* Which bags a post-call opened. Names, not ids, and deduped — one call
         that takes two things out of one jumpkit is one bag.

         Sent as a LIST as well as a readable string. A call that opened two bags
         reads "Jumpkit A, Jumpkit B", and filtering the Activity screen to
         "Jumpkit A" compared against that whole string — so the calls that used
         the most equipment were exactly the ones the kit filter could not
         find. The string is for the eye; the list is what the filter asks. */
      var kits = subject ? [subject] : [];
      if (spec.kind === 'usage' && spec.iUsage >= 0) {
        var raw = cell(r, spec.iUsage), seenU = {}, names = [];
        if (raw) {
          var list;
          try { list = JSON.parse(raw); } catch (err) { list = []; }
          if (Array.isArray(list)) list.forEach(function (u) {
            if (!u || !u.f) return;
            var nm = units[u.f] || u.f;
            if (!seenU[nm]) { seenU[nm] = 1; names.push(nm); }
          });
        }
        kits = names;
      }

      out.push({ date: date, time: asTime(cell(r, spec.iTime)), who: who,
                 andrew: String(cell(r, spec.iAndrew) || '').trim(),
                 site: site === 'bike' ? 'bike' : 'ops',
                 form: spec.form, kind: spec.kind,
                 subject: kits.join(', '), subjects: kits,
                 missing: missing, summary: summary });
    });
  });

  out.sort(function (a, b) {
    return (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time);
  });

  var start = Math.max(0, Number(offset) || 0);
  var take = Math.min(Math.max(Number(limit) || 60, 1), 200);
  return { rows: out.slice(start, start + take), total: out.length,
           offset: start, more: start + take < out.length };
}

function collectReport(period) {
  var since = periodStartMs(period);
  var used = {}, calls = {}, concerns = [];

  var callCount = 0;
  var pc = rowsSince('Post-Call', since);
  if (pc.rows.length) {
    var iJson = pc.cols.indexOf('usageJson'), iCall = pc.cols.indexOf('callnum');
    var unnumbered = 0;
    pc.rows.forEach(function (r) {
      /* A post-call form IS a call. The call number only decides whether two
         forms describe the SAME one — two people filing for one call is one
         call. Counting only the rows that carried a number meant a form filed
         without one vanished from the count entirely, so the report said fewer
         calls than the tab plainly showed. */
      if (r[iCall]) calls[String(r[iCall])] = 1; else unnumbered++;
      if (!r[iJson]) return;
      var list;
      try { list = JSON.parse(r[iJson]); } catch (err) { return; }
      list.forEach(function (u) {
        var e = used[u.i] || (used[u.i] = { qty: 0, from: {} });
        e.qty += Number(u.q) || 0;
        e.from[u.f] = (e.from[u.f] || 0) + (Number(u.q) || 0);
      });
    });
    callCount = Object.keys(calls).length + unnumbered;
  }

  /* Concerns come from the Concerns tab, which is the one place every problem
     lands however it was raised.

     This used to re-read a handful of raw form columns — a Report's free text, a
     room check's maintenance note, an expired item, a checkout's damage note —
     which is a THIRD way of deciding what a problem is, alongside the site's and
     noteConcerns'. It missed everything those two file and this one did not:
     every unticked box, every restock request, every note on a check, every bag
     used on a call. A week in which five things were reported showed a report
     saying nothing had been.

     Dates on that tab are yyyy-MM-dd strings, so the period cut is made on the
     same shape rather than by parsing back into a Date. */
  var sinceDay = Utilities.formatDate(new Date(since), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  concernRows('ops').forEach(function (c) {
    var day = String(c.last || c.first || '');
    if (day && day < sinceDay) return;
    concerns.push({ what: c.what, where: c.where, urgency: c.urgency || 'Soon',
                    by: c.by || '', times: c.times || 1, resolved: !!c.resolved,
                    source: 'Concerns' });
  });

  return { period: period, since: since, used: used, concerns: concerns,
           calls: callCount, actions: actionRows('ops', sinceDay) };
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
  if (p.activity) {
    var aSince = p.since && /^\d{4}-\d{2}-\d{2}$/.test(String(p.since)) ? String(p.since) : '';
    var a = activityRows(siteOf(p), aSince, p.offset, p.limit);
    return json({ ok: true, site: siteOf(p), activity: a.rows, total: a.total,
                  offset: a.offset, more: a.more });
  }
  if (p.restock) {
    return json({ ok: true, restock: restockRows(siteOf(p)) });
  }
  if (p.dp) {
    return json({ ok: true, dp: dutyPeriodRows() });
  }
  /* Everything a view needs that has to aggregate across people, in one call.
     Three round trips from a phone on campus wifi is three chances to time out
     on one screen. */
  if (p.filed) {
    return json(findFiled(String(p.filed)));
  }
  if (p.state) {
    var st = siteOf(p);
    var o = { ok: true, site: st, concerns: concernRows(st), expiry: expiryRows(st) };
    // Only the bike site has a fleet whose status is derived from checks.
    if (st === 'bike') o.checks = bikeCheckRows();
    else o.lastChecked = lastCheckedRows();
    return json(o);
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
  // It also reads `rows`, for the tab belonging to the form it is asking about.
  // Without this it printed "undefined rows", which reads as a broken connection
  // when the connection is fine.
  var askedFor = BIKE_SHEETS[p.form] ? BIKE_SHEETS[p.form].name
               : (SHEETS[p.form] ? SHEETS[p.form].name : null);
  if (askedFor) {
    var asked = ss.getSheetByName(askedFor);
    out.rows = asked ? Math.max(0, asked.getLastRow() - 1) : 0;
    out.sheetTab = askedFor;
  } else {
    // No form named: report the whole file rather than a number about nothing.
    out.rows = Object.keys(out.tabs).reduce(function (n, k) { return n + out.tabs[k]; }, 0);
  }
  var rs = ss.getSheetByName(RESTOCK.name);
  out.restock = rs ? Math.max(0, rs.getLastRow() - 1) : 0;
  var brs = ss.getSheetByName(BIKE_RESTOCK.name);
  out.bikeRestock = brs ? Math.max(0, brs.getLastRow() - 1) : 0;
  return json(out);
}

/* headers, keys and widths are three parallel lists, and adding a column to two
   of them is silent: every value after the gap lands one place left, which reads
   as somebody typing the sheet wrong rather than as a bug. Checked here, and
   again at the top of tidyUp, so a mistake shows up the moment it is pasted
   instead of the next time somebody files a check. */
function checkTabShapes() {
  var bad = [];
  [SHEETS, BIKE_SHEETS].forEach(function (group) {
    Object.keys(group).forEach(function (k) {
      var c = group[k];
      // The bike tabs build their row in writeBikeRow rather than from a key
      // list, so `keys` is absent there and its absence is not a fault.
      if (c.keys && c.headers.length !== c.keys.length)
        bad.push(c.name + ': ' + c.headers.length + ' headers vs ' + c.keys.length + ' keys');
      if (c.widths && c.headers.length !== c.widths.length)
        bad.push(c.name + ': ' + c.headers.length + ' headers vs ' + c.widths.length + ' widths');
    });
  });
  [RESTOCK, BIKE_RESTOCK, ITEMS, EXPIRY, CONCERNS].forEach(function (c) {
    if (c.widths && c.headers.length !== c.widths.length)
      bad.push(c.name + ': ' + c.headers.length + ' headers vs ' + c.widths.length + ' widths');
  });
  return bad;
}

// Run by hand (Run ▸ tidyUp) after pasting an updated script: reformats every
// tab that already exists and repaints the restock list.
/* The order the tabs sit in, left to right. Grouped by whose job it is rather
   than by when they happen to get created, so the file reads as a table of
   contents: the operations forms, then the bike forms, then the two worklists,
   then the machinery nobody opens by choice. */
/* Checkouts first and Restock second: the two anybody actually opens the file
   to read. Moved with moveActiveSheet, which reorders without touching a row. */
var TAB_ORDER = ['Checkouts', 'Restock', 'Room Checks', 'Bag Checks', 'Post-Call',
                 'Reports', 'Concerns', 'Expiry',
                 'Bike Jumpkit Checks', 'Bike Safety Checks',
                 'Bike Restock', 'Actions', 'Items'];

/* Run by hand (Run ▸ tidyUp) after pasting an updated script.

   Builds EVERY tab, rather than letting each one appear the first time somebody
   happens to submit that form. A file that grows tabs as it goes gives no way to
   tell "nobody has filed a room check yet" from "room checks are not set up" —
   and the second is the one worth worrying about. An empty tab with its headers
   in place answers that question by existing.

   Safe to run as often as you like: every step below either finds the tab and
   reformats it, or creates it. Nothing is cleared. */
function tidyUp() {
  var shape = checkTabShapes();
  if (shape.length)
    throw new Error('This script has a tab defined wrongly and would misalign a ' +
                    'column. Fix it before running: ' + shape.join('; '));
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
  [ [ensureExpiry(), EXPIRY], [ensureConcerns(), CONCERNS],
    [ensureActions(), ACTIONS] ].forEach(function (pair) {
    var sh = pair[0], conf = pair[1];
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, conf.headers.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#ffffff');
    conf.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  });

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
