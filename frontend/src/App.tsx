import React, { useState, useEffect, useRef } from 'react';
import { api } from './api/client';
import {
  DatasetSummary,
  DecisionSpec,
  Scenario,
  ScenarioResult,
  ComparisonResponse,
  ChangeSpec,
  FinancialScenarioResult,
} from './contracts/types';
import { DecisionInput } from './components/DecisionInput';
import { ScenarioTree } from './components/ScenarioTree';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { TimetableGrid } from './components/TimetableGrid';
import { ExplanationPanel } from './components/ExplanationPanel';
import { NodeDrawer } from './components/NodeDrawer';
import { ToastContainer, ToastMessage } from './components/ui/Toast';
import { Button } from './components/ui/Button';
import { UploadIngestor } from './components/UploadIngestor';
import { CashFlowMatrix } from './components/CashFlowMatrix';
import {
  GitBranch,
  BarChart3,
  Calendar,
  Sparkles,
  RotateCcw,
  Zap,
  Upload,
  TrendingUp,
  Layers,
  Activity,
  Circle,
} from 'lucide-react';
import { MOCK_EXAMPLE_PROMPTS, MOCK_FINANCIAL_RESULTS, MOCK_FINANCIAL_SCENARIOS } from './mocks/fixtures';

type AppMode = 'financial' | 'timetable';
type FinancialTab = 'upload' | 'fork';
type TimetableTab = 'tree' | 'compare' | 'timetable' | 'explanation';

