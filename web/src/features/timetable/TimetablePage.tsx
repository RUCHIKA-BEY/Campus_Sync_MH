import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { CalendarPlus, Lock, MapPin, Pencil, Trash2, UserRound, CalendarDays, FlaskConical } from 'lucide-react';
import { Button, Card, EmptyState, Field, FormStatus, Input, PageHeader, Select, Skeleton, cx } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toaster';
import { isConfigured } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { DAYS, DAY_SHORT, campusWeekday, clockLabel, toMinutes, toTimeInput } from '../../lib/time';
import { BOOKABLE, buildRows, isLunch, periodSpan, yFor } from '../../lib/periods';
import { pickCurrentTerm, useDeleteSlot, useMySlots, useSaveSlot, useTerms, type Slot, type SlotInput } from '../../lib/timetable';

const PX_PER_MIN = 2; // a 55-minute period is about 110px wide (the grid stretches to fit)
const BREAK_PX = 28;
const DAY_COL_PX = 72;
const DAY_ROW_PX = 84;
const TINTS = [
  'bg-peach border-terracotta/40 text-terracotta-deep',
  'bg-mauve border-plum-muted/40 text-plum',
  'bg-sage-bg border-sage/30 text-sage',
  'bg-[#edf3fb] border-cat-blue/30 text-cat-blue',
  'bg-[#f1ebf8] border-cat-purple/30 text-cat-purple',
];
const LUNCH_TINT = 'border-dashed bg-white/60 border-plum-muted/40 text-plum-muted';
const tintFor = (s: string) => isLunch(s) ? LUNCH_TINT : TINTS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length]!;

