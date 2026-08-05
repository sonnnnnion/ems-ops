# Connecting the site to a spreadsheet

Every form on the site works without this, but nothing is stored anywhere except
the phone that filled it in. This is how you fix that. Twenty minutes, once.

You end up with **one spreadsheet** holding **one tab per form** — Room Checks,
Checkouts, Bag Checks, Post-Call and Reports, plus **Bike Jumpkit Checks** and
**Bike Safety Checks** from the Bike Ops site — plus an **Items** tab with one row
per item and **Restock** and **Bike Restock** tabs the script keeps up to date.

---

## Do this first — one paste, five minutes

The script in `apps-script/Code.gs` has changed and **the deployed copy is older
than it**. Until it is pasted and redeployed, three things are true:

- Bike checks still write to the old separate bike spreadsheet, not this one.
- The Bike Ops site cannot publish at all — the current deployment has nowhere to
  put its content and will refuse the write.
- Anyone appointed under People can be refused when they publish, because the
  deployed copy checks a stale list.

Steps, in the spreadsheet **CMU EMS Operations**:

1. **Extensions ▸ Apps Script.**
2. Select everything in `Code.gs` and paste the whole of
   [`apps-script/Code.gs`](apps-script/Code.gs) over it. Save.
3. **Deploy ▸ Manage deployments ▸ ✏️ (edit) ▸ Version: New version ▸ Deploy.**
   Edit the existing deployment rather than making a new one — a new deployment
   gets a new URL, and every printed QR code and both sites point at the old one.
4. **Run ▸ tidyUp** once. This creates and formats the two bike tabs, and renames
   a `Jumpkit Checks` tab brought over from the old bike file rather than leaving
   its rows stranded.

To confirm it worked, open the Web App URL in a browser. `tabs` should now list
`Bike Jumpkit Checks` and `Bike Safety Checks` alongside the ops tabs.

Both sites publish through this one deployment and each keeps its own copy,
chosen by a `site` field in the request — `CONTENT_OPS` and `CONTENT_BIKE` script
properties. They cannot overwrite one another. An existing `CONTENT` property
from before this split is still read for the ops site, so nothing is lost in the
upgrade.

**Nothing is emailed.** Sending mail from Apps Script needs a permission scope
that makes Google show a warning to whoever deploys it, and the same information
is more useful where the work happens: the Restock tab in the sheet, and **To
Get** inside the site. Reports are generated in the site on demand.

---

## 0. Which account

Everything below should be owned by an account the next Operations Officer can
be handed. `bikecmuems@gmail.com` is fine for now — it is already shared rather
than personal.

**Sign in as only that account.** If Drive says *"Sorry, unable to open the file
at this time"* when you press Extensions ▸ Apps Script, that is almost always
several Google accounts signed in at once: Drive opens the file as whichever is
account 0. Use a private window with just the one account, or check the URL for
`/u/1/` and change it to `/u/0/`.

One spreadsheet holds both sites' forms — **CMU EMS Operations**. Bike checks used
to go to a file of their own, which meant no formula could put a bike check beside
a room check, and answering one question meant opening two files. Handover is
still one ownership transfer, of one file.

---

## 1. Make the spreadsheet

1. Go to <https://sheets.new>.
2. Name it **CMU EMS Operations Data**.
3. Do not create any tabs. The script creates each one, with headers and
   formatting, the first time a form of that type is submitted.

Keep the URL — it goes into the site at the end so managers get an
"Open the spreadsheet" button.

---

## 2. Paste the script

1. In that spreadsheet: **Extensions ▸ Apps Script**.
2. Delete everything in `Code.gs`.
3. Paste the whole of [`apps-script/Code.gs`](apps-script/Code.gs) — see §6.
4. **Save**.

---

## 3. Deploy

1. **Deploy ▸ New deployment**.
2. Gear next to "Select type" ▸ **Web app**.
3. Execute as **Me**. Who has access **Anyone**.
4. **Deploy**, authorise, and accept the "unverified app" warning —
   **Advanced ▸ Go to (unsafe)**. You wrote it.
5. Copy the URL ending `/exec`.

**"Who has access" must be "Anyone".** Set to "Anyone with a Google account",
members get a sign-in wall instead of a submission — and because Google's error
pages carry no CORS headers, the browser reports it as a generic "Failed to
fetch" rather than telling you what went wrong.

