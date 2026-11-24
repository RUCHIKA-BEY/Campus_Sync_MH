# CampusSync — Database Migrations & History

How schema changes reach the real Supabase project safely, and how the project's **migration history** stays truthful.

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Migration** | A numbered SQL file in `supabase/migrations/` (`<14-digit timestamp>_<name>.sql`). Files apply in timestamp order, once each. |
| **Migration history** | The table `supabase_migrations.schema_migrations` in your Supabase database. The Supabase CLI writes one row per applied migration and uses it to decide what's still pending. |
| **SQL Editor** | Runs SQL but **does not write history**. Supabase warns that schema changes made there "bypass the migration history and will cause `db push` to fail with sync errors". |
| **`migration repair`** | "Updates the tracking table only. It does not apply or revert any SQL." Used once to record what the bundle already did. |
| **Forward-only** | An applied migration is never edited. Mistakes are fixed by a *new* migration. |

The CLI is pinned in `package.json` (`supabase` **2.122.1**) and runs through `npx`, so you need no global install and no Docker for these commands. In this version, the hosted project is targeted with **`--linked`**. The npm scripts always pass it.

## 2. Why the project needs a one-time reconciliation

The first six migrations were applied by pasting `setup_all.sql` into the SQL Editor. So:

- the **schema** in the database matches migrations `20261111000100` … `000600`, but
- the **history table** is empty or missing, so the CLI believes none were applied. A plain `db push` would try to re-run them and stop at `type "app_role" already exists`.

The fix is to **record** them as applied (repair) after **proving** the database matches the files (`verify_setup.sql`). The new migration 7 is then applied the proper way, with `db push`.

## 3. Migration 7: why it exists

Since **30 Oct 2026** Supabase no longer auto-grants table privileges in `public` to the API roles. Without a `GRANT`, every request fails with `42501 permission denied for table …` **before RLS runs**. Our live check showed exactly that. Migration `20261124000100_explicit_data_api_grants.sql`:

1. revokes everything from `anon` / `authenticated`, so it ends in the same state whatever the project's defaults were;
2. grants exactly what the RLS policies need (least privilege), including the column-level limits on `profiles`, `events` and `notifications`;
3. grants `service_role` (server scripts only) access so `npm run demo:users` works.

Two gates now protect every request: the **GRANT** (may this *role* touch this table/column?) and **RLS** (which *rows* may this *user* touch?).

---

## 4. One-time reconciliation: steps for you

Run these from the project folder in your own terminal. They need **your** Supabase login and database password, which you type into the CLI's prompts. Never paste them into chat or into files.

**Step 1: prove the database matches the six files.** In the dashboard, open **SQL Editor**, paste `supabase/verify_setup.sql`, and Run it.
- Every row **without** `[m7]` and **not** starting with "migration history" must be ✅.
- `[m7]` rows and the two "migration history" rows showing ❌ is expected at this point.
- **If any other row is ❌, stop.** Repairing would record something untrue. Send me the row.

**Step 2: log in and link** (opens a browser for login; `link` asks for the database password):

```bash
npx supabase login
```

```bash
npx supabase link --project-ref zmnhoeytxufogxquixpt
```

**Step 3: look before changing anything.**

```bash
npm run db:list
```

Expected: 7 migrations in the LOCAL column, none in REMOTE.

**Step 4: record the six bundle migrations as applied** (history only; runs no SQL):

```bash
npx supabase migration repair --status applied --linked 20261111000100 20261111000200 20261111000300 20261111000400 20261111000500 20261111000600
```

**Step 5: confirm.**

```bash
npm run db:list
```

Expected: the six in both columns, and `20261124000100` only in LOCAL.

**Step 6: preview, then apply migration 7.**

```bash
npm run db:push:dry
```

It must list **only** `20261124000100`. If it lists anything else, stop.

```bash
npm run db:push
```

**Step 7: verify end to end.**
- Run `verify_setup.sql` again: **every row ✅**, with history showing 7 versions and latest `20261124000100`.
- Then run:

```bash
npm run check:supabase
```

Expected: all checks pass as an anonymous visitor.

---

## 5. Workflow for every future migration (Stage 5 onward)

1. **Create** `supabase/migrations/<YYYYMMDDHHMMSS>_<what>.sql` with a timestamp later than every existing file.
2. **Include grants** for any new table or function in the *same* migration (Supabase no longer adds them). Add RLS + policies in the same file too.
3. **Keep it transaction-safe**: no `create index concurrently`, and no adding enum values that the same file then uses. The CLI docs don't promise per-file transactions, so each file must be safe to stop halfway.
4. **Test locally:** `npm run test:db` rebuilds the whole database from all migrations and runs every test (the grant guard tests included).
5. **Deploy:** `npm run db:list`, then `npm run db:push:dry` (must list only the new file), then `npm run db:push`, then `npm run db:list`.
6. **Verify:** `verify_setup.sql` (extended each stage) and `npm run check:supabase`.
7. **Never** change schema in the SQL Editor or Table Editor, and **never** edit an applied migration.

Optional, safer still: create a second free Supabase project as **staging**, link it, push there first, then re-link production.

## 6. Where the bundle still fits

`npm run db:bundle` is now only for a **brand-new empty project** when the CLI isn't available. Afterwards you **must** repair history for every migration it contained (Section 4, steps 1–5), listing all versions in the bundle.

## 7. Seed data and demo users

`seed.sql` and `npm run demo:users` are **data**, not schema. They aren't migrations and don't appear in history. The CLI applies `seed.sql` only if you pass `--include-seed`, which our scripts never do.
