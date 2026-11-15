import React, { useState, useEffect, useRef } from 'react';
import { api } from './api/client';
import {
  DatasetSummary,
  DecisionSpec,
  Scenario,
  ScenarioResult,
  ComparisonResponse,
  ChangeSpec,
} from './contracts/types';
import { DecisionInput } from './components/DecisionInput';
import { ScenarioTree } from './components/ScenarioTree';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { TimetableGrid } from './components/TimetableGrid';
import { ExplanationPanel } from './components/ExplanationPanel';
import { NodeDrawer } from './components/NodeDrawer';
import { ToastContainer, ToastMessage } from './components/ui/Toast';
import { Button } from './components/ui/Button';
import { Badge } from './components/ui/Badge';
import {
  GitBranch,
  BarChart3,
  Calendar,
  Sparkles,
  Play,
  RotateCcw,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  LayoutGrid,
} from 'lucide-react';
import { MOCK_EXAMPLE_PROMPTS } from './mocks/fixtures';

export const App: React.FC = () => {
  // Navigation tabs
  type TabType = 'tree' | 'compare' | 'timetable' | 'explanation';
  const [activeTab, setActiveTab] = useState<TabType>('tree');

  // Input & Dataset State
  const [promptText, setPromptText] = useState(MOCK_EXAMPLE_PROMPTS[0]);
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('sample_univ_v1');

  // Decision & Pipeline State
  const [decisionSpec, setDecisionSpec] = useState<DecisionSpec | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<Record<string, ScenarioResult>>({});
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);

  // Execution & Polling State
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Scenario Selection for Comparison
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([
    'baseline',
    'scenario_a',
    'scenario_b',
    'scenario_c',
  ]);

  // Timetable Selected Scenario
  const [selectedTimetableScenarioId, setSelectedTimetableScenarioId] = useState<string>('scenario_b');

  // Drawer State
  const [drawerScenario, setDrawerScenario] = useState<Scenario | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', message: string, title?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initial Load: Datasets & Default Comparison
  useEffect(() => {
    const init = async () => {
      try {
        const dss = await api.getDatasets();
        setDatasets(dss);
        if (dss.length > 0) setSelectedDatasetId(dss[0].id);

        // Preload baseline mock state for immediate responsiveness
        const comp = await api.getComparison('dec_2026_01');
        setDecisionSpec(comp.decision_spec);
        setScenarios(comp.scenarios);
        setResults(comp.results);
        setComparison(comp);
      } catch (err: any) {
        addToast('error', err.message || 'Failed to initialize engine', 'Connection Error');
      }
    };
    init();
  }, []);

  // Polling Effect: Poll GET /runs/{run_id} every 1.5 seconds as per spec
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isRunning || !currentRunId) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const runStatus = await api.getRunStatus(currentRunId);

        // Update individual scenario statuses in the tree
        setScenarios((prev) =>
          prev.map((s) => ({
            ...s,
            status: runStatus.scenarios[s.id] || s.status,
          }))
        );

        if (runStatus.progress_percent !== undefined) {
          setRunProgress(runStatus.progress_percent);
        }

        if (runStatus.overall_status === 'done') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIsRunning(false);
          setRunProgress(100);
          setStatusMessage('Optimization and Monte Carlo simulation completed!');

          // Fetch final comparison data
          const comp = await api.getComparison(runStatus.decision_id);
          setComparison(comp);
          setResults(comp.results);
          setScenarios(comp.scenarios);

          addToast(
            'success',
            'All scenarios evaluated with OR-Tools CP-SAT and Monte Carlo simulations.',
            'Evaluation Complete'
          );
        } else if (runStatus.overall_status === 'failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setIsRunning(false);
          addToast('error', 'Solver encountered an error during scenario execution.', 'Run Failed');
        }
      } catch (err: any) {
        console.error('Polling error:', err);
      }
    }, 1500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isRunning, currentRunId]);

  // Main Pipeline Runner
  const handleRunPipeline = async (text: string, datasetId: string) => {
    setIsRunning(true);
    setRunProgress(10);
    setStatusMessage('Parsing natural language decision policy...');

    try {
      // Step 1: Parse decision
      const spec = await api.createDecision(text, datasetId);
      setDecisionSpec(spec);

      if (spec.status !== 'ok') {
        setIsRunning(false);
        setRunProgress(0);
        addToast(
          spec.status === 'unsupported' ? 'error' : 'info',
          spec.message || 'Please check policy syntax.',
          spec.status === 'unsupported' ? 'Unsupported Domain' : 'Clarification Needed'
        );
        return;
      }

      // Step 2: Branch Scenarios
      setRunProgress(30);
      setStatusMessage('Branching alternative scenarios from baseline...');
      const scList = await api.generateScenarios(spec.id);
      setScenarios(scList);
      setSelectedCompareIds(scList.map((s) => s.id));

      // Step 3: Start Run
      setRunProgress(45);
      setStatusMessage('Dispatched to OR-Tools CP-SAT solver pool...');
      const { run_id } = await api.runDecision(spec.id);
      setCurrentRunId(run_id);
      setActiveTab('tree');
    } catch (err: any) {
      setIsRunning(false);
      setRunProgress(0);
      addToast('error', err.message || 'Pipeline execution failed', 'Run Error');
    }
  };

  // Demo Button Handler
  const handleRunDemo = () => {
    setPromptText(MOCK_EXAMPLE_PROMPTS[0]);
    handleRunPipeline(MOCK_EXAMPLE_PROMPTS[0], selectedDatasetId);
  };

  // Toggle Scenario in Comparison
  const handleToggleCompare = (id: string) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) {
          addToast('info', 'Minimum 2 scenarios required for comparison.', 'Selection Limit');
          return prev;
        }
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 4) {
          addToast('info', 'Maximum 4 scenarios can be compared side-by-side.', 'Selection Limit');
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  // Open Drawer
  const handleOpenDrawer = (scenario: Scenario) => {
    setDrawerScenario(scenario);
    setIsDrawerOpen(true);
  };

  // Branch from drawer (Phase 2 stub)
  const handleBranch = async (parentId: string, name: string, change: ChangeSpec) => {
    try {
      const newScenario = await api.branchScenario(parentId, name, change);
      setScenarios((prev) => [...prev, newScenario]);
      setSelectedCompareIds((prev) => (prev.length < 4 ? [...prev, newScenario.id] : prev));
      addToast('success', `Created new child scenario "${newScenario.name}".`, 'Branch Created');
    } catch (err: any) {
      addToast('error', err.message || 'Branching failed', 'Branch Error');
    }
  };

  // Reset to Baseline
  const handleReset = () => {
    setPromptText(MOCK_EXAMPLE_PROMPTS[0]);
    if (comparison) {
      setDecisionSpec(comparison.decision_spec);
      setScenarios(comparison.scenarios);
      setResults(comparison.results);
      setSelectedCompareIds(comparison.scenarios.map((s) => s.id));
    }
    setIsRunning(false);
    setRunProgress(0);
    addToast('info', 'Workspace reset to baseline state.', 'Reset Complete');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-rose-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-rose-700 flex items-center justify-center text-white shadow-sm ring-2 ring-rose-200">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900">
                  Future<span className="text-brand-600">Fork</span>
                </span>
                <span className="text-[10px] font-bold font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  MVP v0.1
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                Simulate &gt; Compare &gt; Decide
              </p>
            </div>
          </div>

          {/* Action Buttons: Demo, Reset */}
          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isRunning}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              className="text-xs hidden md:inline-flex"
            >
              Reset
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={handleRunDemo}
              loading={isRunning}
              icon={<Zap className="w-3.5 h-3.5 fill-white" />}
              className="text-xs shadow-sm"
            >
              {isRunning ? 'Solving...' : 'Run Demo Flow'}
            </Button>
          </div>
        </div>

        {/* Live Progress Bar when running */}
        {isRunning && (
          <div className="w-full bg-slate-100 h-1 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-600 via-purple-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(5, runProgress)}%` }}
            />
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Section 1: Decision Input Page */}
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

        {/* Section 2: Navigation Tabs for Exploration */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('tree')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                  activeTab === 'tree'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <GitBranch className="w-4 h-4 text-brand-500" />
                <span>Scenario Tree (USP)</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/20">
                  {scenarios.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('compare')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                  activeTab === 'compare'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-purple-500" />
                <span>Comparison Dashboard</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/20">
                  {selectedCompareIds.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('timetable')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                  activeTab === 'timetable'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>Weekly Timetable Grid</span>
              </button>

              <button
                onClick={() => setActiveTab('explanation')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border ${
                  activeTab === 'explanation'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>AI Synthesis &amp; Trade-offs</span>
              </button>
            </div>

            {/* Quick status text */}
            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>{statusMessage}</span>
              </div>
            )}
          </div>

          {/* Active Tab View */}
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
                explanation={comparison?.explanation || null}
                scenarios={scenarios}
                results={results}
              />
            )}
          </div>
        </section>
      </main>

      {/* Side Drawer for Scenario Details & Branching */}
      <NodeDrawer
        scenario={drawerScenario}
        result={drawerScenario ? results[drawerScenario.id] : undefined}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onViewTimetable={(scId) => {
          setSelectedTimetableScenarioId(scId);
          setActiveTab('timetable');
        }}
        onBranch={handleBranch}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>FutureFork</strong> &bull; Elite Coders CodeSprint 2026 &bull; Team FutureLabs
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>React + Vite + Tailwind</span>
            <span>React Flow + Dagre</span>
            <span>Recharts</span>
            <span>Google OR-Tools CP-SAT</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
