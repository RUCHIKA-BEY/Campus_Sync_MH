// Segmented tabs with an animated active pill.
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './ui';

export interface TabItem<T extends string> { id: T; label: string; icon?: LucideIcon; count?: number }

export function Tabs<T extends string>({ items, value, onChange, label, layoutId }: {
  items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; layoutId: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-2xl border border-line bg-white p-1 shadow-soft">
      {items.map(t => {
        const active = t.id === value;
        return (
          <button key={t.id} role="tab" type="button" aria-selected={active} onClick={() => onChange(t.id)}
                  className={cx('relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
                    active ? 'text-ivory' : 'text-plum-soft hover:text-plum')}>
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-xl bg-plum" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {t.icon && <t.icon className="relative size-4" aria-hidden />}
            <span className="relative">{t.label}</span>
            {t.count !== undefined && <span className={cx('relative rounded-md px-1.5 text-xs', active ? 'bg-white/15' : 'bg-cream')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
