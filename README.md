# CMU EMS · Operations

Operations hub for CMU EMS: room checks, bag and equipment checks, post-call and
post-shift closeout, problem reporting, and the reference material behind all of
it.

Single static `index.html`, no build step, deployed to GitHub Pages.

The **Bike Manager** role is not duplicated here — it has its own site at
<https://sonnnnnion.github.io/bike-ops/> and this one links out to it, so there
is one source of truth per role.

## What's in here

```
index.html          the entire app — vanilla HTML/CSS/JS, one file
assets/bags/        bag and kit reference photos (12)
assets/rooms/       room reference photos (10)
SETUP-BACKEND.md    connecting the forms to a Google Sheet
.claude/            dev-server config (port 8850)
```

## Running it

```bash
python3 -m http.server 8850
```

Then open <http://localhost:8850/index.html>. **Serve it over HTTP, not
`file://`** — a `file://` page is treated as a frozen snapshot by some preview
tools, which silently ignores edits and drops query strings.

## The five forms

| Form | Goes to tab | Who fills it |
|---|---|---|
| Room Check | `Room Checks` | every tech / probie, once per duty period |
| Bag & Equipment Check | `Bag Checks` | whoever checks a jumpkit, event bag, blue bag or pod |
| Post-Call Restock | `Post-Call` | after a call, before the kit goes back |
| End of Shift | `Post-Shift` | everyone, at the end of a duty period |
| Report a Problem | `Reports` | anyone, any time |

All five write into **one spreadsheet**, one tab each, so Equipment and Office
data can be cross-referenced in a formula. See `SETUP-BACKEND.md`.

Every form is hash-addressable (`#room-check`, `#bag-check`, …) which is what
makes the QR codes possible. The **QR Codes** view generates real scannable codes
in-page — no library, no network call — and they were verified module-for-module
against the `qrcode-generator` npm package on all seven targets.

## Roles

There is no login. The site is open; the **Manager** button reveals one of three
tool sets:

| Role | Gets |
|---|---|
| Office Manager | duty-period tracker, office restock list, problem log |
| Equipment Manager | equipment inventory, bag activation, problem log |
| Operations Officer | all of the above |

Gating is done in JS: `applyGates()` sets the `hidden` property on every
`[data-need]` element, and CSS carries one `[hidden]{display:none !important}`
rule. This is deliberate — the CSS-class approach used on the bike site leaked
manager controls twice when a later rule set `display` at equal specificity.
Verified: **0 leaks across all four roles and all 15 views**, and gated views
redirect to home when reached by hash.

**This is not a security boundary.** Anyone can set the role from a browser
console. It hides tools from casual visitors; it protects nothing.

## What is deliberately not on this site

The repository is public, so:

- **No member names.** The roster from the cleanup spreadsheet is not here, and
  the role pages name roles rather than people.
- **No live medication counts or expiry dates.** The Inventory view carries the
  *schema* — what should exist, where it lives, and the par level, which is what
  a check compares against. Actual stock lives in the spreadsheet, which is
  shared only with the people who need it. A public page listing exactly how much
  naloxone and epinephrine is held and in which room is not something to publish
  by accident.
- **No door codes, phone numbers or lock combinations.**
- **Raw source material stays out of the repo** — see `.gitignore`. The role
  `.docx` files, the inventory `.xlsx` files, `bagcontents.pdf` and the original
  photos are all excluded. Only sanitized, transcribed content ships.

Photos are re-encoded and stripped of every `APPn` segment before shipping, so no
EXIF or GPS data goes with them (76 segments removed across 22 files).

## Content that still needs a human

Two things on this site were written from inference rather than from a source
document, and are marked as such in the interface:

1. **The per-room checklists.** No room-level checklist existed — the Room
   Tasking memo refers to one but it was never written. The 14 rooms and their
   slot counts are transcribed exactly from the printed tracker; the items inside
   each room are drafted from the Office Manager role description, the four
   cleaning verbs used on the end-of-year sheet, and the room photos. The Office
   Manager can edit any of them in place.

2. **Which bag is called what.** The bag photos arrived unlabelled. Names were
   inferred from the photos plus the locations used in the inventory sheet
   (`CC Pod`, `Blue Bag`, `Equipment Room`). That inference is flagged on the
   page, and the Equipment Manager should confirm every name **before any QR
   code is printed** — a sticker pointing at the wrong bag check is worse than no
   sticker. Trauma and Squad Car checks ship inactive, because the Ops to-do
   records both as forms still to be written.

## Editing

`index.html` is ~150 KB. Grep for an anchor and read with `offset`/`limit` rather
than reading it whole, and re-read the region immediately before each edit.
