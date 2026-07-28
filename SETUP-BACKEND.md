# Connecting the site to a spreadsheet

Right now every form on the site works, but nothing is stored anywhere except the
phone that filled it in. This document is how you fix that. It takes about
twenty minutes and you only do it once.

You will end up with **one Google Sheet** holding **one tab per form** —
Room Checks, Bag Checks, Post-Call, Post-Shift and Reports side by side in the
same file, which is what makes it possible to write a formula across Equipment
and Office data.

---

## 0. Before you start

**Make the shared account first.** Everything below should be owned by an
account the next Operations Officer can be handed, not by a personal Andrew
account — otherwise the whole system leaves with whoever set it up.

Create `cmuemsoperations@gmail.com` (or whatever name you settle on) yourself, in
a browser. **This is not something Claude can do for you** — creating accounts
and entering passwords is off-limits, and there is no Google credential in this
environment anyway. Sign in as that account before step 1, and stay signed in as
that account the whole way through.

While you are there: turn on 2-factor auth, and write the recovery details
somewhere the org will still have them in two years.

### If you cannot make the account yet

Google rate-limits account creation per phone number, and the limit resets on its
own after a while. If you are stuck against it, **use `bikecmuems@gmail.com` in
the meantime.** It is already a shared organisation account rather than a
personal one, which is the property that matters — the system does not walk out
of the door with whoever set it up.

Do the rest of this document signed in as the bike account, and make a
**separate** spreadsheet for ops rather than adding tabs to either bike file.
Keeping them as distinct files is what makes the handover a one-click ownership
transfer later.

Two things to know about the interim arrangement:

- **Whoever holds the bike account can read every ops submission.** That account
  gets handed to the next Bike Manager. This is a role-boundary problem rather
  than a security one, but it is the kind of thing nobody notices until a
  handover — so move off it when you can, and mention it to the Ops Officer in
  the meantime.
- **Migrating later is cheap, and nothing printed changes.** The QR codes encode
  the *site* address (`sonnnnnion.github.io/ems-ops/#room-check`), never the
  Apps Script address, so stickers already on the wall keep working. To move:
  transfer ownership of the ops spreadsheet in Drive (the bound script goes with
  it), have the new owner **Deploy ▸ New deployment**, then paste the new `/exec`
  URL into Site Settings. One field.

---

## 1. Make the spreadsheet

1. Signed in as the ops account, go to <https://sheets.new>.
2. Name it **CMU EMS Operations Data**.
3. That is all. Do not create any tabs — the script creates each one the first
   time a form of that type is submitted, with the right header row.

Copy the URL out of the address bar and keep it; you will paste it into the site
at the end so managers get an "Open the spreadsheet" button.

---

## 2. Add the script

1. In that spreadsheet: **Extensions ▸ Apps Script**.
2. Delete whatever is in `Code.gs`.
3. Paste **all** of the code in §6 below.

   > There is a trap here worth naming, because it has cost time before. If your
   > paste starts one line late and drops the first line of a `/** … */` block
   > comment, everything underneath it gets parsed as code and you get a
   > `SyntaxError: Unexpected token '*'` on line 1. The script below therefore
   > uses only `//` comments, so a short paste is merely a missing comment, not a
   > broken file.

4. **Save** (the disk icon).

---

## 3. Deploy it

1. **Deploy ▸ New deployment**.
2. Click the gear next to "Select type" and pick **Web app**.
3. Fill in:
   - **Description**: `ops forms v1`
   - **Execute as**: **Me** (the ops account)
   - **Who has access**: **Anyone** ← this one matters
4. **Deploy**. Authorise when Google asks; you will get an "unverified app"
   warning because you wrote it — **Advanced ▸ Go to (unsafe)** is expected here.
5. Copy the **Web app URL**. It ends in `/exec`.

**"Who has access" must be "Anyone".** If it is set to "Anyone with a Google
account", members get a sign-in wall instead of a submission, and — because
Google's error pages carry no CORS headers — the browser reports it as a generic
"Failed to fetch" rather than telling you what actually went wrong.

---

## 4. Point the site at it

