import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronDown, Compass, History, LogOut, RotateCcw } from 'lucide-react';
import { api, isMockMode } from '../api/client';
import { AffordabilityAnswer, DatasetType, DecisionSpec, Explanation, FinancialScenarioResult, Scenario } from '../contracts/types';
import { CompareTab, CompareWorkbench } from '../components/compare/CompareWorkbench';
import { DecisionInput, EXAMPLE_PROMPTS } from '../components/DecisionInput';
import { ExplanationPanel } from '../components/ExplanationPanel';
import { VerdictHero } from '../components/VerdictHero';
import { ScenarioTree } from '../components/ScenarioTree';
import { UploadIngestor } from '../components/UploadIngestor';
import { ToastContainer, ToastMessage } from '../components/ui/Toast';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { useAuth } from '../auth/AuthProvider';
import { DEMO_TOUR, GuidedTour } from '../demo/GuidedTour';
import { LiquidityBasis } from '../decide/PreflightBar';
import { StressMode } from '../decide/SimControls';
import { LogoMark } from '../landing/Chrome';
import { ModuleSwitch } from '../components/ModuleSwitch';
import { SAMPLE_DATASETS } from '../mocks/fixtures';

type Tab = 'upload' | 'fork';

interface ActiveDataset {
  id: string;
  name: string;
  type: DatasetType;
  warnings: string[];
}

const POLL_MS = 1000;

const Section: React.FC<{ n: string; title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }> = ({
  n,
  title,
  hint,
  children,
  right,
}) => (
  <section className="space-y-5 animate-in">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink pb-3">
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-xs text-ink-dim">{n}</span>
        <h2 className="text-3xl sm:text-4xl tracking-tight leading-none">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        {right}
        {hint && <span className="label hidden md:inline">{hint}</span>}
      </div>
    </div>
    {children}
  </section>
);

const DETAILS_KEY = 'ff.detailsOpen';
const readDetails = () => {
  try {
    return window.localStorage.getItem(DETAILS_KEY) === '1';
  } catch {
    return false;
  }
};

