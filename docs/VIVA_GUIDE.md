# CampusSync — Viva Guide

A beginner-friendly guide to explaining **what you built, how it works and why**. Every claim here matches the code and tests in this repository.

---

## 1. Two-minute pitch

> Students miss campus events because they don't know whether an event clashes with their classes, and getting On-Duty is a paper chase. CampusSync connects event discovery to each student's **timetable**.
>
> Organizers propose events; the **DSA** approves them, and the database refuses to double-book a venue. Students see a **"Can I attend?"** result before registering, with the exact classes that clash. They register safely: two students can't take the last seat. They request **On-Duty** with the clash attached as evidence, and show a **QR pass** that the organizer scans during a time-limited check-in. Every role gets a dashboard computed by the database.
>
> It's a React + TypeScript frontend on a Supabase/PostgreSQL backend, where **all permissions are enforced in the database**, with 126 database tests and 44 frontend tests.

## 2. Demo script (about 8 minutes)

| Step | Account | Show | Point to make |
|---|---|---|---|
| 1 | Visitor | Home → Discover, filters in the URL, mobile view | Responsive design; only published events visible |
| 2 | Student | Timetable: add a class; try an overlapping one | Refused by an **exclusion constraint**, not by JavaScript |
| 3 | Organizer | Create a draft (department scope, target CSE) → Submit; try a second event at the same venue and time | Venue clash names the other event |
| 4 | DSA | Review desk → Review → Request changes → (organizer resubmits) → Approve | Reason required; organizer can't self-approve |
| 5 | Organizer | Publish | Followers notified (bell) |
| 6 | Student | Event page → **Can I attend?** → Register → QR pass → Request On-Duty | Partial clash with the class names; pass code; OD evidence |
| 7 | DSA | OD queue → Approve | Approval doesn't mark attendance |
| 8 | Organizer | Check-in → Open → scan the pass | Name shown; a second scan is refused |
| 9 | Admin | Overview charts, Users (role change), Audit log | Every sensitive action is audited |

Tip: in the browser console, run the "try to cheat" snippets in SECURITY.md §7 to show the database refusing.

## 3. Concepts in plain words

| Term | Plain explanation | Where in CampusSync |
|---|---|---|
| **SPA** | One page that swaps screens with JavaScript, without reloading | `web/` (React Router) |
| **React component** | A function that returns UI and re-renders when its data changes | `web/src/features/**` |
| **TypeScript** | JavaScript with types, so mistakes are caught before running | `npm run typecheck` (strict) |
| **PostgreSQL** | The relational database (tables, keys, constraints) | Supabase |
| **Primary / foreign key** | A row's unique id / a column that must point to an existing row | e.g. `events.club_id → clubs.id` |
| **Constraint** | A rule the database enforces on every write | `events_time_order`, no double booking |
| **Exclusion constraint** | "No two rows may overlap": like UNIQUE, but for ranges | venues, timetable classes, terms |
| **Transaction** | A group of changes that all happen or none do | every workflow function |
| **Row lock** (`FOR UPDATE`) | Makes other transactions wait for this row | registration capacity, approvals |
| **Supabase Auth / JWT** | Login service; a signed token proving who you are, sent with every request | `auth.uid()` reads it |
| **RLS** | A hidden `WHERE` clause per user on every query | 75 policies |
| **GRANT** | Whether a role may touch a table or column at all | migration 7 |
| **RPC / database function** | A server-side function you call by name | 37 functions, see API_REFERENCE.md |
| **SECURITY DEFINER** | The function runs with its owner's rights, so it must check the caller itself | all workflow functions |
| **Migration** | A numbered SQL file that changes the schema, applied once, in order | `supabase/migrations/` |
| **Half-open interval `[start, end)`** | The start is included, the end isn't, so back-to-back slots don't clash | conflicts, venues |

## 4. Likely questions, with answers

**Architecture**

1. *Why Supabase instead of writing a Node/Express API?* All the rules need transactions and row locks, which PostgreSQL provides natively. Putting them in database functions means one trusted place, with no extra server to host or secure. Supabase adds Auth and an automatic HTTP API on top.
2. *Why did you move from vanilla JavaScript to React?* The app grew to about 15 screens across 4 roles. String-built HTML caused real bugs (a dead "View ticket" button) and an XSS risk. React escapes text by default, and TypeScript catches errors early.
3. *Is the publishable key in the browser a security problem?* No. It only identifies the project. What a request may do is decided by GRANTs and RLS using the user's token. The secret key never leaves `.env`, and the Vercel build refuses a secret key in the public slot.

**Security**