1. Open the site, press **Manager** in the top bar, pick your role.
2. Go to **Site Settings**.
3. Paste the **Web app URL** into the first box and the **spreadsheet URL** into
   the second.
4. **Save**, then **Test connection**.

`Test connection` does a `GET`, which the browser is allowed to read, so it is
the only step here that actually proves anything:

| What you see | What it means |
|---|---|
| **Live — CMU EMS Operations Data** | Working. |
| Got a web page, not JSON | "Who has access" is not "Anyone". Redeploy. |
| Reached it, but the reply was unexpected | The script saved is older than the one in §6 — repaste and deploy a **new version**. |
| Could not reach it | Wrong URL, or the deployment was deleted. |

Then send one real submission through and confirm the row lands.

> **Why the test button has to exist:** submissions are sent with
> `mode:'no-cors'`, which makes the response unreadable by design. The site can
> tell you it sent something; it can never tell you the sheet received it. The
> `GET` ping is the only readable channel, so it is what you trust.

---

## 5. Things that will bite you later

- **The header row is written once, when the tab is created.** If you add a field
  to a form later, an existing tab will *not* grow a column for it. Delete the
  tab and let it be recreated, or add the column by hand.
- **Editing the script is not enough.** After any change you must
  **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**. Saving
  alone changes nothing that the outside world can see.
- **The URL is committed in the page** once you paste it into `DEFAULTS.api`.
  That is deliberate: when it lived only in one manager's browser, every *other*
  visitor had an empty endpoint, so their checks silently went nowhere — and the
  one person who would never notice was the manager. Site Settings still
  overrides it, so a changed URL can be fixed without a commit.
- **The endpoint is unauthenticated.** Anyone who reads the page source can find
  it and post junk to your sheet. For room checks and bag checks that is an
  acceptable trade for "a member with a phone and no account can file in ten
  seconds". Do not extend this script to store anything you would mind a stranger
  reading or writing.

---

## 6. The script

```javascript
// CMU EMS Operations — form intake.
// One spreadsheet, one tab per form. The tab is chosen by the `form` field in
// the payload, so adding a new form to the site needs no change here.
//
// Only // comments are used on purpose: a paste that starts one line late then
// costs you a comment, not a SyntaxError on line 1.

// Which payload keys become columns, in order, per form. A key that is not
// listed is ignored; a listed key that is missing writes an empty cell.
var LAYOUT = {
  'Room Checks': ['date', 'submitted', 'callsign', 'name', 'andrew', 'subject',
                  'doneCount', 'missingCount', 'done', 'missing', 'restock', 'maint'],
  'Checkouts':   ['date', 'submitted', 'callsign', 'name', 'subject',
                  'condition', 'detail'],
  'Bag Checks':  ['date', 'submitted', 'callsign', 'name', 'andrew', 'subject',
                  'doneCount', 'missingCount', 'done', 'missing', 'seal'],
  'Post-Call':   ['date', 'submitted', 'callsign', 'name', 'callnum', 'doneCount',
                  'missingCount', 'done', 'missing', 'usageText', 'usageCount',
                  'short', 'usageJson'],
  'Post-Shift':  ['date', 'submitted', 'callsign', 'name', 'doneCount',
                  'missingCount', 'done', 'missing'],
  'Reports':     ['date', 'submitted', 'callsign', 'name', 'area', 'urgency',
                  'what', 'where']
};

// Who gets the Friday email. Add the Operations Officer and the two managers.
var REPORT_TO = ['cmuemsoperations@gmail.com'];

// Human-readable column titles for the header row.
var TITLES = {
  date: 'Date', submitted: 'Submitted at', callsign: 'Call sign', name: 'Name',
  andrew: 'Andrew ID', subject: 'Room / bag', doneCount: 'Done',
  missingCount: 'Missing', done: 'Completed items', missing: 'Missing items',
  restock: 'Restock needed', maint: 'Maintenance concern', seal: 'Seal number',
  short: 'Could not replace', area: 'Area', urgency: 'Urgency',
  what: 'What is wrong', where: 'Where', condition: 'Condition at pickup',
  detail: 'Detail', callnum: 'Call number', usageText: 'Used',
  usageCount: 'Units used', usageJson: 'Used (data)'
};

function tabFor(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name);
  var cols = LAYOUT[name] || ['date', 'submitted', 'name'];
  var head = cols.map(function (c) { return TITLES[c] || c; });
  sh.appendRow(head);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

// GET is readable by the browser, so this is what the site's "Test connection"
// button calls. A POST response is opaque and can never confirm anything.
function doGet(e) {
  var out = { ok: true, sheet: SpreadsheetApp.getActiveSpreadsheet().getName(), tabs: {} };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(LAYOUT).forEach(function (n) {
    var sh = ss.getSheetByName(n);
    out.tabs[n] = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  });
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    var name = p.form;
    if (!LAYOUT[name]) name = 'Reports';           // never drop a submission
    var sh = tabFor(name);
    var row = LAYOUT[name].map(function (k) {
      var v = p[k];
      return (v === undefined || v === null) ? '' : v;
    });
    sh.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Keep the failure rather than losing the submission entirely.
    try {
      tabFor('Errors').appendRow([new Date(), String(err),
        e && e.postData ? e.postData.contents : '(no body)']);
    } catch (ignored) {}
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

---

## 7. The Friday report

This is the part the website cannot do. A web page only runs while somebody has
it open, so "email me every Friday" has to live somewhere that runs on its own —
which is Apps Script.

Paste this **below** the code in §6, in the same file.

```javascript
// ---- reporting -------------------------------------------------------------
// Sums the machine-readable usage column, NOT the human one. That column exists
// precisely because prose cannot be added up: the old Equipment Exhausted sheet
// recorded the same item as "glucose stuff", "glucose strip" and "glucometer
// strips", and the same bag as "Jumpkit E", "jumpkit" and "supervisor jumpkit",
// which is why nobody could ever produce a buy-list from it.

