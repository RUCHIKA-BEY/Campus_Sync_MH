# CampusSync — Frontend (React + TypeScript)

The new frontend lives in `web/`. The original static site in `public/` is **untouched and still what Vercel deploys**, until the switch-over (see §6).

## 1. Stack, and why each piece is there

| Tool | Version | Why |
|---|---|---|
| React | 19.3.1 | Components: each piece of UI is a function that re-renders when its data changes. No more hand-built `innerHTML` strings (which caused the dead "View ticket" button and risked XSS). |
| TypeScript | 7.0.2 (strict) | Catches mistakes like a misspelled column or a missing field before the code runs. |
| Vite | 8.3.7 | Dev server with instant reload; builds `web/` into `dist/`. |
| Tailwind CSS | 4.3.5 | Styling with utility classes generated from **our** palette tokens (`web/src/index.css`, `@theme`). |
| React Router | 8.5.1 | Real URLs (`/discover`, `/events/hackgrid`) instead of `#hash` pages, so links can be shared. |
| TanStack Query | 5.107.1 | Loading, error and caching states for every Supabase request. |
| Motion | 14.11.1 | Subtle animations (active-tab pill, card entry, page fade). Respects the OS "reduce motion" setting. |
| Radix UI | Dialog 1.3.1, Dropdown 2.2.1 | Accessible ticket dialog and menus (focus trap, Escape to close, screen-reader labels). |
| Lucide | 1.70.0 | Consistent SVG icons. |
| qrcode | 1.5.4 | Generates **real, scannable** QR codes. |
| supabase-js | 2.118.0 | Same client version as the legacy site. |

Every version is pinned exactly and was released at least two weeks before it was installed.

## 2. Folder map

```
web/
├── index.html, vite.config.ts, tsconfig.json
├── public/assets/                 images
└── src/
    ├── main.tsx                   providers: Motion, Query, Toasts, Auth
    ├── App.tsx                    routes (+ which need sign-in / a role)
    ├── index.css                  palette tokens (@theme) and base styles
    ├── lib/
    │   ├── env.ts                 VITE_* config; refuses secret keys
    │   ├── supabase.ts            the one Supabase client
    │   ├── access.ts (+test)      route rules (UX only; RLS enforces)
    │   ├── time.ts (+test)        IST conversions for forms, weekday/date in campus time
    │   ├── timetable.ts, organizer.ts, admin.ts   data hooks per console
    │   ├── events.ts (+test)      event model, SAMPLE events, status, filters, IST formatting
    │   ├── queries.ts             TanStack hooks: departments, categories, clubs, interests, follows
    │   ├── demo.ts                on-device bookmarks + demo registrations
    │   ├── errors.ts, validation.ts, storage.ts, types.ts
    ├── auth/                      AuthProvider (session + profile), Protected, AuthUrlEffects
    ├── components/                ui primitives, Toaster, layout/AppShell + nav
    └── features/                  home, discover, events (detail + ticket), registrations,
                                   clubs, auth (sign-in/up/reset/profile), misc
```

## 3. What is real vs. sample (be precise in the viva)

| Feature | Status |
|---|---|
| Sign up / sign in / sign out / reset / change password / session restore | **Real** (Supabase Auth) |
| Profile view and edit, department list | **Real** (`profiles`, `departments`) |
| Interests on Profile; "For you" on Discover | **Real interests**, matched against sample events with a transparent rule ("Because you picked …") |
| Clubs directory, Follow / Unfollow | **Real** (`clubs`, `club_follows`) |
| Role-aware navigation (Organizer / DSA / Admin links) | **Real role** from `profiles`; links hidden from other roles; RLS enforces |
| Events on Home / Discover / detail | **Real** published events with live seat counts; labelled samples only while nothing is published |
| Registration status (open, closing soon, full, closed, ended) | **Real logic** computed from dates; runs unchanged on DB rows later |
| Registration, cancellation, "Can I attend?", QR pass (real events) | **Real** (`register_for_event`, `check_timetable_conflict`, `cancel_registration`). Verified check-in is Stage 7 |
| Bookmarks; demo registration for sample events | On this device (localStorage), labelled |
| On-Duty requests (student), OD review queue (DSA), check-in desk with camera scanner and manual marking (organizer) | **Real** (migration 10). The scanner uses `jsqr`, loaded only when scanning starts |
| Organizer registrants list, campus-wide clash warnings, target departments | **Real** (`get_event_registrants`, `event_scheduling_warnings`, `event_audiences`) |
| Notifications (bell, unread count, history, mark read) | **Real** (`notifications` table, RLS) |
| Student home dashboard, recommendations with reasons; organizer, DSA and admin numbers; admin charts | **Real** (migration 11 aggregate functions) |
| Timetable | **Real**: add, edit and delete weekly classes (`timetable_slots`). The database rejects overlapping classes. Private to the student |
| Organizer console | **Real**: managed clubs, create, edit and delete **drafts** (`events`; column GRANTs block status changes). *Submit for approval* is disabled until Stage 5 |
| DSA desk | **Real queues** (non-draft events, pending OD), empty until Stage 5 creates submissions. Approve/reject disabled until Stage 5/7 |
| Admin console | **Real**: counts (COUNT queries), users with role change and deactivate (audited RPCs), club leads and coordinators, audit log |

## 4. Run it

Create `.env.local` in the project root (git-ignored), using values from `.env.example`. These are **public** values only:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_DEMO_MODE=true
```

```bash
npm run dev
```

The app runs at `http://localhost:5500`, the same port as before, so Supabase's existing redirect URL still works.

| Command | Does |
|---|---|
| `npm run typecheck` | TypeScript strict check |
| `npm run test:web` | 35 unit tests (status, filters, timezone, route rules, secret-key guard) |
| `npm run build` | type-check + production build into `dist/` |
| `npm run test:db` | the 63 database tests (unchanged) |

Leave the two `VITE_SUPABASE_*` values empty to run in **sample mode** (no backend).

## 5. Security notes

- Only `VITE_*` variables reach the browser, so `SUPABASE_SECRET_KEY` and `DEMO_PASSWORD` in the same `.env` can't be bundled. `env.ts` also **refuses** a secret-looking key placed in the publishable slot.
- React escapes text by default, so event titles or names containing HTML are shown as text and never run.
- Route guards (`Protected`) only decide what to *show*. The database (GRANTs + RLS, 63 tests) decides what is *allowed*.
- Auth forms use `method="post"`, so credentials can never land in a URL even if JavaScript fails.

## 6. Switch-over checklist

1. ✅ Timetable and the Organizer / DSA / Admin screens rebuilt.
2. ✅ Bundle split per route. The first load went from 926 kB to 665 kB (199 kB gzipped); the rest is shared vendor code (supabase-js, Motion, router).
3. ✅ Signed-in screens verified with the demo accounts.
4. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel → Project → Settings → Environment Variables.
5. ✅ `vercel.json` now runs `npm ci` + `npm run build` and serves `dist/`, with SPA rewrites and security headers. A Vercel build **fails on purpose** if the two `VITE_SUPABASE_*` variables are missing, or if a secret key is used.
6. Retire `public/` (legacy) once the deployed React app is verified.