---

## 4. Point the site at it

1. Sign in on the site, go to **Site Settings**.
2. Paste the `/exec` URL and the spreadsheet URL.
3. **Save**, then **Test connection**.

**Item names look after themselves.** The sheet stores item *ids*, because an id
survives a rename — so the script needs an id→name map or the Restock tab reads
`c-bandaid` instead of `Adhesive bandages`. The site now uploads that map by
itself whenever it changes, so there is nothing to remember after renaming or
adding a consumable or a bag.

**Resend item names** is only for when the script has been redeployed or its
properties cleared: the browser thinks it already sent the current map, and this
sends it anyway.

`Test connection` does a `GET`, which the browser can read, so it is the only
step that proves anything:

| What you see | What it means |
|---|---|
| **Live — CMU EMS Operations Data** | Working. |
| Got a web page, not JSON | Access is not "Anyone". Redeploy. |
| Reached it, but the reply was unexpected | The deployed script is older than §6. Repaste, deploy a **new version**. |
| Could not reach it | Wrong URL, or the deployment was deleted. |

> Submissions are sent with `mode:'no-cors'`, so their response is unreadable by
> design. The site can say it sent something; it can never say the sheet received
> it. The `GET` ping is the only readable channel.

---

## 5. Things that will bite you

- **Editing the script is not enough.** After any change:
  **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**
- **After pasting an update, run `tidyUp` once** (function dropdown ▸ Run). It
  reformats existing tabs and repaints the Restock list.
- **Headers self-heal.** If the header row does not match what the script writes,
  it is rewritten and reformatted — so adding a column no longer shifts every
  later value one place left.
- **The endpoint is unauthenticated.** Anyone reading the page source can post to
  your sheet. For checks and checkouts that is an acceptable trade for "a member
  with a phone and no account can file in ten seconds". Do not extend this script
  to store anything you would mind a stranger reading or writing.
- **Duplicate submissions are dropped.** Each payload carries an id and the
  script checks the last hundred rows of that tab, so a double-tap on patchy wifi
  does not become two rows.

---

## 6. The script

The script lives in **[`apps-script/Code.gs`](apps-script/Code.gs)** — one file,
about 480 lines. It used to be pasted inline here; it is a file now so there is
exactly one copy to keep correct. A second copy in a document is how the two
drift and you deploy last month's version believing it is this month's.

To install or update it:

1. Open `apps-script/Code.gs`, select all, copy.
2. In the spreadsheet: **Extensions ▸ Apps Script**.
3. Delete everything in `Code.gs` there and paste.
4. **Save**.
5. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**
   Saving alone changes nothing that is live — see §5.
6. Run **`tidyUp`** once from the function dropdown.

It defines three things you can run: `doPost` (form submissions), `doGet`
(the connection ping and report reads) and `tidyUp` (reformat existing tabs and
repaint Restock). Everything else is called by those.

It creates seven tabs on demand: Room Checks, Checkouts, Bag Checks, Post-Call,
Reports, Items and Restock.

**Restock is the shopping list of record.** Every device's submissions land in
it, and the site reads it back under **To Get** — so a manager sees what all
eighty members filed, not just what they filed themselves. Ticking `Got` works
from either end: tick it in the sheet, or tick it in To Get and the site writes
it through and re-reads to confirm. Writing a tick needs the same permission as
publishing (§7), because it changes what everyone else sees.

---

## 7. Manager sign-in (the OAuth client)

Members need none of this — the five forms are open to everyone. This is only
what makes the **Manager** button work, and what lets a manager publish content
so their edits reach other people's browsers instead of only their own.

### If sign-in suddenly stopped working

Google showing **"Access blocked: Authorization Error … The OAuth client was
disabled. Error 401: disabled_client"** means the client ID in the site no
longer exists on Google's side. That happens when the Cloud project that owned
it was deleted, suspended, or had its consent screen removed — usually because
the account that owned it changed hands.

There is no way to un-disable it from the site. Make a new client below and
paste the new ID in. It takes about five minutes and nothing else breaks in the
meantime: every member-facing form keeps working, because none of them need
sign-in.

If the whole Google **account** was disabled rather than just the client, the
client usually comes back with it — check before rebuilding anything. Ask Google
for the authorise URL with a deliberately wrong `redirect_uri`: a dead client
answers `disabled_client`, a live one answers `invalid_request` about the URI
and names the app, because it got far enough to look the app up.

