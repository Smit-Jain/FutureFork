import React, { useState } from 'react';
import { X, GitBranch, Calendar, CheckCircle2, Cpu, Activity, ArrowRight, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Scenario, ScenarioResult, ChangeSpec } from '../contracts/types';

interface NodeDrawerProps {
  scenario: Scenario | null;
  result?: ScenarioResult;
  isOpen: boolean;
  onClose: () => void;
  onViewTimetable: (scenarioId: string) => void;
  onBranch: (parentId: string, name: string, change: ChangeSpec) => Promise<void>;
}

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  scenario,
  result,
  isOpen,
  onClose,
  onViewTimetable,
  onBranch,
}) => {
  const [isBranching, setIsBranching] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchType, setBranchType] = useState<'shift_time_window' | 'room_change' | 'faculty_load_cap'>('room_change');
  const [isSubmittingBranch, setIsSubmittingBranch] = useState(false);

  if (!isOpen || !scenario) return null;

  const handleBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;

    let changeSpec: ChangeSpec = {
      type: branchType,
      params:
        branchType === 'room_change'
          ? { action: 'add', capacity: 45, type: 'lecture' }
          : branchType === 'faculty_load_cap'
          ? { max_hours_per_week: 16 }
          : { from: 'afternoon', to: 'morning', selection: 'electives' },
    };

    setIsSubmittingBranch(true);
    try {
      await onBranch(scenario.id, branchName.trim(), changeSpec);
      setIsBranching(false);
      setBranchName('');
    } finally {
      setIsSubmittingBranch(false);
    }
  };

  const metrics = result?.metrics;
  const solver = result?.solver;
  const simulation = result?.simulation;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Scenario Details
              </span>
              <Badge
                size="sm"
                variant={
                  scenario.status === 'done'
                    ? 'success'
                    : scenario.status === 'running'
                    ? 'info'
                    : 'neutral'
                }
                dot
              >
                {scenario.status}
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{scenario.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Hypothesis &amp; Description
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              {scenario.description}
            </p>
          </div>

          {/* Change Spec */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Applied Policy Change
            </h4>
            <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs space-y-1">
              <div className="text-rose-400 font-semibold">{scenario.change.type}</div>
              <pre className="text-slate-300 text-[11px] overflow-x-auto">
                {JSON.stringify(scenario.change.params, null, 2)}
              </pre>
            </div>
          </div>

          {/* Real Metrics (from Engine C) */}
          {metrics && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Engine Metrics (OR-Tools CP-SAT)
                </h4>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Exact Mathematical Results
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Student Clashes</div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono mt-0.5">
                    {metrics.student_clashes}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lower is better</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Faculty Clashes</div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono mt-0.5">
                    {metrics.faculty_clashes}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lower is better</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Room Utilization</div>
                  <div className="text-2xl font-extrabold text-brand-600 font-mono mt-0.5">
                    {metrics.room_utilization}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Higher is better</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">Avg Student Gaps</div>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono mt-0.5">
                    {metrics.avg_student_gaps}
                    <span className="text-sm font-normal ml-1">hrs</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lower is better</div>
                </div>
              </div>
            </div>
          )}

          {/* Solver Telemetry */}
          {solver && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Cpu className="w-4 h-4 text-slate-500" />
                <span>Solver Diagnostics</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">STATUS</span>
                  <span className="font-mono font-bold text-slate-800">{solver.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">RUNTIME</span>
                  <span className="font-mono font-bold text-slate-800">{solver.runtime_s}s</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">OBJECTIVE COST</span>
                  <span className="font-mono font-bold text-slate-800">{solver.objective}</span>
                </div>
              </div>
            </div>
          )}

          {/* Monte Carlo Summary */}
          {simulation && (
            <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-purple-950">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span>Monte Carlo Robustness ({simulation.n_runs} runs)</span>
                </div>
                <span className="font-mono text-purple-700">
                  {Math.round(simulation.prob_zero_clashes * 100)}% Zero Clashes
                </span>
              </div>
              <div className="text-xs text-purple-800/80 leading-relaxed">
                Perturbing elective enrollment, session overruns (+10% prob), and room outages (+2% prob)
                yields a mean student clash rate of{' '}
                <strong className="font-mono">{simulation.per_metric.student_clashes.mean}</strong>{' '}
                (P10: {simulation.per_metric.student_clashes.p10}, P90:{' '}
                {simulation.per_metric.student_clashes.p90}).
              </div>
            </div>
          )}

          {/* Phase 2: Branch From Here Section */}
          <div className="pt-2 border-t border-slate-200 space-y-3">
            {!isBranching ? (
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/50 text-slate-700 hover:text-brand-700"
                onClick={() => setIsBranching(true)}
              >
                <GitBranch className="w-4 h-4" />
                <span>Branch from here (Phase 2 Stub)</span>
              </Button>
            ) : (
              <form onSubmit={handleBranchSubmit} className="p-4 rounded-xl border border-brand-200 bg-brand-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-900 flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-brand-600" />
                    New Child Branch
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsBranching(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    Cancel
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Branch Name</label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g. Scenario D: Add Room 104"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Policy Modification</label>
                  <select
                    value={branchType}
                    onChange={(e) => setBranchType(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="room_change">room_change (Add backup capacity)</option>
                    <option value="faculty_load_cap">faculty_load_cap (Strict 16h limit)</option>
                    <option value="shift_time_window">shift_time_window (Selective shift)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isSubmittingBranch}
                  className="w-full mt-2"
                >
                  Create Child Branch
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
          <Button
            variant="primary"
            className="flex-1"
            icon={<Calendar className="w-4 h-4" />}
            onClick={() => {
              onViewTimetable(scenario.id);
              onClose();
            }}
          >
            View Weekly Timetable Grid
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
