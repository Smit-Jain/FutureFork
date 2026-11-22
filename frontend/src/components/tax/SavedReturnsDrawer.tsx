import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { TaxProfileSummary } from '../../contracts/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  currentId?: string | null;
  onDeleted?: (id: string) => void;
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export const SavedReturnsDrawer: React.FC<Props> = ({ open, onClose, onOpen, currentId, onDeleted }) => {
  const [items, setItems] = useState<TaxProfileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api.taxProfiles().then((r) => setItems(r.items)).catch((e: Error) => setError(e.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your saved returns">
      <div className="absolute inset-0 bg-ink/20 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-paper border-l border-ink shadow-lift flex flex-col animate-slide-up">
        <div className="flex items-center justify-between h-[52px] px-4 border-b border-ink-line">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
            <FileText className="w-4 h-4" /> Saved returns {items && <span className="text-ink-dim">· {items.length}</span>}
          </span>
          <button onClick={onClose} className="p-1 text-ink-dim hover:text-ink" aria-label="Close saved returns">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!items && !error && (
            <div className="flex items-center gap-2 label">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {items && items.length === 0 && (
            <div className="border border-dashed border-ink-faint p-6 text-center text-sm">
              Nothing saved yet. Press <strong>Get my filing guide</strong> to save a return.
            </div>
          )}
          {items?.map((it) => (
            <div key={it.id} className={`group flex items-stretch border ${it.id === currentId ? 'border-ink bg-paper-2' : 'border-ink-line bg-paper-2/60 hover:border-ink'}`}>
              <button type="button" onClick={() => onOpen(it.id)} className="flex-1 min-w-0 text-left p-3">
                <span className="flex items-center justify-between gap-2 label text-[10px]">
                  <span>
                    FY {it.fy} {it.form && `· ${it.form}`}
                  </span>
                  <span>{fmtDate(it.updated_at)}</span>
                </span>
                <span className="block mt-1 text-[14px]">{it.label}</span>
                {it.headline && <span className="block mt-1 text-[12.5px] text-ink-dim line-clamp-2">{it.headline}</span>}
              </button>
              <button
                type="button"
                aria-label={`Delete ${it.label}`}
                onClick={async () => {
                  await api.deleteTaxProfile(it.id);
                  setItems((prev) => prev?.filter((x) => x.id !== it.id) ?? null);
                  onDeleted?.(it.id);
                }}
                className="px-3 border-l border-ink-line text-ink-dim hover:text-bad"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};
