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

- Discover, Home, Clubs and event pages read **published, completed and cancelled-after-publication** events from the database. The query filters on status explicitly, because a signed-in organizer or DSA can *see* more rows through RLS, and Discover must still show only public events.
- If **no event has been published yet**, the app falls back to clearly labelled sample events.
- Real events show "Registration opens soon". Registration, with the timetable clash check and capacity safety, is Stage 6. Until then no seat count is shown for real events, because there are no registrations to count.
- "Featured" for real events follows a transparent rule: **university-wide events**.

## 3. Coming in Stage 6

- Timetable conflict detection (none / partial / full / timetable not configured), using half-open intervals.
- Transaction-safe registration and cancellation with capacity locking.
- Campus-wide scheduling warnings for the DSA (overlapping audiences across venues).
