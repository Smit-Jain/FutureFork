import React, { useState } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Sparkles, Play, AlertTriangle, HelpCircle, Database, ArrowRight, Check } from 'lucide-react';
import { DatasetSummary, DecisionSpec } from '../contracts/types';
import { MOCK_EXAMPLE_PROMPTS } from '../mocks/fixtures';

interface DecisionInputProps {
  promptText: string;
  setPromptText: (text: string) => void;
  datasets: DatasetSummary[];
  selectedDatasetId: string;
  setSelectedDatasetId: (id: string) => void;
  onRun: (text: string, datasetId: string) => void;
  isRunning: boolean;
  decisionSpec: DecisionSpec | null;
}

export const DecisionInput: React.FC<DecisionInputProps> = ({
  promptText,
  setPromptText,
  datasets,
  selectedDatasetId,
  setSelectedDatasetId,
  onRun,
  isRunning,
  decisionSpec,
}) => {
  const [selectedExampleIdx, setSelectedExampleIdx] = useState<number | null>(0);

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId) || datasets[0];

  const handleSelectExample = (prompt: string, idx: number) => {
    setPromptText(prompt);
    setSelectedExampleIdx(idx);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value);
    setSelectedExampleIdx(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || isRunning) return;
    onRun(promptText.trim(), selectedDatasetId);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Top Banner / Hero Tagline */}
      <div className="text-center space-y-2 py-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-brand-700 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          Elite Coders CodeSprint 2026 &bull; MVP Engine
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Simulate <span className="text-slate-400 font-light">&gt;</span> Compare{' '}
          <span className="text-slate-400 font-light">&gt;</span> Decide
        </h1>
        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
          Describe any scheduling or resource reallocation policy in plain English. FutureFork branches
          alternative scenarios, runs Google OR-Tools CP-SAT and Monte Carlo simulations, and visualizes trade-offs.
        </p>
      </div>

      <Card className="p-6 sm:p-8 space-y-6 bg-white border border-slate-200 shadow-soft">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dataset Selector Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <label htmlFor="dataset-select" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Target Dataset
                </label>
                <div className="text-sm font-semibold text-slate-800">
                  {selectedDataset?.name || 'Default Campus Timetable'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="dataset-select"
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                disabled={isRunning}
                className="bg-slate-50 border border-slate-300 text-slate-800 text-xs sm:text-sm rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none transition-all"
              >
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dataset Mini Stat Pills */}
          {selectedDataset && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="font-semibold text-slate-500 uppercase text-[10px]">Dataset Stats:</span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                {selectedDataset.stats.events_count} Events
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                {selectedDataset.stats.faculty_count} Faculty
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                {selectedDataset.stats.rooms_count} Rooms
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                {selectedDataset.stats.groups_count} Student Cohorts
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-emerald-700">
                Baseline Util: {selectedDataset.baseline_metrics.room_utilization}%
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono text-rose-700">
                Baseline Clashes: {selectedDataset.baseline_metrics.student_clashes}
              </span>
            </div>
          )}

          {/* Prompt Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="prompt-input" className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>Decision Prompt</span>
                <span className="text-xs font-normal text-slate-500">(Plain English policy instruction)</span>
              </label>
              <span className="text-xs text-slate-400 font-mono">{promptText.length} chars</span>
            </div>
            <div className="relative">
              <textarea
                id="prompt-input"
                rows={4}
                value={promptText}
                onChange={handleTextChange}
                disabled={isRunning}
                placeholder="e.g. Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week..."
                className="w-full p-4 text-slate-900 bg-slate-50/70 hover:bg-slate-50/90 focus:bg-white rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none transition-all text-sm sm:text-base leading-relaxed resize-y font-normal"
              />
            </div>
          </div>

          {/* Clickable Example Prompts */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <span>Suggested Demo Prompts:</span>
              <span className="text-[10px] text-slate-400 font-normal">(Click to test scenario branches)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {MOCK_EXAMPLE_PROMPTS.map((prompt, idx) => {
                const isSelected = selectedExampleIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectExample(prompt, idx)}
                    disabled={isRunning}
                    className={`text-left p-3 rounded-lg border text-xs transition-all flex items-start gap-2 ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/50 text-brand-900 shadow-sm ring-1 ring-brand-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                        isSelected ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span className="line-clamp-2 leading-relaxed">{prompt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline Clarification or Unsupported Messages from DecisionSpec */}
          {decisionSpec && decisionSpec.status !== 'ok' && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start gap-3 animate-in fade-in duration-200 ${
                decisionSpec.status === 'unsupported'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {decisionSpec.status === 'unsupported' ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>
                    {decisionSpec.status === 'unsupported'
                      ? 'Unsupported Request'
                      : 'Clarification Needed'}
                  </span>
                  <Badge
                    size="sm"
                    variant={decisionSpec.status === 'unsupported' ? 'danger' : 'warning'}
                  >
                    {decisionSpec.status}
                  </Badge>
                </div>
                <p className="leading-relaxed text-xs sm:text-sm">{decisionSpec.message}</p>
                <div className="pt-1 text-[11px] font-medium text-slate-600">
                  Supported change types: <code className="bg-white/80 px-1 py-0.5 rounded border">shift_time_window</code>,{' '}
                  <code className="bg-white/80 px-1 py-0.5 rounded border">room_change</code>,{' '}
                  <code className="bg-white/80 px-1 py-0.5 rounded border">faculty_load_cap</code>
                </div>
              </div>
            </div>
          )}

          {/* Golden Rule Note & Submit Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                <strong>Golden Rule:</strong> AI agents interpret &amp; explain &bull; OR-Tools &amp; Monte Carlo calculate all numbers.
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isRunning}
              disabled={isRunning || !promptText.trim()}
              icon={<Play className="w-4 h-4 fill-white" />}
              className="w-full sm:w-auto px-8 shadow-md hover:shadow-lg transition-all"
            >
              {isRunning ? 'Solving Scenarios...' : 'Run Decision Engine'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
