# CMU EMS Operations — project notes

Single-file static site (`index.html`, no build step) for GitHub Pages at
<https://sonnnnnion.github.io/ems-ops/> from `github.com/sonnnnnion/ems-ops`.

Sibling project: the Bike Ops site (`~/Desktop/bike manager`). This one **links
to** it rather than duplicating it. The CSS design system and the QR/modal engine
were spliced from it verbatim, so a fix worth having in both should be applied in
both.

## Dev server

Port **8850**, configured in `.claude/launch.json`.

```
preview_start name="ems-ops"   →  http://localhost:8850/index.html
```

Serve over HTTP, never `file://` — the preview pane renders `file://` as a frozen
snapshot: it ignores edits and drops query strings. Add `?v=N` after editing.

## Editing discipline

~150 KB / ~2850 lines. Grep for an anchor, read with `offset`/`limit`, and
re-read the exact region immediately before each `Edit`.

## Architecture

- **`DEFAULTS`** — all seed content. **`DB` + `loadDB()`/`saveDB()`** persist to
  localStorage under `emsops_db_v1`. `loadDB()` iterates the keys of `DEFAULTS`
  *and type-checks each one*, so a new key is safe for existing stored data and a
  corrupt value falls back per key rather than blanking a whole view.
- **Drafts are separate**, under `emsops_draft_v1`. Deliberately not in `DB`: a
  half-finished form is one person's device state, not site content, and must
  never land in an export.
- **Role gating is done in JS, not CSS.** `applyGates()` sets the `hidden`
  property on `[data-need]` elements; CSS has exactly one rule,
  `[hidden]{display:none !important}`. **Do not reintroduce a CSS class pair like
  the bike site's `.webonly` / `body.is-web`** — that is what leaked manager
  controls there twice, because any later rule setting `display` at equal
  specificity wins. `applyGates()` must be called after every render that
  produces `[data-need]` markup; `renderAll()` already does.
- **`can(need)`** treats `ops` as a superset of `office` + `equipment`. Adding a
  role means adding it to `ROLE_LABEL` and to `can()`, nothing else.
- **`MANAGER_VIEWS` is enforced inside `go()`**, not just by hiding nav items —
  every view is hash-addressable, so hiding a button gates nothing.
- **One form engine.** `FORMS` describes every check; `renderCheck`/`readCheck`/
  `calcCheck`/`submitCheck` are generic. Adding a form means adding a `FORMS`
  entry, a `<section class="view">` with a host div, and a `LAYOUT` row in the
  Apps Script. Nothing form-specific is hard-coded in the engine.
- **`DB.bags` is kit TYPES; `DB.bagUnits` is the physical objects.** A contents
  check picks a type (what should be inside), a checkout and a usage row pick a
  unit (which bag on the rack). Don't merge them.
- **Everything sums by id, on every axis.** `reportData()` groups usage by
  `u.item` and `u.from` — the ids — and only resolves display names once the
  totals are built. Grouping on `u.itemName` or `u.fromName` splits one bag into
  two the moment somebody renames it, which is the same class of bug as the
  `glucose stuff` / `glucose strip` mess in the sheet this replaces. The stored
  `*Name` fields exist *only* as a fallback for an id that has since been deleted.
- **Rooms and bags are keyed by `id`**, never by name — `name` is editable in
  manager mode. `formPick[fid]` and `DB.issues[].where` both hold ids or
  resolved display names, never a name used as a key.
- **Member vs manager is an IA decision, not just gating.** Members see the five
  forms plus bag contents; everything else is `data-need`-gated. Every
  `QR_TARGETS` entry must land on a member-reachable view or the printed sticker
  bounces the scanner to home — there is a test for this.
- **Dialogs** — `uiAlert` / `uiConfirm` / `uiPrompt` / `uiForm`, promise-based,
  in `openModal`. **No `window.alert/confirm/prompt`** — the native ones render
  as "sonnnnnion.github.io says", which reads as a browser warning rather than as
  the site.
- **One backend, many tabs.** `DB.api.url` is a single Apps Script Web App in
  front of a single spreadsheet; the `form` field in the payload picks the tab.
  This is on purpose — Michaela wants Equipment and Office data in one file.
  `DB.api.sheet` is just a convenience link for managers.

## Things that bite

- The global `label{}` rule is uppercase/tracked/faint. Any `<label>` holding a
  sentence must undo `text-transform` and `letter-spacing` — `.checkline .lbl`,
  `.countline .cl-lbl` and `.photo .pcap` already do.
- Never use `new Date().toISOString().slice(0,10)` for a local calendar date; it
  returns *tomorrow* after 8pm EDT. Use `todayISO()`.
- `.topbar` must span `grid-column:1/-1`, not `1/3` — a hard-coded 2-column span
  conjures an implicit second column back into the single-column mobile layout.
- The sidebar must not be `display:none` on mobile. QR codes are scanned on
  phones, so hiding nav strands anyone who lands on a form deep link.
- `setPick()` re-renders only `#<fid>-body` and the pick buttons, not the whole
  form — re-rendering the whole form would wipe identity fields the member has
  already typed into.
- Promise-based dialogs resolve on a **microtask**, so a test that clicks
  `[data-mok]` and asserts synchronously reads stale state. `await` a tick first.
- `PUBLIC_BASE` is what every printed QR code encodes. **If the repo is renamed,
  update it** or every sticker points at a dead address. On localhost the codes
  deliberately encode the live URL instead, so printing from the preview still
  produces usable stickers.

## Constraints

- **The repo is public.** No member names, no live medication counts or expiry
  dates, no door codes, no phone numbers. Inventory ships as schema only (item,
  home, par); actual stock lives in the spreadsheet. See README for the full
  list and the reasoning.
- **Raw source material is gitignored** — the role `.docx` files, the inventory
  `.xlsx` files, `bagcontents.pdf`, `ops things.zip` and `extracted/`. Only
  sanitized, transcribed content goes on the site. Never commit those, and never
  paste their contents into chat, commit messages or memory.
- Photos must be EXIF-stripped before shipping. The script that does it is in the
  session scratchpad; if you add a photo, strip every `APPn` segment.
- **Two pieces of content are inference, not transcription**, and are labelled as
  such on the page: the per-room checklists, and which physical bag is called
  what. Do not quietly promote either to settled fact — the Office Manager and
  Equipment Manager respectively have to confirm them. In particular, **do not
  print bag QR codes before the names are confirmed.**
- Trauma and Squad Car checks ship `active:false` because the Ops to-do records
  both as forms still to be written. Do not activate them by guessing contents.
