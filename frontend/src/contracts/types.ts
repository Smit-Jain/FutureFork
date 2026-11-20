// Synced copy from contracts/types.ts

// ─── Financial Types ───────────────────────────────────────────────────────

export interface ColumnMapping {
  date_col: string;
  amount_col: string;
  description_col: string;
  category_col?: string;
  balance_col?: string;
  raw_columns: string[];
  preview_rows: Record<string, string>[];
}

export interface InspectResponse {
  dataset_id: string;
  filename: string;
  row_count: number;
  column_mapping: ColumnMapping;
  date_range: { start: string; end: string };
  total_inflow: number;
  total_outflow: number;
  net_balance: number;
}

export interface CommitRequest {
  dataset_id: string;
  name: string;
  column_mapping: ColumnMapping;
  opening_balance: number;
  emergency_floor: number;
}

export interface CommitResponse {
  dataset_id: string;
  name: string;
  status: 'committed';
  baseline_metrics: FinancialMetrics;
}

export interface FinancialMetrics {
  cash_out_risk_pct: number;      // 0–100 probability of going below floor
  p10_worst_balance: number;      // ₹ — 10th percentile worst balance
  lowest_balance_month: string;   // e.g. "Aug 2025"
  runway_months: number;          // months of positive balance remaining
  survival_score_pct: number;     // 0–100 composite score
}

export interface FinancialSimulation {
  per_metric: {
    cash_out_risk_pct: { p10: number; p90: number; mean: number; std: number };
    survival_score_pct: { p10: number; p90: number; mean: number; std: number };
    runway_months: { p10: number; p90: number; mean: number; std: number };
    p10_worst_balance: { p10: number; p90: number; mean: number; std: number };
    [key: string]: { p10: number; p90: number; mean: number; std: number };
  };
  prob_cash_out: number;  // 0–1
  monthly_balances: number[]; // 12 monthly balance snapshots
  balance_p10: number[];      // 12-month P10 band
  balance_p90: number[];      // 12-month P90 band
}

export interface CashFlowTimetable {
  months: string[];  // e.g. ["Apr 25","May 25",...]
  categories: {
    name: string;
    type: 'fixed' | 'flexible';
    values: number[]; // ₹ per month, 12 values
  }[];
}

export interface FinancialScenarioResult {
  scenario_id: string;
  solver: { status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE'; objective: number; runtime_s: number };
  metrics: FinancialMetrics;
  simulation: FinancialSimulation;
  timetable: CashFlowTimetable;
  explanation: string | null;
}

// ─── Existing Timetable Types ──────────────────────────────────────────────

export type MetricDirection = 'minimize' | 'maximize';

export type MetricName =
  | 'student_clashes'
  | 'faculty_clashes'
  | 'room_utilization'
  | 'avg_student_gaps';

export interface Objective {
  metric: MetricName;
  direction: MetricDirection;
}

export interface Constraint {
  kind: string;
  params: Record<string, unknown>;
}

export type ChangeType = 'shift_time_window' | 'room_change' | 'faculty_load_cap';

export interface ShiftTimeWindowParams {
  from: 'morning' | 'afternoon';
  to: 'morning' | 'afternoon';
  selection: 'all' | 'electives' | 'labs' | 'lowest_enrollment_n' | 'explicit_ids';
  ids?: string[];
  n?: number;
}

export interface RoomChangeParams {
  action: 'remove' | 'add';
  room_ids?: string[];
  capacity?: number;
  type?: 'lecture' | 'lab';
}

export interface FacultyLoadCapParams {
  max_hours_per_week: number;
}

export interface ChangeSpec {
  type: ChangeType;
  params: ShiftTimeWindowParams | RoomChangeParams | FacultyLoadCapParams | Record<string, unknown>;
}

export type DecisionStatus = 'ok' | 'needs_clarification' | 'unsupported';

export interface DecisionSpec {
  id: string;
  text: string;
  dataset_id: string;
  objectives: Objective[];
  constraints: Constraint[];
  change: ChangeSpec;
  status: DecisionStatus;
  message: string | null;
}

export type ScenarioStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Scenario {
  id: string;
  decision_id: string;
  parent_id: string | null;
  name: string;
  description: string;
  change: ChangeSpec;
  status: ScenarioStatus;
}

export interface SolverInfo {
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'TIMEOUT' | 'UNKNOWN';
  objective: number;
  runtime_s: number;
}

export interface ScenarioMetrics {
  student_clashes: number;
  faculty_clashes: number;
  room_utilization: number;
  avg_student_gaps: number;
  capacity_fit?: number;
}

export interface MetricDistribution {
  mean: number;
  std: number;
  p10: number;
  p90: number;
}

export interface SimulationResult {
  n_runs: number;
  per_metric: {
    student_clashes: MetricDistribution;
    faculty_clashes: MetricDistribution;
    room_utilization: MetricDistribution;
    avg_student_gaps: MetricDistribution;
    [key: string]: MetricDistribution;
  };
  prob_zero_clashes: number;
}

export interface TimetableAssignment {
  event_id: string;
  course: string;
  faculty: string;
  group: string;
  room: string;
  day: number;
  slot: number;
  clash: boolean;
  clash_reasons?: string[];
}

export interface ScenarioResult {
  scenario_id: string;
  solver: SolverInfo;
  metrics: ScenarioMetrics;
  simulation: SimulationResult;
  timetable: TimetableAssignment[];
  explanation: string | null;
}

export interface RunStatus {
  run_id: string;
  decision_id: string;
  overall_status: 'queued' | 'running' | 'done' | 'failed';
  scenarios: Record<string, ScenarioStatus>;
  progress_percent?: number;
}

export interface ExplanationPayload {
  summary: string;
  tradeoffs: Record<string, string>;
  recommendation: string;
  model_generated: boolean;
}

export interface ComparisonResponse {
  decision_id: string;
  decision_spec: DecisionSpec;
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  explanation: ExplanationPayload;
}

export interface DatasetSummary {
  id: string;
  name: string;
  description: string;
  stats: {
    events_count: number;
    faculty_count: number;
    rooms_count: number;
    groups_count: number;
    students_count: number;
    slots_per_day: number;
    days_count: number;
  };
  baseline_metrics: ScenarioMetrics;
  financial_stats?: {
    total_inflow: number;
    total_outflow: number;
    net_balance: number;
    opening_balance: number;
    emergency_floor: number;
    months_of_data: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
}
