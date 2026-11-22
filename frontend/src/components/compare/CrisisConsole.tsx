import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Zap } from 'lucide-react';
import { api, isMockMode } from '../../api/client';
import { FinancialScenarioResult, StressResponse } from '../../contracts/types';
import { STRESS_PRESETS, StressMode } from '../../decide/SimControls';
import { BAD, FORK_COLORS, FORK_LABELS, GOOD, WARN, chartTheme, fmtRs, niceCeil } from '../../theme/forks';
import { VerticalFader } from './VerticalFader';

interface CrisisConsoleProps {
  financialResults: FinancialScenarioResult[];
  decisionId: string | null;
  stressMode: StressMode;
  selectedId: string | null;
}

interface Shock {
  delay: number; // days
  bill: number; // ₹
  drop: number; // % (positive = income falls)
  surge: number; // %
  floor: number; // ₹
}

const cardStatus = (s: number) =>
  s >= 90 ? { label: 'Survives', color: GOOD } : s >= 50 ? { label: 'At risk', color: WARN } : { label: 'Breached', color: BAD };

/**
 * Stress-testing console: a bank of vertical faders on the left and the live-reacting fork cards
 * beside it. Every number comes from POST /decisions/{id}/stress (300 Monte Carlo runs per fork);
 * the plans themselves are not re-optimised.
 */
