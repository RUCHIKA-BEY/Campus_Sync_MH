// Time helpers. Campus time is Asia/Kolkata (UTC+05:30, no daylight saving),
// so a fixed offset is exact for converting form inputs.

export const IST_OFFSET = '+05:30';
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "09:30" or "09:30:00" → minutes since midnight (570). */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "13:05:00" → "1:05 pm". */
export function clockLabel(t: string): string {
  const mins = toMinutes(t);
  const h = Math.floor(mins / 60), m = mins % 60;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "13:05:00" → "13:05" for <input type="time">. */
export const toTimeInput = (t: string) => t.slice(0, 5);

/** <input type="datetime-local"> value in campus time → ISO string with offset. */
export function isoFromIstInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Invalid date/time');
  return `${value}:00${IST_OFFSET}`;
}

/** ISO instant → "YYYY-MM-DDTHH:mm" in campus time, for datetime-local inputs. */
export function istInputFromIso(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Today's ISO weekday in campus time (1 = Monday … 7 = Sunday). */
export function campusWeekday(now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now);
  return DAYS.indexOf(name as (typeof DAYS)[number]) + 1;
}

/** Today's date in campus time as YYYY-MM-DD. */
export function campusDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
