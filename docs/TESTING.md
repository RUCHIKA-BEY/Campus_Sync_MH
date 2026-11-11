# CampusSync — Testing

## How the database tests work

There's no Docker on the development machine, so the tests use **PGlite**: real PostgreSQL (v18) compiled to WebAssembly and run inside Node.js. Each test run:

1. starts an empty in-memory PostgreSQL,
2. applies `tests/db/supabase_shim.sql`, a **test-only** stand-in for the `auth` schema and the `anon`/`authenticated` roles that every real Supabase project already has,
3. applies every file in `supabase/migrations/` in filename order, then `supabase/seed.sql`,
4. runs each test inside a transaction that is **rolled back** afterwards, so tests can't affect each other.

Tests check the **constraint name** in each error, not just "an error happened". That proves the *right* rule rejected the bad data.

```bash
npm install
```

```bash
npm run test:db
```

## Stage 3 results (run 2026-11-11, PGlite 0.5.12 / PostgreSQL 18.6)

**30 / 30 passed.**

| Area | What is proven |
|---|---|
| Setup | migrations + seed apply cleanly; seed is re-runnable; RLS is enabled on all 21 tables |
| RLS lockdown | a logged-in user sees 0 rows, INSERT is refused, and an UPDATE trying `role = 'admin'` changes nothing |
| Profiles | default role `student`; invalid role rejected; email and registration number unique ignoring case; auth-user delete cascades; `updated_at` is set by the DB, not the client |
| Events | end after start; registration closes before start; capacity > 0; only drafts may omit a venue; **no self-approval**; rejection and cancellation need a reason |
| Venue collision | overlap rejected; event fully inside another rejected; **adjacent (12:00/12:00) allowed**; other venue allowed; same instant in a different timezone still collides; drafts don't hold the venue; cancelling releases it |
| Registrations | duplicate active registration rejected; re-register after cancel allowed with history kept; pass code is 32 random hex characters and unique |
| OD | student/event must match the registration; one active request; new request allowed after rejection; rejection needs a note; **approval creates no attendance** |
| Attendance | no duplicate check-in; QR needs a session **of the same event**; no check-in without a registration for that event |
| Feedback | impossible without attendance; one per student |
| Timetable | overlapping classes rejected; adjacent allowed; end > start; day 1–7 |
| Terms | overlapping terms rejected |
| Notifications | `dedupe_key` stops duplicates from retried operations |
| Audit log | UPDATE, DELETE and TRUNCATE blocked, even for the table owner; browser roles hold no such grants |

## Not yet tested (and why)

- **Truly simultaneous venue bookings.** PGlite has one connection, so two transactions can't race. The guarantee comes from PostgreSQL's exclusion constraint, which serialises conflicting inserts. It will be tested against the real Supabase project with two parallel clients in Stage 6.
- **The real Supabase environment.** These tests use the shim. Applying the migrations to your Supabase project is a manual step (see the README / Stage 3 notes).
- **RLS policies, RPC functions, timetable conflict calculation, and the frontend.** These are Stages 4–9.
