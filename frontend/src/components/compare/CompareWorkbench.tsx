import React from 'react';
import { Activity, Download, Table2, Zap } from 'lucide-react';
import { FinancialScenarioResult } from '../../contracts/types';
import { StressMode } from '../../decide/SimControls';
import { FORK_COLORS, FORK_LABELS } from '../../theme/forks';
import { CashFlowMatrix } from '../CashFlowMatrix';
import { CrisisConsole } from './CrisisConsole';
import { Overview } from './Overview';
import { Pills, deltasVsBaseline } from './deltas';

export type CompareTab = 'overview' | 'crisis' | 'cashflow';

const TABS: { id: CompareTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview & charts', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'crisis', label: 'Crisis playground', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'cashflow', label: 'Cash flow matrix', icon: <Table2 className="w-3.5 h-3.5" /> },
];

interface CompareWorkbenchProps {
  financialResults: FinancialScenarioResult[];
  selectedId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  decisionId: string | null;
  stressMode: StressMode;
  tab: CompareTab;
  onTab: (t: CompareTab) => void;
}

function exportPlan(financialResults: FinancialScenarioResult[]) {
  const best = financialResults.reduce((a, b) => (b.metrics.survival_score_pct > a.metrics.survival_score_pct ? b : a));
  const months = best.cash_flow.months;
  const rows = [
    ['FutureFork: winning plan'],
    ['Fork', FORK_LABELS[best.branch_type]],
    ['Survival score', `${best.metrics.survival_score_pct}%`],
    ['Cash-out risk', `${best.metrics.cash_out_risk_pct}%`],
    ['Runway', `${best.metrics.runway_months} months`],
    ['P10 worst balance', best.metrics.p10_worst_balance],
    [],
    ['Month', 'Money in', 'Decision cash-out', 'Closing balance', 'P10 balance', 'P90 balance'],
    ...months.map((m, i) => [
      m,
      best.cash_flow.inflows[i],
      best.cash_flow.purchase_cash_out[i],
      best.simulation.monthly_balances[i],
      best.simulation.balance_p10[i],
      best.simulation.balance_p90[i],
    ]),
  ];
  const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `futurefork-${FORK_LABELS[best.branch_type].replace(/[^a-z0-9]+/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 03 Compare: a persistent bar (tabs, focused fork + deltas, export) over three views. */
export const CompareWorkbench: React.FC<CompareWorkbenchProps> = ({
  financialResults,
  selectedId,
  hoverId,
  onHover,
  onSelect,
  decisionId,
  stressMode,
  tab,
  onTab,
}) => {
  const focusId = hoverId ?? selectedId;
  const focused = financialResults.find((r) => r.scenario_id === focusId) ?? null;
  const baseline = financialResults.find((r) => r.branch_type === 'baseline') ?? null;
  const selected = financialResults.find((r) => r.scenario_id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="sticky top-[54px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 bg-paper/90 backdrop-blur-md border-b border-ink">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2">
          <div className="flex overflow-x-auto" role="tablist" aria-label="Compare views">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => onTab(t.id)}
                className={`h-9 px-3.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] whitespace-nowrap border-b-2 transition-colors
                            ${tab === t.id ? 'border-brand-coral text-ink' : 'border-transparent text-ink-dim hover:text-ink'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            {focused && (
              <span className="flex flex-wrap items-center gap-2 min-w-0" aria-live="polite">
                <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.05em]">
                  <span className="w-2 h-2" style={{ background: FORK_COLORS[focused.branch_type] }} />
                  {FORK_LABELS[focused.branch_type]}
                  <span className="text-ink-dim normal-case">{focused.branch_type === 'baseline' ? '· reference' : 'vs baseline'}</span>
                </span>
                <Pills pills={deltasVsBaseline(focused, baseline, 3)} />
              </span>
            )}
            <button
              onClick={() => exportPlan(financialResults)}
              className="h-7 px-2.5 border border-ink font-mono text-[10.5px] uppercase tracking-[0.06em] flex items-center gap-1.5 hover:bg-ink hover:text-paper transition-colors"
              title="Download the highest-survival fork's 12-month plan as CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className="animate-fade-in">
        {tab === 'overview' && (
          <Overview financialResults={financialResults} focusId={focusId} selectedId={selectedId} onHover={onHover} onSelect={onSelect} />
        )}
        {tab === 'crisis' && (
          <CrisisConsole financialResults={financialResults} decisionId={decisionId} stressMode={stressMode} selectedId={selectedId} />
        )}
        {tab === 'cashflow' && <CashFlowMatrix result={selected} baselineResult={baseline} />}
      </div>
    </div>
  );
};
