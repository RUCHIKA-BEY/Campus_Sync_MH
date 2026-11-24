// Asks for a written reason (cancellations, rejections, change requests).
import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { Button, FormStatus } from './ui';

export function ReasonDialog({ title, description, label, confirmLabel, minLength = 10, optional, onConfirm, onClose }: {
  title: string; description?: string; label: string; confirmLabel: string; minLength?: number; optional?: boolean;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!optional && reason.trim().length < minLength) return setError(`Please write at least ${minLength} characters.`);
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim()); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onOpenChange={o => !o && onClose()} title={title} description={description}>
      <form method="post" noValidate onSubmit={onSubmit} className="grid gap-4">
        <label className="grid gap-1.5 text-[13px] font-semibold text-plum-soft">
          {label}{optional && <span className="font-normal text-plum-muted"> (optional)</span>}
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={1000} autoFocus
            className="w-full rounded-xl border border-line bg-field px-3.5 py-2.5 text-base text-plum focus:border-plum focus:bg-white focus:ring-3 focus:ring-plum/10 focus:outline-none" />
        </label>
        <FormStatus kind="error">{error}</FormStatus>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Back</Button>
          <Button type="submit" loading={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
