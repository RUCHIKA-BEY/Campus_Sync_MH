# CampusSync — API Reference

CampusSync has **no custom API server**. The frontend talks to Supabase in two ways:

1. **Table reads and simple writes** through PostgREST (`supabase.from('table')`), filtered by GRANTs and RLS.
2. **Workflow functions (RPC)** through `supabase.rpc('name', args)`. Every state change with rules (register, approve, check in …) goes through one of these.

All functions below are `SECURITY DEFINER` with a pinned `search_path`, and re-check the caller inside. Signatures are taken from the live schema. `tests/db/security_audit.test.js` fails if this list changes without review.

Errors come back as `{ message, code }`. Common codes: `42501` not allowed, `P0001` a business rule failed (the message says which), `P0002` not found, `23505` duplicate, `23P01` venue clash, `22023` bad argument. The frontend turns them into plain language in `web/src/lib/errors.ts`.

## 1. Identity and roles

| Function | Caller | Returns | Notes |
|---|---|---|---|
| `current_app_role()` | signed in | `app_role` | NULL if deactivated |
| `has_role(VARIADIC roles app_role[])` | signed in | boolean | used inside policies |
| `is_club_manager(p_club_id uuid)` | signed in | boolean | organizer role **and** active lead/coordinator |
| `manages_event(p_event_id uuid)` | signed in | boolean | |
| `can_review_od()` | signed in | boolean | role ∈ `platform_settings.od_reviewer_roles` |
| `admin_set_user_role(p_user_id uuid, p_role app_role)` | admin | void | not on yourself; audited; notifies the user |
| `admin_set_user_active(p_user_id uuid, p_active boolean)` | admin | void | not on yourself; audited |

## 2. Event lifecycle (migration 8)

| Function | Caller | Transition |
|---|---|---|
| `submit_event(p_event_id uuid)` | club manager | draft / changes_requested → submitted (checks venue, capacity, dates, venue clash) |
| `reopen_event(p_event_id uuid)` | club manager | rejected → draft |
| `start_event_review(p_event_id uuid)` | DSA | submitted → under_review |
| `review_event(p_event_id uuid, p_decision text, p_note text DEFAULT NULL)` | DSA (not the creator) | → approved / rejected / changes_requested. `p_decision` ∈ `approve`, `reject`, `request_changes`; a note of 10+ characters is required except for approve |
| `publish_event(p_event_id uuid)` | club manager or DSA | approved → published; notifies followers |
| `complete_event(p_event_id uuid)` | club manager, DSA, admin | published → completed (after the end) |
| `cancel_event(p_event_id uuid, p_reason text)` | club manager, DSA, admin | → cancelled (reason 10+ characters); notifies registrants |

## 3. Scheduling and registration (migration 9)

| Function | Caller | Returns |
|---|---|---|
| `check_timetable_conflict(p_event_id uuid)` | signed in (own timetable; published events) | `jsonb { status, event_minutes, overlap_minutes, free_minutes, timetable_complete, od_eligible, conflicts[] }` |
| `register_for_event(p_event_id uuid)` | student | `jsonb { registration_id, pass_code, seats_left, conflict }` |
| `cancel_registration(p_event_id uuid)` | the registered student | void (until the deadline; withdraws OD) |
| `get_event_seats(p_event_ids uuid[])` | **anyone** | `TABLE(event_id, registered, capacity)` (public events only, numbers only) |
| `event_scheduling_warnings(p_event_id uuid)` | club manager, DSA, admin | `TABLE(other_event_id, other_title, other_club, other_venue, other_scope, other_status, starts_at, ends_at, reason)` |
| `get_event_registrants(p_event_id uuid)` | club manager, DSA, admin | `TABLE(registration_id, full_name, registration_number, department_code, academic_year, status, conflict_status, conflict_minutes, registered_at)` (no email or phone) |

`conflict.status` ∈ `no_conflict`, `partial_conflict`, `full_conflict`, `timetable_not_configured`.

## 4. On-Duty and attendance (migration 10)

