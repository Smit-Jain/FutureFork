import React from 'react';
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import { TaxReport } from '../../contracts/types';
import { inr } from '../../tax/fields';

const OUTCOME = {
  refund: { label: 'Refund', color: '#2f7d4f' },
  payable: { label: 'To pay', color: '#c76a12' },
  settled: { label: 'Nothing due', color: '#2f7d4f' },
} as const;

/** The one answer, first: which regime, what it costs, refund or payable, which form. */
export const TaxVerdict: React.FC<{ report: TaxReport; live?: boolean }> = ({ report, live }) => {
  const v = report.verdict;
  const o = OUTCOME[v.outcome];
  const chosen = report[report.recommended];
  return (
    <div className="relative brackets border border-ink bg-paper-2 p-5 sm:p-7 space-y-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{live ? 'Live estimate' : 'Your answer'} · FY {report.fy}</span>
        <span className="label text-[10px] flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Tax engine
        </span>
      </div>

      <div>
        <h2 className="text-3xl sm:text-[42px] leading-[1.02] tracking-[-0.02em]">{v.headline}</h2>
        <p className="mt-2 text-ink-2 leading-relaxed">{v.subline}</p>
      </div>

      <div className="grid grid-cols-3 border border-ink-line divide-x divide-ink-line">
        <div className="p-3">
          <div className="label text-[10px]">Your tax</div>
          <div className="mt-1 font-mono text-lg sm:text-xl">{inr(chosen.total_tax)}</div>
        </div>
        <div className="p-3">
          <div className="label text-[10px]" style={{ color: o.color }}>
            {o.label}
          </div>
          <div className="mt-1 font-mono text-lg sm:text-xl" style={{ color: o.color }}>
            {inr(v.outcome_amount)}
          </div>
        </div>
        <div className="p-3">
          <div className="label text-[10px]">Form</div>
          <div className="mt-1 font-mono text-lg sm:text-xl flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> {report.form.form}
          </div>
        </div>
      </div>

      <p className="text-[15px]">{v.result}</p>

      {report.window.status !== 'on_time' && (
        <p className={`flex items-start gap-2 text-sm border-l-2 px-3 py-2 ${report.window.status === 'planning' ? 'border-ink-faint' : 'border-warn bg-warn/5'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
          {report.window.message}
        </p>
      )}
      {!report.form.supported && (
        <p className="flex items-start gap-2 text-sm border-l-2 border-bad bg-bad/5 px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-bad" />
          {report.form.reasons[0]}
        </p>
      )}

      {report.explanation && (
        <div className="border-t border-ink-line pt-4 space-y-2">
          <p className="leading-relaxed">{report.explanation.text}</p>
          <span className="label text-[10px] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {report.explanation.guard_passed ? 'Every number checked against the engine' : 'Explanation not verified'}
            {report.explanation.source === 'llm' ? ' · written by AI' : ''}
          </span>
        </div>
      )}
    </div>
  );
};
