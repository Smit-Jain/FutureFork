import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Printer } from 'lucide-react';
import { FilingChecklist } from '../../contracts/types';
import { inr } from '../../tax/fields';

const CopyValue: React.FC<{ value: number }> = ({ value }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(String(Math.round(value))).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="shrink-0 h-7 px-2 border border-ink-faint hover:border-ink flex items-center gap-1 font-mono text-[11px] print:hidden"
      aria-label={`Copy ${Math.round(value)}`}
    >
      {done ? <Check className="w-3 h-3 text-good" /> : <Copy className="w-3 h-3" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
};

export const FilingGuide: React.FC<{ checklist: FilingChecklist; onExport?: () => void }> = ({ checklist, onExport }) => {
  const [done, setDone] = useState<Record<number, boolean>>({});
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
      <ol className="space-y-4">
        {checklist.steps.map((s) => (
          <li key={s.n} className={`border p-4 sm:p-5 transition-colors ${done[s.n] ? 'border-ink-line bg-paper-2/40' : 'border-ink bg-paper-2'}`}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!done[s.n]}
                aria-label={`Mark step ${s.n} done`}
                onClick={() => setDone((d) => ({ ...d, [s.n]: !d[s.n] }))}
                className={`mt-0.5 w-6 h-6 shrink-0 border flex items-center justify-center font-mono text-[11px] ${done[s.n] ? 'bg-ink text-paper border-ink' : 'border-ink'}`}
              >
                {done[s.n] ? <Check className="w-3.5 h-3.5" /> : s.n}
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className={`text-[17px] leading-snug ${done[s.n] ? 'line-through text-ink-dim' : ''}`}>{s.title}</h3>
                <p className="text-[13.5px] text-ink-2 leading-relaxed">{s.detail}</p>
                {s.fields.length > 0 && (
                  <ul className="divide-y divide-ink-line border-t border-b border-ink-line">
                    {s.fields.map((f) => (
                      <li key={`${f.label}-${f.where}`} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px]">{f.label}</div>
                          <div className="label text-[9.5px] normal-case">{f.where}</div>
                        </div>
                        <span className="font-mono text-[14px]">{inr(f.value)}</span>
                        <CopyValue value={f.value} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <aside className="space-y-4 lg:sticky lg:top-20 self-start">
        <div className="border border-ink-line bg-paper-2 p-4 space-y-3">
          <span className="label">Keep these ready</span>
          <ul className="space-y-1.5 text-[13.5px]">
            {checklist.documents.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="text-ink-dim">—</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 print:hidden">
          <a
            href="https://www.incometax.gov.in/iec/foportal/"
            target="_blank"
            rel="noreferrer"
            className="h-10 border border-ink bg-ink text-paper flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]"
          >
            Open the e-filing portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => window.print()} className="h-10 border border-ink flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] hover:bg-paper">
            <Printer className="w-3.5 h-3.5" /> Print / save as PDF
          </button>
          {onExport && (
            <button onClick={onExport} className="h-10 border border-ink-faint hover:border-ink flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
              <Download className="w-3.5 h-3.5" /> Download summary (JSON)
            </button>
          )}
        </div>
        <p className="label text-[10px] leading-relaxed normal-case">
          Guidance only, not a filed return. Check every figure against your AIS and Form 26AS before you submit.
        </p>
      </aside>
    </div>
  );
};
