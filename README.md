# CampusSync 🎓
### One Campus. Every Event. Better Coordination.

CampusSync is a smart campus event and academic coordination platform designed to bring university events, student schedules, registrations, attendance, and On-Duty (OD) requests into one organized digital space.

University campuses host technical competitions, workshops, club activities, seminars, cultural programs, and academic events throughout the year. However, discovering events, tracking registrations, managing schedule conflicts, coordinating venues, and handling attendance can become fragmented across multiple platforms.

**CampusSync aims to solve this problem by connecting event discovery with academic schedules and streamlined event management.**

---

##  Key Features

###  Discover Campus Events
- Explore upcoming events through an interactive event discovery interface.
- Search by event name, category, or club.
- Filter and sort events based on relevant criteria.
- View event descriptions, schedules, venues, organizers, registration deadlines, and available seats.
- Discover events based on student interests.

### 🗓️ Smart Timetable & Conflict Detection
- Compare event schedules against a student's academic timetable.
- Identify full and partial schedule conflicts before registration.
- Display a clear **"Can I Attend?"** assessment to help students make informed decisions.
- Identify overlapping time intervals instead of relying on simple date comparisons.
- Warn organizers about scheduling conflicts and overlapping venue bookings.

### 📝 Event Registration
- Register for available events through the platform.
- Track registrations and registration status.
- Check available capacity before confirming participation.
- Prevent duplicate registrations and handle capacity limits through backend validation.

### 🏛️ Event Proposal & Approval
- Allow organizers to submit event proposals for review.
- Enable the Department of Student Affairs (DSA) to approve or reject proposals.
- Record rejection reasons to make the review process transparent.
- Support an event lifecycle from draft and submission to approval, publication, completion, or cancellation.

### 📄 On-Duty (OD) Request Management
- Allow eligible students to request OD for approved events.
- Track pending, approved, and rejected requests.
- Notify students about OD decisions.
- Maintain OD requests separately from attendance records.

*OD requests represent the platform's workflow and do not imply integration with an official university OD system.*

###  Attendance Management
- Support event-specific QR-based attendance where implemented.
- Validate attendance against event registrations.
- Prevent duplicate attendance records.
- Maintain attendance timestamps and provide a manual fallback where necessary.

###  Notifications & Analytics
- Notify users about relevant registration updates, event decisions, cancellations, schedule changes, and OD decisions.
- Provide role-specific dashboards and activity summaries.
- Help organizers monitor registrations and attendance.
- Give administrators an overview of platform activity.

###  Role-Based Access Control
CampusSync is designed around four primary roles:

| Role | Responsibilities |
|---|---|
| **Student** | Discover events, register, manage interests, view timetable conflicts, and track OD requests. |
| **Event Organizer** | Propose events, manage approved events, monitor registrations, and manage attendance. |
| **DSA** | Review event proposals, approve or reject requests, and inspect scheduling warnings. |
| **Admin** | Manage platform records, roles, clubs, venues, and administrative activity. |

Access control must be enforced by the backend and database policies, not merely by hiding interface elements.

---

##  Project Status (honest snapshot)

| Area | Status |
|---|---|
| Database: 21 tables, constraints, 75 RLS policies, explicit API grants | ✅ Built, 63 automated tests |
| Authentication: sign-up, sign-in, reset, sessions, profile trigger | ✅ Built |
| Roles: student / organizer / DSA / admin, audited role changes | ✅ Built |
| Timetable: personal weekly classes, no overlapping classes | ✅ Built |
| Organizer drafts, club leads, admin users and audit log | ✅ Built |
| Event discovery UI, filters, bookmarks, QR pass | ✅ Built, using **sample events** until Stages 5–6 |
| Proposal submission, DSA approval, publication, cancellation | ✅ Built (Stage 5), 15 workflow tests |
| Timetable conflict detection, transaction-safe registration, seat counts, campus-wide clash warnings | ✅ Built (Stage 6), 23 tests |
| OD requests and review, QR check-in sessions, manual attendance | ✅ Built (Stage 7), 13 tests |
| Notification centre, role dashboards, admin charts, rule-based recommendations | ✅ Built (Stage 8), 7 tests |

