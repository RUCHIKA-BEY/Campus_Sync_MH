# CampusSync — Architecture

## 1. The big picture

```
                         Browser (any device)
 ┌──────────────────────────────────────────────────────────────────────┐
 │  React 19 + TypeScript SPA (web/)  ·  served by Vercel from dist/     │
 │                                                                        │
 │  features/  one folder per screen (discover, events, timetable,       │
 │             organizer, dsa, admin, notifications, auth …)             │
 │  lib/       data hooks (TanStack Query) → supabase-js                 │
 │  auth/      AuthProvider (session + profile), route guards            │
 └───────────────┬──────────────────────────────────────────────────────┘
                 │ HTTPS · JWT access token on every request
                 │ (publishable key only; never the secret key)
 ┌───────────────▼──────────────────────────────────────────────────────┐
 │ Supabase                                                              │
 │  Auth ──────────── accounts, password hashes, sessions, email links  │
 │  PostgREST (Data API) ── turns HTTP requests into SQL as the caller  │
 │  PostgreSQL                                                           │
 │    21 tables · constraints · exclusion constraints (no overlaps)      │
 │    GRANTs  ─ which role may touch which table/column                  │
 │    75 RLS policies ─ which rows each user may see/change              │
 │    37 functions (RPC) ─ every workflow: register, approve, check-in…  │
 │    11 triggers ─ profile creation, updated_at, transition guard,     │
 │                  append-only audit log                                 │
 └──────────────────────────────────────────────────────────────────────┘
```

**The rule the whole design follows:** the browser decides what to *show*; the database decides what is *allowed*. Every permission is checked in PostgreSQL, so changing the frontend code or hand-crafting API requests can't bypass it.

## 2. Request lifecycle (example: a student registers)

1. The student clicks **Register** → `useRegister()` calls `supabase.rpc('register_for_event', { p_event_id })`.
2. supabase-js sends HTTPS to PostgREST with the student's **JWT** (a signed token proving who they are).
3. PostgREST verifies the token and runs the function as role `authenticated`, with `auth.uid()` = the student's id.
4. `register_for_event` (SECURITY DEFINER, pinned `search_path`):
   - **locks** the event row;
   - checks role, status, registration window, duplicates and **capacity**;
   - runs the **timetable conflict** check;
   - inserts the registration and writes a notification;
   - returns the pass code and the conflict result.
5. TanStack Query refreshes the affected screens (My Events, seat counts, "Can I attend?").

If any check fails, the function raises a readable error, the whole transaction is undone, and `friendlyError()` shows the message.

## 3. Frontend structure (`web/src`)

| Folder | Contents |
|---|---|
| `main.tsx`, `App.tsx` | Providers (Motion, Query, Toasts, Auth) and routes, each page lazy-loaded |
| `auth/` | `AuthProvider` (session + profile from `profiles`), `Protected` route guard, email-link handling |
| `components/` | UI primitives, layout (header, mobile tab bar), modal, tabs, charts, toasts |
| `lib/` | Supabase client, env guard, typed data hooks per area (`events`, `registration`, `od`, `organizer`, `admin`, `dashboards`, `notifications`, `timetable`), pure logic with unit tests |
| `features/` | Screens: home, discover, events, registrations, clubs, timetable, organizer, dsa, admin, notifications, auth |

**Code splitting:** each page and the QR scanner download only when first needed, so the Admin console never reaches a student's phone.

## 4. Security layers (detail in SECURITY.md)

| Layer | Example |
|---|---|
| Content-Security-Policy | Scripts only from our own origin; network only to `*.supabase.co` |
| Auth | Supabase-issued JWT; the signup trigger always creates a **Student** |
| GRANTs | Visitors can only *read* the 6 catalogue tables; nobody can write `events.status` or `profiles.role` directly |
| RLS | e.g. a timetable is visible only to its owner |
| Functions | Every workflow re-checks the caller's role and the data's state |
| Constraints | No venue double-booking, no overlapping classes, no duplicate check-in, no self-approval |
| Audit log | Append-only, even for the database owner |

## 5. Environments and deployment

| | Where |
|---|---|
| Source of truth for the database | `supabase/migrations/` (11 files), applied with `npm run db:push` and tracked in `supabase_migrations.schema_migrations` |
| Local database tests | PGlite (real PostgreSQL in Node): `npm run test:db` |
| Frontend | `npm run dev` (port 5500); `npm run build` → `dist/` |
| Hosting | Vercel runs `npm ci && npm run build`, serves `dist/` with SPA rewrites and security headers. The build **fails** if the Supabase variables are missing or a secret key is used |
| Configuration | `.env.local` (public `VITE_*` values) and `.env` (secret key for local scripts only), both git-ignored |

## 6. Key design decisions

| Decision | Why |
|---|---|
| Business rules in PostgreSQL functions, not an API server | One trusted place, transactions and row locks for free, nothing extra to host or secure |
| Edge Functions **not** used | Every workflow is a database transaction; no external secret or third-party call needed one |
| One `status` column for the event lifecycle (D1) | Two columns could contradict each other (e.g. rejected + published) |
| Static QR pass + organizer scan + time-limited session (D3) | Matches the ticket UI; the database validates every scan. The limits are documented honestly |
| Explicit GRANTs migration (m7) | Supabase stopped auto-granting table access (Oct 2026); explicit grants are least-privilege anyway |
| Plain SVG charts | Two simple charts don't justify a 100 kB chart library |
