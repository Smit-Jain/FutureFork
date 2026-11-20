import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Scenario, ScenarioResult, FinancialScenarioResult } from '../contracts/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
  ErrorBar,
} from 'recharts';
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Zap,
  Download,
} from 'lucide-react';

interface ComparisonDashboardProps {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  selectedIds: string[];
  // Financial mode
  financialMode?: boolean;
  financialResults?: FinancialScenarioResult[];
  selectedFinancialId?: string;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

const FINANCIAL_COLORS: Record<string, string> = {
  fin_baseline: '#10B981',
  fin_upfront:  '#06B6D4',
  fin_emi:      '#F59E0B',
  fin_phased:   '#8B5CF6',
  fin_trim:     '#F43F5E',
};

const FINANCIAL_LABELS: Record<string, string> = {
  fin_baseline: 'Baseline',
  fin_upfront:  'Upfront Buy',
  fin_emi:      'EMI Structure',
  fin_phased:   'Phased Spend',
  fin_trim:     'Trim & Survive',
};

const getScenarioColor = (id: string) => {
  if (id === 'baseline') return '#10B981';
  if (id === 'scenario_a') return '#EF4444';
  if (id === 'scenario_b') return '#8B5CF6';
  if (id === 'scenario_c') return '#F59E0B';
  return '#64748B';
};

// ─── Tooltip helper ──────────────────────────────────────────────────────────

const fmtRs = (v: number) => {
  if (Math.abs(v) >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

// ─── Financial Comparison ────────────────────────────────────────────────────

interface FinancialComparisonProps {
  financialResults: FinancialScenarioResult[];
  selectedFinancialId: string;
}

const FinancialComparison: React.FC<FinancialComparisonProps> = ({ financialResults, selectedFinancialId }) => {
  const [floorLevel, setFloorLevel] = useState(500000);
  const [inflowDelay, setInflowDelay] = useState(0);    // 0–45 days
  const [surpriseOutflow, setSurpriseOutflow] = useState(0); // 0–2500000
  const [spendDrift, setSpendDrift] = useState(0);      // 0–30 %

  // Interpolate survival score based on sliders (pure client-side, no backend calls)
  const interpolateSurvival = (result: FinancialScenarioResult): number => {
    const base = result.simulation.per_metric.survival_score_pct;
    // Fraction across sliders
    const fInflow  = inflowDelay / 45;
    const fOutflow = surpriseOutflow / 2500000;
    const fDrift   = spendDrift / 30;
    const shock    = (fInflow * 0.4 + fOutflow * 0.4 + fDrift * 0.2);
    // Interpolate between p90 (best) and p10 (worst) based on shock
    const interpolated = base.p90 - shock * (base.p90 - base.p10);
    return Math.max(0, Math.min(100, Math.round(interpolated)));
  };

  // Build 12-month balance chart data
  const monthLabels = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
  const balanceChartData = monthLabels.map((month, i) => {
    const row: Record<string, number | string> = { month };
    financialResults.forEach((r) => {
      row[FINANCIAL_LABELS[r.scenario_id]] = r.simulation.monthly_balances[i] ?? 0;
    });
    return row;
  });

  // Radar chart data
  const radarData = [
    {
      subject: 'Survival',
      ...financialResults.reduce((acc, r) => { acc[FINANCIAL_LABELS[r.scenario_id]] = r.metrics.survival_score_pct; return acc; }, {} as Record<string, number>),
    },
    {
      subject: 'Cash Safety',
      ...financialResults.reduce((acc, r) => { acc[FINANCIAL_LABELS[r.scenario_id]] = Math.max(0, 100 - r.metrics.cash_out_risk_pct); return acc; }, {} as Record<string, number>),
    },
    {
      subject: 'Runway',
      ...financialResults.reduce((acc, r) => { acc[FINANCIAL_LABELS[r.scenario_id]] = Math.min(100, Math.round((r.metrics.runway_months / 18) * 100)); return acc; }, {} as Record<string, number>),
    },
    {
      subject: 'P10 Buffer',
      ...financialResults.reduce((acc, r) => {
        const v = r.metrics.p10_worst_balance;
        // Normalize to 0-100 (0 = negative, 100 = ₹10L+)
        acc[FINANCIAL_LABELS[r.scenario_id]] = Math.max(0, Math.min(100, Math.round((v / 1000000) * 100)));
        return acc;
      }, {} as Record<string, number>),
    },
    {
      subject: 'Floor Clearance',
      ...financialResults.reduce((acc, r) => {
        // Higher P10 balance relative to floor = better
        const clearance = Math.max(0, r.metrics.p10_worst_balance - floorLevel);
        acc[FINANCIAL_LABELS[r.scenario_id]] = Math.min(100, Math.round(clearance / 10000));
        return acc;
      }, {} as Record<string, number>),
    },
  ];

  // Export winning plan as CSV
  const handleExport = () => {
    const best = financialResults.reduce((a, b) =>
      b.metrics.survival_score_pct > a.metrics.survival_score_pct ? b : a
    );
    const rows = [
      ['FutureFork — Winning Plan Export'],
      ['Fork', FINANCIAL_LABELS[best.scenario_id]],
      ['Survival Score', `${best.metrics.survival_score_pct}%`],
      ['Cash-Out Risk', `${best.metrics.cash_out_risk_pct}%`],
      ['Runway', `${best.metrics.runway_months} months`],
      ['P10 Worst Balance', fmtRs(best.metrics.p10_worst_balance)],
      [],
      ['Month', 'Balance'],
      ...monthLabels.map((m, i) => [m, best.simulation.monthly_balances[i]]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `futurefork-${FINANCIAL_LABELS[best.scenario_id].replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tooltipStyle = {
    backgroundColor: '#0F1623',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    fontSize: '12px',
    color: '#E2E8F0',
  };

  return (
    <div className="space-y-6">
      {/* ── Metrics Summary Table ──────────────────────────────────────────── */}
      <div className="glass-card p-5 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Fork Comparison — Key Metrics</h3>
            <p className="text-xs text-slate-500">Emerald ≥90% survival · Amber 70-89% · Rose &lt;70%</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-emerald-400 border border-white/10 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export Winning Plan
          </button>
        </div>
        <table className="w-full text-left text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-white/8">
              <th className="pb-3 pr-4 text-slate-500 font-semibold">Fork</th>
              <th className="pb-3 pr-4 text-slate-500 font-semibold tabular-nums">Survival</th>
              <th className="pb-3 pr-4 text-slate-500 font-semibold tabular-nums">Cash-Out Risk</th>
              <th className="pb-3 pr-4 text-slate-500 font-semibold tabular-nums">Runway</th>
              <th className="pb-3 pr-4 text-slate-500 font-semibold tabular-nums">P10 Balance</th>
              <th className="pb-3 text-slate-500 font-semibold">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {financialResults.map((r) => {
              const sc = r.metrics.survival_score_pct;
              const survivalColor = sc >= 90 ? 'text-emerald-400' : sc >= 70 ? 'text-amber-400' : 'text-rose-400';
              const riskColor = r.metrics.cash_out_risk_pct <= 20 ? 'text-emerald-400' : r.metrics.cash_out_risk_pct <= 50 ? 'text-amber-400' : 'text-rose-400';
              const verdict = sc >= 90 ? '✅ Resilient' : sc >= 70 ? '⚠️ Moderate' : '🔴 High Risk';
              const isSelected = r.scenario_id === selectedFinancialId;

              return (
                <tr key={r.scenario_id} className={`transition-colors ${isSelected ? 'bg-white/5' : 'hover:bg-white/3'}`}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: FINANCIAL_COLORS[r.scenario_id] }} />
                      <span className="font-semibold text-slate-200">{FINANCIAL_LABELS[r.scenario_id]}</span>
                      {isSelected && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">Selected</span>}
                    </div>
                  </td>
                  <td className={`py-3 pr-4 font-black font-mono tabular-nums text-sm ${survivalColor}`}>{sc}%</td>
                  <td className={`py-3 pr-4 font-black font-mono tabular-nums text-sm ${riskColor}`}>{r.metrics.cash_out_risk_pct}%</td>
                  <td className="py-3 pr-4 font-mono tabular-nums text-cyan-400 font-bold">{r.metrics.runway_months}mo</td>
                  <td className={`py-3 pr-4 font-mono tabular-nums text-sm ${r.metrics.p10_worst_balance < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {fmtRs(r.metrics.p10_worst_balance)}
                  </td>
                  <td className="py-3 text-xs">{verdict}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 12-Month Balance Trajectory + Radar ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance trajectory */}
        <div className="glass-card p-5">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-200">12-Month Balance Trajectories</h4>
            <p className="text-xs text-slate-500">Emergency floor: {fmtRs(floorLevel)}</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceChartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => fmtRs(v as number)} width={56} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtRs(v as number), '']} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#64748b' }} />
                <ReferenceLine y={floorLevel} stroke="#F43F5E" strokeDasharray="5 3" strokeWidth={1.5} label={{ value: 'Floor', fill: '#F43F5E', fontSize: 10 }} />
                {financialResults.map((r) => (
                  <Line
                    key={r.scenario_id}
                    type="monotone"
                    dataKey={FINANCIAL_LABELS[r.scenario_id]}
                    stroke={FINANCIAL_COLORS[r.scenario_id]}
                    strokeWidth={r.scenario_id === selectedFinancialId ? 2.5 : 1.5}
                    dot={false}
                    strokeOpacity={r.scenario_id === selectedFinancialId ? 1 : 0.5}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Floor slider */}
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Emergency Floor</span>
              <span className="font-mono tabular-nums text-rose-400">{fmtRs(floorLevel)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2000000}
              step={50000}
              value={floorLevel}
              onChange={(e) => setFloorLevel(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Radar chart */}
        <div className="glass-card p-5">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-slate-200">Multi-Objective Trade-off Radar</h4>
            <p className="text-xs text-slate-500">Larger surface area = better overall balance</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#64748b' }} />
                {financialResults.map((r) => (
                  <Radar
                    key={r.scenario_id}
                    name={FINANCIAL_LABELS[r.scenario_id]}
                    dataKey={FINANCIAL_LABELS[r.scenario_id]}
                    stroke={FINANCIAL_COLORS[r.scenario_id]}
                    fill={FINANCIAL_COLORS[r.scenario_id]}
                    fillOpacity={r.scenario_id === selectedFinancialId ? 0.25 : 0.08}
                    strokeWidth={r.scenario_id === selectedFinancialId ? 2 : 1}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── 60fps Crisis Shock Playground ─────────────────────────────────── */}
      <div className="glass-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-slate-200">Crisis Shock Playground</h4>
          <span className="text-[10px] font-mono text-slate-500 bg-white/5 border border-white/8 rounded px-2 py-0.5">
            Client-side · Zero backend latency · Monte Carlo percentile interpolation
          </span>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Inflow Delay</span>
              <span className="font-mono tabular-nums text-cyan-400">{inflowDelay} days</span>
            </div>
            <input type="range" min={0} max={45} step={1} value={inflowDelay} onChange={e => setInflowDelay(Number(e.target.value))} className="w-full accent-cyan-500 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-slate-600"><span>0 days</span><span>45 days</span></div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Surprise Outflow</span>
              <span className="font-mono tabular-nums text-amber-400">{fmtRs(surpriseOutflow)}</span>
            </div>
            <input type="range" min={0} max={2500000} step={50000} value={surpriseOutflow} onChange={e => setSurpriseOutflow(Number(e.target.value))} className="w-full accent-amber-500 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-slate-600"><span>₹0</span><span>₹25L</span></div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Spend Drift</span>
              <span className="font-mono tabular-nums text-rose-400">{spendDrift}%</span>
            </div>
            <input type="range" min={0} max={30} step={1} value={spendDrift} onChange={e => setSpendDrift(Number(e.target.value))} className="w-full accent-rose-500 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-slate-600"><span>0%</span><span>30%</span></div>
          </div>
        </div>

        {/* Stressed survival scores */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {financialResults.map((r) => {
            const stressed = interpolateSurvival(r);
            const baseline = r.metrics.survival_score_pct;
            const delta = stressed - baseline;
            const color = stressed >= 90 ? '#10B981' : stressed >= 70 ? '#F59E0B' : '#F43F5E';

            return (
              <div
                key={r.scenario_id}
                className="glass-card p-3 space-y-2"
                style={{ borderLeft: `3px solid ${FINANCIAL_COLORS[r.scenario_id]}` }}
              >
                <div className="text-[10px] text-slate-500 font-semibold truncate">{FINANCIAL_LABELS[r.scenario_id]}</div>
                <div className="font-black text-xl font-mono tabular-nums" style={{ color }}>
                  {stressed}%
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  {delta < 0 ? (
                    <><TrendingDown className="w-3 h-3 text-rose-500" /><span className="text-rose-400">{delta.toFixed(0)}%</span></>
                  ) : delta > 0 ? (
                    <><TrendingUp className="w-3 h-3 text-emerald-500" /><span className="text-emerald-400">+{delta.toFixed(0)}%</span></>
                  ) : (
                    <><Minus className="w-3 h-3 text-slate-500" /><span className="text-slate-500">0%</span></>
                  )}
                  <span className="text-slate-600 ml-auto">stressed</span>
                </div>
                <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${stressed}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Timetable Comparison (original) ─────────────────────────────────────────

interface TimetableComparisonProps {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  selectedIds: string[];
}

const TimetableComparison: React.FC<TimetableComparisonProps> = ({ scenarios, results, selectedIds }) => {
  const selectedScenarios = scenarios.filter((s) => selectedIds.includes(s.id));
  const baselineResult = results['baseline'] || results[scenarios[0]?.id];

  const metricConfigs = [
    { key: 'student_clashes' as const, label: 'Student Clashes', direction: 'minimize' as const, unit: '', format: (v: number) => Math.round(v).toString(), description: 'Sum of concurrent overlaps for any student cohort' },
    { key: 'faculty_clashes' as const, label: 'Faculty Clashes', direction: 'minimize' as const, unit: '', format: (v: number) => Math.round(v).toString(), description: 'Double-booked faculty members in the same time slot' },
    { key: 'room_utilization' as const, label: 'Room Utilization', direction: 'maximize' as const, unit: '%', format: (v: number) => `${v.toFixed(1)}%`, description: 'Occupied room-hours divided by total available capacity' },
    { key: 'avg_student_gaps' as const, label: 'Avg Student Gaps', direction: 'minimize' as const, unit: 'hrs', format: (v: number) => `${v.toFixed(2)}h`, description: "Idle wait hours between a student cohort's first and last class" },
  ];

  const barChartData = metricConfigs.map((m) => {
    const row: Record<string, number | string> = { metric: m.label };
    selectedScenarios.forEach((sc) => {
      const res = results[sc.id];
      if (res?.metrics) row[sc.name] = res.metrics[m.key];
    });
    return row;
  });

  const monteCarloData = selectedScenarios.map((sc) => {
    const res = results[sc.id];
    const mc = res?.simulation?.per_metric?.student_clashes;
    if (!mc) return { name: sc.name, mean: 0, errorMinus: 0, errorPlus: 0, p10: 0, p90: 0, probZero: 0 };
    return {
      name: sc.name,
      mean: Number(mc.mean.toFixed(1)),
      p10: mc.p10,
      p90: mc.p90,
      errorMinus: Number((mc.mean - mc.p10).toFixed(1)),
      errorPlus: Number((mc.p90 - mc.mean).toFixed(1)),
      probZero: Math.round((res?.simulation?.prob_zero_clashes || 0) * 100),
    };
  });

  const radarData = [
    { subject: 'Clash Avoidance', ...selectedScenarios.reduce((acc, sc) => { const val = results[sc.id]?.metrics?.student_clashes ?? 15; acc[sc.name] = Math.max(10, Math.round(100 - val * 6)); return acc; }, {} as Record<string, number>) },
    { subject: 'Faculty Feasibility', ...selectedScenarios.reduce((acc, sc) => { const val = results[sc.id]?.metrics?.faculty_clashes ?? 5; acc[sc.name] = Math.max(15, Math.round(100 - val * 25)); return acc; }, {} as Record<string, number>) },
    { subject: 'Room Efficiency', ...selectedScenarios.reduce((acc, sc) => { const val = results[sc.id]?.metrics?.room_utilization ?? 50; acc[sc.name] = Math.min(100, Math.round(val * 1.15)); return acc; }, {} as Record<string, number>) },
    { subject: 'Compact Schedule', ...selectedScenarios.reduce((acc, sc) => { const val = results[sc.id]?.metrics?.avg_student_gaps ?? 2; acc[sc.name] = Math.max(10, Math.round(100 - val * 35)); return acc; }, {} as Record<string, number>) },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <Card className="p-6 bg-white border border-slate-200 shadow-soft overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Side-by-Side Metrics Comparison</h3>
            <p className="text-xs text-slate-500">Evaluated mathematically by OR-Tools CP-SAT.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Best Value</span>
            <span className="flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200"><span className="w-2 h-2 rounded-full bg-rose-500" /> Worst Value</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-xs">Metric</th>
                <th className="py-3 px-4 font-bold text-slate-700 uppercase tracking-wider text-xs">Direction</th>
                {selectedScenarios.map((sc) => (
                  <th key={sc.id} className="py-3 px-4 font-bold uppercase tracking-wider text-xs" style={{ color: getScenarioColor(sc.id) }}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getScenarioColor(sc.id) }} />
                      <span>{sc.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metricConfigs.map((m) => {
                const values = selectedScenarios.map((sc) => results[sc.id]?.metrics?.[m.key]).filter((v): v is number => v !== undefined);
                const bestVal = m.direction === 'minimize' ? Math.min(...values) : Math.max(...values);
                const worstVal = m.direction === 'minimize' ? Math.max(...values) : Math.min(...values);
                const baselineVal = baselineResult?.metrics?.[m.key] ?? 0;

                return (
                  <tr key={m.key} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div>{m.label}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{m.description}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      <Badge size="sm" variant={m.direction === 'minimize' ? 'neutral' : 'info'}>
                        {m.direction === 'minimize' ? 'Lower is better' : 'Higher is better'}
                      </Badge>
                    </td>
                    {selectedScenarios.map((sc) => {
                      const val = results[sc.id]?.metrics?.[m.key];
                      if (val === undefined) return <td key={sc.id} className="py-3.5 px-4 text-slate-400">-</td>;
                      const isBest = val === bestVal;
                      const isWorst = val === worstVal && values.length > 1;
                      const delta = val - baselineVal;
                      const isBaseline = sc.id === 'baseline';
                      let deltaColor = 'text-slate-500';
                      let deltaIcon: React.ReactNode = <Minus className="w-3 h-3 text-slate-400 inline" />;
                      if (!isBaseline) {
                        const improved = m.direction === 'minimize' ? delta < 0 : delta > 0;
                        if (delta !== 0) {
                          deltaColor = improved ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold';
                          deltaIcon = improved ? <TrendingUp className="w-3 h-3 text-emerald-600 inline" /> : <TrendingDown className="w-3 h-3 text-rose-600 inline" />;
                        }
                      }
                      return (
                        <td key={sc.id} className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold text-sm sm:text-base px-2 py-0.5 rounded ${isBest ? 'bg-emerald-100/80 text-emerald-900 border border-emerald-300' : isWorst ? 'bg-rose-100/70 text-rose-900 border border-rose-300' : 'text-slate-800'}`}>
                              {m.format(val)}
                            </span>
                            {!isBaseline && <span className={`text-[11px] font-mono ${deltaColor}`}>{deltaIcon} {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border border-slate-200 shadow-soft">
          <div className="pb-3 border-b border-slate-100 mb-4">
            <h4 className="text-base font-bold text-slate-900">Comparative Metric Values</h4>
            <p className="text-xs text-slate-500">Raw metric comparison between selected scenarios</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                {selectedScenarios.map((sc) => (
                  <Bar key={sc.id} dataKey={sc.name} fill={getScenarioColor(sc.id)} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 bg-white border border-slate-200 shadow-soft">
          <div className="pb-3 border-b border-slate-100 mb-4">
            <h4 className="text-base font-bold text-slate-900">Multi-Objective Trade-off Radar</h4>
            <p className="text-xs text-slate-500">Normalized 0–100 scale</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#475569' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                {selectedScenarios.map((sc) => (
                  <Radar key={sc.id} name={sc.name} dataKey={sc.name} stroke={getScenarioColor(sc.id)} fill={getScenarioColor(sc.id)} fillOpacity={0.2} />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-white border border-slate-200 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-100 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-600" />
              <h4 className="text-base font-bold text-slate-900">Monte Carlo Simulation Analysis (300 Iterations)</h4>
            </div>
            <p className="text-xs text-slate-500 mt-1">Perturbs elective enrollments, 10% class overrun probability, and 2% room outage probability.</p>
          </div>
          <Badge variant="purple" size="md">NumPy Vectorized MC</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {selectedScenarios.map((sc) => {
            const probZero = Math.round((results[sc.id]?.simulation?.prob_zero_clashes || 0) * 100);
            const color = getScenarioColor(sc.id);
            return (
              <div key={sc.id} className="p-3.5 rounded-xl border bg-slate-50/70 space-y-1.5" style={{ borderLeftColor: color, borderLeftWidth: '4px' }}>
                <div className="text-xs font-bold text-slate-800 truncate">{sc.name}</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-slate-900">{probZero}%</span>
                  <span className="text-[10px] text-slate-500 font-medium">Prob of 0 Clashes</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${probZero}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700">Student Clash Range: Mean with P10 – P90 Confidence Interval</div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monteCarloData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis label={{ value: 'Simulated Student Clashes', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip formatter={(val, name, item) => [`${val} (P10: ${item.payload.p10}, P90: ${item.payload.p90})`, 'Mean Clashes']} contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="mean" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={42}>
                  <ErrorBar dataKey="errorPlus" width={6} strokeWidth={2} stroke="#4C1D95" />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({
  scenarios,
  results,
  selectedIds,
  financialMode = false,
  financialResults = [],
  selectedFinancialId = 'fin_baseline',
}) => {
  if (financialMode && financialResults.length > 0) {
    return (
      <div className="animate-in fade-in">
        <FinancialComparison
          financialResults={financialResults}
          selectedFinancialId={selectedFinancialId}
        />
      </div>
    );
  }

  return (
    <TimetableComparison
      scenarios={scenarios}
      results={results}
      selectedIds={selectedIds}
    />
  );
};
