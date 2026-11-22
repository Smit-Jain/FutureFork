import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, SlidersHorizontal } from 'lucide-react';
import { DatasetType, DecisionSpec } from '../contracts/types';
import { DetectedChips } from '../decide/DetectedChips';
import { LiquidityBasis, PreflightBar } from '../decide/PreflightBar';
import { STRESS_PRESETS, SimControls, StressMode } from '../decide/SimControls';
import { DecisionTag, detect, formatAmount, withCadence, withFloor, withSpend } from '../decide/parseDecision';

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

const TAG_COLOR: Record<DecisionTag, string> = {
  CAPEX: '#0f6b8f',
  HIRING: '#6d4bd1',
  RECURRING: '#c76a12',
  STRESS: '#d6345f',
};

/** Rounds up to a "nice" slider maximum: 1, 2 or 5 × 10^k. */
const niceCeil = (v: number): number => {
  if (v <= 0) return 100000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
};

interface DecisionInputProps {
  promptText: string;
  setPromptText: (text: string) => void;
  datasetType: DatasetType;
  onRun: (text: string) => void;
  isRunning: boolean;
  statusMessage: string;
  decisionSpec: DecisionSpec | null;
  basis: LiquidityBasis | null;
  stressMode: StressMode;
  onStressMode: (m: StressMode) => void;
  runProgress: number;
}

/**
 * The decision workbench. A live client-side preview (chips, pre-flight bar) helps the user shape
 * the prompt; chip and slider edits are written back into the text, which is the only thing the
 * API receives. The server's reading appears as "Understood as" after a run.
 */
export const DecisionInput: React.FC<DecisionInputProps> = ({
  promptText,
  setPromptText,
  datasetType,
  onRun,
  isRunning,
  statusMessage,
  decisionSpec,
  basis,
  stressMode,
  onStressMode,
  runProgress,
}) => {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const detected = useMemo(() => detect(promptText), [promptText]);
  const presets = useMemo(() => EXAMPLE_PROMPTS[datasetType].map((p) => ({ text: p, tag: detect(p).tag })), [datasetType]);

  const available = basis ? Math.max(0, basis.opening + basis.surplus) : 0;
  const floorMax = niceCeil(Math.max(available, (detected.floor?.value ?? 0) * 2, 100000));

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptText.trim() || isRunning) return;
    onRun(promptText.trim());
  };

  const [showOptions, setShowOptions] = useState(false);
  const needsClarification = decisionSpec && decisionSpec.status !== 'ok';
  const understood = decisionSpec?.status === 'ok' ? decisionSpec.understood : null;
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)] gap-x-10 gap-y-6" data-tour="prompt">
      {/* ── Left: prompt, detected parameters, presets, controls, CTA ── */}
      <div className="space-y-4 min-w-0">
        <div className="relative brackets border border-ink bg-paper-2 focus-within:bg-white/50 transition-colors">
          <div className="flex items-center justify-between gap-3 border-b border-ink-line px-3 h-8">
            <label htmlFor="decision-prompt" className="font-mono text-[11px] uppercase tracking-[0.06em] flex items-center gap-2">
              <span className="text-brand-coral" aria-hidden="true">&gt;</span> Decision
            </label>
            <span className="label text-[10px] hidden sm:inline">Plain English · Hinglish works too</span>
          </div>
          <textarea
            ref={textRef}
            id="decision-prompt"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
            }}
            rows={3}
            spellCheck={false}
            className="block w-full bg-transparent px-4 py-3 text-[16px] leading-relaxed resize-none placeholder:text-ink-dim focus:outline-none"
            placeholder="e.g. Buy a ₹1.2L laptop on EMI without dropping below ₹30k savings (₹, lakh, crore or k all work)"
          />
        </div>

        <DetectedChips
          detected={detected}
          onSpend={(v) => setPromptText(withSpend(promptText, detected, v))}
          onFloor={(v) => setPromptText(withFloor(promptText, detected, v))}
          onCadence={(c) => setPromptText(withCadence(promptText, detected, c))}
        />

        <div className="flex items-start gap-3">
          <span className="label text-[10px] pt-2 shrink-0">Try</span>
          <div className="flex flex-wrap gap-2" aria-label="Example decisions">
            {presets.map(({ text, tag }) => {
              const active = promptText === text;
              return (
                <button
                  key={text}
                  type="button"
                  onClick={() => {
                    setPromptText(text);
                    textRef.current?.focus();
                  }}
                  title={text}
                  className={`max-w-full h-8 px-3 border rounded-full flex items-center gap-2 transition-all duration-200
                              ${active ? 'border-ink bg-ink text-paper' : 'border-ink-faint bg-paper-2 hover:border-ink hover:-translate-y-px'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? '#efece6' : TAG_COLOR[tag] }} aria-hidden="true" />
                  <span className="text-[12.5px] truncate max-w-[19rem]">{text}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-ink-line pt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className="label text-[10.5px] flex items-center gap-1.5 hover:text-ink"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showOptions ? 'Hide options' : `Options · keep ${formatAmount(detected.floor?.value ?? 0)} · ${STRESS_PRESETS[stressMode].label}`}
          </button>
          <button
            type="submit"
            disabled={isRunning || !promptText.trim()}
            className="relative h-11 pl-5 pr-2 bg-ink text-paper font-mono text-xs uppercase tracking-[0.08em] flex items-center gap-3
                       hover:bg-ink-2 transition-colors disabled:cursor-not-allowed overflow-hidden min-w-[220px] justify-between"
          >
            <span className="absolute left-0 top-0 h-[2px] w-1/2 bg-brand-linear" />
            <span className="absolute left-0 top-0 w-[2px] h-full bg-brand-linear" />
            {isRunning && (
              <span className="absolute left-0 bottom-0 h-[3px] bg-brand-linear transition-[width] duration-500 ease-editorial" style={{ width: `${Math.max(6, runProgress)}%` }} />
            )}
            <span className="flex items-center gap-2">
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <span aria-hidden="true">⑂</span>}
              {isRunning ? `Simulating · ${Math.round(runProgress)}%` : 'Fork & simulate'}
            </span>
            <kbd className={`font-mono text-[10px] px-1.5 h-6 inline-flex items-center border border-paper/30 ${isRunning ? 'opacity-0' : 'opacity-70'}`}>
              {isMac ? '⌘' : 'Ctrl'} ↵
            </kbd>
          </button>
        </div>
        {showOptions && (
          <div className="animate-in">
            <SimControls
              stressMode={stressMode}
              onStressMode={onStressMode}
              floor={detected.floor?.value ?? 0}
              floorMax={floorMax}
              onFloor={(v) => setPromptText(withFloor(promptText, detected, v))}
            />
          </div>
        )}
        {isRunning && (
          <p className="label text-[10px]" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </div>

      {/* ── Right: pre-flight + the engine's reading ── */}
      <aside className="space-y-5 order-first lg:order-none lg:border-l lg:border-ink-line lg:pl-8 min-w-0">
        <PreflightBar detected={detected} basis={basis} />

        {understood && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 border-l-2 border-good bg-good/5 text-sm animate-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-good" />
            <span>
              <span className="label text-good block mb-0.5">Understood by the engine as</span>
              {understood}
            </span>
          </div>
        )}
        {needsClarification && (
          <div role="alert" className="flex items-start gap-2.5 px-3 py-2.5 border-l-2 border-warn bg-warn/5 text-sm animate-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
            <span>{decisionSpec?.message || 'Please include an amount like ₹60L, ₹1.2 lakh or ₹30,000.'}</span>
          </div>
        )}
      </aside>
    </form>
  );
};
