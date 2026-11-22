import React, { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { Regime, TaxBreakdown, TaxReport } from '../../contracts/types';
import { inr } from '../../tax/fields';

const TITLE: Record<Regime, string> = { new: 'New regime', old: 'Old regime' };
const BLURB: Record<Regime, string> = {
  new: 'Lower rates, ₹75,000 standard deduction, almost no other deductions.',
  old: 'Higher rates, but HRA, 80C, 80D, home loan and more can be deducted.',
};

const Column: React.FC<{ b: TaxBreakdown; best: boolean; locked: boolean; open: boolean }> = ({ b, best, locked, open }) => (
  <div className={`relative border p-5 space-y-4 ${best ? 'border-ink bg-paper-2' : 'border-ink-line bg-paper-2/50'}`}>
    {best && <span className="absolute -top-2.5 left-4 px-2 bg-ink text-paper font-mono text-[10px] uppercase tracking-[0.06em]">Recommended</span>}
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-xl tracking-tight flex items-center gap-2">
          {TITLE[b.regime]} {locked && <Lock className="w-3.5 h-3.5 text-ink-dim" aria-label="Not available for this return" />}
        </h3>
        <p className="text-[13px] text-ink-dim mt-1 max-w-xs">{BLURB[b.regime]}</p>
      </div>
      <div className="text-right">
        <div className="label text-[10px]">Tax</div>
        <div className="font-mono text-2xl">{inr(b.total_tax)}</div>
      </div>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <dt className="text-ink-dim">Taxable income</dt>
      <dd className="font-mono text-right">{inr(b.taxable_income)}</dd>
      <dt className="text-ink-dim">Deductions used</dt>
      <dd className="font-mono text-right">{inr(b.total_deductions)}</dd>
      <dt className="text-ink-dim">Share of income</dt>
      <dd className="font-mono text-right">{b.effective_rate_pct.toFixed(1)}%</dd>
    </dl>
    {open && (
      <table className="w-full text-[13px] border-t border-ink-line">
        <tbody>
          {b.lines.map((l) => (
            <tr
              key={l.key}
              className={`border-b border-ink-line/70 ${['subtotal', 'total', 'result'].includes(l.kind) ? 'font-medium' : ''}`}
            >
              <td className="py-1.5 pr-2">
                {l.label}
                {l.section && <span className="ml-1.5 font-mono text-[10px] text-ink-dim">{l.section}</span>}
              </td>
              <td className={`py-1.5 text-right font-mono whitespace-nowrap ${l.amount < 0 ? 'text-good' : ''}`}>{inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {open && b.notes.length > 0 && (
      <ul className="space-y-1 text-[12.5px] text-ink-dim list-disc pl-4">
        {b.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    )}
  </div>
);

export const RegimeSideBySide: React.FC<{ report: TaxReport }> = ({ report }) => {
  const [open, setOpen] = useState(false);
  const oldLocked = !report.window.old_regime_allowed;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <Column b={report.new} best={report.recommended === 'new'} locked={false} open={open} />
        <Column b={report.old} best={report.recommended === 'old'} locked={oldLocked} open={open} />
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="label flex items-center gap-1.5 hover:text-ink"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Hide the working' : 'Show the line-by-line working'}
      </button>
    </div>
  );
};
