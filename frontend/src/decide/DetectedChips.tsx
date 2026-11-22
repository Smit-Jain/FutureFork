import React, { useEffect, useRef, useState } from 'react';
import { CADENCE_LABEL, Cadence, Detected, formatAmount, parseAmountInput } from './parseDecision';

interface ChipProps {
  label: string;
  value: string;
  onCommit?: (raw: string) => boolean; // return false to keep editing (invalid input)
  onClick?: () => void;
  title?: string;
  tone?: 'ink' | 'brand' | 'dim';
}

/** A mono key:value chip. Editable chips turn into an inline input on click. */
const Chip: React.FC<ChipProps> = ({ label, value, onCommit, onClick, title, tone = 'ink' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    if (!onCommit) return setEditing(false);
    if (onCommit(draft)) {
      setEditing(false);
      setBad(false);
    } else setBad(true);
  };

  const base = 'h-7 inline-flex items-center gap-1.5 border px-2 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors duration-200';
  const toneCls =
    tone === 'brand' ? 'border-brand-coral text-ink bg-brand-coral/5' : tone === 'dim' ? 'border-ink-faint text-ink-dim' : 'border-ink text-ink';

  if (editing && onCommit) {
    return (
      <span className={`${base} ${bad ? 'border-bad' : 'border-ink'} bg-paper-2`}>
        <span className="text-ink-dim">{label}:</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
              setBad(false);
            }
          }}
          aria-label={`Edit ${label}`}
          className="w-20 bg-transparent outline-none font-mono text-[11px] normal-case"
        />
      </span>
    );
  }

  const interactive = !!onCommit || !!onClick;
  return (
    <button
      type="button"
      title={title}
      disabled={!interactive}
      onClick={() => {
        if (onCommit) {
          setDraft(value);
          setEditing(true);
        } else onClick?.();
      }}
      className={`${base} ${toneCls} ${interactive ? 'hover:bg-ink hover:text-paper cursor-pointer' : 'cursor-default'} animate-fade-in`}
    >
      <span className={interactive ? 'opacity-60' : 'opacity-70'}>{label}:</span>
      <span>{value}</span>
      {onCommit && <span className="opacity-40" aria-hidden="true">✎</span>}
      {onClick && !onCommit && <span className="opacity-40" aria-hidden="true">⇄</span>}
    </button>
  );
};

interface DetectedChipsProps {
  detected: Detected;
  onSpend: (v: number) => void;
  onFloor: (v: number) => void;
  onCadence: (c: Cadence) => void;
}

const NEXT_CADENCE: Record<Cadence, Cadence> = { one_time: 'monthly', monthly: 'yearly', yearly: 'one_time' };

/** "Detected parameters" strip under the prompt. Edits are written back into the prompt text. */
export const DetectedChips: React.FC<DetectedChipsProps> = ({ detected: d, onSpend, onFloor, onCadence }) => {
  const amountCommit = (cb: (v: number) => void) => (raw: string) => {
    const v = parseAmountInput(raw);
    if (v === null || v < 0) return false;
    cb(v);
    return true;
  };
  const cadenceLocked = d.cadence !== 'one_time' && !d.cadenceSpan && !(d.spend?.unit === 'lpa');

  return (
    <div className="flex flex-wrap items-center gap-2 min-h-7" aria-label="Detected parameters" aria-live="polite">
      <span className="label text-[10px] mr-1">Detected</span>
      {d.kind === 'income' && d.percent ? (
        <Chip label="Income change" value={`-${d.percent.value}%`} tone="brand" title="An income change; the engine models it with its own forks" />
      ) : d.spend ? (
        <Chip label="Spend" value={formatAmount(d.spend.value)} onCommit={amountCommit(onSpend)} title="Click to change the amount" />
      ) : (
        <Chip label="Spend" value="—" tone="dim" title="Type an amount like ₹60L, 1.2 lakh or 30k" />
      )}
      {d.quantity && d.quantity > 1 && <Chip label="Qty" value={`× ${d.quantity}`} />}
      {d.kind !== 'income' && (
        <Chip
          label="Cadence"
          value={CADENCE_LABEL[d.cadence]}
          onClick={d.spend && !cadenceLocked ? () => onCadence(NEXT_CADENCE[d.cadence]) : undefined}
          title={cadenceLocked ? 'Implied by a word like "subscription"; edit the text to change it' : 'Click to switch one-time / monthly / yearly'}
        />
      )}
      {d.floor ? (
        <Chip label="Reserve floor" value={formatAmount(d.floor.value)} onCommit={amountCommit(onFloor)} tone="brand" title="Click to change the floor" />
      ) : (
        <Chip label="Reserve floor" value="+ add" onCommit={amountCommit(onFloor)} tone="dim" title="Add a minimum balance to protect" />
      )}
      <Chip label="Type" value={d.tag} tone="dim" />
    </div>
  );
};
