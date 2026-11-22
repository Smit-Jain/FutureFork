import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Search, X } from 'lucide-react';
import { api } from '../api/client';
import { HistoryItem } from '../contracts/types';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenDecision: (id: string) => void;
  currentDecisionId?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  one_time: 'One-time',
  recurring_expense: 'Recurring',
  income_change: 'Income change',
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const statusOf = (it: HistoryItem): { label: string; color: string } => {
  if (it.status !== 'ok') return { label: it.status === 'unsupported' ? 'Off-topic' : 'Needs detail', color: '#c76a12' };
  if (it.run_status === 'done') return { label: 'Evaluated', color: '#2f7d4f' };
  if (it.run_status === 'failed') return { label: 'Failed', color: '#d6345f' };
  if (it.run_status) return { label: 'Running', color: '#0f6b8f' };
  return { label: 'Not run', color: 'rgba(20,20,20,.5)' };
};

/** Right-hand panel with the signed-in user's saved decisions. */
export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ open, onClose, onOpenDecision, currentDecisionId }) => {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    api
      .getHistory()
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((it) => !t || it.text.toLowerCase().includes(t) || it.dataset_name.toLowerCase().includes(t));
  }, [items, q]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your decision history">
      <div className="absolute inset-0 bg-ink/20 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-paper border-l border-ink shadow-lift flex flex-col animate-slide-up">
        <div className="flex items-center justify-between h-[52px] px-4 border-b border-ink-line">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
            <History className="w-4 h-4" /> Your history
            {items && <span className="text-ink-dim">· {items.length}</span>}
          </span>
          <button onClick={onClose} className="p-1 text-ink-dim hover:text-ink" aria-label="Close history">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 mx-4 mt-4 border border-ink-faint focus-within:border-ink bg-paper-2 px-3 h-9">
          <Search className="w-3.5 h-3.5 text-ink-dim" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search decisions or datasets"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
            autoFocus
          />
        </label>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {!items && !error && (
            <div className="flex items-center gap-2 label">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          {items && items.length === 0 && (
            <div className="border border-dashed border-ink-faint p-6 text-center space-y-1">
              <p className="text-sm">No saved decisions yet.</p>
              <p className="label text-[10px]">Every decision you run is saved here automatically.</p>
            </div>
          )}
          {items && items.length > 0 && filtered.length === 0 && <p className="label">No matches for "{q}"</p>}
          {filtered.map((it) => {
            const st = statusOf(it);
            const current = it.id === currentDecisionId;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onOpenDecision(it.id)}
                className={`group relative w-full text-left border p-3 transition-colors ${current ? 'border-ink bg-paper-2' : 'border-ink-line bg-paper-2/60 hover:border-ink'}`}
              >
                <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: st.color }} />
                <span className="flex items-center justify-between gap-2 label text-[10px]">
                  <span className="truncate">{it.dataset_name}</span>
                  <span className="shrink-0">{fmtDate(it.created_at)}</span>
                </span>
                <span className="block mt-1.5 text-[14px] leading-snug line-clamp-2">{it.text}</span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 h-5 px-1.5 border font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: st.color, borderColor: st.color }}>
                    {st.label}
                  </span>
                  {it.decision_kind && <span className="label text-[9.5px]">{KIND_LABEL[it.decision_kind] ?? it.decision_kind}</span>}
                  {current && <span className="label text-[9.5px] ml-auto text-ink">Open now</span>}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
};