const Workspace: React.FC = () => {
  const [answer, setAnswer] = useState<AffordabilityAnswer | null>(null);
  const [detailsOpen, setDetailsOpenState] = useState<boolean>(readDetails);
  const setDetailsOpen = (v: boolean) => {
    setDetailsOpenState(v);
    try {
      window.localStorage.setItem(DETAILS_KEY, v ? '1' : '0');
    } catch {
      /* storage unavailable: keep it for this visit only */
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('upload');
  const [dataset, setDataset] = useState<ActiveDataset | null>(null);

  const [promptText, setPromptText] = useState('');
  const [decisionSpec, setDecisionSpec] = useState<DecisionSpec | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<Record<string, FinancialScenarioResult>>({});
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [compareTab, setCompareTab] = useState<CompareTab>('overview');

  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { user, signOut } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  // Decision workbench: dataset facts for the pre-flight bar, and the stress preset for the playground
  const [basis, setBasis] = useState<LiquidityBasis | null>(null);
  const [stressMode, setStressMode] = useState<StressMode>('baseline');

  // Guided demo: started from the landing page with ?demo=<dataset>&prompt=<text>
  const [demoPending, setDemoPending] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const addToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, title }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  };

  useEffect(() => {
    document.title = 'Workspace · FutureFork';
    api.getHealth().then((h) => setApiHealthy(h.status === 'ok')).catch(() => setApiHealthy(false));
  }, []);

  useEffect(() => {
    setBasis(null);
    if (!dataset) return;
    let cancelled = false;
    api
      .getDataset(dataset.id)
      .then((d) => {
        const s = d.stats;
        // Mock datasets carry zeros: no basis rather than a misleading bar
        if (!cancelled && s && (s.total_inflow || s.total_outflow || s.starting_balance)) {
          setBasis({ opening: s.starting_balance, surplus: s.total_inflow - s.total_outflow });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dataset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Poll the background run until every fork is evaluated ───────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning || !runId) return;
    pollRef.current = setInterval(async () => {
      try {
        const run = await api.getRunStatus(runId);
        setScenarios((prev) => prev.map((s) => ({ ...s, status: run.scenarios[s.id] ?? s.status })));
        if (run.progress_percent !== undefined) setRunProgress(run.progress_percent);
        if (run.overall_status === 'done' || run.overall_status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          const comp = await api.getComparison(run.decision_id);
          setScenarios(comp.scenarios);
          setResults(comp.results);
          setExplanation(comp.explanation);
          setAnswer(comp.answer ?? null);
          setSelectedId(comp.scenarios.find((s) => s.parent_id === null)?.id ?? null);
          setIsRunning(false);
          setRunProgress(100);
          const failed = comp.scenarios.filter((s) => s.status === 'failed').length;
          if (run.overall_status === 'failed') {
            addToast('error', 'No scenario could be evaluated.', 'Run failed');
          } else if (failed > 0) {
            addToast('info', `${failed} fork(s) could not be evaluated. See the scenario cards for details.`, 'Partially evaluated');
          } else {
            setTimeout(() => document.querySelector('[data-tour="verdict"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
          }
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        setIsRunning(false);
        addToast('error', err instanceof Error ? err.message : 'Lost contact with the run', 'Polling error');
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isRunning, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const clearDecision = () => {
    setDecisionSpec(null);
    setScenarios([]);
    setResults({});
    setExplanation(null);
    setAnswer(null);
    setSelectedId(null);
    setRunId(null);
    setRunProgress(0);
  };

  const handleDatasetReady = (id: string, name: string, type: DatasetType, warnings: string[], quiet = false) => {
    setDataset({ id, name, type, warnings });
    clearDecision();
    setPromptText(EXAMPLE_PROMPTS[type][0]);
    setTab('fork');
    window.scrollTo({ top: 0 });
  };

  const handleRun = async (text: string, ds: ActiveDataset | null = dataset) => {
    if (!ds) return;
    clearDecision();
    setIsRunning(true);
    setRunProgress(10);
    setStatusMessage('Parsing your decision…');
    try {
      const spec = await api.createDecision(text, ds.id);
      setDecisionSpec(spec);
      setSearchParams({ decision: spec.id }, { replace: true });
      if (spec.status !== 'ok') {
        setIsRunning(false);
        setRunProgress(0);
        setDemoPending(false);
        return;
      }
      setRunProgress(30);
      setStatusMessage('Forking into strategies…');
      setScenarios(await api.generateScenarios(spec.id));
      setRunProgress(45);
      setStatusMessage('Solving with CP-SAT and running 300 Monte Carlo stress tests…');
      const { run_id } = await api.runDecision(spec.id);
      setRunId(run_id);
    } catch (err: unknown) {
      setIsRunning(false);
      setRunProgress(0);
      setDemoPending(false);
      addToast('error', err instanceof Error ? err.message : 'Pipeline execution failed', 'Run error');
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setIsRunning(false);
    setSearchParams({}, { replace: true });
    setDataset(null);
    setPromptText('');
    clearDecision();
    setTab('upload');
  };

  // Reopen a saved decision (from History or a ?decision=<id> link)
  const openDecision = async (decisionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setHistoryOpen(false);
    setIsRunning(false);
    try {
      const comp = await api.getComparison(decisionId);
      const spec = comp.decision_spec;
      const ds = await api.getDataset(spec.dataset_id);
      setDataset({ id: spec.dataset_id, name: ds.name, type: spec.dataset_type, warnings: ds.stats?.warnings ?? [] });
      setDecisionSpec(spec);
      setPromptText(spec.text);
      setScenarios(comp.scenarios);
      setResults(comp.results);
      setExplanation(Object.keys(comp.results).length ? comp.explanation : null);
      setAnswer(comp.answer ?? null);
      setSelectedId(comp.scenarios.find((sc) => sc.parent_id === null)?.id ?? null);
      setRunId(null);
      setRunProgress(Object.keys(comp.results).length ? 100 : 0);
      setTab('fork');
      setSearchParams({ decision: decisionId }, { replace: true });
      window.scrollTo({ top: 0 });
      if (!Object.keys(comp.results).length) {
        addToast('info', 'This decision was saved but not simulated yet. Press Fork & simulate to run it.', 'Not run yet');
      }
    } catch (err) {
      setSearchParams({}, { replace: true });
      addToast('error', err instanceof Error ? err.message : 'Could not open that decision', 'History');
    }
  };

  // Start the guided demo once, from the URL
  const demoStarted = useRef(false);
  useEffect(() => {
    const decisionId = searchParams.get('decision');
    if (decisionId && !demoStarted.current) {
      demoStarted.current = true;
      openDecision(decisionId);
      return;
    }
    const demoId = searchParams.get('demo');
    if (!demoId || demoStarted.current) return;
    demoStarted.current = true;
    const preset = SAMPLE_DATASETS.find((d) => d.id === demoId);
    setSearchParams({}, { replace: true });
    if (!preset) {
      addToast('error', `Unknown sample dataset "${demoId}".`, 'Demo');
      return;
    }
    const ds: ActiveDataset = { id: preset.id, name: preset.name, type: preset.dataset_type, warnings: [] };
    handleDatasetReady(ds.id, ds.name, ds.type, [], true);
    const prompt = searchParams.get('prompt') || EXAMPLE_PROMPTS[ds.type][0];
    setPromptText(prompt);
    setDemoPending(true);
    handleRun(prompt, ds);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived ──────────────────────────────────────────────────────────────
  const forkResults = useMemo(
    () => scenarios.filter((s) => !s.id.startsWith('branch_')).map((s) => results[s.id]).filter(Boolean),
    [scenarios, results],
  );

  // When the demo's results land, open the tour (the timer lives in a ref so the
  // re-render caused by clearing demoPending doesn't cancel it)
  const tourTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (demoPending && !isRunning && forkResults.length > 0) {
      setDemoPending(false);
      tourTimer.current = setTimeout(() => setTourOpen(true), 700);
    }
  }, [demoPending, isRunning, forkResults.length]);
  useEffect(() => () => clearTimeout(tourTimer.current), []);

  const step = forkResults.length > 0 ? 3 : dataset ? 2 : 1;

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md border-b border-ink-line">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-[52px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="FutureFork home">
              <LogoMark />
              <span className="hidden xl:inline text-[18px] font-medium tracking-[0.01em]">FUTUREFORK</span>
            </Link>
            <ModuleSwitch />
          </div>

          <nav className="hidden md:flex items-stretch h-full" aria-label="Steps">
            {[
              { n: 1, label: 'Data', onClick: () => setTab('upload'), enabled: true },
              { n: 2, label: 'Decide', onClick: () => dataset && setTab('fork'), enabled: !!dataset },
              { n: 3, label: 'Compare', onClick: () => dataset && setTab('fork'), enabled: forkResults.length > 0 },
            ].map((s) => (
              <button
                key={s.n}
                onClick={s.onClick}
                disabled={!s.enabled}
                className={`px-5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] border-l border-ink-line last:border-r transition-colors
                            ${step === s.n ? 'text-ink bg-paper-2' : s.enabled ? 'text-ink-dim hover:text-ink' : 'text-ink/25 cursor-not-allowed'}`}
                aria-current={step === s.n ? 'step' : undefined}
              >
                <span className={`w-4 h-4 flex items-center justify-center text-[9px] border ${step >= s.n ? 'border-ink' : 'border-ink/25'}`}>{s.n}</span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {isMockMode && <span className="label text-warn border border-warn px-1.5 py-0.5">Mock data</span>}
            <span className="hidden sm:flex items-center gap-1.5 label">
              <span className={`w-1.5 h-1.5 rounded-full ${apiHealthy === true ? 'bg-good' : apiHealthy === false ? 'bg-bad' : 'bg-ink/30'}`} />
              {apiHealthy === true ? 'Engine live' : apiHealthy === false ? 'Engine offline' : 'Connecting'}
            </span>
            {forkResults.length > 0 && (
              <button onClick={() => setTourOpen(true)} className="h-8 px-3 border border-ink-faint hover:border-ink font-mono text-[11px] uppercase tracking-[0.06em] flex items-center gap-1.5" title="Guided tour">
                <Compass className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Tour</span>
              </button>
            )}
            <button
              onClick={() => setHistoryOpen(true)}
              className="h-8 px-3 border border-ink-faint hover:border-ink font-mono text-[11px] uppercase tracking-[0.06em] flex items-center gap-1.5"
              title="Your saved decisions"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">History</span>
            </button>
            <button onClick={handleReset} className="h-8 px-3 border border-ink font-mono text-[11px] uppercase tracking-[0.06em] flex items-center gap-1.5 hover:bg-ink hover:text-paper transition-colors" title="Start a new decision">
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
            {user && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account"
                  className="h-8 w-8 border border-ink overflow-hidden flex items-center justify-center bg-paper-2 font-mono text-[12px] uppercase"
                >
                  {user.picture ? (
                    <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    (user.name || user.email).slice(0, 1)
                  )}
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                    <div role="menu" className="absolute right-0 mt-2 z-50 w-60 bg-paper-2 border border-ink shadow-lift animate-fade-in">
                      <div className="px-3 py-3 border-b border-ink-line">
                        <div className="text-sm truncate">{user.name || 'Signed in'}</div>
                        <div className="label text-[10px] normal-case truncate">{user.email}</div>
                      </div>
                      <button role="menuitem" onClick={() => { setMenuOpen(false); setHistoryOpen(true); }} className="w-full text-left px-3 h-9 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] hover:bg-paper">
                        <History className="w-3.5 h-3.5" /> History
                      </button>
                      <button role="menuitem" onClick={() => { setMenuOpen(false); signOut(); }} className="w-full text-left px-3 h-9 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] hover:bg-paper border-t border-ink-line">
                        <LogOut className="w-3.5 h-3.5" /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="h-[2px] w-full overflow-hidden" aria-hidden="true">
          {isRunning && <div className="h-full bg-brand-linear transition-[width] duration-500 ease-editorial" style={{ width: `${Math.max(6, runProgress)}%` }} />}
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className={`flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 ${tab === 'fork' ? 'pt-6 pb-10 space-y-12' : 'py-10 space-y-16'}`}>
        {tab === 'upload' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] items-end gap-6 animate-in">
              <div>
                <span className="label">Step 01 · Your data</span>
                <h1 className="mt-3 text-5xl sm:text-7xl tracking-[-0.03em] leading-[0.95]">
                  Start from
                  <br />
                  <span className="relative inline-block grad-border px-3 -ml-3">your numbers.</span>
                </h1>
              </div>
              <p className="max-w-sm text-ink-2 leading-relaxed">
                FutureFork compiles 12 months of income and spending into a baseline (Node 0). Every fork is then measured against it,
                with numbers from the engine, never from the AI.
              </p>
            </div>
            <UploadIngestor onDatasetReady={(id, name, type, warnings) => handleDatasetReady(id, name, type, warnings)} />
          </>
        )}

        {tab === 'fork' && dataset && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-line pb-3 animate-in">
              <button onClick={() => setTab('upload')} className="label flex items-center gap-1 hover:text-ink">
                <ArrowLeft className="w-3 h-3" /> Data
              </button>
              <span className="label">Dataset</span>
              <span className="text-sm">{dataset.name}</span>
              <span className="label border border-ink-faint px-1.5 py-0.5">{dataset.type}</span>
            </div>

            {dataset.warnings.length > 0 && (
              <div className="flex items-start gap-3 px-4 py-3 border-l-2 border-warn bg-warn/5 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warn" />
                <div className="space-y-1">
                  <div className="label text-warn">About your data</div>
                  {dataset.warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </div>
              </div>
            )}

            <DecisionInput
              promptText={promptText}
              setPromptText={setPromptText}
              datasetType={dataset.type}
              onRun={(t) => handleRun(t)}
              isRunning={isRunning}
              statusMessage={statusMessage}
              decisionSpec={decisionSpec}
              basis={basis}
              stressMode={stressMode}
              onStressMode={setStressMode}
              runProgress={runProgress}
            />

            {forkResults.length > 0 && (
              <Section n="02" title="The answer" hint="Explained, then verified">
                <div className="space-y-8">
                  <VerdictHero results={forkResults} answer={answer} />
                  <ExplanationPanel explanation={explanation} financialResults={forkResults} />
                </div>
              </Section>
            )}

            {scenarios.length > 0 && (
              <Section n="03" title="The options" hint="Click one to inspect it">
                <ScenarioTree
                  scenarios={scenarios}
                  results={results}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  hoverId={hoverId}
                  onHover={setHoverId}
                />
              </Section>
            )}

            {forkResults.length > 0 && (
              <section className="space-y-5">
                <button
                  type="button"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                  aria-expanded={detailsOpen}
                  className="w-full flex items-center justify-between gap-3 border-y border-ink py-4 text-left group"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-ink-dim">04</span>
                    <span className="text-2xl sm:text-3xl tracking-tight leading-none">
                      {detailsOpen ? 'Hide the details' : 'Show the details'}
                    </span>
                  </span>
                  <span className="label flex items-center gap-2 group-hover:text-ink">
                    <span className="hidden md:inline">Charts · cash flow · crisis playground</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {detailsOpen && (
                  <div className="animate-in">
                    <CompareWorkbench
                      financialResults={forkResults}
                      selectedId={selectedId}
                      hoverId={hoverId}
                      onHover={setHoverId}
                      onSelect={setSelectedId}
                      decisionId={decisionSpec?.id ?? null}
                      stressMode={stressMode}
                      tab={compareTab}
                      onTab={setCompareTab}
                    />
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenDecision={openDecision}
        currentDecisionId={decisionSpec?.id ?? null}
      />
      {tourOpen && <GuidedTour steps={DEMO_TOUR} onClose={() => setTourOpen(false)} onStep={(st) => {
            if (st.tab) {
              setDetailsOpen(true);
              setCompareTab(st.tab);
            }
          }} />}

      <footer className="border-t border-ink-line mt-8">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 label">
          <span>FutureFork · 2026</span>
          <span>OR-Tools CP-SAT · NumPy Monte Carlo · Numeric Guard</span>
        </div>
      </footer>
    </div>
  );
};

export default Workspace;
