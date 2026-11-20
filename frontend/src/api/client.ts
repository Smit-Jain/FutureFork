import {
  DatasetSummary,
  DecisionSpec,
  Scenario,
  ScenarioResult,
  RunStatus,
  ComparisonResponse,
  ChangeSpec,
  InspectResponse,
  CommitRequest,
  CommitResponse,
} from '../contracts/types';
import {
  MOCK_DATASET,
  MOCK_DECISION_SPEC,
  MOCK_SCENARIOS,
  MOCK_RESULTS,
  MOCK_COMPARISON_RESPONSE,
  MOCK_INSPECT_RESPONSE,
  MOCK_FINANCIAL_RESULTS,
} from '../mocks/fixtures';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// In-memory state for mock lifecycle and polling
let mockCurrentRun: {
  runId: string;
  decisionId: string;
  startTime: number;
  scenarios: Record<string, 'queued' | 'running' | 'done' | 'failed'>;
} | null = null;

let dynamicScenarios: Scenario[] = [...MOCK_SCENARIOS];
let dynamicResults: Record<string, ScenarioResult> = { ...MOCK_RESULTS };

export const api = {
  async getHealth(): Promise<{ status: string }> {
    if (USE_MOCKS) return { status: 'ok' };
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async getDatasets(): Promise<DatasetSummary[]> {
    if (USE_MOCKS) {
      return [
        MOCK_DATASET,
        {
          id: 'sample_univ_v2_small',
          name: 'Engineering Faculty Department (30 classes, 8 faculty, 4 rooms)',
          description: 'Compact departmental dataset for rapid simulation and stress testing.',
          stats: {
            events_count: 30,
            faculty_count: 8,
            rooms_count: 4,
            groups_count: 4,
            students_count: 120,
            slots_per_day: 8,
            days_count: 5,
          },
          baseline_metrics: {
            student_clashes: 4,
            faculty_clashes: 1,
            room_utilization: 72.0,
            avg_student_gaps: 1.2,
          },
        },
      ];
    }
    const res = await fetch(`${API_BASE_URL}/datasets`);
    if (!res.ok) throw new Error(`Failed to fetch datasets: ${res.statusText}`);
    return res.json();
  },

  async getDataset(id: string): Promise<DatasetSummary> {
    if (USE_MOCKS) return MOCK_DATASET;
    const res = await fetch(`${API_BASE_URL}/datasets/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch dataset: ${res.statusText}`);
    return res.json();
  },

  async createDecision(text: string, datasetId: string): Promise<DecisionSpec> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 600));

      const lower = text.toLowerCase();
      if (lower.includes('crypto') || lower.includes('bitcoin') || lower.includes('weather') || lower.includes('salary')) {
        return {
          id: `dec_${Date.now()}`,
          text,
          dataset_id: datasetId,
          objectives: [],
          constraints: [],
          change: { type: 'shift_time_window', params: {} },
          status: 'unsupported',
          message:
            'Unsupported decision domain. FutureFork MVP currently supports timetable & resource allocation: shift_time_window, room_change, and faculty_load_cap.',
        };
      }

      if (text.trim().length < 15 || lower.includes('fix everything') || lower.includes('make it better')) {
        return {
          id: `dec_${Date.now()}`,
          text,
          dataset_id: datasetId,
          objectives: [],
          constraints: [],
          change: { type: 'shift_time_window', params: {} },
          status: 'needs_clarification',
          message:
            'Please specify which classes or rooms to modify (e.g., "Move afternoon classes to the morning" or "Remove Room 101").',
        };
      }

      if (lower.includes('room 101') || lower.includes('remove room')) {
        return {
          id: `dec_${Date.now()}`,
          text,
          dataset_id: datasetId,
          objectives: [
            { metric: 'student_clashes', direction: 'minimize' },
            { metric: 'room_utilization', direction: 'maximize' },
          ],
          constraints: [],
          change: {
            type: 'room_change',
            params: { action: 'remove', room_ids: ['Room 101'] },
          },
          status: 'ok',
          message: null,
        };
      }

      if (lower.includes('faculty') && (lower.includes('cap') || lower.includes('hours') || lower.includes('15'))) {
        return {
          id: `dec_${Date.now()}`,
          text,
          dataset_id: datasetId,
          objectives: [
            { metric: 'faculty_clashes', direction: 'minimize' },
            { metric: 'avg_student_gaps', direction: 'minimize' },
          ],
          constraints: [{ kind: 'faculty_load_cap', params: { max_hours_per_week: 15 } }],
          change: {
            type: 'faculty_load_cap',
            params: { max_hours_per_week: 15 },
          },
          status: 'ok',
          message: null,
        };
      }

      return {
        ...MOCK_DECISION_SPEC,
        id: `dec_${Date.now()}`,
        text,
        dataset_id: datasetId,
      };
    }

    const res = await fetch(`${API_BASE_URL}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, dataset_id: datasetId }),
    });
    if (!res.ok) throw new Error(`Failed to create decision: ${res.statusText}`);
    return res.json();
  },

  async generateScenarios(decisionId: string): Promise<Scenario[]> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 500));
      dynamicScenarios = MOCK_SCENARIOS.map((s) => ({
        ...s,
        decision_id: decisionId,
        status: 'queued',
      }));
      return dynamicScenarios;
    }

    const res = await fetch(`${API_BASE_URL}/decisions/${decisionId}/scenarios`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to generate scenarios: ${res.statusText}`);
    return res.json();
  },

  async runDecision(decisionId: string): Promise<{ run_id: string }> {
    if (USE_MOCKS) {
      const runId = `run_${Date.now()}`;
      mockCurrentRun = {
        runId,
        decisionId,
        startTime: Date.now(),
        scenarios: {
          baseline: 'queued',
          scenario_a: 'queued',
          scenario_b: 'queued',
          scenario_c: 'queued',
        },
      };
      return { run_id: runId };
    }

    const res = await fetch(`${API_BASE_URL}/decisions/${decisionId}/run`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to start run: ${res.statusText}`);
    return res.json();
  },

  async getRunStatus(runId: string): Promise<RunStatus> {
    if (USE_MOCKS) {
      if (!mockCurrentRun || mockCurrentRun.runId !== runId) {
        return {
          run_id: runId,
          decision_id: 'dec_2026_01',
          overall_status: 'done',
          scenarios: {
            baseline: 'done',
            scenario_a: 'done',
            scenario_b: 'done',
            scenario_c: 'done',
          },
          progress_percent: 100,
        };
      }

      const elapsed = Date.now() - mockCurrentRun.startTime;
      const scenarios = { ...mockCurrentRun.scenarios };

      if (elapsed > 600) scenarios.baseline = 'done';
      else scenarios.baseline = 'running';

      if (elapsed > 2400) scenarios.scenario_a = 'done';
      else if (elapsed > 600) scenarios.scenario_a = 'running';

      if (elapsed > 3600) scenarios.scenario_b = 'done';
      else if (elapsed > 1200) scenarios.scenario_b = 'running';

      if (elapsed > 4600) scenarios.scenario_c = 'done';
      else if (elapsed > 2000) scenarios.scenario_c = 'running';

      const allDone = Object.values(scenarios).every((s) => s === 'done');
      const doneCount = Object.values(scenarios).filter((s) => s === 'done').length;
      const progress = Math.min(100, Math.round((doneCount / Object.keys(scenarios).length) * 100));

      return {
        run_id: runId,
        decision_id: mockCurrentRun.decisionId,
        overall_status: allDone ? 'done' : 'running',
        scenarios,
        progress_percent: progress,
      };
    }

    const res = await fetch(`${API_BASE_URL}/runs/${runId}`);
    if (!res.ok) throw new Error(`Failed to get run status: ${res.statusText}`);
    return res.json();
  },

  async getScenarioResult(scenarioId: string): Promise<ScenarioResult> {
    if (USE_MOCKS) {
      return dynamicResults[scenarioId] || MOCK_RESULTS.baseline;
    }
    const res = await fetch(`${API_BASE_URL}/scenarios/${scenarioId}/result`);
    if (!res.ok) throw new Error(`Failed to get scenario result: ${res.statusText}`);
    return res.json();
  },

  async getComparison(decisionId: string): Promise<ComparisonResponse> {
    if (USE_MOCKS) {
      return {
        ...MOCK_COMPARISON_RESPONSE,
        decision_id: decisionId,
        scenarios: dynamicScenarios,
        results: dynamicResults,
      };
    }
    const res = await fetch(`${API_BASE_URL}/decisions/${decisionId}/compare`);
    if (!res.ok) throw new Error(`Failed to get comparison: ${res.statusText}`);
    return res.json();
  },

  async branchScenario(parentScenarioId: string, name: string, change: ChangeSpec): Promise<Scenario> {
    if (USE_MOCKS) {
      const newId = `branch_${Date.now()}`;
      const newScenario: Scenario = {
        id: newId,
        decision_id: 'dec_2026_01',
        parent_id: parentScenarioId,
        name: name || `Branch of ${parentScenarioId}`,
        description: `Custom branch extending ${parentScenarioId} with ${change.type}.`,
        change,
        status: 'done',
      };
      dynamicScenarios.push(newScenario);

      dynamicResults[newId] = {
        scenario_id: newId,
        solver: { status: 'OPTIMAL', objective: 42.0, runtime_s: 3.1 },
        metrics: {
          student_clashes: 3,
          faculty_clashes: 0,
          room_utilization: 77.4,
          avg_student_gaps: 1.05,
          capacity_fit: 90.2,
        },
        simulation: {
          n_runs: 300,
          per_metric: {
            student_clashes: { mean: 3.2, std: 1.2, p10: 2, p90: 5 },
            faculty_clashes: { mean: 0.1, std: 0.3, p10: 0, p90: 0 },
            room_utilization: { mean: 77.0, std: 2.1, p10: 74, p90: 80 },
            avg_student_gaps: { mean: 1.08, std: 0.15, p10: 0.9, p90: 1.3 },
          },
          prob_zero_clashes: 0.25,
        },
        timetable: MOCK_RESULTS.scenario_b.timetable,
        explanation: 'Custom branch maintains excellent clash suppression with balanced room distribution.',
      };

      return newScenario;
    }

    const res = await fetch(`${API_BASE_URL}/scenarios/${parentScenarioId}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, change }),
    });
    if (!res.ok) throw new Error(`Failed to branch scenario: ${res.statusText}`);
    return res.json();
  },

  // ─── New Financial API Functions ─────────────────────────────────────────

  async inspectDataset(file: File): Promise<InspectResponse> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 800));
      return {
        ...MOCK_INSPECT_RESPONSE,
        filename: file.name,
        dataset_id: `inspect_${Date.now()}`,
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE_URL}/datasets/inspect`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Failed to inspect dataset: ${res.statusText}`);
    return res.json();
  },

  async commitDataset(payload: CommitRequest): Promise<CommitResponse> {
    if (USE_MOCKS) {
      await new Promise((r) => setTimeout(r, 600));
      const baseResult = MOCK_FINANCIAL_RESULTS[0];
      return {
        dataset_id: payload.dataset_id,
        name: payload.name,
        status: 'committed',
        baseline_metrics: baseResult.metrics,
      };
    }

    const res = await fetch(`${API_BASE_URL}/datasets/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to commit dataset: ${res.statusText}`);
    return res.json();
  },
};
