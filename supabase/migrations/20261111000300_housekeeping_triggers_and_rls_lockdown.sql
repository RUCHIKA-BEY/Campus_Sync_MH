-- =====================================================================
-- CampusSync migration 3/4 — housekeeping triggers + RLS lockdown
-- ---------------------------------------------------------------------
-- A *trigger* is a function PostgreSQL runs automatically before or
-- after a row is inserted/updated/deleted. Nothing in the browser can
-- skip it, which makes triggers a good place for rules that must
-- always hold.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. updated_at maintenance
-- ---------------------------------------------------------------------
-- The frontend never sends updated_at; the database stamps it on every
-- UPDATE, so the value is trustworthy.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at        before update on public.profiles        for each row execute function public.set_updated_at();
create trigger clubs_set_updated_at           before update on public.clubs           for each row execute function public.set_updated_at();
create trigger venues_set_updated_at          before update on public.venues          for each row execute function public.set_updated_at();
create trigger events_set_updated_at          before update on public.events          for each row execute function public.set_updated_at();
create trigger timetable_slots_set_updated_at before update on public.timetable_slots for each row execute function public.set_updated_at();
create trigger platform_settings_set_updated_at before update on public.platform_settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Audit log is append-only
-- ---------------------------------------------------------------------
-- Even a role that somehow had UPDATE/DELETE permission is stopped here.
-- (TRUNCATE is a separate statement, so it gets its own trigger.)
create or replace function public.prevent_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed', tg_op
    using errcode = '42501';  -- 42501 = insufficient_privilege
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_log_change();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_log_change();

-- ---------------------------------------------------------------------
-- 3. Row Level Security: deny by default
-- ---------------------------------------------------------------------
-- Supabase exposes every table in the `public` schema through its REST
-- API. With RLS ENABLED and NO policies, the API returns zero rows and
-- refuses all writes for normal users. That is the safe starting
-- point: Stage 4 then adds one explicit policy per allowed action.
-- (The service-role key bypasses RLS; it must never reach a browser.)
alter table public.departments          enable row level security;
alter table public.categories           enable row level security;
alter table public.academic_terms       enable row level security;
alter table public.platform_settings    enable row level security;
alter table public.profiles             enable row level security;
alter table public.student_interests    enable row level security;
alter table public.clubs                enable row level security;
alter table public.club_members         enable row level security;
alter table public.club_follows         enable row level security;
alter table public.venues               enable row level security;
alter table public.events               enable row level security;
alter table public.event_audiences      enable row level security;
alter table public.event_registrations  enable row level security;
alter table public.saved_events         enable row level security;
alter table public.timetable_slots      enable row level security;
alter table public.od_requests          enable row level security;
alter table public.attendance_sessions  enable row level security;
alter table public.attendance_records   enable row level security;
alter table public.event_feedback       enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;

-- Belt and braces: browser roles may never modify the audit log, even
-- if a future policy is written carelessly.
revoke update, delete, truncate on public.audit_logs from anon, authenticated;
