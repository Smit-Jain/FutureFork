import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { FinancialScenarioResult } from '../../contracts/types';
import { BAD, FORK_COLORS, FORK_LABELS, chartTheme, fmtRs, riskStatus, riskTone, scoreTone } from '../../theme/forks';

interface OverviewProps {
  financialResults: FinancialScenarioResult[];
  /** hovered fork, else the selected one */
  focusId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

type SortKey = 'fork' | 'survival' | 'cashout' | 'floor' | 'runway' | 'p10';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'fork', label: 'Fork' },
  { key: 'survival', label: 'Survival' },
  { key: 'cashout', label: 'Cash-out risk' },
  { key: 'floor', label: 'Below floor' },
  { key: 'runway', label: 'Runway' },
  { key: 'p10', label: 'P10 low' },
];
const sortValue = (r: FinancialScenarioResult, k: SortKey): number | string =>
  k === 'fork' ? FORK_LABELS[r.branch_type]
  : k === 'survival' ? r.metrics.survival_score_pct
  : k === 'cashout' ? r.metrics.cash_out_risk_pct
  : k === 'floor' ? r.metrics.floor_breach_risk_pct
  : k === 'runway' ? r.metrics.runway_months
  : r.metrics.p10_worst_balance;

const MicroBar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <span className="block w-20 h-[4px] bg-ink-line mt-1 overflow-hidden" aria-hidden="true">
    <span className="block h-full transition-[width] duration-500 ease-editorial" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </span>
);

