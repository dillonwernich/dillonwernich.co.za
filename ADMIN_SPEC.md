# dillonwernich.co.za — Private Admin & Quoting System

You are working in the repository for my personal portfolio site, dillonwernich.co.za. The public site is a hand-built static site (HTML, CSS, JS) currently deployed on GitHub Pages. Read the whole repo before you touch anything.

This brief covers three pieces of work:

1. Move hosting from GitHub Pages to Firebase Hosting without changing the public site.
2. Build a private admin area at `/admin/` — login-gated, visible only to me — for quoting, clients, pricing configuration and files.
3. Do it to a standard where nothing looks or reads as AI-generated. Premium, restrained, considered.

Work in the phases at the end. Explore first, propose a short plan, then build. Commit at the end of each phase with a clear message. Where this brief leaves something open, ask me a single direct question rather than guessing on anything that is hard to reverse (data model, security rules, hosting config). For small UI decisions, decide and move on.

---

## 0. Ground rules

**Stack.** Match the existing site: static HTML, modern CSS, vanilla JavaScript as ES modules, Firebase modular SDK (v10+) loaded from the CDN or via a minimal build. Do not introduce React, Vue, Tailwind or a component framework. If you believe a build step (e.g. Vite) is justified for the admin area, make the case in your plan and wait for my answer — default is no build step.

**Firebase services.** Authentication (email/password), Firestore, Storage, Hosting. No Realtime Database. Cloud Functions only if a feature genuinely cannot be done client-side with security rules (e.g. a public quote-acceptance link in phase 5). Assume the Firebase project may need to be on the Blaze plan for Storage; tell me if so.

**Access.** This is a single-user system. Only my account may read or write anything. Enforce that in Firestore and Storage security rules by UID (I will give you the UID after creating the user — write the rules to read it from a single constant at the top of the rules file). The admin UI must also hard-fail to the login screen if the signed-in UID does not match. Never rely on "the page is unlinked" as security.

**Public site.** Do not change the look, copy, structure or URLs of any public page. `/admin/` must not appear in the public nav, sitemap or footer, and must carry `<meta name="robots" content="noindex, nofollow">`.

**Freedom over everything.** The admin area is a tool I will keep extending. Every list of options the user sees — pricing categories, line items, project types, platforms, design tiers, quote statuses, payment schedules, terms clauses, client fields — must be data in Firestore that I can add to, edit, reorder, hide or delete from inside the admin UI. Nothing that is a "choice" should be hardcoded in JavaScript. If you find yourself writing an array of options in code, stop and move it to Firestore with a UI to manage it.

**Code quality.** Small focused modules. A single `firebase.js` that initialises the app and exports `auth`, `db`, `storage`. One shared `ui/` layer for components (table, drawer, modal, toast, form fields, empty state, confirm dialog) so every screen is visually identical. No duplicated markup across pages. Comments only where a decision is non-obvious. No TODOs left in shipped code.

---

## 1. Hosting migration (GitHub Pages → Firebase Hosting)

- Inspect how the site is currently deployed and how the contact form works (what it posts to). Preserve that behaviour exactly.
- Create `firebase.json` with `public` set to the correct directory, `cleanUrls: true`, `trailingSlash` set to match the current URL shape (check `/privacy/`), and 404 handling that matches whatever exists now.
- Preserve every existing URL: `/`, `/privacy/`, `/Dillon-Wernich-CV.pdf`, `/og-image.png`, `/assets/*`, and anything else you find. Add explicit redirects for any old GitHub Pages paths that would otherwise break.
- Add sensible cache headers: long cache for hashed/static assets, short for HTML.
- Add a GitHub Actions workflow that deploys to Firebase Hosting on push to `main` (use the official `FirebaseExtended/action-hosting-deploy` action with a service-account secret). Document the secret I need to add.
- Write a short `DEPLOY.md`: how to run locally with the emulators, how to deploy, and the steps to point the custom domain at Firebase (DNS records to change at the registrar). Do not attempt DNS yourself.

---

## 2. Admin area — structure

Routes (all under `/admin/`):

