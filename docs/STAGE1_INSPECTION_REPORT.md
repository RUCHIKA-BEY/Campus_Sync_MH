# Stage 1 — Repository Inspection Report

**Date:** 2026-11-11  **Branch inspected:** `main` (clean, HEAD `5998401 qr ui update`)
**Status:** Inspection only. Nothing in the existing project has been changed.

---

## 1. What was inspected

| Source | Finding |
|---|---|
| Repository working tree | 3 code files (`public/index.html`, `public/app.js`, `public/styles.css`), 4 JPG assets, `README.md`, `TODO.md`, `vercel.json`, `manus-routes.json`, an empty root `assets/` folder |
| `campussync.zip` (Downloads) | The **original** generated export. It is identical in content to the repo's first commit `7950ff7 Initial commit from zip` (root copies + `public/` copies, minified CSS). The repo has **4 newer commits** of UI work on top of it, so the **repo is the source of truth**; the zip adds nothing new. |
| Shared ChatGPT conversation | Contains (a) the earlier "frontend implementation" prompt, (b) the README draft, and (c) the backend master prompt you pasted. No code. |
| Git history | 9 commits; latest work: timetable UI, QR pass UI, CSS formatting, move to `public/`, Vercel config. |

### Files in the repo

```
Campus_Sync_M/
├── public/                 ← Vercel serves this folder ("outputDirectory")
│   ├── index.html          101 lines — ALL eight pages live here (single-page app)
│   ├── app.js              263 lines — all behaviour, hard-coded demo data
│   ├── styles.css          2,458 lines — one stylesheet, CSS custom-property tokens
│   └── assets/             4 event/hero photos (~1 MB each)
├── assets/                 empty folder (left over from the zip; git ignores it)
├── manus-routes.json       list of 8 routes — leftover from the generator, NOT read by the app
├── vercel.json             rewrites every URL to /index.html
├── README.md               project overview (palette section is outdated — see §6)
└── TODO.md                 frontend checklist; marks backend/auth as out of scope
```

No `.gitignore`, no `package.json`, no build tool, no Supabase config, no SQL, no tests exist yet.

---

## 2. Existing frontend architecture

**Type:** a static **single-page application (SPA)**. *SPA* means one HTML file contains every screen; JavaScript shows one `<section class="page-view">` and hides the others, so the browser never loads a new page.

**Routing:** *hash routing*. Clicking a nav button sets `window.location.hash` (e.g. `#discover`), and `navigate(page)` toggles the `is-visible` class. A `hashchange` listener supports back/forward and deep links. `vercel.json` rewrites every path to `index.html`, which suits an SPA.

