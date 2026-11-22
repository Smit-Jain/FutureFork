import React from 'react';
import { CheckCircle2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Explanation, FinancialScenarioResult } from '../contracts/types';
import { FORK_COLORS, FORK_LABELS, riskTone, scoreTone } from '../theme/forks';
import { Reveal } from './fx/Reveal';

const TOKEN_RE = /(₹[\d,.]+(?:L|K|Cr)?|-₹[\d,.]+(?:L|K|Cr)?|[\d.]+\s?%|Month\s+\d+|\d+\s+months?)/gi;

/** Highlights engine numbers (₹, %, months) and renders **bold** from LLM output as plain emphasis. */
function renderRich(text: string, onHighlight?: (month: number) => void): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((chunk, ci) => {
    const bold = chunk.startsWith('**') && chunk.endsWith('**');
    const body = bold ? chunk.slice(2, -2) : chunk;
    let last = 0;
    let m: RegExpExecArray | null;
    const parts: React.ReactNode[] = [];
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(body)) !== null) {
      if (m.index > last) parts.push(body.slice(last, m.index));
      const token = m[0];
      const monthNum = /^month/i.test(token) ? parseInt(token.replace(/\D/g, ''), 10) : null;
      const cls = 'font-mono tabular-nums text-[0.92em] px-1 border-b border-ink/40';
      parts.push(
        monthNum !== null && onHighlight ? (
          <button key={`${ci}-${m.index}`} className={`${cls} hover:bg-ink hover:text-paper`} onClick={() => onHighlight(monthNum)}>
            {token}
          </button>
        ) : (
          <span key={`${ci}-${m.index}`} className={cls}>
            {token}
          </span>
        ),
      );
      last = m.index + token.length;
    }
    if (last < body.length) parts.push(body.slice(last));
    out.push(bold ? <strong key={ci} className="font-medium">{parts}</strong> : <React.Fragment key={ci}>{parts}</React.Fragment>);
  });
  return out;
}

interface ExplanationPanelProps {
  explanation: Explanation | null;
  financialResults: FinancialScenarioResult[];
  /** kept for API compatibility; the per-fork list moved to the fork cards and Compare table */
  selectedFinancialId?: string | null;
  onHighlightMonth?: (month: number) => void;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
  explanation,
  financialResults,
  onHighlightMonth,
}) => {
  if (financialResults.length === 0) return null;
  // Rank the competing forks (not the do-nothing baseline) the way the server's explainer does:
  // fewest months below the floor, then survival, then financing interest, then trims.
  const forks = financialResults.filter((r) => r.branch_type !== 'baseline');
  const pool = forks.length ? forks : financialResults;
  const best = [...pool].sort(
    (a, b) =>
      a.metrics.months_below_floor - b.metrics.months_below_floor ||
      b.metrics.survival_score_pct - a.metrics.survival_score_pct ||
      a.metrics.total_financing_interest - b.metrics.total_financing_interest ||
      a.metrics.total_trims_saved - b.metrics.total_trims_saved,
  )[0];
  const guardOk = !!explanation?.guard_passed;

  return (
    <div className="space-y-8" data-tour="explanation">
      {/* Recommendation hero */}
      <Reveal>
        <div className="relative grad-border p-6 sm:p-8 bg-paper-2/60">
          <div className="label">Recommended fork</div>
          <div className="mt-2 text-3xl sm:text-5xl tracking-tight leading-[1.02]" style={{ color: FORK_COLORS[best.branch_type] }}>
            {FORK_LABELS[best.branch_type]}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 max-w-xl border-t border-ink-line pt-4">
            <div>
              <div className="label">Survival</div>
              <div className="font-mono text-2xl tabular-nums" style={{ color: scoreTone(best.metrics.survival_score_pct) }}>
                {best.metrics.survival_score_pct}%
              </div>
            </div>
            <div>
              <div className="label">Cash-out risk</div>
              <div className="font-mono text-2xl tabular-nums" style={{ color: riskTone(best.metrics.cash_out_risk_pct) }}>
                {best.metrics.cash_out_risk_pct}%
              </div>
            </div>
            <div>
              <div className="label">Runway</div>
              <div className="font-mono text-2xl tabular-nums">{best.metrics.runway_months}mo</div>
            </div>
          </div>
          <p className="mt-4 text-[12px] text-ink-dim flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-good" />
            Fewest months below the floor, then highest survival, then lowest cost · from CP-SAT and {best.simulation.n_runs} Monte Carlo runs.
          </p>
        </div>
      </Reveal>

      {/* Guarded explanation */}
      {explanation?.summary && (
        <Reveal step={1}>
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 lg:gap-8">
            <div className="space-y-2">
              <div className="label">{explanation.source === 'llm' ? 'Written by AI' : 'Written from template'}</div>
              <div
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.05em] border px-2 py-1"
                style={{ color: guardOk ? '#2f7d4f' : '#d6345f', borderColor: guardOk ? '#2f7d4f' : '#d6345f' }}
              >
                {guardOk ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                Numeric Guard {guardOk ? 'passed' : 'failed'}
              </div>
              <p className="text-[12px] text-ink-dim leading-snug">
                Every ₹, % and month in this text was checked against the engine's results.
              </p>
            </div>
            <p className="text-[15px] leading-relaxed whitespace-pre-line max-w-3xl">
              {renderRich(explanation.summary, onHighlightMonth)}
            </p>
          </div>
        </Reveal>
      )}

    </div>
  );
};
