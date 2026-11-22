import React, { useEffect, useId, useState } from 'react';
import { inr, parseMoney } from '../../tax/fields';

interface MoneyFieldProps {
  label: string;
  hint?: string;
  where?: string;
  value: number;
  cap?: number | null;
  onChange: (v: number) => void;
}

/** Rupee input that accepts "12L", "75k" or "1,20,000" and shows Indian grouping when not focused. */
export const MoneyField: React.FC<MoneyFieldProps> = ({ label, hint, where, value, cap, onChange }) => {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(value ? value.toLocaleString('en-IN') : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setText(value ? value.toLocaleString('en-IN') : '');
  }, [value, focused]);

  const commit = (raw: string) => {
    const v = parseMoney(raw);
    if (v === null || v < 0) {
      setError('Type an amount like 1,20,000 or 1.2L');
      return;
    }
    setError(null);
    onChange(Math.round(v));
  };

  const over = cap != null && value > cap;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] leading-snug">{label}</span>
        {cap != null && (
          <span className={`label text-[10px] shrink-0 ${over ? 'text-warn' : ''}`}>
            {value ? `${inr(Math.min(value, cap))} of ${inr(cap)}` : `Limit ${inr(cap)}`}
          </span>
        )}
      </label>
      <div className={`flex items-center border bg-paper-2 transition-colors ${error ? 'border-bad' : focused ? 'border-ink' : 'border-ink-faint'}`}>
        <span className="pl-3 pr-1 text-ink-dim font-mono text-sm" aria-hidden="true">
          ₹
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder="0"
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseMoney(e.target.value);
            if (v !== null && v >= 0) {
              setError(null);
              onChange(Math.round(v));
            }
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          aria-invalid={!!error}
          aria-describedby={`${id}-hint`}
          className="flex-1 min-w-0 bg-transparent px-1 py-2 text-sm font-mono outline-none placeholder:text-ink-dim"
        />
      </div>
      <p id={`${id}-hint`} className="text-[12px] leading-snug text-ink-dim">
        {error ? <span className="text-bad">{error}</span> : hint}
        {!error && over && <span className="text-warn"> Only {inr(cap!)} counts.</span>}
        {!error && where && <span className="block font-mono text-[10.5px] uppercase tracking-[0.04em] mt-0.5">Find it in: {where}</span>}
      </p>
    </div>
  );
};
