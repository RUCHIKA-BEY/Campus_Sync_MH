// Lightweight toast notifications (announced to screen readers).
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; message: string }

const ToastContext = createContext<((message: string, kind?: Kind) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const show = useCallback((message: string, kind: Kind = 'info') => {
    const id = nextId.current++;
    setToasts(t => [...t.filter(x => x.message !== message), { id, kind, message }].slice(-3));
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4200);
  }, [dismiss]);

  const icon = { success: <CircleCheck className="size-5 text-sage" />, error: <CircleAlert className="size-5 text-terracotta-deep" />, info: <Info className="size-5 text-plum-soft" /> };

  return (
    <ToastContext.Provider value={useMemo(() => show, [show])}>
      {children}
      <div aria-live="polite" role="status"
           className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6">
        <AnimatePresence initial={false}>
          {toasts.map(t => (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-plum shadow-float">
              {icon[t.kind]}
              <p className="flex-1 pt-0.5">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="rounded-lg p-0.5 text-plum-muted hover:text-plum" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