export function TimetablePage() {
  const terms = useTerms();
  const [termId, setTermId] = useState<string>();
  useEffect(() => { if (!termId && terms.data?.length) setTermId(pickCurrentTerm(terms.data)?.id); }, [terms.data, termId]);
  const slots = useMySlots(termId);
  const [editing, setEditing] = useState<Slot | 'new' | null>(null);
  const [mobileDay, setMobileDay] = useState(() => Math.min(campusWeekday(), 5));

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <PageHeader kicker="Academic context" title="My timetable" />
        <Card className="flex items-start gap-3 p-6 text-plum-soft"><FlaskConical className="mt-0.5 size-5 text-amber" aria-hidden />
          <p>Your timetable is saved to your account, so it needs the backend. Connect Supabase to use it.</p></Card>
      </div>
    );
  }

  const list = slots.data ?? [];
  const days = [1, 2, 3, 4, 5, ...[6, 7].filter(d => list.some(s => s.day_of_week === d))];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader kicker="Academic context" title="My timetable"
        actions={<Button onClick={() => setEditing('new')} disabled={!termId}><CalendarPlus className="size-4" />Add class</Button>}>
        Keep your weekly classes here. Event registration will check them for clashes.
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-plum-soft">
          Term
          <Select value={termId ?? ''} onChange={e => setTermId(e.target.value)} disabled={!terms.data?.length} className="h-10 min-h-0 w-auto bg-white text-sm">
            {!terms.data?.length && <option value="">{terms.isError ? 'Couldn’t load terms' : 'Loading…'}</option>}
            {terms.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </label>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-plum-soft shadow-soft">
          <Lock className="size-3.5" aria-hidden /> Private: only you can see your timetable
        </p>
      </div>

      {terms.isError || slots.isError ? (
        <FormStatus kind="error">{friendlyError(terms.error ?? slots.error)}</FormStatus>
      ) : slots.isPending ? (
        <Skeleton className="h-96 rounded-[22px]" />
      ) : list.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-6" />} title="No classes yet"
                    action={<Button onClick={() => setEditing('new')}><CalendarPlus className="size-4" />Add your first class</Button>}>
          Add your lectures and labs once. CampusSync uses them to tell you whether an event fits your week.
        </EmptyState>
      ) : (
        <>
          <WeekGrid slots={list} days={days} onEdit={setEditing} />
          <DayList slots={list} days={days} day={mobileDay} setDay={setMobileDay} onEdit={setEditing} />
        </>
      )}

      {editing && termId && (
        <SlotDialog key={editing === 'new' ? 'new' : editing.id} slot={editing === 'new' ? null : editing} termId={termId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function WeekGrid({ slots, days, onEdit }: { slots: Slot[]; days: number[]; onEdit: (s: Slot) => void }) {
  // Laid out like the university timetable: one row per day, one column per
  // period (1–8) with its timings, and the two short breaks between them.
  const cols = buildRows(slots, PX_PER_MIN, BREAK_PX);
  const total = cols.reduce((w, c) => w + c.height, 0);
  const pct = (px: number) => `${(px / total) * 100}%`;
  const today = campusWeekday();

  return (
    <Card className="hidden overflow-x-auto md:block">
      <div className="grid" style={{ gridTemplateColumns: `${DAY_COL_PX}px minmax(${total}px, 1fr)` }}>
        {/* Header: period numbers and timings */}
        <div className="border-b border-line" />
        <div className="relative h-14 border-b border-line">
          {cols.map(c => (
            <div key={c.start} style={{ left: pct(c.top), width: pct(c.height) }}
                 className={cx('absolute inset-y-0 flex flex-col items-center justify-center border-l border-line/70 text-center leading-tight',
                   c.kind === 'break' && 'bg-cream/70')}>
              {c.kind === 'break'
                ? <span className="text-[10px] font-semibold text-plum-muted [writing-mode:vertical-rl] rotate-180" title={c.sub}>Break</span>
                : <><span className="text-base font-bold text-plum">{c.label}</span><span className="text-[10px] text-plum-muted">{c.sub}</span></>}
            </div>
          ))}
        </div>

        {days.map(d => (
          <Fragment key={d}>
            <div className={cx('flex items-center border-b border-line px-3 text-sm font-bold', d === today ? 'bg-peach text-terracotta-deep' : 'text-plum')}>
              {DAY_SHORT[d - 1]}{d === today && <span className="ml-1.5 text-[11px] font-semibold">Today</span>}
            </div>
            <div className={cx('relative border-b border-line', d === today && 'bg-peach/30')} style={{ height: DAY_ROW_PX }}>
              {cols.map(c => (
                <div key={c.start} className={cx('absolute inset-y-0 border-l border-line/70', c.kind === 'break' && 'bg-cream/70')}
                     style={{ left: pct(c.top), width: pct(c.height) }} />
              ))}
              {slots.filter(s => s.day_of_week === d).map(s => {
                const x = yFor(cols, toMinutes(s.start_time));
                const w = yFor(cols, toMinutes(s.end_time)) - x;
                const span = periodSpan(s.start_time, s.end_time);
                return (
                  <motion.button key={s.id} type="button" onClick={() => onEdit(s)} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                    className={cx('absolute inset-y-1.5 z-[1] overflow-hidden rounded-xl border px-2 py-1.5 text-left shadow-soft transition hover:shadow-lift focus-visible:z-10', tintFor(s.subject_name))}
                    style={{ left: `calc(${pct(x)} + 3px)`, width: `calc(${pct(w)} - 6px)` }}
                    title={`${s.subject_name} · ${span ? `${span} · ` : ''}${clockLabel(s.start_time)} – ${clockLabel(s.end_time)}`}
                    aria-label={`${s.subject_name}, ${DAYS[d - 1]} ${clockLabel(s.start_time)} to ${clockLabel(s.end_time)}. Edit`}>
                    <p className="truncate text-[13px] leading-tight font-bold">{s.subject_name}</p>
                    {isLunch(s.subject_name) && <p className="truncate text-[11px] opacity-80">Free for events</p>}
                    {s.course_code && s.course_code !== s.subject_name && <p className="truncate text-[11px] opacity-80">{s.course_code}</p>}
                    {s.room && <p className="truncate text-[11px] opacity-80">{s.room}</p>}
                  </motion.button>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

function DayList({ slots, days, day, setDay, onEdit }: { slots: Slot[]; days: number[]; day: number; setDay: (d: number) => void; onEdit: (s: Slot) => void }) {
  const today = campusWeekday();
  const items = slots.filter(s => s.day_of_week === day);
  return (
    <div className="md:hidden">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Day">
        {days.map(d => (
          <button key={d} role="tab" type="button" aria-selected={d === day} onClick={() => setDay(d)}
                  className={cx('shrink-0 rounded-2xl border px-4 py-2 text-sm font-bold transition',
                    d === day ? 'border-plum bg-plum text-ivory' : 'border-line bg-white text-plum-soft')}>
            {DAY_SHORT[d - 1]}{d === today && ' •'}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-mauve-strong bg-white/70 p-6 text-center text-sm text-plum-soft">No classes on {DAYS[day - 1]}.</p>
      ) : (
        <ol className="grid gap-3">
          {items.map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => onEdit(s)} className={cx('w-full rounded-2xl border p-4 text-left shadow-soft', tintFor(s.subject_name))}>
                <p className="text-xs font-bold">{periodSpan(s.start_time, s.end_time) ? `${periodSpan(s.start_time, s.end_time)} · ` : ''}{clockLabel(s.start_time)} – {clockLabel(s.end_time)}</p>
                <p className="mt-1 text-base font-bold text-plum">{s.subject_name}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-plum-soft">
                  {s.course_code && <span>{s.course_code}</span>}
                  {s.room && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{s.room}</span>}
                  {s.faculty && <span className="inline-flex items-center gap-1"><UserRound className="size-3" aria-hidden />{s.faculty}</span>}
                </p>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SlotDialog({ slot, termId, onClose }: { slot: Slot | null; termId: string; onClose: () => void }) {
  const save = useSaveSlot();
  const remove = useDeleteSlot();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [f, setF] = useState({
    subject_name: slot?.subject_name ?? '', course_code: slot?.course_code ?? '', room: slot?.room ?? '', faculty: slot?.faculty ?? '',
    day_of_week: String(slot?.day_of_week ?? Math.min(campusWeekday(), 5)),
    start_time: slot ? toTimeInput(slot.start_time) : '08:50', end_time: slot ? toTimeInput(slot.end_time) : '09:45',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.subject_name.trim().length < 2) return setError('Enter the subject name.');
    if (f.course_code && !/^[A-Za-z0-9-]{2,15}$/.test(f.course_code.trim())) return setError('Course code should be 2–15 letters, digits or dashes.');
    if (!f.start_time || !f.end_time || toMinutes(f.end_time) <= toMinutes(f.start_time)) return setError('A class must end after it starts.');
    const input: SlotInput = {
      term_id: termId, subject_name: f.subject_name.trim(), course_code: f.course_code.trim() || null,
      room: f.room.trim() || null, faculty: f.faculty.trim() || null, day_of_week: Number(f.day_of_week),
      start_time: f.start_time, end_time: f.end_time,
    };
    // The database re-checks everything, including "no overlapping classes".
    save.mutate({ id: slot?.id, input }, {
      onSuccess: () => { toast(slot ? 'Class updated.' : 'Class added.', 'success'); onClose(); },
      onError: err => setError(friendlyError(err)),
    });
  };

  return (
    <Modal open onOpenChange={o => !o && onClose()} title={slot ? 'Edit class' : 'Add a class'} description="Weekly recurring class for the selected term.">
      <form method="post" noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="Subject" hint="Your lunch period? Name it “Lunch”: it shows in your week, but events then aren’t counted as clashing with it.">
          <Input value={f.subject_name} onChange={set('subject_name')} maxLength={120} placeholder="e.g. Data Structures" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course code (optional)"><Input value={f.course_code} onChange={set('course_code')} maxLength={15} placeholder="CS301" /></Field>
          <Field label="Day">
            <Select value={f.day_of_week} onChange={set('day_of_week')}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="From period">
            <Select value={BOOKABLE.find(p => p.start === f.start_time)?.start ?? ''}
                    onChange={e => { const p = BOOKABLE.find(x => x.start === e.target.value); if (p) setF(v => ({ ...v, start_time: p.start, end_time: toMinutes(v.end_time) > toMinutes(p.start) ? v.end_time : p.end })); }}>
              <option value="" disabled>Custom time</option>
              {BOOKABLE.map(p => <option key={p.start} value={p.start}>{p.label} · {clockLabel(p.start)}</option>)}
            </Select>
          </Field>
          <Field label="To period">
            <Select value={BOOKABLE.find(p => p.end === f.end_time)?.end ?? ''}
                    onChange={e => setF(v => ({ ...v, end_time: e.target.value }))}>
              <option value="" disabled>Custom time</option>
              {BOOKABLE.filter(p => toMinutes(p.end) > toMinutes(f.start_time)).map(p => <option key={p.end} value={p.end}>{p.label} · ends {clockLabel(p.end)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starts"><Input type="time" value={f.start_time} onChange={set('start_time')} step={300} /></Field>
          <Field label="Ends"><Input type="time" value={f.end_time} onChange={set('end_time')} step={300} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room (optional)"><Input value={f.room} onChange={set('room')} maxLength={60} placeholder="B-204" /></Field>
          <Field label="Faculty (optional)"><Input value={f.faculty} onChange={set('faculty')} maxLength={80} /></Field>
        </div>
        <FormStatus kind="error">{error}</FormStatus>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {slot ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this class?
                <Button type="button" variant="plum" size="sm" loading={remove.isPending}
                  onClick={() => remove.mutate(slot.id, { onSuccess: () => { toast('Class deleted.'); onClose(); }, onError: e => setError(friendlyError(e)) })}>Delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </span>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-terracotta-deep"><Trash2 className="size-4" />Delete</Button>
            )
          ) : <span />}
          <Button type="submit" loading={save.isPending} loadingLabel="Saving…">{slot ? <><Pencil className="size-4" />Save changes</> : 'Add class'}</Button>
        </div>
      </form>
    </Modal>
  );
}