function periodStartMs(period) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));   // week starts Saturday
  } else if (period === 'month') {
    d.setDate(1);
  } else {
    var y = d.getFullYear(), aug = new Date(y, 7, 1);  // EMS year turns over in August
    d = (d >= aug) ? aug : new Date(y - 1, 7, 1);
  }
  return d.getTime();
}

function collect(period) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var since = periodStartMs(period);
  var used = {};      // itemId -> {qty, from:{unitId:qty}}
  var calls = {};
  var concerns = [];

  var pc = ss.getSheetByName('Post-Call');
  if (pc && pc.getLastRow() > 1) {
    var cols = LAYOUT['Post-Call'];
    var iJson = cols.indexOf('usageJson'), iSub = cols.indexOf('submitted'),
        iCall = cols.indexOf('callnum');
    var rows = pc.getRange(2, 1, pc.getLastRow() - 1, cols.length).getValues();
    rows.forEach(function (r) {
      if (new Date(r[iSub]).getTime() < since) return;
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

  // Concerns come from three places, because a member can raise one from a
  // problem report, a room check, or a checkout that found something wrong.
  [['Reports', 'what', 'where', 'urgency'],
   ['Room Checks', 'maint', 'subject', null],
   ['Checkouts', 'detail', 'subject', null]].forEach(function (spec) {
    var sh = ss.getSheetByName(spec[0]);
    if (!sh || sh.getLastRow() < 2) return;
    var cols = LAYOUT[spec[0]];
    var iw = cols.indexOf(spec[1]), il = cols.indexOf(spec[2]),
        iu = spec[3] ? cols.indexOf(spec[3]) : -1, isub = cols.indexOf('submitted');
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
    rows.forEach(function (r) {
      if (new Date(r[isub]).getTime() < since) return;
      if (!r[iw]) return;
      concerns.push({ what: r[iw], where: r[il] || '',
                      urgency: iu >= 0 ? (r[iu] || 'Whenever') : 'Soon',
                      source: spec[0] });
    });
  });

  return { period: period, since: since, used: used,
           concerns: concerns, calls: Object.keys(calls).length };
}

// Names live in the website, not here, so the sheet stays the record and the
// site stays the vocabulary. NAMES is refreshed by the site; until it has been,
// the report falls back to raw ids, which is ugly but never wrong.
function nameMap() {
  var raw = PropertiesService.getScriptProperties().getProperty('NAMES');
  if (!raw) return { items: {}, units: {} };
  try { return JSON.parse(raw); } catch (err) { return { items: {}, units: {} }; }
}

function reportText(period) {
  var d = collect(period), n = nameMap();
  var label = { week: 'weekly', month: 'monthly', ytd: 'year-to-date' }[period] || period;
  var L = ['CMU EMS Operations — ' + label + ' report',
           'Covering ' + new Date(d.since).toDateString() + ' to today', '',
           'EQUIPMENT TO BUY'];

  var ids = Object.keys(d.used).sort(function (a, b) { return d.used[b].qty - d.used[a].qty; });
  if (!ids.length) {
    L.push('  (nothing logged as used — check that post-call forms are being filled in)');
  } else {
    ids.forEach(function (id) {
      var e = d.used[id];
      var from = Object.keys(e.from).map(function (u) { return (n.units[u] || u); });
      L.push('  ' + e.qty + ' x ' + (n.items[id] || id) + '   — from ' + from.join(', '));
    });
  }

  L.push('', 'CONCERNS REPORTED (' + d.concerns.length + ')');
  if (!d.concerns.length) L.push('  (none)');
  else d.concerns.forEach(function (c) {
    L.push('  [' + c.urgency + '] ' + c.what + (c.where ? ' — ' + c.where : '') +
           '   (' + c.source + ')');
  });

  L.push('', 'Calls logged: ' + d.calls);
  L.push('', 'Full detail: https://sonnnnnion.github.io/ems-ops/#reports');
  return L.join('\n');
}

// This is the function the trigger calls. Keep the name.
function sendWeeklyReport() {
  var body = reportText('week');
  MailApp.sendEmail({
    to: REPORT_TO.join(','),
    subject: 'CMU EMS Ops — weekly equipment and concerns',
    body: body
  });
}

function sendMonthlyReport() {
  MailApp.sendEmail({
    to: REPORT_TO.join(','),
    subject: 'CMU EMS Ops — monthly equipment and concerns',
    body: reportText('month')
  });
}

// Lets the site read the same numbers back, and lets it push the display names
// this script uses in the email.
function doGetReport(e) {
  var p = (e && e.parameter) || {};
  if (p.names) {
    PropertiesService.getScriptProperties().setProperty('NAMES', p.names);
    return { ok: true, stored: true };
  }
  return { ok: true, report: collect(p.report || 'week'), text: reportText(p.report || 'week') };
}
```

Then **replace the `doGet` from §6 with this one**, so the report endpoint is
reachable:

```javascript
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.report || p.names) {
    return ContentService.createTextOutput(JSON.stringify(doGetReport(e)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: true, sheet: ss.getName(), tabs: {} };
  Object.keys(LAYOUT).forEach(function (nm) {
    var sh = ss.getSheetByName(nm);
    out.tabs[nm] = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  });
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Setting the Friday trigger

1. In the Apps Script editor, click the **clock icon** (Triggers) in the left rail.
2. **Add Trigger**.
3. Function: **`sendWeeklyReport`** · Event source: **Time-driven** ·
   Type: **Week timer** · Day: **Friday** · Time: whatever hour suits.
4. Save. Authorise the mail permission when asked.

Add a second trigger for `sendMonthlyReport` on a **Month timer** if you want the
monthly one too.

**Test it before you trust it:** select `sendWeeklyReport` from the function
dropdown and press **Run**. Check the inbox. An empty report on a quiet week is
correct; an empty report after a busy week means post-call forms are not being
filled in, which is a people problem rather than a code one.

---

## 8. Checking it from a terminal

```bash
curl -sL "PASTE_YOUR_EXEC_URL_HERE?ping=1"
```

You want JSON back. If you get `<!doctype html>`, access is not set to "Anyone".
If you get `Script function not found: doGet`, the script that is *deployed* is
older than the one above — repaste and deploy a new version.
