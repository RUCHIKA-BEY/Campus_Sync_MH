-- =====================================================================
-- CampusSync migration 2/4 — tables, keys, constraints, indexes
-- ---------------------------------------------------------------------
-- Design document: docs/SCHEMA_PROPOSAL.md (approved 2026-11-11).
-- Conventions:
--   * every id is a random UUID (unguessable, safe to show in URLs)
--   * every instant is timestamptz (stored as UTC, shown in local time)
--   * constraint names say what they protect, so error messages
--     returned to the frontend are readable (e.g. events_time_order)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lookup / reference tables
-- ---------------------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z]{2,10}$'),
  name       text not null unique check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) between 2 and 60),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.academic_terms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_on  date not null,
  ends_on    date not null,
  created_at timestamptz not null default now(),
  constraint academic_terms_date_order check (ends_on > starts_on),
  -- Two terms may not overlap, otherwise "which timetable applies on
  -- this date?" would have two answers.
  constraint academic_terms_no_overlap
    exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);

-- Configurable rules (who reviews OD, campus timezone, …). The values
-- themselves are inserted by migration 4.
create table public.platform_settings (
  key         text primary key check (key ~ '^[a-z_]+$'),
  value       jsonb not null,
  description text,
  updated_by  uuid,             -- FK added after profiles exists (below)
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Users
-- ---------------------------------------------------------------------
-- auth.users is owned by Supabase Auth (emails, password hashes,
-- sessions). We never store passwords. profiles holds *our* data about
-- the same person and shares the same id (one-to-one).
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                public.app_role not null default 'student',
  full_name           text not null check (length(trim(full_name)) between 2 and 100),
  email               text not null,
  registration_number text check (registration_number ~ '^[A-Za-z0-9]{4,20}$'),
  department_id       uuid references public.departments (id) on delete restrict,
  academic_year       smallint check (academic_year between 1 and 5),
  semester            smallint check (semester between 1 and 10),
  phone_number        text check (phone_number ~ '^\+?[0-9 ]{7,20}$'),
  avatar_url          text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Case-insensitive uniqueness: "Priya@Uni.edu" and "priya@uni.edu" are one person.
create unique index profiles_email_unique on public.profiles (lower(email));
create unique index profiles_registration_number_unique
  on public.profiles (upper(registration_number))
  where registration_number is not null;
create index profiles_role_idx on public.profiles (role);
create index profiles_department_idx on public.profiles (department_id);

alter table public.platform_settings
  add constraint platform_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles (id) on delete set null;

-- Junction table: many students <-> many categories.
create table public.student_interests (
  student_id  uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (student_id, category_id)
);
create index student_interests_category_idx on public.student_interests (category_id);

-- ---------------------------------------------------------------------
-- 3. Clubs
-- ---------------------------------------------------------------------
create table public.clubs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(trim(name)) between 2 and 120),
  short_name    text not null check (short_name ~ '^[A-Z0-9]{1,4}$'),
  description   text,
  category_id   uuid references public.categories (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  logo_url      text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.club_members (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubs (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  membership_role   public.membership_role not null default 'member',
  membership_status public.membership_status not null default 'active',
  created_at        timestamptz not null default now(),
  constraint club_members_one_row_per_user unique (club_id, user_id)
);
create index club_members_user_idx on public.club_members (user_id);

-- "Follow +" button: no approval, grants no rights (decision D6).
create table public.club_follows (
  student_id uuid not null references public.profiles (id) on delete cascade,
  club_id    uuid not null references public.clubs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, club_id)
);
create index club_follows_club_idx on public.club_follows (club_id);

-- ---------------------------------------------------------------------
-- 4. Venues and events
-- ---------------------------------------------------------------------
create table public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) between 2 and 120),
  building    text,
  capacity    integer not null check (capacity > 0),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.events (
  id                     uuid primary key default gen_random_uuid(),
  club_id                uuid not null references public.clubs (id) on delete restrict,
  created_by             uuid not null references public.profiles (id) on delete restrict,
  title                  text not null check (length(trim(title)) between 5 and 150),
  description            text not null check (length(trim(description)) between 10 and 5000),
  category_id            uuid not null references public.categories (id) on delete restrict,
  event_type             public.event_type not null,
  scope                  public.event_scope not null default 'club',
  venue_id               uuid references public.venues (id) on delete restrict,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  registration_opens_at  timestamptz not null,
  registration_closes_at timestamptz not null,
  capacity               integer not null check (capacity > 0),
  od_eligible            boolean not null default false,
  poster_url             text,
  status                 public.event_status not null default 'draft',
  submitted_at           timestamptz,
  reviewed_by            uuid references public.profiles (id) on delete set null,
  reviewed_at            timestamptz,
  review_note            text,
  published_at           timestamptz,
  cancelled_at           timestamptz,
  cancellation_reason    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint events_time_order check (ends_at > starts_at),
  constraint events_registration_window check (
    registration_opens_at < registration_closes_at
    and registration_closes_at <= starts_at
  ),
  -- A draft may be saved before a venue is chosen; nothing else may.
  constraint events_venue_required check (
    venue_id is not null or status in ('draft', 'cancelled')
  ),
  -- Organizers can never approve their own proposal.
  constraint events_no_self_review check (reviewed_by is null or reviewed_by <> created_by),
  constraint events_review_recorded check (
    status not in ('approved', 'rejected', 'changes_requested')
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  constraint events_review_note_required check (
    status not in ('rejected', 'changes_requested')
    or length(trim(coalesce(review_note, ''))) >= 10
  ),
  constraint events_published_recorded check (
    status not in ('published', 'completed') or published_at is not null
  ),
  constraint events_cancellation_reason_required check (
    status <> 'cancelled'
    or (cancelled_at is not null and length(trim(coalesce(cancellation_reason, ''))) >= 10)
  ),
  constraint events_submitted_recorded check (status = 'draft' or status = 'cancelled' or submitted_at is not null),

  -- HARD VENUE CONFLICT RULE (decision D2).
  -- While an event is in a venue-reserving state, no other reserving
  -- event may use the same venue at an overlapping time. '[)' makes the
  -- range half-open: 10:00–12:00 and 12:00–14:00 do NOT collide.
  -- Because this is enforced by a unique-style index, two organizers
  -- submitting at the same instant cannot both succeed: PostgreSQL
  -- makes the second insert wait for the first and then rejects it.
  constraint events_no_venue_double_booking exclude using gist (
    venue_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('submitted', 'under_review', 'changes_requested',
                      'approved', 'published', 'completed'))
);
create index events_club_idx on public.events (club_id);
create index events_created_by_idx on public.events (created_by);
create index events_status_starts_idx on public.events (status, starts_at);
create index events_category_idx on public.events (category_id);

-- Who an event targets. NULL department / year = "all".
create table public.event_audiences (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  academic_year smallint check (academic_year between 1 and 5)
);
-- NULLS NOT DISTINCT would be neater but needs PostgreSQL 15+ semantics
-- on every host; coalescing to a sentinel works everywhere.
create unique index event_audiences_unique on public.event_audiences (
  event_id,
  coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(academic_year, 0)
);

-- ---------------------------------------------------------------------
-- 5. Participation
-- ---------------------------------------------------------------------
create table public.event_registrations (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  student_id       uuid not null references public.profiles (id) on delete cascade,
  status           public.registration_status not null default 'registered',
  -- Snapshot of the server-side timetable check at registration time.
  conflict_status  public.conflict_status not null,
  conflict_minutes integer not null default 0 check (conflict_minutes >= 0),
  -- Random code shown on the ticket and encoded in the QR (decision D3).
  -- 32 hex characters from a v4 UUID = 122 random bits: unguessable.
  pass_code        text not null unique
                   default replace(gen_random_uuid()::text, '-', ''),
  registered_at    timestamptz not null default now(),
  cancelled_at     timestamptz,
  constraint event_registrations_cancel_recorded check (
    (status = 'cancelled') = (cancelled_at is not null)
  ),
  -- Lets od_requests / attendance_records reference (id, student, event)
  -- together, so those three values can never disagree.
  constraint event_registrations_id_student_event unique (id, student_id, event_id)
);
-- One ACTIVE registration per student per event; cancelled rows are kept
-- as history and the student may register again.
create unique index event_registrations_one_active
  on public.event_registrations (event_id, student_id)
  where status = 'registered';
create index event_registrations_student_idx on public.event_registrations (student_id, status);

-- "Saved" tab (decision D6).
create table public.saved_events (
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, event_id)
);

