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
  params: Record<string, any>;
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
  params: ShiftTimeWindowParams | RoomChangeParams | FacultyLoadCapParams | Record<string, any>;
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
  parent_id: string | null; // null = baseline root
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
  room_utilization: number; // percentage (e.g. 78.5)
  avg_student_gaps: number; // hours (e.g. 1.25)
  capacity_fit?: number;    // secondary value percentage
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
  prob_zero_clashes: number; // probability between 0 and 1
}

export interface TimetableAssignment {
  event_id: string;
  course: string;
  faculty: string;
  group: string;
  room: string;
  day: number;  // 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri
  slot: number; // 0 to 7 (0-3 morning, 4-7 afternoon)
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

export interface ComparisonResponse {
  decision_id: string;
  decision_spec: DecisionSpec;
  scenarios: Scenario[];
  results: Record<string, ScenarioResult>;
  explanation: {
    summary: string;
    tradeoffs: Record<string, string>;
    recommendation: string;
    model_generated: boolean;
  };
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
}

export interface ApiError {
  error: string;
  message: string;
}