4. *How do you stop a student making themselves admin?* `profiles.role` has no update privilege for browser roles, the signup trigger ignores any role in the request, and only `admin_set_user_role` (admin-only, audited) changes roles. Tested.
5. *Difference between GRANT and RLS?* A GRANT controls whether a **role** may use a table or column at all; RLS controls **which rows** a particular user sees. Both must allow an action.
6. *Why does a blocked UPDATE not show an error?* Under RLS the rows are invisible, so the update matches 0 rows. Blocked inserts do raise an error. The tests check both behaviours.
7. *What does SECURITY DEFINER risk, and how did you handle it?* The function runs with the owner's rights, so it could leak data. Every one pins `search_path = ''`, uses schema-qualified names, checks the caller, and is executable only by the intended roles. A test enforces the pinned `search_path`.
8. *What is the CSP header for?* It tells the browser to run scripts only from our own site and to connect only to our Supabase project, so an injected script wouldn't run.

**Timetable conflict detection**

9. *Explain the overlap rule.* Two intervals overlap when `event_start < class_end AND event_end > class_start`. Example: an event 10:00–12:00 against a class 09:00–11:00 → 10 < 11 and 12 > 9, so they overlap from 10:00 to 11:00 (60 minutes).
10. *Why half-open intervals?* So an event at 11:00–12:00 doesn't clash with a class ending at 11:00.
11. *How do you tell partial from full?* Add up the overlap minutes. Overlap ≥ event duration → full; > 0 → partial.
12. *An event crosses midnight?* The function walks each campus calendar day the event touches and compares that day's slice with that weekday's classes.
13. *What if the student has no timetable?* The result is `timetable_not_configured`, never "free". The panel asks them to add their classes.
14. *Why compute it in the database and not in JavaScript?* One authoritative implementation, used by the "Can I attend?" panel, by registration, by OD requests and by recommendations. The browser can't fake it.

**Registration and capacity**

15. *Two students click Register for the last seat at the same moment. What happens?* `register_for_event` first locks the event row. The second request waits, then counts again, sees no seats, and is refused. A JavaScript check couldn't do this, because both browsers would see "1 seat left".
16. *How are duplicate registrations prevented?* A partial unique index allows one *active* registration per student per event, plus a check in the function. Cancelled rows are kept as history.

**Events and venues**

17. *Explain the event lifecycle.* Draft → submitted → under review → approved, rejected or changes requested → published → completed, with cancellation from most states. A trigger refuses any other jump, even for the database owner.
18. *How is venue double-booking prevented?* An exclusion constraint on (venue, time range) while the event is in a reserving state. It's re-checked at approval, and it's safe even when two organizers submit at the same instant.
19. *Venue clash vs. campus-wide warning?* A clash means the same venue at the same time: **blocked**. A warning means different venues, the same time and a shared audience: **advice** for the DSA.

**OD and attendance**

20. *Does approving OD mark attendance?* No. OD, registration and attendance are three separate records. A test proves approval creates no attendance.
21. *How does QR check-in work?* The QR holds only a random 32-character pass code. The organizer opens a time-limited session and scans; `check_in` verifies the session, that the pass is for this event, that the registration is active, and that there's no earlier check-in.
22. *Can someone use a friend's screenshot?* Only partly prevented. The pass is static, so the organizer sees the registered name on each scan to catch it. A rotating, screenshot-proof QR is **not** implemented (stated honestly).

**Data, testing, process**

23. *How did you test RLS?* The tests switch to Supabase's real `authenticated` and `anon` roles with a simulated token, attempt forbidden actions, and check the exact refusal.
24. *What is PGlite and why use it?* Real PostgreSQL compiled to WebAssembly, running inside Node. It gives fast, isolated tests with no Docker; each test rolls back.
25. *What is migration history and why did you need `migration repair`?* Supabase records applied migrations in `supabase_migrations.schema_migrations`. The first six were pasted in the SQL Editor (not recorded), so we marked them as applied after proving the schema matched (`verify_setup.sql`).
26. *How are recommendations calculated?* A transparent score: interest +3, followed club +2, a category you've joined before +1, fits your timetable +2, partial clash −1. Every suggestion lists its reasons, and only your own data is used.
27. *What would you add next?* Feedback forms (the table exists), waitlists, email notifications, a rotating QR code, and Supabase Realtime for live updates.

## 5. Honest limitations (say these before you're asked)

- Notifications are **in-app only**: no email or push.
- The QR pass is static, so screenshot forwarding is only *mitigated* (by the name check).
- OD is the platform's workflow; there's **no integration** with the university's official records.
- Event feedback and server-side saved events exist in the schema but have no UI (bookmarks are kept on-device).
- Truly simultaneous requests aren't load-tested; correctness relies on PostgreSQL row locks and constraints.
