import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { CheckCircle2, Clock, AlertCircle, Loader2, GitCommit, CheckSquare, Square } from 'lucide-react';
import { MetricPill } from './ui/MetricPill';
import { Scenario, ScenarioResult } from '../contracts/types';

export interface CustomNodeData {
  scenario: Scenario;
  result?: ScenarioResult;
  isSelectedForCompare: boolean;
  onToggleCompare: (scenarioId: string) => void;
  onOpenDrawer: (scenario: Scenario) => void;
  accentColor: 'baseline' | 'scenarioA' | 'scenarioB' | 'scenarioC' | 'other';
}

export const CustomScenarioNode = memo(({ data }: NodeProps<CustomNodeData>) => {
  const { scenario, result, isSelectedForCompare, onToggleCompare, onOpenDrawer, accentColor } = data;

  const colorStyles = {
    baseline: {
      border: 'border-emerald-500',
      bg: 'bg-emerald-50/40',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      indicator: 'bg-emerald-500',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    },
    scenarioA: {
      border: 'border-rose-500',
      bg: 'bg-rose-50/40',
      badge: 'bg-rose-100 text-rose-800 border-rose-200',
      indicator: 'bg-rose-500',
      glow: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
    },
    scenarioB: {
      border: 'border-purple-500',
      bg: 'bg-purple-50/40',
      badge: 'bg-purple-100 text-purple-800 border-purple-200',
      indicator: 'bg-purple-500',
      glow: 'shadow-[0_0_15px_rgba(139,92,246,0.15)]',
    },
    scenarioC: {
      border: 'border-amber-500',
      bg: 'bg-amber-50/40',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      indicator: 'bg-amber-500',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    },
    other: {
      border: 'border-slate-400',
      bg: 'bg-slate-50/50',
      badge: 'bg-slate-100 text-slate-800 border-slate-200',
      indicator: 'bg-slate-400',
      glow: 'shadow-soft',
    },
  };

  const style = colorStyles[accentColor] || colorStyles.other;

  // Status icon
  const renderStatus = () => {
    switch (scenario.status) {
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>Solving...</span>
          </span>
        );
      case 'queued':
        return (
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Queued</span>
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-600">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </span>
        );
      case 'done':
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Solved</span>
          </span>
        );
    }
  };

  const metrics = result?.metrics;

  return (
    <div
      onClick={() => onOpenDrawer(scenario)}
      className={`relative w-72 rounded-xl bg-white border-2 ${style.border} ${style.glow} shadow-card hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden group select-none`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />

      {/* Top Header Row with Accent Stripe */}
      <div className={`px-3 py-2 border-b border-slate-100 ${style.bg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          {/* Comparison Checkbox */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompare(scenario.id);
            }}
            title={isSelectedForCompare ? 'Deselect from comparison' : 'Select for comparison'}
            className="text-slate-400 hover:text-brand-600 transition-colors p-0.5 rounded focus:outline-none"
          >
            {isSelectedForCompare ? (
              <CheckSquare className="w-4 h-4 text-brand-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
            )}
          </button>

          <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
            {scenario.name}
          </span>
        </div>

        <div className="shrink-0">{renderStatus()}</div>
      </div>

      {/* Body Content */}
      <div className="p-3 space-y-2.5">
        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
          {scenario.description}
        </p>

        {/* Change Tag */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
          <GitCommit className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">
            {scenario.change.type}: {JSON.stringify(scenario.change.params).replace(/["{}]/g, ' ')}
          </span>
        </div>

        {/* Mini Metric Pills Row */}
        {scenario.status === 'done' && metrics ? (
          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-100">
            <MetricPill
              label="Stu"
              value={metrics.student_clashes}
              trend={metrics.student_clashes === 0 ? 'good' : metrics.student_clashes > 8 ? 'bad' : 'neutral'}
            />
            <MetricPill
              label="Fac"
              value={metrics.faculty_clashes}
              trend={metrics.faculty_clashes === 0 ? 'good' : 'bad'}
            />
            <MetricPill
              label="Util"
              value={`${metrics.room_utilization}%`}
              trend={metrics.room_utilization >= 75 ? 'good' : 'neutral'}
            />
          </div>
        ) : scenario.status === 'running' ? (
          <div className="h-6 flex items-center justify-center text-xs text-blue-600 font-medium">
            CP-SAT optimization in progress...
          </div>
        ) : (
          <div className="h-6 flex items-center justify-center text-xs text-slate-400 italic">
            Waiting in queue
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white" />
    </div>
  );
});