create table public.timetable_slots (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  term_id      uuid not null references public.academic_terms (id) on delete cascade,
  subject_name text not null check (length(trim(subject_name)) between 2 and 120),
  course_code  text check (course_code ~ '^[A-Za-z0-9-]{2,15}$'),
  room         text,
  faculty      text,
  day_of_week  smallint not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday
  start_time   time not null,
  end_time     time not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Classes never cross midnight, so end must be later the same day.
  constraint timetable_slots_time_order check (end_time > start_time),
  -- A student cannot have two overlapping classes on the same day in the
  -- same term. Half-open, so 09:00–10:00 then 10:00–11:00 is fine.
  constraint timetable_slots_no_overlap exclude using gist (
    student_id with =,
    term_id with =,
    day_of_week with =,
    public.time_range(start_time, end_time, '[)') with &&
  )
);
create index timetable_slots_lookup_idx on public.timetable_slots (student_id, term_id, day_of_week);

-- ---------------------------------------------------------------------
-- 6. On-Duty requests and attendance
-- ---------------------------------------------------------------------
create table public.od_requests (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null,
  student_id        uuid not null,
  event_id          uuid not null,
  reason            text not null check (length(trim(reason)) between 10 and 1000),
  conflict_snapshot jsonb not null default '[]'::jsonb,
  status            public.od_status not null default 'pending',
  reviewed_by       uuid references public.profiles (id) on delete set null,
  review_note       text,
  requested_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  constraint od_requests_registration_fkey
    foreign key (registration_id, student_id, event_id)
    references public.event_registrations (id, student_id, event_id) on delete cascade,
  constraint od_requests_no_self_review check (reviewed_by is null or reviewed_by <> student_id),
  constraint od_requests_review_recorded check (
    status not in ('approved', 'rejected') or reviewed_at is not null
  ),
  constraint od_requests_rejection_note_required check (
    status <> 'rejected' or length(trim(coalesce(review_note, ''))) >= 10
  )
);
-- At most one pending-or-approved request per registration.
create unique index od_requests_one_active
  on public.od_requests (registration_id)
  where status in ('pending', 'approved');
