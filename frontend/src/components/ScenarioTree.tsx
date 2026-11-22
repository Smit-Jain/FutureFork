import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { BranchType, FinancialScenarioResult, Scenario } from '../contracts/types';
import { FORK_COLORS, FORK_SHORT, fmtRs, pickBestFork, riskStatus, safeYears } from '../theme/forks';
import { Pills, deltasVsBaseline } from './compare/deltas';
import { TiltCard } from './fx/TiltCard';

interface ScenarioTreeProps {
  scenarios: Scenario[];
  results: Record<string, FinancialScenarioResult>;
  selectedId: string | null;
  onSelect: (scenarioId: string) => void;
  /** Cross-highlight: hovering a fork spotlights it in the Compare charts. */
  onHover?: (scenarioId: string | null) => void;
  hoverId?: string | null;
}

export const branchOf = (s: Scenario): BranchType =>
  (s.change.type in FORK_COLORS ? s.change.type : 'baseline') as BranchType;

const Metric: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <span className="block">
    <span className="label text-[9.5px] block">{label}</span>
    <span className="font-mono text-lg tabular-nums leading-tight" style={{ color }}>{value}</span>
  </span>
);

const tone = (ok: boolean, warn: boolean) => (ok ? '#2f7d4f' : warn ? '#c76a12' : '#d6345f');

/** The three numbers every card shows, in plain words (technical terms live in the glossary). */
const PlainMetrics: React.FC<{ r: FinancialScenarioResult; className: string }> = ({ r, className }) => {
  const { safe, of } = safeYears(r);
  const m = r.metrics;
  return (
    <span className={className}>
      <Metric label="Stays safe" value={`${Math.round((safe / of) * 100)}%`} color={tone(safe / of >= 0.9, safe / of >= 0.7)} />
      <Metric label="Lowest balance" value={fmtRs(m.lowest_balance)} color={m.lowest_balance < m.emergency_floor ? '#c76a12' : undefined} />
      <Metric label="Extra interest" value={m.total_financing_interest > 0 ? fmtRs(m.total_financing_interest) : '₹0'} />
    </span>
  );
};

/** Full-width reference strip for Node 0. */
const BaselineStrip: React.FC<{ scenario: Scenario; result?: FinancialScenarioResult; selected: boolean; hovered: boolean; onSelect: () => void; onHover?: (on: boolean) => void }> = ({
  scenario,
  result,
  selected,
  hovered,
  onSelect,
  onHover,
}) => {
  const m = result?.metrics;
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      disabled={!result}
      aria-pressed={selected}
      className={`relative w-full text-left grid grid-cols-1 md:grid-cols-[minmax(180px,0.9fr)_auto_minmax(0,1.6fr)] items-center gap-x-8 gap-y-3 pl-5 pr-4 py-3.5 border transition-all duration-300
                  ${selected ? 'border-ink bg-paper-2 shadow-paper' : hovered ? 'border-ink-faint bg-paper-2' : 'border-ink-line bg-paper-2/60'}`}
      style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(20,20,20,.025) 0 1px, transparent 1px 8px)' }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: FORK_COLORS.baseline }} />
      <span className="min-w-0">
        <span className="label flex items-center gap-2">
          <span>00</span>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: FORK_COLORS.baseline }} />
          <span style={{ color: FORK_COLORS.baseline }}>Baseline anchor</span>
        </span>
        <span className="block text-base tracking-tight mt-1">{scenario.name}</span>
      </span>
      {m ? (
        <PlainMetrics r={result!} className="flex gap-8" />
      ) : (
        <span className="label">Solving…</span>
      )}
      <span className="text-[12.5px] text-ink-dim leading-snug line-clamp-2">{scenario.description}</span>
    </button>
  );
};

interface ForkCardProps {
  scenario: Scenario;
  result?: FinancialScenarioResult;
  baseline?: FinancialScenarioResult;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHover?: (on: boolean) => void;
  index: number;
  recommended?: boolean;
}