| Function | Caller | Returns |
|---|---|---|
| `request_od(p_event_id uuid, p_reason text)` | registered student with a real clash | `uuid` (request id) |
| `withdraw_od(p_request_id uuid)` | the student (pending only) | void |
| `decide_od(p_request_id uuid, p_decision text, p_note text DEFAULT NULL)` | configured OD reviewer | void (`approve` / `reject`; reject needs 10+ characters; never creates attendance) |
| `get_od_queue(p_status od_status DEFAULT 'pending')` | OD reviewer, admin | `TABLE(request_id, status, reason, requested_at, reviewed_at, review_note, conflict_snapshot, student_name, registration_number, department_code, event_id, event_title, starts_at, ends_at, club_name)`; NULL status = all |
| `my_od_requests()` | signed in | the caller's requests with event titles |
| `open_attendance_session(p_event_id uuid, p_minutes integer DEFAULT 180)` | club manager | the new `attendance_sessions` row (5–720 min; from 2 h before the start until the end) |
| `close_attendance_session(p_session_id uuid)` | club manager | void |
| `check_in(p_event_id uuid, p_pass_code text)` | club manager, session open | `jsonb { student_name, registration_number, checked_in_at }` |
| `mark_attendance_manual(p_registration_id uuid)` | club manager | void (method `manual`, audited) |
| `revoke_attendance(p_registration_id uuid, p_reason text)` | club manager, DSA, admin | void (audited) |
| `get_event_attendance(p_event_id uuid)` | club manager, DSA, admin | roster + open session |
| `my_attendance()` | signed in | the caller's check-ins |

## 5. Dashboards and recommendations (migration 11)

| Function | Caller | Returns (`jsonb` unless noted) |
|---|---|---|
| `student_dashboard()` | signed in | `{ upcoming_registrations, pending_od, approved_od, events_attended, clubs_followed, active_clubs, upcoming_public_events, timetable_classes, interests }` |
| `organizer_dashboard()` | organizer | `{ total_events, by_status, total_registrations, seats_available, attendance_rate, upcoming[] }` |
| `dsa_dashboard()` | DSA, admin | `{ awaiting_review, changes_requested, approved_30d, rejected_30d, published_upcoming, avg_decision_hours, od_pending, od_approved_30d, od_rejected_30d }` |
| `admin_dashboard()` | admin | `{ users_by_role, active_clubs, venues, events_by_status, upcoming_published, registrations_active, attendance_verified, attendance_rate, od_by_status, registrations_14d[], events_by_category[] }` |
| `get_recommendations(p_limit integer DEFAULT 6)` | signed in | `TABLE(event_id, score, reasons text[], conflict_status)` |

## 6. Direct table access (PostgREST)

| Table | Visitor | Signed in (RLS narrows it further) |
|---|---|---|
| departments, categories, venues, clubs, events (public ones), event_audiences | read | read; admins write reference data |
| profiles | — | read own (DSA/admin: all); update own personal columns |
| timetable_slots | — | full CRUD on own rows only |
| student_interests, club_follows, saved_events | — | read, insert and delete own rows |
| events | — | club managers: insert and update descriptive columns of drafts; never `status` |
| event_registrations, od_requests, attendance_* | — | read-only (writes only via the functions above) |
| notifications | — | read own; update `is_read` only |
| audit_logs | — | admins read only |

## 7. Frontend integration points

| Hook / module (`web/src/lib`) | Calls |
|---|---|
| `auth/AuthProvider.tsx` | Supabase Auth: sign up, sign in, sign out, reset, update password; reads `profiles` |
| `publicEvents.ts` | `events` (public) + `get_event_seats` |
| `registration.ts` | `check_timetable_conflict`, `register_for_event`, `cancel_registration`, `get_event_registrants`, `event_scheduling_warnings` |
| `workflow.ts` | lifecycle functions (§2) |
| `od.ts` | OD and attendance functions (§4) |
| `organizer.ts`, `timetable.ts`, `admin.ts`, `queries.ts` | table reads and writes allowed by RLS + admin functions |
| `dashboards.ts`, `notifications.ts` | §5 functions; `notifications` table |
