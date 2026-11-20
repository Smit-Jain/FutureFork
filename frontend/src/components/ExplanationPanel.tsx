import React from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkles, CheckCircle2, Lightbulb, Compass } from 'lucide-react';
import { ExplanationPayload, Scenario, ScenarioResult, FinancialScenarioResult } from '../contracts/types';

interface ExplanationPanelProps {
  explanation: ExplanationPayload | null;
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  // Financial mode (optional)
  financialMode?: boolean;
  financialResults?: FinancialScenarioResult[];
  selectedFinancialId?: string;
  onHighlightMonth?: (month: number) => void;
}

// ─── Utility: parse ₹, %, Month N patterns ──────────────────────────────────

function parseExplanationPills(text: string, onHighlight?: (month: number) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Pattern: ₹ amounts, percentages, Month references
  const regex = /(₹[\d,.]+(L|K|Cr)?|[\d.]+%|Month\s+\d+|\d+\s+months?)/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    const isRupee = token.startsWith('₹');
    const isPercent = token.endsWith('%');
    const isMonth = /month/i.test(token);

    let pillClass = '';
    if (isRupee) pillClass = 'metric-pill-emerald';
    else if (isPercent) pillClass = 'metric-pill-amber';
    else if (isMonth) pillClass = 'metric-pill-cyan';
    else pillClass = 'metric-pill-cyan';

    const monthNum = isMonth ? parseInt(token.replace(/\D/g, ''), 10) : null;

    parts.push(
      <button
        key={`${match.index}-${token}`}
        className={`${pillClass} cursor-pointer hover:opacity-80 active:scale-95 transition-all duration-100 inline-block mx-0.5`}
        onClick={() => { if (monthNum !== null && onHighlight) onHighlight(monthNum); }}
        title={monthNum !== null ? `Highlight Month ${monthNum}` : undefined}
      >
        {token}
      </button>
    );

    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

const POLICY_LABEL_MAP: Record<string, string> = {
  fin_baseline: 'Baseline (Node 0)',
  fin_upfront:  'Fork 1: Upfront Pay',
  fin_emi:      'Fork 2: EMI Structure',
  fin_phased:   'Fork 3: Phased Spend',
  fin_trim:     'Fork 4: Trim & Survive',
};

const POLICY_COLOR_MAP: Record<string, string> = {
  fin_baseline: 'border-emerald-500/30 bg-emerald-500/5',
  fin_upfront:  'border-cyan-500/30 bg-cyan-500/5',
  fin_emi:      'border-amber-500/30 bg-amber-500/5',
  fin_phased:   'border-purple-500/30 bg-purple-500/5',
  fin_trim:     'border-rose-500/30 bg-rose-500/5',
};

const SURVIVAL_COLOR = (pct: number) =>
  pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400';

// ─── Financial Explanation Panel ─────────────────────────────────────────────

interface FinancialExplanationProps {
  financialResults: FinancialScenarioResult[];
  selectedFinancialId: string;
  onHighlightMonth?: (month: number) => void;
}

const FinancialExplanationPanel: React.FC<FinancialExplanationProps> = ({
  financialResults,
  selectedFinancialId,
  onHighlightMonth,
}) => {
  const best = financialResults.reduce((a, b) =>
    b.metrics.survival_score_pct > a.metrics.survival_score_pct ? b : a
  );

  return (
    <div className="glass-card p-6 space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/8 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">AI Decision Synthesis</h3>
            <p className="text-xs text-slate-500">Grounded strictly in CP-SAT solver + Monte Carlo simulation outputs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="purple" size="sm" dot>AI-generated from computed results</Badge>
          <span className="text-[10px] text-slate-600 font-mono">Numeric Guard: Active</span>
        </div>
      </div>

      {/* Recommendation */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-purple-500/10 border border-emerald-500/20 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Lightbulb className="w-4 h-4" />
          Recommended Policy: <span className="text-white">{POLICY_LABEL_MAP[best.scenario_id] ?? best.scenario_id}</span>
        </div>
        <div className="text-sm text-slate-300 leading-relaxed font-mono tabular-nums">
          Survival score{' '}
          <span className={`font-black ${SURVIVAL_COLOR(best.metrics.survival_score_pct)}`}>
            {best.metrics.survival_score_pct}%
          </span>
          {' '}· Cash-out risk{' '}
          <span className={`font-black ${SURVIVAL_COLOR(100 - best.metrics.cash_out_risk_pct)}`}>
            {best.metrics.cash_out_risk_pct}%
          </span>
          {' '}· Runway{' '}
          <span className="text-cyan-400 font-black">{best.metrics.runway_months} months</span>
        </div>
        <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Validated against 300 Monte Carlo perturbations and CP-SAT solver constraints.</span>
        </div>
      </div>

      {/* Per-scenario breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <Compass className="w-3.5 h-3.5 text-slate-500" />
          Per-Fork Consequence Analysis
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {financialResults.map((r) => (
            <div
              key={r.scenario_id}
              className={`p-4 rounded-xl border space-y-2 transition-all hover:shadow-glass ${
                POLICY_COLOR_MAP[r.scenario_id] ?? 'border-white/10 bg-white/3'
              } ${r.scenario_id === selectedFinancialId ? 'ring-1 ring-inset ring-white/20' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{POLICY_LABEL_MAP[r.scenario_id] ?? r.scenario_id}</span>
                <span className={`text-xs font-black font-mono tabular-nums ${SURVIVAL_COLOR(r.metrics.survival_score_pct)}`}>
                  {r.metrics.survival_score_pct}% survival
                </span>
              </div>
              {r.explanation && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  {parseExplanationPills(r.explanation, onHighlightMonth)}
                </p>
              )}
              <div className="flex gap-3 text-[10px] font-mono tabular-nums mt-1">
                <span className="metric-pill-rose">{r.metrics.cash_out_risk_pct}% risk</span>
                <span className="metric-pill-cyan">{r.metrics.runway_months}mo runway</span>
                <span className={r.metrics.p10_worst_balance < 0 ? 'metric-pill-rose' : 'metric-pill-emerald'}>
                  P10: {r.metrics.p10_worst_balance < 0 ? '-₹' : '₹'}
                  {Math.abs(r.metrics.p10_worst_balance).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
  explanation,
  scenarios,
  results,
  financialMode = false,
  financialResults = [],
  selectedFinancialId = 'fin_baseline',
  onHighlightMonth,
}) => {
  if (financialMode && financialResults.length > 0) {
    return (
      <FinancialExplanationPanel
        financialResults={financialResults}
        selectedFinancialId={selectedFinancialId}
        onHighlightMonth={onHighlightMonth}
      />
    );
  }

  if (!explanation) return null;

  return (
    <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-soft space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-brand-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">AI Decision Synthesis</h3>
            <p className="text-xs text-slate-500">Natural language interpretation grounded in mathematical simulation outputs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="purple" size="sm" dot>AI-generated from computed results</Badge>
          <span className="text-[10px] text-slate-400 font-mono">Strict Numeric Guard: Active</span>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-slate-400" />
          <span>Executive Synthesis</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed">{explanation.summary}</p>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Per-Scenario Consequence Analysis</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {scenarios.map((sc) => {
            const tradeoffText = explanation.tradeoffs[sc.id];
            const metrics = results[sc.id]?.metrics;
            const borderColor = sc.id === 'baseline' ? 'border-emerald-200 bg-emerald-50/20' : sc.id === 'scenario_a' ? 'border-rose-200 bg-rose-50/20' : sc.id === 'scenario_b' ? 'border-purple-200 bg-purple-50/20' : 'border-amber-200 bg-amber-50/20';

            return (
              <div key={sc.id} className={`p-4 rounded-xl border ${borderColor} space-y-2 transition-all hover:shadow-xs`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{sc.name}</span>
                  {metrics && (
                    <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {metrics.student_clashes} clashes · {metrics.room_utilization}% util
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{tradeoffText || sc.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-gradient-to-r from-brand-50/80 via-purple-50/60 to-emerald-50/60 border border-brand-200/80 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-brand-700 font-bold text-sm">
          <Lightbulb className="w-4 h-4 text-brand-600" />
          <span>Recommended Policy Decision</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed font-medium">{explanation.recommendation}</p>
        <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Validated against solver constraints and 300 Monte Carlo perturbations.</span>
        </div>
      </div>
    </Card>
  );
};