const ForkCard: React.FC<ForkCardProps> = ({ scenario, result, baseline, selected, dimmed, onSelect, onHover, index, recommended }) => {
  const branch = branchOf(scenario);
  const color = FORK_COLORS[branch];
  const m = result?.metrics;
  const pending = (scenario.status === 'running' || scenario.status === 'queued') && !result;
  const st = m ? riskStatus(100 - m.floor_breach_risk_pct) : null;

  return (
    <TiltCard className="h-full" max={5} lift={selected ? 18 : 10}>
      <button
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        onFocus={() => onHover?.(true)}
        onBlur={() => onHover?.(false)}
        disabled={!result}
        aria-pressed={selected}
        className={`relative h-full w-full text-left p-4 preserve-3d flex flex-col transition-all duration-300
                    ${selected ? 'bg-paper-2 shadow-lift' : 'bg-paper-2/70 hover:bg-paper-2 shadow-paper'}
                    ${dimmed ? 'opacity-60' : ''} ${result ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ border: `1px solid ${selected || recommended ? '#141414' : 'rgba(20,20,20,.14)'}`, boxShadow: recommended ? `0 0 0 3px ${color}33` : undefined }}
      >
        {recommended && (
          <span className="absolute -top-3 right-3 z-10 px-2 h-6 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-paper" style={{ background: color, transform: 'translateZ(30px)' }}>
            ★ Recommended
          </span>
        )}
        <span className="absolute left-0 top-0 right-0 h-[3px]" style={{ background: color }} />
        {selected && (
          <>
            <span className="absolute -top-[5px] -left-[5px] w-[7px] h-[7px] border-t border-l border-ink" />
            <span className="absolute -bottom-[5px] -right-[5px] w-[7px] h-[7px] border-b border-r border-ink" />
          </>
        )}

        <div className="flex items-start justify-between gap-2" style={{ transform: 'translateZ(18px)' }}>
          <div className="min-w-0">
            <div className="label flex items-center gap-2">
              <span>{String(index).padStart(2, '0')}</span>
              <span style={{ color }}>{FORK_SHORT[branch]}</span>
            </div>
            <div className="text-[15px] tracking-tight mt-1 leading-snug">{scenario.name}</div>
          </div>
          {pending && <Loader2 className="w-4 h-4 text-ink-dim animate-spin shrink-0" />}
          {scenario.status === 'failed' && <AlertTriangle className="w-4 h-4 text-bad shrink-0" />}
          {st && !recommended && (
            <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.06em] px-1.5 h-5 inline-flex items-center text-paper" style={{ background: st.color }}>
              {st.label}
            </span>
          )}
        </div>

        {m ? (
          <div className="mt-3 space-y-3" style={{ transform: 'translateZ(26px)' }}>
            <PlainMetrics r={result!} className="grid grid-cols-3 gap-2 border-t border-ink-line pt-3" />
            <Pills pills={deltasVsBaseline(result!, baseline ?? null, 2)} />
          </div>
        ) : (
          <div className="label mt-4">{scenario.status === 'failed' ? 'Not evaluated' : 'Solving · CP-SAT + Monte Carlo…'}</div>
        )}

        <p className="text-[12px] text-ink-dim leading-snug mt-3 line-clamp-2" title={result?.description ?? scenario.description}>
          {result?.description && result.branch_type !== 'baseline' ? result.description : scenario.description}
        </p>
      </button>
    </TiltCard>
  );
};

/** 02 The forks: a baseline anchor strip, then the competing forks as a selector grid. */
export const ScenarioTree: React.FC<ScenarioTreeProps> = ({ scenarios, results, selectedId, onSelect, onHover, hoverId }) => {
  const baseline = scenarios.find((s) => s.parent_id === null);
  const forks = scenarios.filter((s) => s.parent_id !== null);
  const baseResult = baseline ? results[baseline.id] : undefined;
  const focusId = hoverId ?? null;
  const bestId = pickBestFork(Object.values(results).filter((r) => scenarios.some((sc) => sc.id === r.scenario_id)))?.scenario_id;

  return (
    <div className="space-y-4" data-tour="tree">
      {baseline && (
        <BaselineStrip
          scenario={baseline}
          result={baseResult}
          selected={selectedId === baseline.id}
          hovered={focusId === baseline.id}
          onSelect={() => onSelect(baseline.id)}
          onHover={(on) => onHover?.(on ? baseline.id : null)}
        />
      )}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${forks.length >= 4 ? 'xl:grid-cols-4' : forks.length === 3 ? 'xl:grid-cols-3' : ''} gap-4`}
        style={{ perspective: '1400px' }}
      >
        {forks.map((s, i) => (
          <div key={s.id} className="animate-slide-up" style={{ animationDelay: `${i * 70}ms` }}>
            <ForkCard
              scenario={s}
              result={results[s.id]}
              baseline={baseResult}
              selected={selectedId === s.id}
              dimmed={!!focusId && focusId !== s.id && selectedId !== s.id}
              onSelect={() => onSelect(s.id)}
              onHover={(on) => onHover?.(on ? s.id : null)}
              index={i + 1}
              recommended={!!results[s.id] && s.id === bestId}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
