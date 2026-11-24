// Accessible dialog (Radix): focus trap, Escape to close, labelled title.
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

export function Modal({ open, onOpenChange, title, description, children, wide }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-plum/30 backdrop-blur-sm" />
        {/* Width via inline style: Tailwind can't generate classes built at runtime. */}
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[92dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[26px] bg-white p-6 shadow-float focus:outline-none sm:p-7"
          style={{ width: `min(94vw, ${wide ? 720 : 520}px)` }}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="font-display text-xl font-extrabold text-plum">{title}</Dialog.Title>
                {description
                  ? <Dialog.Description className="mt-1 text-sm text-plum-soft">{description}</Dialog.Description>
                  : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
              </div>
              <Dialog.Close aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-plum-soft hover:bg-cream hover:text-plum">
                <X className="size-4" />
              </Dialog.Close>
            </div>
            <div className="mt-5">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