export const App: React.FC = () => {
  // ─── App Mode ─────────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('financial');

  // ─── Financial State ──────────────────────────────────────────────────────
  const [financialTab, setFinancialTab] = useState<FinancialTab>('upload');
  const [financialDatasetId, setFinancialDatasetId] = useState<string | null>(null);
  const [financialDatasetName, setFinancialDatasetName] = useState<string>('');
  const [financialResults, setFinancialResults] = useState<FinancialScenarioResult[]>(MOCK_FINANCIAL_RESULTS);
  const [selectedFinancialId, setSelectedFinancialId] = useState<string>('fin_baseline');
  const [showDiff, setShowDiff] = useState(false);

  // ─── Timetable State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TimetableTab>('tree');
  const [promptText, setPromptText] = useState(MOCK_EXAMPLE_PROMPTS[0]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('sample_univ_v1');
  const [decisionSpec, setDecisionSpec] = useState<DecisionSpec | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>(['baseline', 'scenario_a', 'scenario_b', 'scenario_c']);
  const [selectedTimetableScenarioId, setSelectedTimetableScenarioId] = useState<string>('scenario_b');
  const [drawerScenario, setDrawerScenario] = useState<Scenario | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ─── Shared State ─────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  const addToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, title }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  };

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const h = await api.getHealth();
        setApiHealthy(h.status === 'ok');
      } catch {
        setApiHealthy(false);
      }
      try {
        const dss = await api.getDatasets();
        setDatasets(dss);
        if (dss.length > 0) setSelectedDatasetId(dss[0].id);
        const comp = await api.getComparison('dec_2026_01');
        setDecisionSpec(comp.decision_spec);
        setScenarios(comp.scenarios);
        setResults(comp.results);
        setComparison(comp);
      } catch (err: unknown) {
        addToast('error', err instanceof Error ? err.message : 'Failed to initialize', 'Connection Error');
      }
    };
    init();
  }, []);

  // ─── Timetable Pipeline ───────────────────────────────────────────────────
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning || !currentRunId) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }
    pollTimerRef.current = setInterval(async () => {
      try {
        const runStatus = await api.getRunStatus(currentRunId);
        setScenarios((prev) => prev.map((s) => ({ ...s, status: runStatus.scenarios[s.id] || s.status })));
        if (runStatus.progress_percent !== undefined) setRunProgress(runStatus.progress_percent);
        if (runStatus.overall_status === 'done') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIsRunning(false);
          setRunProgress(100);
          setStatusMessage('Optimization and Monte Carlo simulation completed!');
          const comp = await api.getComparison(runStatus.decision_id);
          setComparison(comp);
          setResults(comp.results);
          setScenarios(comp.scenarios);
          addToast('success', 'All scenarios evaluated with OR-Tools CP-SAT and Monte Carlo simulations.', 'Evaluation Complete');
        } else if (runStatus.overall_status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIsRunning(false);
          addToast('error', 'Solver encountered an error during scenario execution.', 'Run Failed');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [isRunning, currentRunId]);

  const handleRunPipeline = async (text: string, datasetId: string) => {
    setIsRunning(true);
    setRunProgress(10);
    setStatusMessage('Parsing natural language decision policy...');
    try {
      const spec = await api.createDecision(text, datasetId);
      setDecisionSpec(spec);
      if (spec.status !== 'ok') {
        setIsRunning(false);
        setRunProgress(0);
        addToast(spec.status === 'unsupported' ? 'error' : 'info', spec.message || 'Please check policy syntax.', spec.status === 'unsupported' ? 'Unsupported Domain' : 'Clarification Needed');
        return;
      }
      setRunProgress(30);
      setStatusMessage('Branching alternative scenarios from baseline...');
      const scList = await api.generateScenarios(spec.id);
      setScenarios(scList);
      setSelectedCompareIds(scList.map((s) => s.id));
      setRunProgress(45);
      setStatusMessage('Dispatched to OR-Tools CP-SAT solver pool...');
      const { run_id } = await api.runDecision(spec.id);
      setCurrentRunId(run_id);
      setActiveTab('tree');
    } catch (err: unknown) {
      setIsRunning(false);
      setRunProgress(0);
      addToast('error', err instanceof Error ? err.message : 'Pipeline execution failed', 'Run Error');
    }
  };

  const handleRunDemo = () => {
    setPromptText(MOCK_EXAMPLE_PROMPTS[0]);
    handleRunPipeline(MOCK_EXAMPLE_PROMPTS[0], selectedDatasetId);
  };

  const handleToggleCompare = (id: string) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) { addToast('info', 'Minimum 2 scenarios required for comparison.', 'Selection Limit'); return prev; }
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 4) { addToast('info', 'Maximum 4 scenarios can be compared side-by-side.', 'Selection Limit'); return prev; }
        return [...prev, id];
      }
    });
  };

  const handleOpenDrawer = (scenario: Scenario) => { setDrawerScenario(scenario); setIsDrawerOpen(true); };

  const handleBranch = async (parentId: string, name: string, change: ChangeSpec) => {
    try {
      const newScenario = await api.branchScenario(parentId, name, change);
      setScenarios((prev) => [...prev, newScenario]);
      setSelectedCompareIds((prev) => (prev.length < 4 ? [...prev, newScenario.id] : prev));
      addToast('success', `Created new child scenario "${newScenario.name}".`, 'Branch Created');
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Branching failed', 'Branch Error');
    }
  };

  const handleReset = () => {
    setPromptText(MOCK_EXAMPLE_PROMPTS[0]);
    if (comparison) { setDecisionSpec(comparison.decision_spec); setScenarios(comparison.scenarios); setResults(comparison.results); setSelectedCompareIds(comparison.scenarios.map((s) => s.id)); }
    setIsRunning(false);
    setRunProgress(0);
    addToast('info', 'Workspace reset to baseline state.', 'Reset Complete');
  };

  // ─── Financial Handlers ───────────────────────────────────────────────────
  const handleFinancialCommit = (datasetId: string, name: string) => {
    setFinancialDatasetId(datasetId);
    setFinancialDatasetName(name);
    setFinancialResults(MOCK_FINANCIAL_RESULTS);
    setSelectedFinancialId('fin_baseline');
    setFinancialTab('fork');
    addToast('success', `Baseline (Node 0) built for "${name}". Explore 4 competing forks below.`, 'Dataset Ready');
  };

  const handlePresetLoad = (presetId: string) => {
    setFinancialDatasetId(presetId);
    setFinancialResults(MOCK_FINANCIAL_RESULTS);
    setSelectedFinancialId('fin_baseline');
    setFinancialTab('fork');
  };

  // ─── Derived financial values ─────────────────────────────────────────────
  const selectedFinancialResult = financialResults.find(r => r.scenario_id === selectedFinancialId) ?? null;
  const baselineFinancialResult = financialResults.find(r => r.scenario_id === 'fin_baseline') ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[#090D16] text-slate-100 selection:bg-emerald-500/30 bg-grid-pattern">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#090D16]/90 backdrop-blur-xl border-b border-white/8 shadow-glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-glow">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">
                  Future<span className="text-emerald-400">Fork</span>
                </span>
                <span className="text-[10px] font-bold font-mono bg-white/8 text-slate-400 px-1.5 py-0.5 rounded border border-white/10">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                Drop CSV · Fork Future · Decide with Confidence
              </p>
            </div>
          </div>

          {/* Mode Switcher Pills */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setAppMode('financial')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                appMode === 'financial'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Financial Engine</span>
              <span className="sm:hidden">Finance</span>
            </button>
            <button
              onClick={() => setAppMode('timetable')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                appMode === 'timetable'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Timetable Engine</span>
              <span className="sm:hidden">Timetable</span>
            </button>
          </div>

          {/* Right side: API health + actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* API Health Dot */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
              <Circle
                className={`w-2 h-2 fill-current ${
                  apiHealthy === true ? 'text-emerald-500' : apiHealthy === false ? 'text-rose-500' : 'text-slate-600'
                }`}
              />
              <span>{apiHealthy === true ? 'API live' : apiHealthy === false ? 'API offline' : 'Connecting…'}</span>
            </div>

            {appMode === 'timetable' && (
              <>
                <Button size="sm" variant="outline" onClick={handleReset} disabled={isRunning} icon={<RotateCcw className="w-3.5 h-3.5" />} className="text-xs hidden md:inline-flex border-white/15 text-slate-300 hover:bg-white/8">
                  Reset
                </Button>
                <Button size="sm" variant="primary" onClick={handleRunDemo} loading={isRunning} icon={<Zap className="w-3.5 h-3.5 fill-white" />} className="text-xs shadow-sm">
                  {isRunning ? 'Solving…' : 'Run Demo'}
                </Button>
              </>
            )}

            {appMode === 'financial' && (
              <button
                onClick={() => { setFinancialTab('upload'); setFinancialDatasetId(null); setFinancialDatasetName(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 border border-white/10 bg-white/5 hover:bg-white/8 transition-all duration-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="w-full bg-white/5 h-0.5 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 transition-all duration-300"
              style={{ width: `${Math.max(5, runProgress)}%` }}
            />
          </div>
        )}
      </header>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ══════════════════════════════════════════════════════════════════
            FINANCIAL MODE
        ══════════════════════════════════════════════════════════════════ */}
        {appMode === 'financial' && (
          <div className="space-y-8 animate-in fade-in">
            {/* Financial mode hero */}
            <div className="text-center space-y-2 pt-2 pb-4">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Drop Your CSV. <span className="text-emerald-400">Fork Your Financial Future.</span>
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl mx-auto">
                Upload any bank statement or P&L — the CP-SAT solver + Monte Carlo engine generates 4 competing policy forks instantly.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-white/8 pb-0">
              <button
                onClick={() => setFinancialTab('upload')}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  financialTab === 'upload'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload & Build
              </button>
              <button
                onClick={() => { if (financialDatasetId) setFinancialTab('fork'); else addToast('info', 'Build a baseline first by uploading a CSV or choosing a preset.', 'Dataset Required'); }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  financialTab === 'fork'
                    ? 'border-emerald-500 text-emerald-400'
                    : financialDatasetId
                    ? 'border-transparent text-slate-500 hover:text-slate-300'
                    : 'border-transparent text-slate-600 cursor-not-allowed'
                }`}
              >
                <Layers className="w-4 h-4" />
                Fork & Compare
                {financialDatasetId && (
                  <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5">
                    {MOCK_FINANCIAL_SCENARIOS.length} forks
                  </span>
                )}
              </button>
            </div>

            {/* Upload Tab */}
            {financialTab === 'upload' && (
              <div className="animate-in fade-in">
                <UploadIngestor onCommit={handleFinancialCommit} onPresetLoad={handlePresetLoad} />
              </div>
            )}

            {/* Fork & Compare Tab */}
            {financialTab === 'fork' && financialDatasetId && (
              <div className="space-y-6 animate-in fade-in">
                {/* Dataset badge */}
                {financialDatasetName && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Dataset: <span className="text-slate-200 font-semibold">{financialDatasetName}</span></span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" checked={showDiff} onChange={e => setShowDiff(e.target.checked)} className="w-3.5 h-3.5 accent-amber-500" />
                        <span>Show diff vs baseline</span>
                      </label>
                    </span>
                  </div>
                )}

                {/* Scenario Tree (financial card mode) */}
                <section className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-emerald-500" />
                    Scenario Tree — Select a fork to explore
                  </h2>
                  <ScenarioTree
                    scenarios={scenarios}
                    results={results}
                    selectedCompareIds={selectedCompareIds}
                    onToggleCompare={handleToggleCompare}
                    onOpenDrawer={handleOpenDrawer}
                    onNavigateToCompare={() => {}}
                    financialMode={true}
                    financialResults={financialResults}
                    selectedFinancialId={selectedFinancialId}
                    onSelectFinancial={setSelectedFinancialId}
                  />
                </section>

                {/* Cash Flow Matrix */}
                <section className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-500" />
                    12-Month Cash Flow Matrix
                  </h2>
                  <CashFlowMatrix
                    result={selectedFinancialResult}
                    baselineResult={baselineFinancialResult}
                    showDiff={showDiff && selectedFinancialId !== 'fin_baseline'}
                  />
                </section>

                {/* Financial Comparison Dashboard */}
                <section className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                    Comparison Dashboard & Crisis Playground
                  </h2>
                  <ComparisonDashboard
                    scenarios={scenarios}
                    results={results}
                    selectedIds={selectedCompareIds}
                    financialMode={true}
                    financialResults={financialResults}
                    selectedFinancialId={selectedFinancialId}
                  />
                </section>

                {/* Explanation Panel for financial */}
                <section className="space-y-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    AI Decision Synthesis
                  </h2>
                  <ExplanationPanel
                    explanation={comparison?.explanation ?? null}
                    scenarios={scenarios}
                    results={results}
                    financialMode={true}
                    financialResults={financialResults}
                    selectedFinancialId={selectedFinancialId}
                    onHighlightMonth={(month) => console.debug('Highlight month', month)}
                  />
                </section>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TIMETABLE MODE
        ══════════════════════════════════════════════════════════════════ */}
        {appMode === 'timetable' && (
          <div className="space-y-8 animate-in fade-in">
            {/* Decision Input */}
            <section>
              <DecisionInput
                promptText={promptText}
                setPromptText={setPromptText}
                datasets={datasets}
                selectedDatasetId={selectedDatasetId}
                setSelectedDatasetId={setSelectedDatasetId}
                onRun={handleRunPipeline}
                isRunning={isRunning}
                decisionSpec={decisionSpec}
              />
            </section>

            {/* Tabs */}
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/8 gap-3">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(
                    [
                      { id: 'tree', label: 'Scenario Tree', icon: <GitBranch className="w-4 h-4 text-emerald-400" />, badge: scenarios.length },
                      { id: 'compare', label: 'Comparison', icon: <BarChart3 className="w-4 h-4 text-purple-400" />, badge: selectedCompareIds.length },
                      { id: 'timetable', label: 'Weekly Grid', icon: <Calendar className="w-4 h-4 text-cyan-400" />, badge: null },
                      { id: 'explanation', label: 'AI Synthesis', icon: <Sparkles className="w-4 h-4 text-amber-400" />, badge: null },
                    ] as { id: TimetableTab; label: string; icon: React.ReactNode; badge: number | null }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                        activeTab === tab.id
                          ? 'bg-white/10 text-white border-white/20 shadow-sm'
                          : 'bg-transparent text-slate-500 hover:text-slate-200 hover:bg-white/5 border-transparent'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {tab.badge !== null && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10">{tab.badge}</span>
                      )}
                    </button>
                  ))}
                </div>

                {isRunning && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>{statusMessage}</span>
                  </div>
                )}
              </div>

              <div>
                {activeTab === 'tree' && (
                  <ScenarioTree
                    scenarios={scenarios}
                    results={results}
                    selectedCompareIds={selectedCompareIds}
                    onToggleCompare={handleToggleCompare}
                    onOpenDrawer={handleOpenDrawer}
                    onNavigateToCompare={() => setActiveTab('compare')}
                  />
                )}
                {activeTab === 'compare' && (
                  <ComparisonDashboard
                    scenarios={scenarios}
                    results={results}
                    selectedIds={selectedCompareIds}
                  />
                )}
                {activeTab === 'timetable' && (
                  <TimetableGrid
                    scenarios={scenarios}
                    results={results}
                    selectedScenarioId={selectedTimetableScenarioId}
                    onSelectScenario={setSelectedTimetableScenarioId}
                  />
                )}
                {activeTab === 'explanation' && (
                  <ExplanationPanel
                    explanation={comparison?.explanation ?? null}
                    scenarios={scenarios}
                    results={results}
                  />
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Drawer */}
      <NodeDrawer
        scenario={drawerScenario}
        result={drawerScenario ? results[drawerScenario.id] : undefined}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onViewTimetable={(scId) => { setSelectedTimetableScenarioId(scId); setActiveTab('timetable'); }}
        onBranch={handleBranch}
      />

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#090D16] py-5 mt-12 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong className="text-slate-500">FutureFork</strong> · Elite Coders CodeSprint 2026 · Team FutureLabs
          </div>
          <div className="flex items-center gap-4 text-slate-700">
            <span>React 18 + Vite + Tailwind</span>
            <span>ReactFlow + Dagre</span>
            <span>Recharts</span>
            <span>Google OR-Tools CP-SAT · NumPy MC</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
