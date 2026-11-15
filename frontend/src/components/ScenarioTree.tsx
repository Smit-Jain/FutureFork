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
import { Scenario, ScenarioResult } from '../contracts/types';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { GitBranch, BarChart3, CheckSquare, Sparkles, RefreshCw } from 'lucide-react';

interface ScenarioTreeProps {
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  selectedCompareIds: string[];
  onToggleCompare: (id: string) => void;
  onOpenDrawer: (scenario: Scenario) => void;
  onNavigateToCompare: () => void;
}

const nodeTypes = {
  scenarioNode: CustomScenarioNode,
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 180;

// Generically lay out nodes and edges using dagre graph based on parent_id
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

  // Determine accent colors
  const getAccentColor = (scenario: Scenario): CustomNodeData['accentColor'] => {
    if (scenario.id === 'baseline' || scenario.parent_id === null) return 'baseline';
    if (scenario.id === 'scenario_a' || scenario.name.includes('Scenario A')) return 'scenarioA';
    if (scenario.id === 'scenario_b' || scenario.name.includes('Scenario B')) return 'scenarioB';
    if (scenario.id === 'scenario_c' || scenario.name.includes('Scenario C')) return 'scenarioC';
    return 'other';
  };

  const nodes: Node<CustomNodeData>[] = [];
  const edges: Edge[] = [];

  // Register nodes with dagre
  scenarios.forEach((scenario) => {
    dagreGraph.setNode(scenario.id, { width: NODE_WIDTH, height: NODE_HEIGHT });

    const accent = getAccentColor(scenario);
    nodes.push({
      id: scenario.id,
      type: 'scenarioNode',
      position: { x: 0, y: 0 }, // will be set by dagre
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

  // Build edges generically from parent_id
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
          opacity: isRunning ? 0.9 : 0.8,
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

  // Apply positions computed by dagre
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

export const ScenarioTree: React.FC<ScenarioTreeProps> = ({
  scenarios,
  results,
  selectedCompareIds,
  onToggleCompare,
  onOpenDrawer,
  onNavigateToCompare,
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

  // Sync when layouted elements change
  React.useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const canCompare = selectedCompareIds.length >= 2 && selectedCompareIds.length <= 4;

  return (
    <div className="relative w-full h-[620px] rounded-2xl border border-slate-200 bg-slate-50/60 overflow-hidden shadow-soft">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-200/90 shadow-soft pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-brand-600" />
              Branching Scenario Tree
            </span>
          </div>

          <span className="text-xs text-slate-400 hidden md:inline">|</span>

          <div className="hidden md:flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600">Baseline</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="text-slate-600">Scenario A</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span className="text-slate-600">Scenario B</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-slate-600">Scenario C</span>
            </span>
          </div>
        </div>

        {/* Selection & Compare Action */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-xs text-slate-600 font-medium">
            <span className="font-bold text-brand-700">{selectedCompareIds.length}</span> of 4 selected
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

      {/* React Flow Canvas */}
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
        <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls className="!bg-white !border-slate-200 !shadow-soft !rounded-lg overflow-hidden" />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.accentColor === 'baseline') return '#10B981';
            if (n.data?.accentColor === 'scenarioA') return '#EF4444';
            if (n.data?.accentColor === 'scenarioB') return '#8B5CF6';
            if (n.data?.accentColor === 'scenarioC') return '#F59E0B';
            return '#94A3B8';
          }}
          className="!bottom-4 !right-4 !bg-white/90 !border-slate-200 !shadow-soft !rounded-lg"
          maskColor="rgba(241, 245, 249, 0.7)"
        />
      </ReactFlow>

      {/* Bottom Hint */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-xs border border-slate-200 text-[11px] text-slate-500 shadow-xs">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span>Click node to open drawer &bull; Check box to select for side-by-side comparison</span>
      </div>
    </div>
  );
};
