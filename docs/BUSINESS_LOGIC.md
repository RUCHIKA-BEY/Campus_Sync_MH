# CampusSync — Business Logic

## 1. Event lifecycle (Stage 5, migration `20261124000200_event_lifecycle.sql`)

```
            submit              start review           approve
  draft ───────────▶ submitted ─────────────▶ under_review ─────────▶ approved ──publish──▶ published ──complete──▶ completed
    ▲                  │  ▲                      │   │                  │                     │
    │ reopen           │  │ resubmit             │   └─ request_changes ┘                     │
    │                  │  └──────── changes_requested ◀─┘                                     │
    └──── rejected ◀───┴──────────── reject ◀────┘                                            │
  (any of draft, submitted, under_review, changes_requested, approved, published) ── cancel ──▶ cancelled
```

DSA may also decide directly from `submitted`, skipping "start review".

### Who can do what

| Action (function) | Allowed caller | Main checks | Side effects |
|---|---|---|---|
| `submit_event` | active lead/coordinator of the event's club (with the organizer role) | status is draft or changes_requested; venue chosen and active; capacity ≤ venue capacity; starts in the future; registration deadline not passed; **no venue clash** | `submitted_at`; old review cleared; all active DSA notified; audited |
| `reopen_event` | club manager | status is rejected | back to draft (DSA note kept); audited |
| `start_event_review` | DSA | status is submitted | organizer team notified; audited |
| `review_event(id, 'approve' \| 'reject' \| 'request_changes', note)` | DSA, never the creator | awaiting a decision; **reason of 10+ characters** to reject or request changes; approval **re-checks** venue, capacity and dates | reviewer and time recorded; team notified; audited |
| `publish_event` | club manager or DSA | status is approved; not started yet | `published_at`; team **and club followers** notified; now visible on Discover |
| `complete_event` | club manager, DSA, admin | published and already ended | audited |
| `cancel_event(id, reason)` | club manager, DSA, admin | not already cancelled, completed or rejected; reason of 10+ characters | team and **registered students** notified; stays visible as "Cancelled" |

### Why these are database functions

- Browser roles have **no privilege on `events.status`** (migration 7). Calling these functions is the only way to move an event, so an organizer can never approve their own proposal.
- Each function **locks the event row** (`SELECT … FOR UPDATE`) first. If a DSA approves while the organizer cancels, one waits for the other and the second sees the new state, so the event can't end up half-changed.
- A **transition trigger** refuses any jump not in the diagram, even for the database owner (e.g. `draft → published`).
- **Venue double-booking** is checked twice: a friendly pre-check names the clashing event (*"Seminar Hall 1 is already booked for 'X' (12 Dec, 10:00 – 12:00)"*), and the exclusion constraint guarantees it even if two organizers submit at the same instant.

### Notifications

Written by the functions through `notify()` with a **dedupe key** (e.g. `event:<id>:published`), so a retried request never creates duplicate notifications. Each notification goes only to the people involved: the organizer team, the DSA, club followers, or registered students.

## 2. Discover: real vs. sample events

- Discover, Home, Clubs and event pages read **published, completed and cancelled-after-publication** events. The query filters on status explicitly, because a signed-in organizer or DSA can *see* more rows through RLS, and Discover must still show only public events.
- **Live seat counts** come from `get_event_seats()`: numbers only, never who registered.
- If no event has been published yet, the app falls back to clearly labelled sample events.
- "Featured" follows a transparent rule: **university-wide events**.

## 3. Timetable conflict detection (Stage 6, `_timetable_conflict`)

**One authoritative implementation, in the database.** The "Can I attend?" panel calls it through `check_timetable_conflict(event)`, and registration calls the same function again, so the browser can never fake a result.

### The overlap rule

Two time intervals overlap when

```
event_start < class_end   AND   event_end > class_start
```

Intervals are **half-open** `[start, end)`: an event from 11:00–12:00 does **not** clash with a class from 09:00–11:00, because 11:00 isn't inside `[09:00, 11:00)`.

### Algorithm

