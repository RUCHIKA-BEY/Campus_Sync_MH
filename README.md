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

##  Design Philosophy

CampusSync combines a clean, daylight-friendly interface with a warm, premium visual identity.

The design uses:

- **Warm Platinum** — a calm, welcoming background.
- **Deep Mocha** — strong headings, navigation, and brand elements.
- **Soft Burnt Coral** — featured events and important calls to action.
- **Platinum Silver** — subtle borders and interface separation.
- **Champagne Gold** — refined highlights and accents.
- **Burnt Amber** — secondary emphasis and warm details.

The goal is to make campus events feel engaging and discoverable while keeping dashboards readable, navigation intuitive, and essential actions easy to find.

---

##  Technology Stack

The intended stack is:

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend and Database | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row Level Security (RLS) |
| Development Tools | Visual Studio Code, Git, GitHub |
| UI Design | Google Stitch and custom HTML/CSS implementation |

Additional libraries or services may be introduced where they serve a specific requirement, such as QR-code generation.

> The technology list describes