| Route | Purpose |
|---|---|
| `/admin/` | Login if signed out, otherwise Dashboard |
| `/admin/quotes/` | Quote list |
| `/admin/quotes/new/` and `/admin/quotes/{id}/` | Quote builder |
| `/admin/quotes/{id}/print/` | Print layout for PDF |
| `/admin/clients/` and `/admin/clients/{id}/` | Client database |
| `/admin/pricing/` | Pricing configuration |
| `/admin/files/` | File manager |
| `/admin/settings/` | Business details, numbering, defaults, terms |

Use a persistent left sidebar on desktop (collapsible), a top bar with the page title and primary action, and a bottom tab bar on mobile. Every screen must be fully usable on a phone — I will send quotes from the road.

Global behaviours:

- `Cmd/Ctrl+K` command palette: jump to any screen, search clients and quotes, create new quote.
- Unsaved-changes guard on forms.
- Autosave quote drafts with a visible "Saved · 12:04" indicator; manual save still available.
- Toasts for every write, with undo where it is cheap (delete, status change).
- Real empty states for every list (one sentence and one action — no illustrations, no mascots).
- Loading skeletons, not spinners, for list and detail screens.
- Dark and light themes, following the system by default, with a toggle in settings. Reuse the public site's existing design tokens (colours, type scale, spacing) — read them from the current CSS rather than inventing new ones.

---

## 3. Dashboard

Small, useful, not a "welcome" page:

- Quotes by status (draft / sent / accepted / declined / expired) as plain numbers.
- Value of quotes sent this month and accepted this month.
- Quotes expiring in the next 7 days.
- Last five quotes and last five clients touched.
- One primary button: New quote.

---

## 4. Pricing configuration (`/admin/pricing/`)

This is the engine. Build it as a generic, data-driven schema so I can shape it however I want later.

### 4.1 Core settings

- Default hourly rate (ZAR). Every price in the system can be expressed either as a fixed amount or as hours × rate, so changing the rate reprices everything expressed in hours.
- Currency and locale for formatting (default ZAR, `en-ZA`).
- VAT: registered yes/no, rate. If not registered, quotes show no VAT and state that.
- Minimum project fee (floor applied after discounts).
- Default quote validity in days.

### 4.2 Pricing structure

A pricing config is an ordered list of **sections**. Each section has a name, description, display order, and an ordered list of **items**. Each item has:

- `label`, `description` (shown to me), `clientDescription` (what appears on the quote)
- `kind` — one of:
  - `single-select` (one of several options, each option with its own price/hours and optional multiplier)
  - `multi-select` (any number of options, each priced)
  - `quantity` (a number × unit price/hours, with optional included quantity and optional banded pricing e.g. first 5 pages included, then R x per page)
  - `toggle` (on/off, priced)
  - `complexity` (simple / medium / complex selector, each with its own price/hours — this is for feature add-ons)
  - `percentage` (rush fee, discount — applied to the subtotal, positive or negative)
  - `multiplier` (design tier, platform — multiplies a chosen base)
- `price` expressed as `{ mode: 'fixed' | 'hours', amount }`
- `complexityWeight` — a number that feeds a hidden complexity score
- `recurring: true/false` — recurring items are totalled separately (monthly) on the quote
- `visible`, `order`, `showOnQuote`

Seed the config with the structure below, but make it clear in the UI that all of it is editable:

- **Project type** (single-select): Landing page · Brochure site · Business site · Web app · Mobile app (Android / iOS / both). Sets base price and included page count.
- **Platform** (multiplier): Static · WordPress · Custom (Next.js / Firebase etc.).
- **Pages** (quantity, banded): with a sub-choice per page type — static, dynamic (CMS/database driven), templated (one layout, many records).
- **Functionality** (complexity items): contact form, booking/calendar, blog, client-editable CMS, user login & roles, payments, e-commerce (banded by product count), search & filtering, maps, live chat, third-party API integration, admin dashboard, PDF generation, automated emails, multilingual.
- **Design level** (multiplier): Template-based · Custom · Premium (brand from scratch, motion).
- **Content** (multi-select): client supplies all · copywriting · stock imagery · photoshoot coordination.
- **Adjustments** (percentage): rush fee, discount.
- **Recurring** (recurring items): hosting, domain, SSL, maintenance retainer with included support hours and overage rate.