1. Read the campus timezone (`Asia/Kolkata`) from `platform_settings`.
2. For **each campus calendar day** the event touches, take the slice of the event on that day. This handles events that cross midnight.
3. Find the academic term containing that day. If there's no term, or the student has no classes in it, mark the timetable **incomplete**.
4. For that weekday, turn each weekly class into real timestamps for that date in campus time, and keep the ones that pass the overlap rule.
5. Overlap minutes = `min(event_end, class_end) − max(event_start, class_start)`, summed. Classes can't overlap each other (an exclusion constraint), so no minute is counted twice.
6. Status:
   - **full_conflict**: overlap ≥ event duration;
   - **partial_conflict**: overlap > 0;
   - **no_conflict**: no overlap and the timetable covers every event day;
   - **timetable_not_configured**: otherwise. We never call a student "free" just because nothing was entered.

The result includes the clashing classes with exact overlap times, total overlap, event duration, free minutes, and whether the event is OD-eligible.

### Worked examples (class: Data Structures, Monday 09:00–11:00)

| Event (Monday) | Overlap | Result |
|---|---|---|
| 12:00–13:00 | none | no_conflict |
| 09:30–10:30 | 60 of 60 min | full_conflict |
| 08:00–12:00 | 120 of 240 min | partial_conflict (120 min free) |
| 10:00–12:00 | 10:00–11:00 = 60 min | partial_conflict |
| 11:00–12:00 | touches, doesn't overlap | no_conflict |
| any time, no timetable entered | — | timetable_not_configured |
| 10:30–11:30, with OS also 11:00–12:00 | 30 + 30 = 60 of 60 | full_conflict (two classes) |
| Mon 23:00 → Tue 01:00, Night Lab Tue 00:30–02:00 | 30 min on Tuesday | partial_conflict |

All of these are automated tests in `tests/db/registration.test.js`.

## 4. Registration (`register_for_event`, `cancel_registration`)

Checks, in order:
1. A signed-in **student**.
2. The event is **published**, and registration is **open now** (between opens and closes).
3. **No duplicate** active registration.
4. **Seats left**, counted under a lock.
5. The **timetable result**. A full clash on a non-OD event is allowed or refused by the platform setting `allow_registration_on_full_conflict` (decision D8: allowed, with the result recorded).

The registration then stores a **snapshot** of the conflict result, gets a random 32-character pass code, and the student is notified.

**Why capacity can't be exceeded:** the function first locks the event row (`SELECT … FOR UPDATE`). If two students try for the last seat at the same moment, the second request waits until the first transaction finishes, then counts again, sees no seats left, and is refused. A JavaScript check couldn't do this, because both browsers would see "1 seat left".

**Cancelling** is allowed until the registration deadline (decision D9). It frees the seat and withdraws any pending or approved OD request for that registration.

## 5. Venue clashes vs. campus-wide warnings

| | Venue clash | Campus-wide warning |
|---|---|---|
| What | Same venue, overlapping time | Different venues, overlapping time, **shared audience** |
| Effect | **Blocked** by the database (exclusion constraint) | **Advice** shown to organizers and the DSA (`event_scheduling_warnings`) |
| When | On submit and again on approval | Live while drafting and reviewing |

A warning appears when both events are at least department-scope (configurable: `campus_warning_min_scope`) and their audiences intersect. Audience comes from `event_audiences`; no rows means "all students", and a NULL department or year means "any". Organizers set target departments when drafting.

## 6. Organizer registrant lists

`get_event_registrants(event)` lets a club's organizers, the DSA and admins see who registered: name, registration number, department, year, and the conflict snapshot. Email and phone are never exposed. Profiles otherwise stay private (RLS).

## 7. On-Duty requests (Stage 7, migration `20261124000400_od_and_attendance.sql`)

```
register for an OD-eligible event -> a real class clash exists -> request_od(reason)
    -> pending -> (OD reviewer) approve | reject (reason required) -> student notified
    the student may withdraw while pending; cancelling the registration withdraws it automatically
```

| Rule | Enforced by |
|---|---|
| Only for your own **active registration**, an **OD-eligible**, **published**, not-yet-ended event | `request_od` |
| There must be a **real clash right now** (partial or full). No clash means OD isn't needed; no timetable means "add your timetable first" | `request_od` -> `_timetable_conflict` |
| The clashing classes are stored as **evidence** (`conflict_snapshot`) for the reviewer | `request_od` |
| One active request per registration | unique index + function check |
| Reviewers = roles in `platform_settings.od_reviewer_roles` (default DSA) | `can_review_od()` in `decide_od` |
| Rejection needs a reason of 10+ characters; reviewers can't decide their own request; every decision audited | `decide_od` |
| **Approval never creates attendance** | tests prove it |

