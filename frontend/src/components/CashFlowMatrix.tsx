import React, { useState } from 'react';
import { FinancialScenarioResult, CashFlowMatrixData } from '../contracts/types';
import { Lock, Unlock, GitCompare } from 'lucide-react';

interface CashFlowMatrixProps {
  result: FinancialScenarioResult | null;
  baselineResult: FinancialScenarioResult | null;
}

interface TooltipData {
  x: number;
  y: number;
  category: string;
  month: string;
  value: number;
  delta?: number;
}

/** Heat shading on paper: ink-tinted for fixed costs, warm brand tint for flexible ones. */
function cellStyle(value: number, maxValue: number, isFixed: boolean): React.CSSProperties {
  if (value === 0) return { color: 'rgba(20,20,20,.3)' };
  const k = Math.min(1, value / maxValue);
  return isFixed
    ? { background: `rgba(15,107,143,${0.04 + k * 0.16})` }
    : { background: `rgba(255,90,95,${0.04 + k * 0.22})` };
}

const deltaColor = (d: number) => (d > 0 ? '#d6345f' : d < 0 ? '#2f7d4f' : 'rgba(20,20,20,.5)');

const fmtK = (v: number) => {
  if (v === 0) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 100000) return `${sign}${(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(0)}K`;
  return `${sign}${Math.round(a)}`;
};