export const Overview: React.FC<OverviewProps> = ({ financialResults, focusId, selectedId, onHover, onSelect }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [mode, setMode] = useState<'all' | 'pair'>('all');

  const rows = useMemo(() => {
    if (!sort) return financialResults;
    return [...financialResults].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [financialResults, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: key === 'fork' ? 1 : -1 } : s.dir === -1 ? { key, dir: 1 } : null));

  const label = (r: FinancialScenarioResult) => FORK_LABELS[r.branch_type];
  const base = financialResults.find((r) => r.branch_type === 'baseline') ?? null;
  const focused = financialResults.find((r) => r.scenario_id === focusId) ?? null;
  const planFloor = financialResults[0]?.metrics.emergency_floor ?? 0;
  const months = financialResults[0]?.cash_flow.months ?? [];

  const pairIds = new Set([base?.scenario_id, focused?.scenario_id].filter(Boolean) as string[]);
  const visible = mode === 'pair' ? financialResults.filter((r) => pairIds.has(r.scenario_id)) : financialResults;

  const chartData = months.map((month, i) => {
    const row: Record<string, number | string> = { month };
    visible.forEach((r) => {
      row[label(r)] = r.simulation.monthly_balances[i] ?? 0;
    });
    return row;
  });

  const radarData = useMemo(() => {
    const maxP10 = Math.max(1, ...financialResults.map((r) => r.metrics.p10_worst_balance));
    const maxRunway = Math.max(1, ...financialResults.map((r) => r.metrics.runway_months));
    const axis = (subject: string, f: (r: FinancialScenarioResult) => number) => ({
      subject,
      ...financialResults.reduce((acc, r) => {
        acc[label(r)] = Math.max(0, Math.min(100, Math.round(f(r))));
        return acc;
      }, {} as Record<string, number>),
    });
    return [
      axis('Survival', (r) => r.metrics.survival_score_pct),
      axis('Cash safety', (r) => 100 - r.metrics.cash_out_risk_pct),
      axis('Floor safety', (r) => 100 - r.metrics.floor_breach_risk_pct),
      axis('Runway', (r) => (r.metrics.runway_months / maxRunway) * 100),
      axis('P10 buffer', (r) => (r.metrics.p10_worst_balance / maxP10) * 100),
    ];
  }, [financialResults]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-10">
      {/* ── Side-by-side table ── */}
      <div className="overflow-x-auto" onMouseLeave={() => onHover(null)}>
        <table className="w-full text-left text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-ink">
              {COLUMNS.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className="py-2 pr-4 font-normal" aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => toggleSort(c.key)} className={`label flex items-center gap-1 hover:text-ink ${active ? 'text-ink' : ''}`}>
                      {c.label}
                      {active ? sort!.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </th>
                );
              })}
              <th className="py-2 label font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sc = r.metrics.survival_score_pct;
              const st = riskStatus(sc);
              const isFocus = r.scenario_id === focusId;
              const isSel = r.scenario_id === selectedId;
              return (
                <tr
                  key={r.scenario_id}
                  onMouseEnter={() => onHover(r.scenario_id)}
                  onClick={() => onSelect(r.scenario_id)}
                  className={`border-b border-ink-line cursor-pointer transition-colors ${isFocus ? 'bg-paper-2' : 'hover:bg-paper-2/60'}`}
                  aria-selected={isSel}
                >
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 shrink-0" style={{ background: FORK_COLORS[r.branch_type] }} />
                      <span>{label(r)}</span>
                      {isSel && <span className="label text-[9px] border border-ink px-1">Selected</span>}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums" style={{ color: scoreTone(sc) }}>
                    {sc}%
                    <MicroBar pct={sc} color={scoreTone(sc)} />
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums" style={{ color: riskTone(r.metrics.cash_out_risk_pct) }}>
                    {r.metrics.cash_out_risk_pct}%
                    <MicroBar pct={r.metrics.cash_out_risk_pct} color={riskTone(r.metrics.cash_out_risk_pct)} />
                  </td>
                  <td className="py-3 pr-4 font-mono tabular-nums">{r.metrics.floor_breach_risk_pct}%</td>
                  <td className="py-3 pr-4 font-mono tabular-nums">{r.metrics.runway_months}mo</td>
                  <td className="py-3 pr-4 font-mono tabular-nums" style={{ color: r.metrics.p10_worst_balance < 0 ? BAD : undefined }}>
                    {fmtRs(r.metrics.p10_worst_balance)}
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center h-6 px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-paper" style={{ background: st.color }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line pb-2">
            <h4 className="text-xl tracking-tight">Balance, month by month</h4>
            <div className="inline-flex border border-ink" role="radiogroup" aria-label="Compare mode">
              {([['all', `All ${financialResults.length} forks`], ['pair', 'Selected vs baseline']] as const).map(([m, t], i) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`h-7 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors ${i ? 'border-l border-ink' : ''} ${mode === m ? 'bg-ink text-paper' : 'hover:bg-paper'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {mode === 'pair' && (!focused || focused.branch_type === 'baseline') && (
            <p className="label text-[10px]">Hover or select a fork to compare it with the baseline</p>
          )}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid {...chartTheme.grid} vertical={false} />
                <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={chartTheme.axisLine} tickLine={false} />
                <YAxis tick={chartTheme.axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtRs(v as number)} width={60} />
                <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, name) => [fmtRs(v as number), name]} />
                <ReferenceLine y={planFloor} stroke="#141414" strokeDasharray="4 4" label={{ value: 'Floor', fill: '#141414', fontSize: 10, position: 'insideTopLeft' }} />
                {visible.map((r) => {
                  const spot = focusId === r.scenario_id;
                  const dim = !!focusId && !spot && !(mode === 'pair' && r.branch_type === 'baseline');
                  return (
                    <Line
                      key={r.scenario_id}
                      type="monotone"
                      dataKey={label(r)}
                      stroke={FORK_COLORS[r.branch_type]}
                      strokeWidth={spot ? 3.2 : 1.5}
                      strokeOpacity={dim ? 0.25 : 1}
                      strokeDasharray={r.branch_type === 'baseline' && mode === 'pair' ? '6 4' : undefined}
                      dot={false}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
            {visible.map((r) => (
              <button
                key={r.scenario_id}
                type="button"
                onMouseEnter={() => onHover(r.scenario_id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(r.scenario_id)}
                className={`flex items-center gap-1.5 font-mono text-[11px] transition-opacity ${focusId && focusId !== r.scenario_id ? 'opacity-40' : ''}`}
              >
                <span className="w-3 h-[2px]" style={{ background: FORK_COLORS[r.branch_type] }} />
                {label(r)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-ink-line pb-2">
            <h4 className="text-xl tracking-tight">Trade-offs</h4>
            <span className="label">Relative to best fork</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(20,20,20,.12)" />
                <PolarAngleAxis dataKey="subject" tick={chartTheme.axisTick} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip contentStyle={chartTheme.tooltip} />
                {financialResults.map((r) => {
                  const spot = focusId === r.scenario_id;
                  return (
                    <Radar
                      key={r.scenario_id}
                      name={label(r)}
                      dataKey={label(r)}
                      stroke={FORK_COLORS[r.branch_type]}
                      strokeOpacity={focusId && !spot ? 0.25 : 1}
                      fill={FORK_COLORS[r.branch_type]}
                      fillOpacity={spot ? 0.22 : 0.04}
                      strokeWidth={spot ? 2.2 : 1}
                      isAnimationActive={false}
                    />
                  );
                })}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