---

##  Design Philosophy

A clean, daylight-friendly interface with a warm, premium identity. Every page sits on a light canvas (no dark full-screen views).

| Role | Colour |
|---|---|
| Canvas | Warm Ivory `#FAF6F0` |
| Cards | White `#FFFFFF` / Soft Cream `#F7F3EC`, borders `#EAE3D9` |
| Headings, navigation, primary text | Deep Plum `#4A2E35` |
| Inputs, chips, secondary UI | Dusty Mauve `#EADFD8` / `#D6C7C2`, input fill `#F3ECE7` |
| Calls to action, highlights | Terracotta `#D96B43` |

The tokens live in one place: `web/src/index.css` (`@theme`).

---

##  Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript (strict), Vite 8 |
| Styling & motion | Tailwind CSS 4, Motion, Lucide icons, Radix UI primitives |
| Data fetching | TanStack Query, `@supabase/supabase-js` |
| Backend | Supabase: PostgreSQL, Auth, Row Level Security, SQL functions |
| Database changes | Versioned SQL migrations (`supabase/migrations/`) applied with the Supabase CLI |
| Testing | Vitest (frontend logic), PGlite (real PostgreSQL in Node) for database tests |
| Hosting | Vercel (static build) |

---

##  Getting Started

**Prerequisites:** Node.js 22+ and a Supabase project (see `docs/AUTHENTICATION.md` §7).

```bash
npm install
```

Create `.env.local` in the project root (git-ignored). These are **public** values only:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_DEMO_MODE=true
```

```bash
npm run dev
```

Then open `http://localhost:5500`. Leave the two `VITE_SUPABASE_*` values empty to run with sample data and no backend.

| Command | Purpose |
|---|---|
| `npm run build` | Type-check and production build into `dist/` |
| `npm run test:web` | Frontend unit tests |
| `npm run test:db` | Database schema, auth and RLS tests |
| `npm run check:supabase` | Check the live project as an anonymous visitor (public key only) |
| `npm run db:list` / `db:push:dry` / `db:push` | Migration history and deployment (see `docs/MIGRATIONS.md`) |
| `npm run demo:users` | Create the four demo accounts (needs the secret key in `.env`, local only) |

> **Never** put the Supabase secret key or database password in `VITE_*` variables, `.env.local` or any frontend file. The Vercel build refuses a secret key in the public slot.

---

##  Project Structure

```
web/                React + TypeScript app (src/features/* = one folder per screen)
supabase/           migrations, seed.sql, verify_setup.sql, CLI config
tests/db/           PGlite database tests
scripts/            demo users, SQL bundle, live project check
docs/               architecture, database, security, migrations, frontend, testing
public/             legacy static site (kept until the React deployment is verified)
```

---

##  Documentation

- `docs/FRONTEND.md`: React architecture; what's real vs. sample data
- `docs/SCHEMA_PROPOSAL.md`: the database design and decisions
- `docs/AUTHENTICATION.md`: sign-up, sessions, setup guide
- `docs/SECURITY.md`: roles, RLS, trusted functions, permission matrix
- `docs/MIGRATIONS.md`: migration history and the deployment workflow
- `docs/BUSINESS_LOGIC.md`: event lifecycle, conflicts, registration, OD, attendance, dashboards
- `docs/ARCHITECTURE.md`: how the pieces fit and why
- `docs/DATABASE.md`: tables, triggers, migrations (as built)
- `docs/API_REFERENCE.md`: every database function and table permission
- `docs/VIVA_GUIDE.md`: pitch, demo script, concepts and likely questions
- `docs/TESTING.md`: test strategy and results

---

##  Institution

Developed as a university academic project, *CampusSync: Smart Campus Event & Academic Coordination Platform*.
