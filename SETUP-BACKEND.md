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
  'Bag Checks':  ['date', 'submitted', 'callsign', 'name', 'andrew', 'subject',
                  'doneCount', 'missingCount', 'done', 'missing', 'seal'],
  'Post-Call':   ['date', 'submitted', 'callsign', 'name', 'doneCount',
                  'missingCount', 'done', 'missing', 'used', 'short'],
  'Post-Shift':  ['date', 'submitted', 'callsign', 'name', 'doneCount',
                  'missingCount', 'done', 'missing'],
  'Reports':     ['date', 'submitted', 'callsign', 'name', 'area', 'urgency',
                  'what', 'where']
};

// Human-readable column titles for the header row.
var TITLES = {
  date: 'Date', submitted: 'Submitted at', callsign: 'Call sign', name: 'Name',
  andrew: 'Andrew ID', subject: 'Room / bag', doneCount: 'Done',
  missingCount: 'Missing', done: 'Completed items', missing: 'Missing items',
  restock: 'Restock needed', maint: 'Maintenance concern', seal: 'Seal number',
  used: 'Used and replaced', short: 'Could not replace', area: 'Area',
  urgency: 'Urgency', what: 'What is wrong', where: 'Where'
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

## 7. Checking it from a terminal

```bash
curl -sL "PASTE_YOUR_EXEC_URL_HERE?ping=1"
```

You want JSON back. If you get `<!doctype html>`, access is not set to "Anyone".
If you get `Script function not found: doGet`, the script that is *deployed* is
older than the one above — repaste and deploy a new version.
