// Small, reusable UI primitives built on the CampusSync tokens.
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import { LoaderCircle } from 'lucide-react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'plum';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'bg-terracotta text-white shadow-[0_10px_22px_rgb(217_107_67/0.25)] hover:bg-terracotta-hover active:bg-terracotta-deep',
  secondary: 'bg-white text-plum border border-line shadow-soft hover:bg-cream hover:border-mauve-strong',
  ghost: 'text-plum hover:bg-cream',
  plum: 'bg-plum text-ivory hover:bg-plum-deep',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-2xl gap-2',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx('inline-flex items-center justify-center font-semibold transition-[background,box-shadow,transform,border-color] duration-200',
    'disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none select-none', variantClass[variant], sizeClass[size], extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean; loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, loadingLabel, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

// ----------------------------------------------------------------- Badge
type Tone = 'neutral' | 'terracotta' | 'sage' | 'amber' | 'plum' | 'muted';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-mauve text-plum',
  terracotta: 'bg-terracotta text-white',
  sage: 'bg-sage-bg text-sage',
  amber: 'bg-amber-bg text-amber',
  plum: 'bg-plum text-ivory',
  muted: 'bg-cream text-plum-soft border border-line',
};
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap', toneClass[tone], className)}>
      {icon}{children}
    </span>
  );
}

// ------------------------------------------------------------ Form fields
const fieldBase = 'w-full min-h-11 rounded-xl border border-line bg-field px-3.5 text-base text-plum placeholder:text-plum-muted transition ' +
  'focus:outline-none focus:border-plum focus:bg-white focus:ring-3 focus:ring-plum/10 disabled:opacity-60 read-only:bg-cream read-only:text-plum-soft';

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[13px] font-semibold text-plum-soft">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-plum-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cx(fieldBase, 'pr-9', className)} {...rest} />;
});

export function FormStatus({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  if (!children) return null;
  return (
    <p role={kind === 'error' ? 'alert' : 'status'}
       className={cx('rounded-xl px-3.5 py-2.5 text-sm font-semibold',
         kind === 'error' ? 'bg-peach text-terracotta-deep' : 'bg-sage-bg text-sage')}>
      {kind === 'error' ? '⚠ ' : '✓ '}{children}
    </p>
  );
}

// ------------------------------------------------------------- Surfaces
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-[var(--radius-card)] border border-line bg-white shadow-soft', className)}>{children}</div>;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('block text-[11px] font-extrabold uppercase tracking-[0.14em] text-terracotta-deep', className)}>{children}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-mauve-strong bg-cream/60 px-6 py-14 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-2xl bg-white text-terracotta shadow-soft">{icon}</div>}
      <h3 className="text-lg">{title}</h3>
      {children && <p className="max-w-md text-sm text-plum-soft">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-mauve/60', className)} aria-hidden />;
}

export function PageHeader({ kicker, title, children, actions }: { kicker?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {kicker && <Kicker className="mb-2">{kicker}</Kicker>}
        <h1 className="text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.05] font-extrabold">{title}</h1>
        {children && <p className="mt-2 text-plum-soft">{children}</p>}
      </div>
      {actions}
    </div>
  );
}