CampusSync records the platform's OD workflow. It does **not** claim to update the university's official OD or attendance systems.

## 8. QR attendance (Stage 7)

```
organizer opens a check-in session (5-720 min, from 2 h before start until the end)
  -> scans the student's pass (camera or typed code) -> check_in(event, pass) validates -> attendance (method 'qr')
  fallback: mark_attendance_manual (method 'manual', audited);  mistakes: revoke_attendance (reason, audited)
```

### What `check_in` checks

1. The caller manages the event's club.
2. A session for **this** event is open **right now**: the time limit.
3. The code looks like a CampusSync pass (32 hex characters; the `CAMPUSSYNC|` prefix and letter case are ignored).
4. The pass exists, belongs to **this** event, and the registration is active (not cancelled).
5. The student hasn't already checked in. A unique constraint also guarantees this.

It then returns the student's **name and registration number**, which the organizer compares with the person in front of them.

### What the QR protects against, and what it doesn't

| Attack | Protected? | How |
|---|---|---|
| Guessing a valid pass | Yes | Pass codes are 122 random bits |
| Making up attendance from the browser | Yes | No INSERT privilege on `attendance_records` for browser roles; only the organizer-only function writes |
| Checking yourself in | Yes | `check_in` requires the club's organizer |
| Using a pass at a different event | Yes | Must belong to this event |
| Using a pass from a cancelled registration | Yes | Registration must be active |
| Checking in twice | Yes | Function check + unique constraint |
| Checking in outside the event time | Yes | Only during an open session (from 2 h before the start until the end) |
| Reading personal data from the QR | Yes | The QR holds only the random code |
| A friend showing your **screenshot** | Partly | The pass is static (not a rotating code). The organizer sees the registered name on every scan to catch this. A screenshot-proof rotating QR is **not** implemented |
| Organizer marks someone present who wasn't there | Audited | Manual marks and revocations are in the audit log |

## 9. Notifications (Stage 8)

- Every workflow writes in-app notifications through `notify()`, with a **dedupe key**, so a retried request never creates a duplicate.
- The header bell shows the **unread count** (a COUNT query, refreshed every minute), the latest 15 notifications with links to the right page, and **Mark all as read**. `/notifications` keeps the full history.
- RLS: you can read only your own notifications and change only `is_read`. **Email and push are not implemented**; the app never claims they are.

## 10. Dashboards (Stage 8, migration `20261124000500_dashboards_and_recommendations.sql`)

One aggregate database function per role. Each checks the caller's role first and returns all of that role's numbers in a single request, so the browser never downloads tables just to count rows.

| Function | Who | Shows |
|---|---|---|
| `student_dashboard()` | any signed-in user (about themselves) | upcoming registrations, OD pending/approved, events attended, clubs followed, active clubs, open events, this term's classes, interests |
| `organizer_dashboard()` | organizers (their managed clubs only) | events by status, active registrations, open seats, **attendance rate** (checked in ÷ registered, past events), upcoming events with fill and check-ins |
| `dsa_dashboard()` | DSA, admin | proposals awaiting review, decisions in the last 30 days, **average hours to decide**, OD pending and decided |
| `admin_dashboard()` | admin | users by role, clubs, venues, events by status, registrations, attendance rate, OD by status, **registrations per day (14 days)**, events by category |

The admin charts are plain SVG (no chart library), one validated colour, with hover values and a "Show as table" view.

## 11. Recommendations (Stage 8, `get_recommendations`)

Transparent and rule-based; no AI. Candidates are published events that are **open for registration now**, start within 60 days, aren't full, and that you haven't registered for.

| Signal | Points |
|---|---|
| Category is one of your interests | +3 |
| Organized by a club you follow | +2 |
| Same category as events you registered for before | +1 |
| Fits your timetable (no class clash) | +2 |
| Partly clashes with a class | −1 |

Only events scoring above 0 are suggested, highest first. Every card shows its **reasons** ("Matches your interests", "Fits your timetable"…). Only your own data is used, never anything about other students. The timetable check reuses the same `_timetable_conflict` function as registration.
