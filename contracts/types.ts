// FutureFork API contract (TypeScript mirror of contracts/schemas.py).
// Keep frontend/src/contracts/types.ts identical to this file.

export type BranchType = 'baseline' | 'upfront' | 'emi' | 'phased' | 'trim' | 'absorb' | 'delay' | 'phase_in';
export type ForkType = Exclude<BranchType, 'baseline'>;
export type DecisionKind = 'one_time' | 'recurring_expense' | 'income_change';
export type DatasetType = 'personal' | 'institute' | 'startup';
export type ScenarioStatus = 'queued' | 'running' | 'done' | 'failed';
export type DecisionStatus = 'ok' | 'needs_clarification' | 'unsupported';
export type CategoryType = 'fixed' | 'flexible';

// ─── Datasets ──────────────────────────────────────────────────────────────

export interface ColumnMapping {
  date_col: string;
  amount_col: string | null;
  debit_col: string | null;
  credit_col: string | null;
  category_col: string | null;
  description_col: string | null;
  type_col: string | null;
  balance_col: string | null;
  date_format: string | null;
  starting_balance: number;
}

export type ColumnRole = Exclude<keyof ColumnMapping, 'date_format' | 'starting_balance'>;

export interface InspectResponse {
  upload_id: string;
  filename: string;
  headers: string[];
  proposed_mapping: ColumnMapping;
  mapping_confidence: number;
  mapping_source: 'llm' | 'regex';
  dataset_type: DatasetType;
  preview_rows: Record<string, string>[];
  row_count: number;
  warnings: string[];
  ttl_seconds: number;
}

export interface CommitRequest {
  upload_id: string;
  confirmed_mapping: ColumnMapping;
  dataset_name?: string;
  starting_balance?: number;
  dataset_type?: DatasetType;
  monthly_income?: number;      // for expenses-only files
}

export interface DatasetStats {
  months: number;
  categories: number;
  starting_balance: number;
  total_inflow: number;
  total_outflow: number;
  category_types: Record<string, CategoryType>;
  observed_months?: number;
  projected_months?: number[];
  currency?: string;
  warnings?: string[];
}

export interface CommitResponse {
  dataset_id: string;
  name: string;
  dataset_type: DatasetType;
  stats: DatasetStats;
  baseline_metrics: Record<string, number | string | boolean>;
  warnings: string[];
}

export interface DatasetSummary {
  id: string;
  name: string;
  description: string;
  stats: DatasetStats;
  baseline_metrics: Record<string, number | string | boolean>;
}

// ─── Decisions & scenarios ─────────────────────────────────────────────────

export interface ChangeSpec {
  type: BranchType | string;
  params: Record<string, unknown>;
}

export interface DecisionSpec {
  id: string;
  text: string;
  dataset_id: string;
  dataset_type: DatasetType;
  decision_kind: DecisionKind | null;
  understood: string | null;      // plain-English summary of what was understood
  change: ChangeSpec;
  status: DecisionStatus;
  message: string | null;
}

export interface Scenario {
  id: string;
  decision_id: string;
  parent_id: string | null;
  name: string;
  description: string;
  change: ChangeSpec;
  status: ScenarioStatus;
}

export interface RunStatus {
  run_id: string;
  decision_id: string;
  overall_status: ScenarioStatus;
  scenarios: Record<string, ScenarioStatus>;
  progress_percent?: number;
}

// ─── Evaluated scenario ────────────────────────────────────────────────────

export interface FinancialMetrics {
  cash_out_risk_pct: number;      // % of Monte Carlo runs that go below ₹0
  floor_breach_risk_pct: number;  // % of runs that breach the emergency floor
  survival_score_pct: number;     // 0–100 composite score
  p10_worst_balance: number;      // ₹ — 10th percentile lowest balance
  lowest_balance: number;         // ₹ — deterministic lowest balance
  lowest_balance_month: string;   // e.g. "2024-09"
  months_below_floor: number;
  runway_months: number;
  ending_balance: number;
  emergency_floor: number;
  total_purchase_cost: number;
  total_financing_interest: number;
  total_trims_saved: number;
  income_change_total: number;
  monthly_emi?: number | null;
  remaining_loan_principal?: number | null;
}

export interface MetricDistribution {
  mean: number;
  std: number;
  p10: number;
  p90: number;
}

export interface FinancialSimulation {
  n_runs: number;
  prob_cash_out: number;          // 0–1
  monthly_balances: number[];     // 12 deterministic closing balances
  balance_p10: number[];          // 12-month Monte Carlo P10 band
  balance_p90: number[];          // 12-month Monte Carlo P90 band
  per_metric: Record<string, MetricDistribution>;
}

export interface CashFlowCategory {
  name: string;
  type: CategoryType;
  values: number[];               // ₹ per month, 12 values
}

export interface CashFlowMatrixData {
  months: string[];
  projected: boolean[];             // true for months projected from your averages
  inflows: number[];
  purchase_cash_out: number[];
  categories: CashFlowCategory[];
}

export interface FinancialScenarioResult {
  scenario_id: string;
  decision_id?: string | null;
  branch_type: BranchType;
  name?: string | null;
  description?: string | null;
  is_feasible: boolean;
  purchase_month: number;
  solver: { status: string; solver?: string | null; runtime_s: number };
  metrics: FinancialMetrics;
  simulation: FinancialSimulation;
  cash_flow: CashFlowMatrixData;
  category_trims: Record<string, number>;
  explanation: string | null;
}

// ─── Comparison ────────────────────────────────────────────────────────────

export interface Explanation {
  summary: string;
  source: 'llm' | 'template' | 'none';
  guard_passed: boolean;
  violations: Record<string, unknown>[];
}

export interface ComparisonResponse {
  decision_id: string;
  decision_spec: DecisionSpec;
  scenarios: Scenario[];
  results: Record<string, FinancialScenarioResult>;
  explanation: Explanation;
}

// ─── Crisis Playground (engine-backed stress test) ──────────────────────────

export interface StressRequest {
  inflow_delay_days: number;        // every inflow arrives this many days late
  surprise_outflow: number;         // one-off unexpected bill in the first month (₹)
  spend_increase_pct: number;       // all regular spending is this % higher
  income_change_pct?: number;       // every month's income changes by this % (-15 = a 15% drop)
  emergency_floor?: number | null;  // score against this floor; default: the plan's
}

export interface StressedResult {
  scenario_id: string;
  branch_type: BranchType;
  survival_score_pct: number;
  cash_out_risk_pct: number;
  floor_breach_risk_pct: number;
  p10_worst_balance: number;
  p50_worst_balance: number;
  balance_p10: number[];
  balance_p50: number[];
  balance_p90: number[];
}

export interface StressResponse {
  decision_id: string;
  stress: StressRequest;
  emergency_floor: number;
  n_runs: number;
  runtime_ms: number;
  results: Record<string, StressedResult>;
}

// ─── Accounts & history ───────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

export interface AuthConfig {
  google_client_id: string | null;
  dev_login: boolean;
}

export interface HistoryItem {
  id: string;
  text: string;
  dataset_id: string;
  dataset_name: string;
  status: DecisionStatus;
  decision_kind?: DecisionKind | null;
  understood?: string | null;
  run_status?: ScenarioStatus | null;
  created_at?: string | null;
}

export interface HistoryResponse {
  items: HistoryItem[];
}

export interface ApiError {
  error: string;
  message: string;
}