Seed every item with realistic placeholder ZAR values or hours and flag in the UI that they are placeholders until I confirm them. Use a mid-range South African freelance rate as the seeded hourly rate and tell me what you chose.

### 4.3 Management UI

- Drag-to-reorder sections and items.
- Inline editing in a drawer, not a separate page.
- Duplicate an item or section.
- "Hide" vs "delete" — hidden items stay in old quotes, deleted items are blocked if any quote references them (show which).
- Version the config: every save creates a new version; each quote stores a snapshot of the config it was priced against so old quotes never silently reprice.
- A "Preview quote" pane on the pricing page that shows a sample quote reflecting the current config.

---

## 5. Quote builder (`/admin/quotes/new/`)

Two-column layout on desktop: form on the left, live quote summary on the right (sticky). On mobile, summary collapses to a bottom sheet showing the total.

Form sections (built from the pricing config, so they change when the config changes):

1. **Client** — pick existing or create inline. Pulls address, contact, VAT number.
2. **Project** — title, one-paragraph summary, project type and all pricing items rendered from config.
3. **Scope detail** — free-text "included", "excluded" and "assumptions" lists, pre-filled from editable templates in Settings, editable per quote.
4. **Timeline** — auto-estimated weeks from total hours and a configurable hours-per-week capacity; overridable.
5. **Payment schedule** — pick a template (e.g. 50 / 40 / 10) or set custom milestones; amounts computed.
6. **Terms** — pick which terms clauses to include from the library in Settings; editable per quote.
7. **Internal** — hidden from the quote: notes, estimated hours, effective hourly rate after discount, complexity score, margin warning if effective rate drops below a threshold I set.

Live summary shows: once-off subtotal, adjustments, VAT if applicable, once-off total, monthly recurring total, estimated timeline, and the internal effective hourly rate (clearly marked internal).

Quote lifecycle:

- Statuses (editable list in Settings): Draft · Sent · Accepted · Declined · Expired. Expired is set automatically from the validity date.
- Quote numbers from a configurable pattern in Settings (default `DW-{YYYY}-{0001}`), assigned on first move out of Draft, never reused.
- Revisions: "Create revision" copies the quote to a new version (`DW-2026-0007-R2`), links back to the original, and marks the original superseded.
- Duplicate quote (to a new client or the same).
- Activity log per quote: created, edited, sent, status changes, with timestamps.

---

## 6. Quote document (`/admin/quotes/{id}/print/`)

This is what the client sees, so it matters most.

- A dedicated print route with its own stylesheet, A4, correct margins, page breaks that never split a line item or a payment milestone.
- "Download PDF" uses the browser print dialog. Set `@page` size and margins, hide chrome, and make sure it renders identically in Chrome and Safari.
- Layout: my name/business block and the client block at the top, quote number, date, valid until. Project title and summary. Itemised scope grouped by the sections from the pricing config, showing only `showOnQuote` items with their `clientDescription`. Once-off total. Recurring block separate. Timeline. Payment schedule. Included / excluded / assumptions. Terms. A signature/acceptance line.
- Typography and spacing must match the public site. One accent colour at most. No boxes-within-boxes, no coloured header bars, no icons.
- Also render the same document as a share-ready HTML page so that in phase 5 it can be sent as a link.

---

## 7. Clients (`/admin/clients/`)

- Fields: company, contact name, email, phone, address, VAT number, website, notes, tags (editable tag list), source (how they found me — editable list).
- Extra fields must be addable from Settings without code changes (a simple custom-fields definition: label, type text/number/date/select).
- Client detail page: all quotes for that client, all files, activity, a notes timeline.
- Search, filter by tag, sort.
- Merge duplicates.

---

## 8. File manager (`/admin/files/`)

Backed by Firebase Storage with a Firestore index of metadata.