To keep working through an outage of this kind, set `LOCAL_MANAGER_UNLOCK` to
`true` in `index.html`. It lets anyone pick a manager role for their own device
— buttons only, never data, since publishing and Restock ticks are still checked
by the script. Set it back to `false` afterwards; every device drops to member
on its next load with nothing to clean up.

### Making the client

1. Go to <https://console.cloud.google.com/> signed in as **the same account
   that owns the spreadsheet** (§0). Getting this wrong is the usual reason
   step 7 fails later.
2. Create a project — call it **CMU EMS Operations**.
3. **APIs & Services ▸ OAuth consent screen**. User type **External**, then:
   - App name **CMU EMS Operations**, your address for both support and
     developer contact.
   - No scopes need adding. Sign-in gives the site your address and nothing else.
   - Under **Audience**, press **Publish app**. Leaving it in *Testing* means
     the client stops working for anyone not on the test-user list, and expires
     on its own — which is a slow-motion version of the failure above.
4. **APIs & Services ▸ Credentials ▸ Create credentials ▸ OAuth client ID**.
5. Application type **Web application**, name **ems-ops site**.
6. Under **Authorised JavaScript origins**, add both:

   ```
   https://sonnnnnion.github.io
   http://localhost:8850
   ```

   Origins only — no path, no trailing slash. `https://sonnnnnion.github.io/ems-ops/`
   is rejected. The localhost entry is what lets sign-in be tested from the
   preview server before pushing.
7. **Create**, then copy the **Client ID**. It ends `.apps.googleusercontent.com`.

### Pasting it in, in two places

Both are required. The first makes the button work; the second is what makes
the permission boundary real.

1. In `index.html`, find `GOOGLE_CLIENT_ID` (near the sign-in code) and replace
   the value with the new ID. Commit and push.
2. In the Apps Script: **Project Settings ▸ Script properties ▸ Add script
   property**, name `CLIENT_ID`, value the same ID. Save.

`verifiedEmail()` refuses any token whose `aud` is not that exact ID, so a
mismatch between the two silently rejects every publish while sign-in still
appears to work. If managers can sign in but "Publish" reports *not allowed*,
these two values disagree.

### Who gets in

Signing in only proves which address you are. What it *grants* comes from the
site: the Operations Officers list and the Managers list, both under
**Site Settings ▸ People**. An address on neither signs in fine and is told it
has no role here.

`bikecmuems@gmail.com` is the **webmaster**: always an Operations Officer, and
the one row with no Remove button. Officers turn over every year and an access
list you can empty is one bad afternoon from nobody being able to get back in,
so there is always a way back. Any officer can add or remove other officers —
the role changes hands too often for that to run through one person.

`MANAGER_EMAILS` at the top of the script is the bootstrap — the one address
that can publish before any People list exists. Change it to the ops account
once there is one.

### Publishing without Google: the publish key

Publishing is the one action that changes what *everyone* sees, so the endpoint
will not accept it unauthenticated. While Google sign-in is switched off, the
alternative is a shared key:

1. Apps Script ▸ **Project Settings ▸ Script properties ▸ Add script property**.
   Name `PUBLISH_KEY`, value a long random string you invent. Save.
2. On the site, **Site Settings ▸ Publish key**, paste the same string, **Save**.

Publish then works from any role that can reach Site Settings.

Know what this is and is not. A Google sign-in proves *who* you are, and taking
someone off the People list takes their access with it. A key proves only that
whoever is holding it has it — there is no per-person revocation, and changing
it means telling everyone the new one. It is a caretaker measure, not a
replacement.

What it is not is a secret in a public repo. The key never appears in
`index.html` or in the page source; it lives in one browser's localStorage,
under `api`, which is on the never-published list. Do not paste it into a commit
message, a doc or a screenshot.

**To close this route, delete the `PUBLISH_KEY` property.** Publishing goes back
to being Google-only immediately, no redeploy needed.

---

## 8. Checking from a terminal

```bash
curl -sL "PASTE_YOUR_EXEC_URL_HERE?ping=1"
```

JSON back is good. `<!doctype html>` means access is not "Anyone".
`Script function not found: doGet` means the deployed script predates §6.
