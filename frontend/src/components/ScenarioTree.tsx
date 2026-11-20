import React, { useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { CustomScenarioNode, CustomNodeData } from './CustomScenarioNode';
import { Scenario, ScenarioResult, FinancialScenarioResult } from '../contracts/types';
import { Button } from './ui/Button';
import { GitBranch, BarChart3, Sparkles } from 'lucide-react';
import { MOCK_FINANCIAL_SCENARIOS, MOCK_FINANCIAL_RESULTS } from '../mocks/fixtures';

interface ScenarioTreeProps {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  selectedCompareIds: string[];
  onToggleCompare: (id: string) => void;
  onOpenDrawer: (scenario: Scenario) => void;
  onNavigateToCompare: () => void;
  // Financial mode props (optional)
  financialMode?: boolean;
  financialResults?: FinancialScenarioResult[];
  selectedFinancialId?: string;
  onSelectFinancial?: (id: string) => void;
}

const nodeTypes = {
  scenarioNode: CustomScenarioNode,
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 180;

function getLayoutedElements(
  scenarios: Scenario[],
  results: Record<string, ScenarioResult>,
  selectedCompareIds: string[],
  onToggleCompare: (id: string) => void,
  onOpenDrawer: (scenario: Scenario) => void
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });

  const getAccentColor = (scenario: Scenario): CustomNodeData['accentColor'] => {
    if (scenario.id === 'baseline' || scenario.parent_id === null) return 'baseline';
    if (scenario.id === 'scenario_a' || scenario.name.includes('Scenario A')) return 'scenarioA';
    if (scenario.id === 'scenario_b' || scenario.name.includes('Scenario B')) return 'scenarioB';
    if (scenario.id === 'scenario_c' || scenario.name.includes('Scenario C')) return 'scenarioC';
    return 'other';
  };

  const nodes: Node<CustomNodeData>[] = [];
  const edges: Edge[] = [];

  scenarios.forEach((scenario) => {
    dagreGraph.setNode(scenario.id, { width: NODE_WIDTH, height: NODE_HEIGHT });

    const accent = getAccentColor(scenario);
    nodes.push({
      id: scenario.id,
      type: 'scenarioNode',
      position: { x: 0, y: 0 },
      data: {
        scenario,
        result: results[scenario.id],
        isSelectedForCompare: selectedCompareIds.includes(scenario.id),
        onToggleCompare,
        onOpenDrawer,
        accentColor: accent,
      },
    });
  });

  scenarios.forEach((scenario) => {
    if (scenario.parent_id && dagreGraph.hasNode(scenario.parent_id)) {
      dagreGraph.setEdge(scenario.parent_id, scenario.id);

      const isRunning = scenario.status === 'running';
      const edgeColor =
        scenario.id === 'scenario_a'
          ? '#EF4444'
          : scenario.id === 'scenario_b'
          ? '#8B5CF6'
          : scenario.id === 'scenario_c'
          ? '#F59E0B'
          : '#94A3B8';

      edges.push({
        id: `e-${scenario.parent_id}-${scenario.id}`,
        source: scenario.parent_id,
        target: scenario.id,
        animated: isRunning,
        style: {
          stroke: edgeColor,
          strokeWidth: isRunning ? 3 : 2.5,
          opacity: isRunning ? 0.9 : 0.7,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor,
          width: 18,
          height: 18,
        },
      });
    }
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      };
    }
  });

  return { nodes, edges };
}

