import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from './ui';

export function StatCard({ label, value, icon: Icon, hint, loading }: { label: string; value: ReactNode; icon: LucideIcon; hint?: string; loading?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-plum-soft">{label}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-peach text-terracotta"><Icon className="size-[18px]" aria-hidden /></span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{value}</p>}
      {hint && <p className="mt-1 text-xs text-plum-muted">{hint}</p>}
    </motion.div>
  );
}