export const CashFlowMatrix: React.FC<CashFlowMatrixProps> = ({ result, baselineResult }) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [highlightedMonth, setHighlightedMonth] = useState<number | null>(null);
  const [diffMode, setDiffMode] = useState(true);

  if (!result) {
    return (
      <div className="paper-card brackets p-10 flex items-center justify-center">
        <span className="label">Select a fork above to open its cash-flow matrix</span>
      </div>
    );
  }

  const cashFlow = result.cash_flow;
  const baselineCashFlow: CashFlowMatrixData | null = baselineResult?.cash_flow ?? null;
  const canDiff = !!baselineCashFlow && result.branch_type !== 'baseline';
  const showDiff = diffMode && canDiff;

  const maxValues = cashFlow.categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.name] = Math.max(...cat.values, 1);
    return acc;
  }, {});

  const getDelta = (catName: string, monthIdx: number): number => {
    if (!baselineCashFlow) return 0;
    const baseCat = baselineCashFlow.categories.find((c) => c.name === catName);
    const curCat = cashFlow.categories.find((c) => c.name === catName);
    if (!baseCat || !curCat) return curCat ? curCat.values[monthIdx] : 0;
    return curCat.values[monthIdx] - baseCat.values[monthIdx];
  };

  const fixedCats = cashFlow.categories.filter((c) => c.type === 'fixed');
  const flexCats = cashFlow.categories.filter((c) => c.type === 'flexible');
  const hasPurchase = cashFlow.purchase_cash_out.some((v) => v > 0);

  const cellHandlers = (category: string, monthIdx: number, value: number, delta: number) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltip({ x: rect.left, y: rect.top - 64, category, month: cashFlow.months[monthIdx], value, delta });
      setHighlightedMonth(monthIdx);
    },
    onMouseLeave: () => {
      setTooltip(null);
      setHighlightedMonth(null);
    },
  });

  const renderCell = (cat: CashFlowMatrixData['categories'][0], monthIdx: number) => {
    const val = cat.values[monthIdx];
    const delta = showDiff ? getDelta(cat.name, monthIdx) : 0;
    const changed = showDiff && delta !== 0;
    const dimmed = showDiff && !changed;
    return (
      <td
        key={`${cat.name}-${monthIdx}`}
        className={`relative text-center text-[11px] font-mono tabular-nums py-2 px-1 cursor-default border-r border-ink-line transition-opacity duration-150
                    ${highlightedMonth === monthIdx ? 'outline outline-1 -outline-offset-1 outline-ink/40' : ''}
                    ${dimmed ? 'opacity-25' : ''}
                    ${changed ? 'outline outline-1 -outline-offset-1 outline-brand-coral' : ''}`}
        style={changed ? { background: delta > 0 ? 'rgba(214,52,95,.16)' : 'rgba(47,125,79,.16)' } : cellStyle(val, maxValues[cat.name], cat.type === 'fixed')}
        {...cellHandlers(cat.name, monthIdx, val, delta)}
      >
        {fmtK(val)}
        {changed && (
          <span className="absolute top-0.5 right-0.5 text-[8px] leading-none" style={{ color: deltaColor(delta) }}>
            {delta > 0 ? '+' : ''}
            {fmtK(delta)}
          </span>
        )}
      </td>
    );
  };

  const groupHeader = (label: string) => (
    <tr className="border-b border-ink-line">
      <td colSpan={13} className="py-1.5 pl-4 label text-[10px] bg-paper">
        {label}
      </td>
    </tr>
  );

  const renderCategoryGroup = (cats: CashFlowMatrixData['categories'], isFixed: boolean) =>
    cats.map((cat) => (
      <tr key={cat.name} className="border-b border-ink-line">
        <th scope="row" className="py-2 pl-4 pr-3 text-xs font-normal text-left whitespace-nowrap sticky left-0 bg-paper-2 z-10 border-r border-ink-line">
          <span className="flex items-center gap-1.5">
            {isFixed ? <Lock className="w-3 h-3 text-ink-dim shrink-0" /> : <Unlock className="w-3 h-3 text-ink-dim shrink-0" />}
            {cat.name}
          </span>
        </th>
        {cashFlow.months.map((_, mIdx) => renderCell(cat, mIdx))}
      </tr>
    ));

  const simpleRow = (label: string, values: number[], color?: string, baseValues?: number[]) => (
    <tr className="border-b border-ink-line">
      <th scope="row" className="py-2 pl-4 pr-3 text-xs font-medium text-left whitespace-nowrap sticky left-0 bg-paper-2 z-10 border-r border-ink-line">
        {label}
      </th>
      {values.map((v, i) => {
        const delta = showDiff ? v - (baseValues?.[i] ?? 0) : 0;
        const changed = showDiff && Math.abs(delta) >= 1;
        return (
          <td
            key={i}
            className={`text-center text-[11px] font-mono tabular-nums py-2 px-1 border-r border-ink-line transition-opacity
                        ${showDiff && !changed ? 'opacity-25' : ''} ${changed ? 'outline outline-1 -outline-offset-1 outline-brand-coral' : ''}`}
            style={{ color: v ? color : 'rgba(20,20,20,.3)', background: changed ? 'rgba(255,90,95,.12)' : undefined }}
            {...cellHandlers(label, i, v, delta)}
          >
            {fmtK(v)}
          </td>
        );
      })}
    </tr>
  );

  // How many cells this fork changes (for the diff summary)
  const changedCells = canDiff
    ? cashFlow.categories.reduce((n, c, ci) => n + c.values.filter((_, mi) => getDelta(cashFlow.categories[ci].name, mi) !== 0).length, 0) +
      cashFlow.inflows.filter((v, i) => Math.abs(v - (baselineCashFlow?.inflows[i] ?? 0)) >= 1).length +
      cashFlow.purchase_cash_out.filter((v, i) => Math.abs(v - (baselineCashFlow?.purchase_cash_out[i] ?? 0)) >= 1).length
    : 0;

  return (
    <div className="paper-card overflow-hidden" data-tour="cashflow">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-ink-line">
        <div className="flex items-baseline gap-3">
          <span className="text-lg tracking-tight">{result.name || 'Cash flow'}</span>
          <span className="label">{cashFlow.categories.length} categories × {cashFlow.months.length} months</span>
        </div>
        <div className="flex items-center gap-3">
          {showDiff && <span className="label text-[10px]">{changedCells} cell{changedCells === 1 ? '' : 's'} changed vs baseline</span>}
          <div className="inline-flex border border-ink" role="radiogroup" aria-label="Cash flow view">
            {([['abs', 'Absolute values'], ['diff', 'Diff vs baseline']] as const).map(([m, t], i) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={(m === 'diff') === showDiff}
                disabled={m === 'diff' && !canDiff}
                title={m === 'diff' && !canDiff ? 'Select a fork other than the baseline to compare' : undefined}
                onClick={() => setDiffMode(m === 'diff')}
                className={`h-7 px-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] transition-colors ${i ? 'border-l border-ink' : ''}
                            ${(m === 'diff') === showDiff ? 'bg-ink text-paper' : m === 'diff' && !canDiff ? 'text-ink/25 cursor-not-allowed' : 'hover:bg-paper'}`}
              >
                {m === 'diff' && <GitCompare className="w-3 h-3" />}
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-b border-ink-line label text-[10px]">
        <span className="flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Fixed</span>
        <span className="flex items-center gap-1"><Unlock className="w-2.5 h-2.5" /> Flexible</span>
        <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'rgba(15,107,143,.2)' }} /> Fixed spend</span>
        <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5" style={{ background: 'rgba(255,90,95,.26)' }} /> Flexible spend</span>
        {showDiff && <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 border border-brand-coral" /> Changed</span>}
      </div>

      {cashFlow.projected?.some(Boolean) && (
        <p className="px-4 pt-2 text-[12px] text-ink-dim">
          <span className="text-brand-coral">*</span> Projected month: your file didn't cover it, so it uses your average monthly
          income and spending.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-ink">
              <th className="py-2 pl-4 pr-3 text-left label text-[10px] sticky left-0 bg-paper-2 z-10 w-32 border-r border-ink-line">
                Category
              </th>
              {cashFlow.months.map((m, i) => (
                <th
                  key={m}
                  className={`text-center label text-[10px] py-2 px-1 cursor-pointer border-r border-ink-line transition-colors ${highlightedMonth === i ? 'text-ink' : ''}`}
                  onClick={() => setHighlightedMonth(highlightedMonth === i ? null : i)}
                  title={cashFlow.projected?.[i] ? 'Projected from your average monthly income and spending' : undefined}
                >
                  {m}
                  {cashFlow.projected?.[i] && <span className="text-brand-coral">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {simpleRow('Money in', cashFlow.inflows, '#2f7d4f', baselineCashFlow?.inflows)}
            {hasPurchase && simpleRow('Decision cash-out', cashFlow.purchase_cash_out, '#d6345f', baselineCashFlow?.purchase_cash_out)}
            {groupHeader('Fixed costs')}
            {renderCategoryGroup(fixedCats, true)}
            {groupHeader('Flexible costs')}
            {renderCategoryGroup(flexCats, false)}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-paper-2 border border-ink px-3 py-2 shadow-lift text-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="label text-ink">{tooltip.category} · {tooltip.month}</div>
          <div className="font-mono tabular-nums text-sm">₹{tooltip.value.toLocaleString('en-IN')}</div>
          {showDiff && tooltip.delta !== undefined && tooltip.delta !== 0 && (
            <div className="font-mono tabular-nums" style={{ color: deltaColor(tooltip.delta) }}>
              Δ {tooltip.delta > 0 ? '+' : ''}₹{tooltip.delta.toLocaleString('en-IN')} vs baseline
            </div>
          )}
        </div>
      )}
    </div>
  );
};