export const CrisisConsole: React.FC<CrisisConsoleProps> = ({ financialResults, decisionId, stressMode, selectedId }) => {
  const planFloor = financialResults[0]?.metrics.emergency_floor ?? 0;
  const zero: Shock = { delay: 0, bill: 0, drop: 0, surge: 0, floor: planFloor };

  const { billMax, floorMax } = useMemo(() => {
    const base = financialResults.find((r) => r.branch_type === 'baseline') ?? financialResults[0];
    const months = base?.cash_flow.months.length || 12;
    const totalOut = (base?.cash_flow.categories ?? []).reduce((acc, c) => acc + c.values.reduce((a, v) => a + v, 0), 0);
    const maxBal = Math.max(0, ...financialResults.flatMap((r) => r.simulation.monthly_balances));
    return { billMax: niceCeil((totalOut / months) * 3), floorMax: niceCeil(Math.max(maxBal * 1.2, planFloor * 2, 100000)) };
  }, [financialResults, planFloor]);

  const PRESETS: { id: string; label: string; shock: Shock }[] = [
    { id: 'reset', label: 'Reset all', shock: zero },
    { id: 'late', label: 'Late fees · 30d', shock: { ...zero, delay: 30 } },
    { id: 'revenue', label: 'Revenue shock · −20%', shock: { ...zero, drop: 20 } },
    { id: 'storm', label: 'Perfect storm', shock: { delay: 30, bill: Math.round((billMax * 0.3) / 1000) * 1000, drop: 20, surge: 20, floor: planFloor } },
  ];

  const [shock, setShock] = useState<Shock>(zero);
  const set = (k: keyof Shock) => (v: number) => setShock((s) => ({ ...s, [k]: v }));

  // Start from the decision workbench's stress preset whenever a decision (or the preset) changes
  useEffect(() => {
    const p = STRESS_PRESETS[stressMode];
    setShock({ delay: p.inflowDelay, bill: 0, drop: -p.incomePct, surge: p.spendPct, floor: planFloor });
  }, [decisionId, planFloor, stressMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Engine-backed stress test, debounced; stale requests are aborted
  const [stress, setStress] = useState<StressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!decisionId || isMockMode || financialResults.length === 0) return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      api
        .stressDecision(
          decisionId,
          {
            inflow_delay_days: shock.delay,
            surprise_outflow: shock.bill,
            spend_increase_pct: shock.surge,
            income_change_pct: -shock.drop,
            emergency_floor: shock.floor,
          },
          ctrl.signal,
        )
        .then((res) => {
          setStress(res);
          setError(null);
        })
        .catch((err: unknown) => {
          if ((err as Error)?.name !== 'AbortError') setError((err as Error)?.message || 'Stress test failed');
        })
        .finally(() => {
          if (abortRef.current === ctrl) setLoading(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [decisionId, shock, financialResults.length]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const [focusId, setFocusId] = useState<string | null>(selectedId);
  useEffect(() => setFocusId(selectedId), [selectedId]);

  const activePreset = PRESETS.find((p) => JSON.stringify(p.shock) === JSON.stringify(shock))?.id;
  const months = financialResults[0]?.cash_flow.months ?? [];
  const label = (r: FinancialScenarioResult) => FORK_LABELS[r.branch_type];
  const chartData = stress
    ? months.map((month, i) => {
        const row: Record<string, number | string> = { month };
        financialResults.forEach((r) => {
          const sr = stress.results[r.scenario_id];
          if (sr) row[label(r)] = sr.balance_p50[i] ?? 0;
        });
        return row;
      })
    : [];

  const floorSeverity = shock.floor <= planFloor ? 0 : (shock.floor - planFloor) / Math.max(1, floorMax - planFloor);

  return (
    <div className="space-y-6" data-tour="playground">
      {/* presets + status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mr-1 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-brand-coral" /> Presets
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setShock(p.shock)}
            className={`h-7 px-2.5 border font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors
                        ${activePreset === p.id ? 'bg-ink text-paper border-ink' : 'border-ink-faint hover:border-ink bg-paper-2'}`}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto label text-[10px] flex items-center gap-2">
          {loading && <span className="text-brand-coral animate-pulse">updating…</span>}
          Engine · {stress?.n_runs ?? 300} runs per fork{stress ? ` · ${Math.round(stress.runtime_ms)}ms` : ''}
        </span>
      </div>
      {isMockMode && <p className="text-sm border-l-2 border-warn bg-warn/5 px-3 py-2">The playground needs the backend. Set VITE_USE_MOCKS=false and start the API.</p>}
      {error && <p role="alert" className="text-sm border-l-2 border-bad bg-bad/5 px-3 py-2">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[auto_minmax(0,1fr)] gap-8 items-start">
        {/* fader bank */}
        <div className="paper-card px-4 pt-4 pb-3">
          <div className="grid grid-cols-5 gap-2 sm:gap-4 justify-items-center">
            <VerticalFader id="f-delay" label="Income delay" value={shock.delay} min={0} max={60} step={1} display={(v) => `${v}d`} onChange={set('delay')} resetValue={0} severity={shock.delay / 60} />
            <VerticalFader id="f-bill" label="Surprise bill" value={shock.bill} min={0} max={billMax} step={billMax / 100} display={fmtRs} onChange={set('bill')} resetValue={0} severity={shock.bill / billMax} />
            <VerticalFader id="f-drop" label="Income drop" value={shock.drop} min={0} max={50} step={1} display={(v) => (v ? `−${v}%` : '0%')} onChange={set('drop')} resetValue={0} severity={shock.drop / 50} />
            <VerticalFader id="f-surge" label="Spend surge" value={shock.surge} min={0} max={40} step={1} display={(v) => `+${v}%`} onChange={set('surge')} resetValue={0} severity={shock.surge / 40} />
            <VerticalFader id="f-floor" label="Reserve floor" value={shock.floor} min={0} max={floorMax} step={floorMax / 100} display={fmtRs} onChange={set('floor')} resetValue={planFloor} severity={floorSeverity} />
          </div>
          <p className="label text-[9.5px] text-center mt-3">Drag · arrow keys · double-click to reset</p>
        </div>

        {/* live-reacting fork cards */}
        <div className="space-y-2" aria-live="polite">
          {financialResults.map((r) => {
            const sr = stress?.results[r.scenario_id];
            const base = Math.round((100 - r.metrics.floor_breach_risk_pct) * 10) / 10;
            const s = sr ? Math.round((100 - sr.floor_breach_risk_pct) * 10) / 10 : base;
            const delta = Math.round((s - base) * 10) / 10;
            const st = cardStatus(s);
            const focused = focusId === r.scenario_id;
            return (
              <button
                key={r.scenario_id}
                type="button"
                onClick={() => setFocusId(focused ? null : r.scenario_id)}
                aria-pressed={focused}
                className={`relative w-full text-left grid grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.4fr)] items-center gap-4 pl-4 pr-3 py-3 border transition-all duration-300
                            ${focused ? 'border-ink bg-paper-2 shadow-paper' : 'border-ink-line bg-paper-2/60 hover:border-ink-faint'} ${loading ? 'opacity-80' : ''}`}
              >
                <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: FORK_COLORS[r.branch_type] }} />
                <span className="min-w-0">
                  <span className="block text-[15px] tracking-tight truncate">{label(r)}</span>
                  <span className="inline-flex mt-1 items-center gap-1 h-5 px-1.5 border font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: st.color, borderColor: st.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                    {st.label}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-2xl tabular-nums leading-none transition-colors duration-300" style={{ color: st.color }}>{s}%</span>
                  <span
                    className="inline-block mt-1 font-mono text-[10.5px] tabular-nums"
                    style={{ color: delta < 0 ? BAD : delta > 0 ? GOOD : 'rgba(20,20,20,.45)' }}
                  >
                    {delta < 0 ? `▼ ${delta}` : delta > 0 ? `▲ +${delta}` : '— 0'} pts
                  </span>
                </span>
                <span className="min-w-0 space-y-1.5">
                  <span className="flex h-[5px] bg-ink-line overflow-hidden" title="Share of what-if scenarios that stay above the cushion">
                    <span className="h-full transition-[width] duration-500 ease-editorial" style={{ width: `${s}%`, background: st.color }} />
                  </span>
                  <span className="grid grid-cols-2 gap-1 font-mono text-[10px] tabular-nums text-ink-dim">
                    <span>typical low <b className="font-normal block text-ink">{fmtRs(sr?.p50_worst_balance ?? r.metrics.lowest_balance)}</b></span>
                    <span>bad-case low <b className="font-normal block" style={{ color: (sr?.p10_worst_balance ?? r.metrics.p10_worst_balance) < (sr ? stress!.emergency_floor : r.metrics.emergency_floor) ? BAD : '#141414' }}>{fmtRs(sr?.p10_worst_balance ?? r.metrics.p10_worst_balance)}</b></span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label">P50 median balance under this crisis</span>
            <span className="label text-[10px]">{focusId ? 'Click the card again to show all' : 'Click a card to focus its curve'}</span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid {...chartTheme.grid} vertical={false} />
                <XAxis dataKey="month" tick={chartTheme.axisTick} axisLine={chartTheme.axisLine} tickLine={false} />
                <YAxis tick={chartTheme.axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtRs(v as number)} width={60} />
                <Tooltip contentStyle={chartTheme.tooltip} formatter={(v, name) => [fmtRs(v as number), name]} />
                <ReferenceLine y={shock.floor} stroke="#141414" strokeDasharray="4 4" label={{ value: 'Floor', fill: '#141414', fontSize: 10, position: 'insideTopLeft' }} />
                <ReferenceLine y={0} stroke={BAD} />
                {financialResults.map((r) => {
                  const on = !focusId || focusId === r.scenario_id;
                  return (
                    <Line
                      key={r.scenario_id}
                      type="monotone"
                      dataKey={label(r)}
                      stroke={FORK_COLORS[r.branch_type]}
                      strokeWidth={focusId === r.scenario_id ? 3 : 1.6}
                      strokeOpacity={on ? 1 : 0.25}
                      dot={false}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
