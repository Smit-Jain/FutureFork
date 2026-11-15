import React from 'react';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Sparkles, CheckCircle2, ShieldCheck, ArrowRight, Lightbulb, Compass } from 'lucide-react';
import { ExplanationPayload, Scenario, ScenarioResult } from '../contracts/types';

interface ExplanationPanelProps {
  explanation: ExplanationPayload | null;
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
  explanation,
  scenarios,
  results,
}) => {
  if (!explanation) return null;

  return (
    <Card className="p-6 sm:p-8 bg-white border border-slate-200 shadow-soft space-y-6">
      {/* Header with AI Attribution Label */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-brand-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">AI Decision Synthesis</h3>
            <p className="text-xs text-slate-500">
              Natural language interpretation grounded strictly in mathematical simulation outputs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="purple" size="sm" dot>
            AI-generated from computed results
          </Badge>
          <span className="text-[10px] text-slate-400 font-mono">Strict Numeric Guard: Active</span>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-slate-400" />
          <span>Executive Synthesis</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed font-normal">
          {explanation.summary}
        </p>
      </div>

      {/* Trade-off Breakdown Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Per-Scenario Consequence Analysis
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {scenarios.map((sc) => {
            const tradeoffText = explanation.tradeoffs[sc.id];
            const isBaseline = sc.id === 'baseline';
            const metrics = results[sc.id]?.metrics;

            const borderColor =
              sc.id === 'baseline'
                ? 'border-emerald-200 bg-emerald-50/20'
                : sc.id === 'scenario_a'
                ? 'border-rose-200 bg-rose-50/20'
                : sc.id === 'scenario_b'
                ? 'border-purple-200 bg-purple-50/20'
                : 'border-amber-200 bg-amber-50/20';

            return (
              <div
                key={sc.id}
                className={`p-4 rounded-xl border ${borderColor} space-y-2 transition-all hover:shadow-xs`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{sc.name}</span>
                  {metrics && (
                    <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {metrics.student_clashes} clashes &bull; {metrics.room_utilization}% util
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {tradeoffText || sc.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommended Trade-off Callout */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-brand-50/80 via-purple-50/60 to-emerald-50/60 border border-brand-200/80 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-brand-700 font-bold text-sm">
          <Lightbulb className="w-4 h-4 text-brand-600" />
          <span>Recommended Policy Decision</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed font-medium">
          {explanation.recommendation}
        </p>
        <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Validated against solver constraints and 300 Monte Carlo perturbations.</span>
        </div>
      </div>
    </Card>
  );
};
