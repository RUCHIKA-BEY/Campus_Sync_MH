# CampusSync — Database

PostgreSQL on Supabase: **21 tables, 75 RLS policies (+3 Storage policies), 11 triggers, 41 callable functions**, built by 14 migrations in `supabase/migrations/`. The original design and decisions (D1–D9) are in [SCHEMA_PROPOSAL.md](SCHEMA_PROPOSAL.md), which includes the ER diagram. This page is the as-built reference.

## 1. Migrations

| # | File | Adds |
|---|---|---|
| 1 | `20261111000100_extensions_and_types` | `btree_gist`; enums (roles, statuses …); `time_range` |
| 2 | `20261111000200_core_tables` | All 21 tables, keys, CHECKs, exclusion constraints, indexes |
| 3 | `20261111000300_housekeeping_triggers_and_rls_lockdown` | `updated_at` triggers, append-only audit log, RLS on every table |
| 4 | `20261111000400_reference_data` | Categories, platform settings |
| 5 | `20261111000500_auth_roles_and_helpers` | Signup trigger, role helpers, column protection, admin role functions |
| 6 | `20261111000600_rls_policies` | 75 policies |
| 7 | `20261124000100_explicit_data_api_grants` | Least-privilege GRANTs for the API roles |
| 8 | `20261124000200_event_lifecycle` | Status-transition trigger; submit / review / publish / cancel / complete |
| 9 | `20261124000300_registration_and_conflicts` | Timetable conflicts, registration, seats, warnings, registrants |
| 10 | `20261124000400_od_and_attendance` | OD workflow, attendance sessions, check-in, manual marks |
| 11 | `20261124000500_dashboards_and_recommendations` | Role dashboards, recommendations |
| 12 | `20261125000100_dsa_events_venue_requests_media` | Office of the DSA host club + DSA-head approval; venue requests (added to the venue list on approval); poster/banner columns and the public `event-media` Storage bucket (JPG/PNG/WebP, 2 MB) |
| 13 | `20261126000100_lunch_not_a_clash` | Timetable entries named "Lunch" (or Lunch break/hour/time) are free time: skipped by the clash check, still shown in the timetable |
| 14 | `20261128000100_schedule_preview` | `check_timetable_window(start, end)`: the signed-in student's OWN timetable against a time window, using the same `_timetable_conflict`. Lets sample events (which exist only in the browser) show a clash preview. Stores nothing; registration is unchanged |

Seed data (fictional, development only) is in `supabase/seed.sql`; it isn't a migration.

## 2. Tables

| Area | Table | Purpose | Key rules |
|---|---|---|---|
| Reference | `departments` | Department codes and names | unique code and name |
| | `categories` | Event categories | unique slug |
| | `academic_terms` | Semester date ranges | terms may not overlap (exclusion) |
| | `venues` | Rooms and halls | capacity > 0 |
| | `platform_settings` | Configurable rules (timezone, OD reviewers, D8/D9 …) | admin-editable |
| People | `profiles` | One row per account (same id as `auth.users`) | role default `student`; email and registration number unique ignoring case; users may edit only personal columns |
| | `student_interests` | Student ↔ category | composite primary key |
| Clubs | `clubs` | Clubs | unique name |
| | `club_members` | Who leads or coordinates which club | one row per club + user |
| | `club_follows` | Students following clubs | composite primary key |
| Events | `events` | Proposals and events | time order; registration window; venue required after draft; **no self-review**; reasons required; **no venue double-booking** (exclusion on `venue_id` + time range while reserving) |
| | `event_audiences` | Target departments / years | used by campus-wide warnings |
| Participation | `event_registrations` | Registrations | **one active per student per event** (partial unique index); random 32-character pass code; conflict snapshot |
| | `saved_events` | Bookmarks (schema only; the UI keeps bookmarks on-device) | composite primary key |
| | `timetable_slots` | Weekly classes | end > start; **no overlapping classes** (exclusion) |
| OD & attendance | `od_requests` | On-Duty requests | composite FK to the registration; one active per registration; rejection needs a note |
| | `attendance_sessions` | Check-in windows | closes after it opens |
| | `attendance_records` | Who attended | **one per student per event**; QR requires a session of the same event |
| | `event_feedback` | Ratings (schema ready; no UI yet) | FK to attendance, so feedback is impossible without attending |
| System | `notifications` | In-app inbox | unique (recipient, dedupe key) |
| | `audit_logs` | Sensitive actions | append-only (trigger blocks UPDATE, DELETE and TRUNCATE) |

## 3. Relationships at a glance

```
auth.users 1─1 profiles ─┬─< club_members >── clubs ──< events >── venues
                         ├─< club_follows  >──┘          │   └──< event_audiences >── departments
                         ├─< student_interests >── categories ──┘
                         ├─< timetable_slots >── academic_terms
                         ├─< event_registrations >── events
                         │        ├──< od_requests          (composite FK: id + student + event)
                         │        └──1 attendance_records ──< event_feedback
                         ├─< notifications
                         └─< audit_logs (actor)
events ──< attendance_sessions ──< attendance_records (session must be for the same event)
```

## 4. Triggers

| Trigger | Table | Does |
|---|---|---|
| `on_auth_user_created` | `auth.users` | Creates the profile (always role `student`) |
| `on_auth_user_email_changed` | `auth.users` | Keeps `profiles.email` in sync |
| `*_set_updated_at` (6) | profiles, clubs, venues, events, timetable_slots, platform_settings | Server-side `updated_at` |
| `audit_logs_no_update_delete`, `audit_logs_no_truncate` | `audit_logs` | Append-only |
| `events_enforce_transition` | `events` | Refuses status changes not in the lifecycle |

## 5. Indexes

Every foreign key used for filtering is indexed (e.g. `events(club_id)`, `event_registrations(student_id, status)`, `od_requests(status, requested_at)`, `notifications(recipient_id, is_read, created_at desc)`). The exclusion constraints build GiST indexes that also make overlap queries fast.

## 6. Time and timezone

Every instant is `timestamptz` (stored in UTC). Weekly classes are `time` values in campus time, and the campus timezone (`Asia/Kolkata`) comes from `platform_settings`. Conflict checks convert classes to real instants for each campus day the event touches.
