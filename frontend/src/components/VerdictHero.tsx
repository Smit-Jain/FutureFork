import React, { useMemo, useState } from 'react';
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldCheck, XCircle } from 'lucide-react';
import { AffordabilityAnswer, FinancialScenarioResult } from '../contracts/types';
import { FORK_COLORS, FORK_LABELS, PLAIN, chartTheme, fmtRs, headroom, pickBestFork, safeYears } from '../theme/forks';

type PlainKey = keyof typeof PLAIN;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2024-06" → "Jun '24" */
export const fmtMonth = (m?: string | null) => {
  const x = /^(\d{4})-(\d{2})/.exec(m ?? '');
  return x ? `${MONTHS[Number(x[2]) - 1]} '${x[1].slice(2)}` : m ?? '';
};

/** A "?" that reveals the plain meaning and the technical term behind a number. */
export const Glossary: React.FC<{ k: PlainKey }> = ({ k }) => {
  const [open, setOpen] = useState(false);
  const p = PLAIN[k];
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label={`What does "${p.label}" mean?`}
        className="text-ink-dim hover:text-ink"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && (
        <span role="tooltip" className="absolute z-30 left-0 top-5 w-64 bg-paper-2 border border-ink p-3 shadow-lift normal-case tracking-normal font-sans text-[12.5px] text-ink leading-snug">
          {p.help}
          <span className="block mt-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-ink-dim">Engine term: {p.term}</span>
        </span>
      )}
    </span>
  );
};

const pct = (r: FinancialScenarioResult) => {
  const { safe, of } = safeYears(r);
  return Math.round((safe / of) * 100);
};
const toneOf = (p: number) => (p >= 90 ? '#2f7d4f' : p >= 70 ? '#c76a12' : '#d6345f');

const Stat: React.FC<{ label: string; value: string; k?: PlainKey; tone?: string; sub?: string }> = ({ label, value, k, tone, sub }) => (
  <div className="p-4 min-w-0 border-ink-line">
    <div className="label text-[10px] flex items-center gap-1.5">
      {label} {k && <Glossary k={k} />}
    </div>
    <div className="mt-1.5 font-mono text-[22px] sm:text-2xl tabular-nums leading-none truncate" style={{ color: tone }}>
      {value}
    </div>
    {sub && <div className="mt-1 text-[11.5px] text-ink-dim truncate">{sub}</div>}
  </div>
);