- Folders: a virtual folder tree stored in Firestore (so moving a file does not copy bytes in Storage).
- Upload via drag-and-drop or picker, with progress. Multiple files at once.
- Attach files to a client and/or a quote; those show on the respective detail pages.
- Preview images and PDFs inline; everything else shows type and size with a download action.
- Rename, move, delete (soft delete to a Trash folder, hard delete from Trash).
- Generated quote PDFs can be saved here with one click from the print page (render to PDF client-side only if it can be done without a heavy dependency; otherwise just save the HTML snapshot and note the limitation).
- Storage rules: my UID only, max file size I can set in Settings.

---

## 9. Settings (`/admin/settings/`)

- **Business details**: name, trading name, address, email, phone, bank details for the quote, logo upload, VAT details.
- **Quote defaults**: numbering pattern, validity days, hours-per-week capacity, margin warning threshold, default payment schedule.
- **Libraries** (all editable lists): quote statuses, payment schedule templates, terms clauses (with a title, body, and default on/off), included/excluded/assumption templates, client tags, client sources, custom client fields.
- **Appearance**: theme.
- **Account**: change password, sign out everywhere.
- **Data**: export everything as JSON; import.

---

## 10. Design standard

I will reject work that looks generated. Concretely:

- Start from the public site's CSS. Reuse its font stack, type scale, colours, radii and spacing. The admin should feel like the back room of the same building.
- One accent colour. Neutral surfaces. No purple-to-blue gradients, no glassmorphism, no glow, no decorative blobs.
- No emoji anywhere in the UI. Icons only where they carry meaning, from a single consistent set, line weight matched to the type.
- No "Welcome back, Dillon 👋". No "Let's get started!". Labels are nouns, buttons are verbs, sentences end with full stops.
- Tables for lists, not card grids. Dense enough to be useful.
- Motion is limited to 120–200 ms ease-out on open/close and hover. Nothing bounces.
- Alignment to a 4px grid, consistent control heights, consistent border treatment. If two screens differ in how they handle the same element, that is a bug.
- Placeholder content must be realistic: real South African company name formats, real-looking addresses, ZAR formatted as `R 12 500,00`, dates as `13 Oct 2026`.
- The print document is the showpiece. Treat it like a typeset page.

---

## 11. Data model (Firestore)

Propose the collections in your plan before building. Expected shape, adjust as you see fit:

```
settings/business
settings/quoteDefaults
settings/appearance
pricingConfig/{versionId}          // full snapshot per version; a pointer doc holds currentVersionId
libraries/{name}                   // statuses, paymentTemplates, terms, scopeTemplates, tags, sources, clientFields
clients/{clientId}
quotes/{quoteId}                   // includes pricingConfigVersionId and a frozen copy of selected items with prices
quotes/{quoteId}/activity/{id}
files/{fileId}                     // metadata: path, name, size, type, folderId, clientId, quoteId, deletedAt
folders/{folderId}
```

Security rules: every read and write requires `request.auth.uid == OWNER_UID`. Validate shapes on write for quotes and pricing config so a bug in the UI cannot corrupt data. Write rules tests using the emulator.

---

## 12. Phases

Deliver in this order. After each phase: run it locally against the emulators, confirm it works on a phone-width viewport, commit.

1. **Hosting** — firebase.json, workflow, DEPLOY.md, verify the public site is byte-identical in behaviour.
2. **Shell** — Firebase init, auth with UID gate, security rules, admin layout, navigation, theme, shared UI components, command palette, Settings with business details.
3. **Pricing config** — schema, seed data, management UI, versioning, preview.
4. **Clients** — CRUD, custom fields, detail page.
5. **Quotes** — builder, live summary, lifecycle, numbering, revisions, activity, print document.
6. **Files** — Storage, folders, attachments, previews.
7. **Dashboard, data export/import, polish** — then a written checklist of everything I need to do in the Firebase console and at the registrar.

Optional phase 8 (ask me first): a public quote link (`/q/{token}/`) where a client can view and accept a quote, which flips the status to Accepted and records the time. Requires a Cloud Function or carefully scoped rules.

---

## 13. Before you start

Reply with:

1. What you found in the repo (deploy method, contact form mechanism, CSS tokens available).
2. Your proposed Firestore model and anything you would change about this brief.
3. The Firebase console steps I need to complete before phase 2 (create project, enable Auth email/password, create my user, enable Firestore and Storage, plan tier).

Then start phase 1.