create index od_requests_status_idx on public.od_requests (status, requested_at);
create index od_requests_student_idx on public.od_requests (student_id);
create index od_requests_event_idx on public.od_requests (event_id);

-- The check-in window an organizer opens (QR is only valid inside it).
create table public.attendance_sessions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  opened_by       uuid not null references public.profiles (id) on delete restrict,
  opens_at        timestamptz not null default now(),
  closes_at       timestamptz not null,
  closed_early_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint attendance_sessions_time_order check (closes_at > opens_at),
  constraint attendance_sessions_id_event unique (id, event_id)
);
create index attendance_sessions_event_idx on public.attendance_sessions (event_id);

create table public.attendance_records (
  id                  uuid primary key default gen_random_uuid(),
  registration_id     uuid not null unique,
  event_id            uuid not null,
  student_id          uuid not null,
  session_id          uuid,
  method              public.check_in_method not null,
  verification_status text not null default 'verified'
                      check (verification_status in ('verified', 'revoked')),
  recorded_by         uuid not null references public.profiles (id) on delete restrict,
  checked_in_at       timestamptz not null default now(),
  constraint attendance_records_registration_fkey
    foreign key (registration_id, student_id, event_id)
    references public.event_registrations (id, student_id, event_id) on delete cascade,
  -- The session must belong to the SAME event as the attendance row.
  constraint attendance_records_session_fkey
    foreign key (session_id, event_id)
    references public.attendance_sessions (id, event_id) on delete restrict,
  constraint attendance_records_qr_needs_session check (method <> 'qr' or session_id is not null),
  -- No duplicate check-ins.
  constraint attendance_records_one_per_student unique (event_id, student_id)
);

-- Feedback may only exist for a student who has an attendance record:
-- the foreign key points at attendance_records itself (decision D6).
create table public.event_feedback (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null,
  student_id uuid not null,
  rating     smallint not null check (rating between 1 and 5),
  comment    text check (length(comment) <= 1000),
  created_at timestamptz not null default now(),
  constraint event_feedback_requires_attendance
    foreign key (event_id, student_id)
    references public.attendance_records (event_id, student_id) on delete cascade,
  constraint event_feedback_one_per_student unique (event_id, student_id)
);

-- ---------------------------------------------------------------------
-- 7. System tables
-- ---------------------------------------------------------------------
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_id        uuid not null references public.profiles (id) on delete cascade,
  type                text not null check (type ~ '^[a-z_]+$'),
  title               text not null check (length(trim(title)) between 1 and 150),
  message             text not null check (length(message) <= 1000),
  related_entity_type text,
  related_entity_id   uuid,
  -- Same key twice for the same person = the same notification.
  -- Retried operations therefore cannot create duplicates.
  dedupe_key          text not null,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint notifications_dedupe unique (recipient_id, dedupe_key)
);
create index notifications_inbox_idx on public.notifications (recipient_id, is_read, created_at desc);

-- Append-only history of sensitive operations (written by trusted
-- functions only; UPDATE/DELETE are blocked by a trigger in migration 3).
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