**State:** one in-memory JS object, `state` (`app.js:17`). It is **not** saved anywhere, so a page refresh resets registrations. (`TODO.md` says "browser-local registration state", but `localStorage` isn't used either.)

**Rendering:** functions build HTML strings and assign them with `innerHTML` (`eventCard`, `renderDiscover`, `renderRegistrations`, …). Interactions use one delegated `document` click listener plus `data-nav`, `data-action`, `data-event` and `data-ticket` attributes.

**Styling:** the design tokens in `styles.css :root` already match your palette exactly:

| Your rule | Token in `styles.css` | Value |
|---|---|---|
| Canvas: Warm Ivory | `--bg-canvas` | `#faf6f0` ✅ |
| Cards: White / Soft Cream | `--bg-card`, `--bg-cream` | `#fff`, `#f7f3ec` ✅ |
| Borders | `--border-subtle` | `#eae3d9` ✅ |
| Deep Plum text/nav | `--text-primary` | `#4a2e35` ✅ |
| Dusty Mauve UI | `--mauve`, `--border-strong` | `#eadfd8`, `#d6c7c2` ✅ |
| Input fill | `--bg-input` | `#f3ece7` ✅ |
| Terracotta CTA | `--accent` | `#d96b43` ✅ |

Fonts: DM Sans (body) and Plus Jakarta Sans (headings) from Google Fonts. No dark backgrounds exist anywhere, which satisfies your consistency rule.

**Responsiveness (tested in a browser):** breakpoints at 1020px, 760px and 430px. At a 375px phone width, **none of the 8 views scrolls horizontally**. The hamburger menu works. One issue: the fixed "Evaluation Mode" ribbon takes up roughly the bottom 10% of a phone screen.

---

## 3. Pages and their purpose

| View (`data-page`) | Intended role | Purpose |
|---|---|---|
| `landing` | Public / Student | Hero, "discover by interest" category tabs, 4-step workflow explainer |
| `discover` | Student | Search + category filter over event cards, "Campus snapshot" side panel, Create Event button |
| `timetable` | Student | Week/Day timetable grid (Mon–Fri, 09:00–17:00) |
| `registrations` | Student | Upcoming/Past/Saved tabs, registration cards, digital pass (QR ticket) modal |
| `clubs` | All | Searchable club directory |
| `organizer` | Organizer | 4 stat cards, "performance overview" list, OD action queue |
| `dsa` | DSA | **OD request** queue table with stats |
| `admin` | Admin | Platform stats, **event "Pending approvals"** list, system health |

Shared pieces: header nav, notification drawer, a modal used for event details, tickets and the create form, the footer, and the **Evaluation ribbon** (a role switcher for demos).

---

## 4. What actually works vs. what is only visual

### Works (client-side only, on hard-coded data)
- Hash navigation, mobile menu, deep links, back/forward
- Category tabs and search on the 6 hard-coded events; club search
- Event detail modal, ticket modal, copy pass code to clipboard
- Timetable Week ⇄ Day toggle and day stepping (in Day view)
- Register / cancel, but only inside the in-memory `state` (lost on refresh)
- Notification drawer open/close and "Mark all as read" (visual only)
- Persona switcher: changes the name label and jumps to a page

### Visual only or fake (needs backend or correction)
| Element | Location | Problem |
|---|---|---|
| All event, club and dashboard numbers | `app.js:1-16`, `index.html` | Hard-coded (284 registrations, 2,840 users, 99.9% health, …) |
| "Schedule fit" in event modal | `app.js:155` | Not calculated: `od:true` → "Overlaps 2 classes", otherwise "No conflict". **No conflict logic exists.** |
| Register button | `app.js:192` | Always succeeds and claims "Your On-Duty request has been prepared"; no capacity, deadline, or conflict checks |
| Timetable classes | `index.html:80`, `app.js:28` | Hard-coded HTML + a hard-coded minutes array; "+ Add class" does nothing; week arrows do nothing in Week view |
| QR pass | `app.js:120` | A **decorative pseudo-random pattern**, not a scannable QR code. Roll number "21CS042" is hard-coded. The text "*cryptographically tied to your student record*" (`app.js:184`) is **not true** and must be replaced or made true. |
| Registration tabs | `index.html:82` | Counts (3/8/4) hard-coded; switching tabs doesn't filter |
| Create Event form | `app.js:189` | 4 fields only (no time, capacity, deadline, OD, club); category list is missing Hackathons/Music; submit only shows a message |
| Dead buttons | various | Date filter "Any date", Club "Follow +", Organizer "View all"/"Review requests", DSA "Review"/"Export CSV", Admin "Review"/"Download report", footer "Help centre" |
| Notification badge "3" + items | `index.html:28,98` | Static |
| Persona switcher | `app.js:198` | Cosmetic. Every page is reachable by anyone; there is no login at all |

### Pages/features that don't exist yet
Login, sign-up, password reset, profile and interests, student OD-request list, attendance history, feedback, the organizer's full event form/manage events/attendance and scanner, the DSA proposal review screen, and admin users/clubs/venues/audit-log screens.

---

## 5. Problems to fix during integration (found during inspection)

1. **XSS risk (security).** Every renderer inserts data into `innerHTML` without escaping. That's harmless with hard-coded data, but once organizers can type event titles into the database, a title like `<img src=x onerror=…>` would run script in other students' browsers. *XSS (cross-site scripting)* means injecting script into a page that other users view. **Fix:** add a small `escapeHtml()` helper and use it everywhere DB text is rendered.
2. **Role/page mismatch with your spec.** In the UI, *event approval* sits on the **Admin** page and *OD review* sits on the **DSA** page. Your master prompt makes **DSA the event approval authority**, with OD review as an assignable permission. (Decision needed — see §9, Q2.)
3. **False security claim on the ticket** (see §4).
4. **No `.gitignore`.** You'll need one before any `.env`/config secrets exist.
5. **README "Design Philosophy"** still describes the old Mocha/Platinum/Champagne palette from the earlier ChatGPT prompt, not the Ivory/Plum/Terracotta palette actually in the CSS.
6. Housekeeping: `manus-routes.json` and the empty root `assets/` aren't used. Safe to delete, but I'll leave them for you to decide.

---

## 6. Missing backend functionality (summary)

Everything in master-prompt sections 5–15 is missing: authentication, the profiles and roles database, RLS, the event lifecycle, timetable conflict detection, venue collision detection, transaction-safe registration, OD workflow, attendance/QR, notifications, real dashboards, and recommendations.

---

## 7. Proposed architecture (for approval; no code written yet)

```
 Browser (Vercel static hosting)                Supabase (hosted)
 ┌──────────────────────────────┐   HTTPS   ┌──────────────────────────────────┐
 │ index.html  (existing SPA)   │──────────▶│ Auth  (email+password, sessions) │
 │ styles.css  (unchanged theme)│  JWT in   │                                  │
 │ js/config.js  URL + publish- │  every    │ PostgREST API ─▶ PostgreSQL      │
 │               able key only  │  request  │   • tables + constraints         │
 │ js/supabase-client.js        │           │   • RLS policies (who sees what) │
 │ js/auth.js, js/events.js …   │           │   • RPC functions (register,     │
 │ (ES modules, no build step)  │           │     approve, check_conflicts …)  │
 └──────────────────────────────┘           │   • triggers (profile creation,  │
                                            │     notifications, audit log)    │
                                            │ Edge Function: only if QR needs  │
                                            │   a server-held signing secret   │
                                            └──────────────────────────────────┘
```

Key decisions I'd make (and explain in later stages):

- **Keep the SPA.** Add `login` / `signup` / `reset` / profile views as new `page-view` sections in the same design, and do not create separate HTML pages that duplicate the header and footer.
- **No build step.** Load `@supabase/supabase-js` v2 as an ES module from a pinned CDN URL. Split `app.js` into small modules under `public/js/`.
- **`.env` caveat.** A static site has no server to read `.env`. The Supabase URL and **publishable** key go in `public/js/config.js`. They're designed to be public, and security comes from RLS. The **service-role key and DB password never go in the repo.** `.env.example` documents them for CLI use only.
- **Roles:** one `role` column on `profiles` (`student | organizer | dsa | admin`). The default is `student`, set by a trigger on `auth.users`. Users can't update the column themselves, and only an admin RPC can change it. Organizer *scope* comes from `club_members` (which clubs a user can manage).
- **Business rules in PostgreSQL:** conflict detection, venue collision (an exclusion constraint that blocks double-booking even under concurrent requests), capacity-safe registration, and lifecycle transitions as `SECURITY DEFINER`/`INVOKER` RPCs with locked `search_path`.
- **QR attendance:** a short-lived, random, per-event check-in token stored hashed in the DB and validated by an RPC. A real QR library (pinned CDN) renders it. I'll document what it does and doesn't prevent (e.g. a screenshot shared during the validity window).

You said you'll work on the **database schema structure later**, so I have **not** designed tables or written migrations. The master prompt's table list (profiles, clubs, club_members, venues, events, event_registrations, timetable_slots, student_interests, od_requests, attendance_records, notifications, audit_logs, plus maybe feedback/qr_tokens) is a sound starting point that we'll refine together in Stage 2.

---

## 8. Required configuration (you will need to do these; I can't)

1. Create a free Supabase project, preferably a dedicated **dev** project, and copy its **Project URL** and **publishable (anon) key**.
2. In Auth settings, enable email/password and add redirect URLs (`http://localhost:5500`, your Vercel URL).
3. Decide how migrations get applied (see Q3 below).
4. After migrations, promote the first admin with one SQL statement in the dashboard. I'll provide it, and it can't be done from the browser on purpose.

---

## 9. Decisions I need from you before Stage 2

1. **Database schema:** you said you'll work on it later. Should I wait for your schema notes, or draft a proposal (ER diagram + table docs, **no SQL yet**) for you to edit?
2. **DSA vs Admin pages:** move *event proposal approvals* to the DSA page (DSA gets two tabs: Proposals + OD requests) and turn Admin's list into an overview? This is a small UI change that matches your spec.
3. **Migrations and tests:** do you have **Docker Desktop** installed? With Docker I can use the Supabase CLI to run a local database and execute real automated SQL tests. Without it, migrations go into the hosted project through the SQL editor and tests run there, which is slower and partly manual.
4. **Evaluation ribbon:** once real login exists, the persona switcher can't just "become" another role. I'd like to turn it into a **demo quick-login** that signs in as seeded demo accounts, shown only when a `DEMO_MODE` flag is on. Is that OK?

---

## 10. Implementation sequence (after your answers)

| Stage | Output |
|---|---|
| 2 Architecture | ER diagram, permission matrix (4 roles × all tables × S/I/U/D), lifecycle and registration flow diagrams |
| 3 Foundation | `supabase/migrations/*.sql`, constraints, indexes, seed data, `.gitignore`, `.env.example` |
| 4 Auth & RLS | signup trigger, roles, every RLS policy, auth views in the SPA |
| 5 Events | proposal → submit → DSA approve/reject → publish → complete/cancel RPCs |
| 6 Scheduling | `check_timetable_conflict`, venue exclusion constraint, campus-wide warnings, `register_for_event` |
| 7 OD & attendance | OD workflow, QR token issue/validate, manual attendance |
| 8 Notifications & dashboards | triggers, unread count, aggregate RPCs per role |
| 9 Frontend wiring | replace hard-coded data, escape output, loading/error states, keep theme/layout |
| 10 Tests & docs | SQL + JS unit tests with real results, `docs/*.md`, viva guide |

Git: I haven't run and won't run any commit, push, merge, rebase, branch, or staging command.
