import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Zap } from 'lucide-react';
import { DatasetType, DecisionSpec } from '../contracts/types';

export const EXAMPLE_PROMPTS: Record<DatasetType, string[]> = {
  personal: [
    'Buy a ₹1.2L laptop on 12-month EMI without dropping below ₹30k emergency savings',
    'Take a ₹2L vacation without dropping below ₹50k reserve',
    'Add a ₹15k/month gym subscription',
    'What if my salary drops by 20% for 6 months?',
  ],
  institute: [
    'Buy 40 GPU lab PCs for ₹60L without dropping below ₹25L treasury reserve',
    'Upgrade server infrastructure for ₹18L without dropping below ₹20L reserve',
    'Hire 3 faculty at ₹90k per month each',
    'What if fee collections fall 15% next quarter?',
  ],
  startup: [
    'Run a ₹8L marketing campaign without dropping below ₹15L in the bank',
    'Buy ₹12L of GPU servers on EMI while keeping ₹20L in reserve',
    'Hire 2 engineers at 20L per year each',
    'What if revenue falls 30% for 3 months?',
  ],
};

interface DecisionInputProps {
  promptText: string;
  setPromptText: (text: string) => void;
  datasetType: DatasetType;
  onRun: (text: string) => void;
  isRunning: boolean;
  statusMessage: string;
  decisionSpec: DecisionSpec | null;
}

export const DecisionInput: React.FC<DecisionInputProps> = ({
  promptText,
  setPromptText,
  datasetType,
  onRun,
  isRunning,
  statusMessage,
  decisionSpec,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || isRunning) return;
    onRun(promptText.trim());
  };

  const needsClarification = decisionSpec && decisionSpec.status !== 'ok';
  const understood = decisionSpec?.status === 'ok' ? decisionSpec.understood : null;

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4">
      <label htmlFor="decision-prompt" className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        Describe your decision
      </label>

      <textarea
        id="decision-prompt"
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
        rows={2}
        className="dark-input w-full text-sm leading-relaxed resize-none"
        placeholder="e.g. Buy a ₹1.2L laptop on EMI without dropping below ₹30k emergency savings"
      />

      <div className="flex flex-wrap gap-2">
        {EXAMPLE_PROMPTS[datasetType].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPromptText(p)}
            className="px-3 py-1.5 rounded-lg text-[11px] text-left border border-white/10 bg-white/5 text-slate-400
                       hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {understood && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <span><span className="font-semibold text-emerald-300">Understood as:</span> {understood}</span>
        </div>
      )}

      {needsClarification && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{decisionSpec?.message || 'Please include an amount like ₹60L, ₹1.2 lakh or ₹30,000.'}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{isRunning ? statusMessage : 'Amounts can use ₹, lakh (L), crore (Cr) or k.'}</span>
        <button
          type="submit"
          disabled={isRunning || !promptText.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white
                     bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400
                     shadow-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-white" />}
          {isRunning ? 'Simulating…' : 'Fork & Simulate'}
        </button>
      </div>
    </form>
  );
};