// Policy badge colors
const POLICY_COLORS: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  Baseline: { border: '#10B981', bg: 'rgba(16,185,129,0.08)', text: '#10B981', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  Upfront:  { border: '#06B6D4', bg: 'rgba(6,182,212,0.08)',  text: '#06B6D4', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  EMI:      { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', text: '#F59E0B', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  Phased:   { border: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', text: '#8B5CF6', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  Trim:     { border: '#F43F5E', bg: 'rgba(244,63,94,0.08)',  text: '#F43F5E', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
};

function getSurvivalBorderClass(score: number): string {
  if (score >= 90) return 'border-survival-high';
  if (score >= 70) return 'border-survival-mid';
  return 'border-survival-low';
}

interface FinancialNodeCardProps {
  fin: typeof MOCK_FINANCIAL_SCENARIOS[0];
  result: FinancialScenarioResult;
  selected: boolean;
  onSelect: () => void;
}

const FinancialNodeCard: React.FC<FinancialNodeCardProps> = ({ fin, result, selected, onSelect }) => {
  const colors = POLICY_COLORS[fin.policy] ?? POLICY_COLORS.Baseline;
  const { metrics } = result;
  const survivalClass = getSurvivalBorderClass(metrics.survival_score_pct);

  return (
    <div
      onClick={onSelect}
      className={`glass-card p-4 cursor-pointer transition-all duration-200 border-2
                  hover:scale-[1.02] hover:shadow-glass
                  ${selected ? 'border-opacity-100 shadow-glass' : 'border-opacity-40'}
                  ${survivalClass}`}
      style={{ borderColor: selected ? colors.border : undefined, background: selected ? colors.bg : undefined }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-md px-2 py-0.5 ${colors.badge}`}>
            {fin.policy}
          </span>
          <div className="text-xs font-semibold text-slate-200 mt-1.5 leading-snug">{fin.name}</div>
        </div>
        {selected && (
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Survival</div>
          <div className={`text-sm font-black font-mono tabular-nums ${
            metrics.survival_score_pct >= 90 ? 'text-emerald-400'
            : metrics.survival_score_pct >= 70 ? 'text-amber-400'
            : 'text-rose-400'
          }`}>
            {metrics.survival_score_pct}%
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Cash-Out Risk</div>
          <div className={`text-sm font-black font-mono tabular-nums ${
            metrics.cash_out_risk_pct <= 20 ? 'text-emerald-400'
            : metrics.cash_out_risk_pct <= 50 ? 'text-amber-400'
            : 'text-rose-400'
          }`}>
            {metrics.cash_out_risk_pct}%
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Runway</div>
          <div className="text-sm font-black font-mono tabular-nums text-cyan-400">
            {metrics.runway_months}mo
          </div>
        </div>
      </div>

      {/* Survival bar */}
      <div className="space-y-1">
        <div className="text-[9px] text-slate-500">Survival Score</div>
        <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${metrics.survival_score_pct}%`,
              backgroundColor: metrics.survival_score_pct >= 90 ? '#10B981' : metrics.survival_score_pct >= 70 ? '#F59E0B' : '#F43F5E',
            }}
          />
        </div>
      </div>

      {/* Description */}
      <p className="text-[10px] text-slate-500 leading-snug mt-2.5 line-clamp-2">{fin.description}</p>
    </div>
  );
};

export const ScenarioTree: React.FC<ScenarioTreeProps> = ({
  scenarios,
  results,
  selectedCompareIds,
  onToggleCompare,
  onOpenDrawer,
  onNavigateToCompare,
  financialMode = false,
  financialResults = MOCK_FINANCIAL_RESULTS,
  selectedFinancialId,
  onSelectFinancial,
}) => {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () =>
      getLayoutedElements(
        scenarios,
        results,
        selectedCompareIds,
        onToggleCompare,
        onOpenDrawer
      ),
    [scenarios, results, selectedCompareIds, onToggleCompare, onOpenDrawer]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  React.useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const canCompare = selectedCompareIds.length >= 2 && selectedCompareIds.length <= 4;

  // Financial mode: show card-based tree
  if (financialMode) {
    const finResultsMap = Object.fromEntries(financialResults.map(r => [r.scenario_id, r]));
    const baselineScenario = MOCK_FINANCIAL_SCENARIOS.find(s => s.parent_id === null);
    const childScenarios = MOCK_FINANCIAL_SCENARIOS.filter(s => s.parent_id !== null);

    return (
      <div className="space-y-5">
        {/* Baseline node */}
        {baselineScenario && finResultsMap[baselineScenario.id] && (
          <div className="max-w-sm">
            <FinancialNodeCard
              fin={baselineScenario}
              result={finResultsMap[baselineScenario.id]}
              selected={selectedFinancialId === baselineScenario.id}
              onSelect={() => onSelectFinancial?.(baselineScenario.id)}
            />
          </div>
        )}

        {/* Fork indicator */}
        <div className="flex items-center gap-3">
          <div className="w-px h-6 bg-white/10 ml-6" />
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-slate-600" />
            4 competing forks generated
          </div>
        </div>

        {/* Fork nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {childScenarios.map((fin) => {
            const r = finResultsMap[fin.id];
            if (!r) return null;
            return (
              <FinancialNodeCard
                key={fin.id}
                fin={fin}
                result={r}
                selected={selectedFinancialId === fin.id}
                onSelect={() => onSelectFinancial?.(fin.id)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Timetable mode: existing ReactFlow tree
  return (
    <div className="relative w-full h-[620px] rounded-2xl border border-white/10 bg-[#090D16] overflow-hidden shadow-glass">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/5 backdrop-blur-md p-3.5 rounded-xl border border-white/10 shadow-glass pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-emerald-500" />
              Branching Scenario Tree
            </span>
          </div>

          <span className="text-xs text-slate-600 hidden md:inline">|</span>

          <div className="hidden md:flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-500">Baseline</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-slate-500">Scenario A</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-slate-500">Scenario B</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-slate-500">Scenario C</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-emerald-400">{selectedCompareIds.length}</span> of 4 selected
          </div>

          <Button
            size="sm"
            variant="primary"
            disabled={!canCompare}
            onClick={onNavigateToCompare}
            icon={<BarChart3 className="w-3.5 h-3.5" />}
            className="text-xs shadow-sm"
          >
            Compare Selected ({selectedCompareIds.length})
          </Button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="rgba(255,255,255,0.04)" gap={28} size={1} variant={BackgroundVariant.Dots} />
        <Controls className="!bg-white/5 !border-white/10 !shadow-glass !rounded-lg overflow-hidden" />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.accentColor === 'baseline') return '#10B981';
            if (n.data?.accentColor === 'scenarioA') return '#EF4444';
            if (n.data?.accentColor === 'scenarioB') return '#8B5CF6';
            if (n.data?.accentColor === 'scenarioC') return '#F59E0B';
            return '#334155';
          }}
          className="!bottom-4 !right-4 !bg-[#090D16]/90 !border-white/10 !shadow-glass !rounded-lg"
          maskColor="rgba(9,13,22,0.7)"
        />
      </ReactFlow>

      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 backdrop-blur-xs border border-white/10 text-[11px] text-slate-500 shadow-xs">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span>Click node to open drawer • Check box to select for side-by-side comparison</span>
      </div>
    </div>
  );
};
