import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Explanation, FinancialScenarioResult } from '../contracts/types';
import { Reveal } from './fx/Reveal';

const TOKEN_RE = /(₹[\d,.]+(?:L|K|Cr)?|-₹[\d,.]+(?:L|K|Cr)?|[\d.]+\s?%|Month\s+\d+|\d+\s+months?)/gi;

/** Highlights engine numbers (₹, %, months) and renders **bold** from LLM output as plain emphasis. */
function renderRich(text: string, onHighlight?: (month: number) => void): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((chunk, ci) => {
    const bold = chunk.startsWith('**') && chunk.endsWith('**');
    const body = bold ? chunk.slice(2, -2) : chunk;
    let last = 0;
    let m: RegExpExecArray | null;
    const parts: React.ReactNode[] = [];
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(body)) !== null) {
      if (m.index > last) parts.push(body.slice(last, m.index));
      const token = m[0];
      const monthNum = /^month/i.test(token) ? parseInt(token.replace(/\D/g, ''), 10) : null;
      const cls = 'font-mono tabular-nums text-[0.92em] px-1 border-b border-ink/40';
      parts.push(
        monthNum !== null && onHighlight ? (
          <button key={`${ci}-${m.index}`} className={`${cls} hover:bg-ink hover:text-paper`} onClick={() => onHighlight(monthNum)}>
            {token}
          </button>
        ) : (
          <span key={`${ci}-${m.index}`} className={cls}>
            {token}
          </span>
        ),
      );
      last = m.index + token.length;
    }
    if (last < body.length) parts.push(body.slice(last));
    out.push(bold ? <strong key={ci} className="font-medium">{parts}</strong> : <React.Fragment key={ci}>{parts}</React.Fragment>);
  });
  return out;
}

interface ExplanationPanelProps {
  explanation: Explanation | null;
  financialResults: FinancialScenarioResult[];
  /** kept for API compatibility; the per-fork list moved to the fork cards and Compare table */
  selectedFinancialId?: string | null;
  onHighlightMonth?: (month: number) => void;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({
  explanation,
  financialResults,
  onHighlightMonth,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  if (financialResults.length === 0) return null;
  const long = (explanation?.summary?.length ?? 0) > 420;
  const guardOk = !!explanation?.guard_passed;

  return (
    <div className="space-y-8" data-tour="explanation">
      {/* Guarded explanation */}
      {explanation?.summary && (
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 lg:gap-8">
            <div className="space-y-2">
              <div className="label">{explanation.source === 'llm' ? 'Written by AI' : 'Written from template'}</div>
              <div
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.05em] border px-2 py-1"
                style={{ color: guardOk ? '#2f7d4f' : '#d6345f', borderColor: guardOk ? '#2f7d4f' : '#d6345f' }}
              >
                {guardOk ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                Numeric Guard {guardOk ? 'passed' : 'failed'}
              </div>
              <p className="text-[12px] text-ink-dim leading-snug">
                Every ₹, % and month in this text was checked against the engine's results.
              </p>
            </div>
            <div className="max-w-3xl">
              <div className={`relative overflow-hidden transition-[max-height] duration-500 ${long && !expanded ? 'max-h-[9.5rem]' : 'max-h-[200rem]'}`}>
                <p className="text-[15px] leading-relaxed whitespace-pre-line">{renderRich(explanation.summary, onHighlightMonth)}</p>
                {long && !expanded && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-paper to-transparent" aria-hidden="true" />}
              </div>
              {long && (
                <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-2 label hover:text-ink underline underline-offset-4">
                  {expanded ? 'Show less' : 'Read the full explanation'}
                </button>
              )}
            </div>
          </div>
        </Reveal>
      )}

    </div>
  );
};
