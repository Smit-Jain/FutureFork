import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useReducedMotion } from '../components/fx/useReducedMotion';

export interface TourStep {
  /** Matches an element's `data-tour` attribute. */
  target: string;
  /** Compare tab to open before showing this step (the target lives inside it). */
  tab?: 'overview' | 'crisis' | 'cashflow';
  title: string;
  body: string;
}

export const DEMO_TOUR: TourStep[] = [
  {
    target: 'prompt',
    title: 'Your decision, understood',
    body: 'The prompt is parsed into amounts, timing and a safety floor. Check the "Understood as" line to see exactly what FutureFork read.',
  },
  {
    target: 'verdict',
    title: 'The answer, first',
    body: 'One sentence tells you the best option and how often it keeps you above your safety cushion across 300 what-if scenarios of your next 12 months (late salary, surprise bills, rising prices). Tap a "?" for what each number means.',
  },
  {
    target: 'tree',
    title: 'Every option side by side',
    body: 'Each card is a different way to do it, with the same three plain numbers. Click one to inspect it in the details below.',
  },
  {
    target: 'explanation',
    title: 'A recommendation you can check',
    body: 'The explanation is written from the engine’s numbers, and the Numeric Guard verifies every figure in it.',
  },
  {
    target: 'overview',
    tab: 'overview',
    title: 'The details, when you want them',
    body: 'Sort the table, hover a fork to spotlight its balance curve, or switch to "Selected vs baseline" to isolate two lines.',
  },
  {
    target: 'playground',
    tab: 'crisis',
    title: 'Break it on purpose',
    body: 'Drag the faders to throw a crisis at every plan. The engine re-runs 300 simulations per fork live, and the cards react instantly.',
  },
  {
    target: 'cashflow',
    tab: 'cashflow',
    title: 'Every rupee, every month',
    body: 'The selected fork’s 12-month cash flow. "Diff vs baseline" lights up only the cells the strategy changes.',
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Coach marks: a spotlight frame around each `data-tour` target with a short note. */
export const GuidedTour: React.FC<{ steps: TourStep[]; onClose: () => void; onStep?: (step: TourStep) => void }> = ({ steps, onClose, onStep }) => {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.target]);

  useLayoutEffect(() => {
    onStep?.(step);
    // let a tab switch render before scrolling to and measuring the target
    const t0 = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }, 60);
    const t = setTimeout(measure, reduced ? 120 : 520);
    return () => {
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [step.target, measure, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, steps.length - 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', onKey);
    };
  }, [measure, onClose, steps.length]);

  const pad = 10;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = Math.min(340, vw - 32);
  // Place the note below the target if there's room, otherwise above, clamped to the viewport
  let cardTop = rect ? rect.top + Math.min(rect.height, vh * 0.55) + pad + 14 : vh / 2 - 90;
  if (rect && cardTop + 200 > vh) cardTop = Math.max(16, rect.top - 200 - pad);
  const cardLeft = rect ? Math.min(Math.max(16, rect.left), vw - cardW - 16) : vw / 2 - cardW / 2;
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* dim everything except the target (box-shadow cut-out) */}
      {rect ? (
        <div
          className="absolute border border-ink pointer-events-none transition-all duration-300 ease-editorial"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: Math.min(rect.height, vh * 0.55) + pad * 2,
            boxShadow: '0 0 0 9999px rgba(239,236,230,.72)',
          }}
        >
          <span className="absolute -top-[5px] -left-[5px] w-[9px] h-[9px] border-t-2 border-l-2 border-brand-coral" />
          <span className="absolute -bottom-[5px] -right-[5px] w-[9px] h-[9px] border-b-2 border-r-2 border-brand-pink" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-paper/70" />
      )}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="absolute bg-paper-2 border border-ink shadow-lift p-5 space-y-3 animate-fade-in"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
        key={i}
      >
        <span className="absolute left-0 top-0 h-[2px] w-1/2 bg-brand-linear" />
        <div className="label">
          Step {i + 1} / {steps.length}
        </div>
        <div className="text-xl tracking-tight leading-snug">{step.title}</div>
        <p className="text-sm text-ink-2 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onClose} className="label hover:text-ink">Skip tour</button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="h-8 px-3 border border-ink font-mono text-[11px] uppercase hover:bg-paper">
                Back
              </button>
            )}
            <button
              onClick={() => (last ? onClose() : setI(i + 1))}
              className="h-8 px-4 bg-ink text-paper font-mono text-[11px] uppercase tracking-[0.06em] hover:bg-ink-2"
              autoFocus
            >
              {last ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