/** The answer that leads the results: one verdict, one picture, four numbers, one contrast. */
export const VerdictHero: React.FC<{ results: FinancialScenarioResult[]; answer?: AffordabilityAnswer | null }> = ({ results, answer }) => {
  const best = pickBestFork(results);
  const baseline = results.find((r) => r.branch_type === 'baseline') ?? null;

  const chart = useMemo(() => {
    if (!best) return [];
    const months = best.cash_flow?.months ?? [];
    return best.simulation.monthly_balances.map((v, i) => ({
      m: fmtMonth(months[i]) || `M${i + 1}`,
      plan: Math.round(v),
      bad: Math.round(best.simulation.balance_p10[i] ?? v),
      base: baseline ? Math.round(baseline.simulation.monthly_balances[i] ?? 0) : undefined,
    }));
  }, [best, baseline]);

  if (!best) return null;
  const m = best.metrics;
  const bestPct = pct(best);
  const color = FORK_COLORS[best.branch_type];
  const label = FORK_LABELS[best.branch_type];
  const forks = results.filter((r) => r.branch_type !== 'baseline');
  const worst = forks.length > 1 ? [...forks].sort((a, b) => pct(a) - pct(b) || b.metrics.months_below_floor - a.metrics.months_below_floor)[0] : null;
  const contrast = worst && worst.scenario_id !== best.scenario_id && pct(worst) < bestPct ? worst : null;

  const affordable = answer && answer.cost > 0 ? answer.fits : null;
  const status =
    affordable === false || bestPct < 70
      ? { label: 'Risky', icon: XCircle, color: '#d6345f' }
      : bestPct < 90 || m.months_below_floor > 0
        ? { label: 'Tight', icon: AlertTriangle, color: '#c76a12' }
        : { label: 'Safe', icon: ShieldCheck, color: '#2f7d4f' };
  const StatusIcon = status.icon;
  const floorLabel = m.emergency_floor > 0 ? `your ${fmtRs(m.emergency_floor)} cushion` : 'zero';

  let headline: React.ReactNode;
  if (affordable === true) {
    headline = (
      <>
        Yes, you can afford it. <span style={{ color }}>Go with {label.toLowerCase()}.</span>
      </>
    );
  } else if (affordable === false) {
    headline = (
      <>
        Not yet: you're <span className="text-bad">{fmtRs(answer!.shortfall)} short.</span>
      </>
    );
  } else {
    headline = (
      <>
        <span style={{ color }}>{label}</span> keeps you safest.
      </>
    );
  }

  return (
    <div className="relative border border-ink bg-paper-2 shadow-lift overflow-hidden animate-in" data-tour="verdict">
      <span className="absolute inset-x-0 top-0 h-[4px]" style={{ background: status.color }} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-8 space-y-5 xl:border-r border-ink-line">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-paper" style={{ background: status.color }}>
              <StatusIcon className="w-3.5 h-3.5" /> {status.label}
            </span>
            <span className="label">The answer</span>
          </div>
          <h3 className="text-[34px] sm:text-[46px] tracking-[-0.025em] leading-[1.02]">{headline}</h3>
          <p className="text-[17px] sm:text-lg text-ink-2 leading-snug max-w-xl">
            {affordable === false ? (
              <>
                The most you can safely spend this year is <strong className="font-medium">{fmtRs(answer!.max_safe_amount)}</strong>. Cut about{' '}
                <strong className="font-medium">{fmtRs(answer!.monthly_cut_to_close_gap)} a month</strong> or lower the budget. Safest way meanwhile:{' '}
                <span style={{ color }}>{label}</span>.
              </>
            ) : (
              <>
                {label} stays above {floorLabel} in{' '}
                <strong className="font-medium" style={{ color: toneOf(bestPct) }}>
                  {bestPct}%
                </strong>{' '}
                of 300 what-if scenarios of your next 12 months.
              </>
            )}
          </p>
          {contrast && (
            <p className="flex items-start gap-2 text-[14px] border-l-2 border-bad bg-bad/5 px-3 py-2 max-w-xl">
              <AlertTriangle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
              <span>
                <strong className="font-medium">{FORK_LABELS[contrast.branch_type]}</strong> instead is safe in only{' '}
                <strong className="font-medium text-bad">{pct(contrast)}%</strong> of them. Same money, very different risk.
              </span>
            </p>
          )}
        </div>

        <div className="p-5 sm:p-6 bg-paper/60 border-t xl:border-t-0 border-ink-line">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="label">Your balance with {label.toLowerCase()}</span>
            <span className="flex items-center gap-3 label text-[9.5px]">
              <span className="flex items-center gap-1">
                <span className="w-3 h-[2px]" style={{ background: color }} /> Plan
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 border-t border-dashed" style={{ borderColor: color }} /> Bad case
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 border-t border-dashed border-ink" /> Cushion
              </span>
            </span>
          </div>
          <div className="h-[220px]" role="img" aria-label={`Balance over the next 12 months with ${label}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vh-band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="m" tick={chartTheme.axisTick} axisLine={chartTheme.axisLine} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={chartTheme.axisTick} axisLine={false} tickLine={false} width={54} tickFormatter={(v) => fmtRs(v)} />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  formatter={(v: number, name: string) => [fmtRs(v), name]}
                />
                <Area type="monotone" dataKey="plan" stroke="none" fill="url(#vh-band)" tooltipType="none" baseValue="dataMin" />
                <Line type="monotone" dataKey="bad" stroke={color} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="3 3" dot={false} name="Bad case (1 in 10)" />
                {baseline && <Line type="monotone" dataKey="base" stroke="rgba(20,20,20,.3)" strokeWidth={1.5} dot={false} name="Doing nothing" />}
                <Line type="monotone" dataKey="plan" stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color }} name={label} />
                <ReferenceLine y={m.emergency_floor} stroke="#141414" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-ink-line [&>*:nth-child(even)]:border-l lg:[&>*:not(:first-child)]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0">
        {answer && answer.cost > 0 ? (
          <>
            <Stat label="Safe to spend now" value={fmtRs(answer.safe_now)} tone={answer.safe_now >= answer.cost ? '#2f7d4f' : undefined} sub={`keeping ${fmtRs(answer.floor)} aside`} />
            <Stat
              label={answer.fits ? 'Earliest safe month' : 'Most you can spend'}
              value={answer.fits ? fmtMonth(answer.earliest_safe_month) : fmtRs(answer.max_safe_amount)}
              sub={answer.fits ? `for the full ${fmtRs(answer.cost)}` : 'this year, at the best time'}
            />
          </>
        ) : (
          <>
            <Stat label="Stays safe" k="safe_years" value={`${bestPct}%`} tone={toneOf(bestPct)} sub="of 300 what-if scenarios" />
            <Stat label="Room above cushion" k="headroom" value={headroom(m) < 0 ? `−${fmtRs(-headroom(m))}` : fmtRs(headroom(m))} tone={headroom(m) < 0 ? '#d6345f' : undefined} sub="in your tightest month" />
          </>
        )}
        <Stat label="Lowest balance" k="lowest_balance" value={fmtRs(m.lowest_balance)} sub={m.lowest_balance_month ? `in ${fmtMonth(m.lowest_balance_month)}` : undefined} />
        <Stat label="Extra interest" k="interest" value={m.total_financing_interest > 0 ? fmtRs(m.total_financing_interest) : '₹0'} sub={m.total_financing_interest > 0 ? 'cost of borrowing' : 'no borrowing'} />
      </div>

      <p className="px-6 sm:px-8 py-3 border-t border-ink-line text-[12px] text-ink-dim flex items-center gap-1.5 bg-paper/40">
        <CheckCircle2 className="w-3.5 h-3.5 text-good shrink-0" />
        Every number comes from the CP-SAT optimiser and 300 Monte Carlo runs. The AI only writes the explanation below.
      </p>
    </div>
  );
};
