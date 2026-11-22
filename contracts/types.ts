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

export interface AffordabilityAnswer {
  safe_now: number;
  max_safe_amount: number;
  best_month: string;
  best_month_index: number;
  cost: number;
  floor: number;
  fits: boolean;
  earliest_safe_month: string | null;
  shortfall: number;
  monthly_cut_to_close_gap: number;
  headroom_by_month: number[];
}

export interface ComparisonResponse {
  decision_id: string;
  decision_spec: DecisionSpec;
  scenarios: Scenario[];
  results: Record<string, FinancialScenarioResult>;
  explanation: Explanation;
  answer?: AffordabilityAnswer | null;
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

// ─── ITR helper (engine/tax) ──────────────────────────────────────────────

export type TaxpayerType = 'salaried' | 'freelancer' | 'business';
export type AgeBand = 'below_60' | '60_to_80' | 'above_80';
export type Regime = 'new' | 'old';

export interface TaxInputs {
  fy: string;
  taxpayer_type: TaxpayerType;
  age_band: AgeBand;
  resident: boolean;
  basic_da: number;
  hra_received: number;
  other_salary: number;
  employer_nps: number;
  professional_tax: number;
  rent_paid: number;
  metro_city: boolean;
  gross_receipts: number;
  digital_receipts: number;
  declared_profit: number;
  home_loan_interest: number;
  let_out_rent: number;
  let_out_municipal_tax: number;
  let_out_loan_interest: number;
  savings_interest: number;
  deposit_interest: number;
  dividends: number;
  other_income: number;
  stcg_111a: number;
  ltcg_112a: number;
  d_80c: number;
  d_80ccd1b: number;
  d_80d_self: number;
  d_80d_parents: number;
  parents_senior: boolean;
  d_80e: number;
  tds: number;
  tcs: number;
  advance_tax: number;
}

export interface TaxLine {
  key: string;
  label: string;
  amount: number;
  kind: string;
  section: string;
}

export interface TaxPresumptive {
  section: string | null;
  income: number;
  within_limit: boolean;
  limit: number;
}

export interface TaxBreakdown {
  regime: Regime;
  gross_total_income: number;
  total_deductions: number;
  taxable_income: number;
  slab_tax: number;
  special_rate_tax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total_tax: number;
  taxes_paid: number;
  payable: number;
  refund: number;
  effective_rate_pct: number;
  heads: Record<string, number>;
  exemptions: Record<string, number>;
  deductions: Record<string, number>;
  presumptive: TaxPresumptive;
  lines: TaxLine[];
  notes: string[];
}

export interface FilingWindow {
  status: 'planning' | 'on_time' | 'belated' | 'closed';
  section: string | null;
  due_date: string;
  belated_until: string;
  old_regime_allowed: boolean;
  message: string;
}

export interface ItrFormChoice {
  form: 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';
  name: string;
  supported: boolean;
  reasons: string[];
}

export interface TaxVerdict {
  headline: string;
  subline: string;
  result: string;
  outcome: 'refund' | 'payable' | 'settled';
  outcome_amount: number;
  regime: Regime;
  saving_vs_other: number;
}

export interface TaxMove {
  key: string;
  title: string;
  detail: string;
  extra_outlay: number;
  tax_before: number;
  tax_after: number;
  saving: number;
  regime_after: Regime;
  benefit: boolean;
  locks_money: boolean;
}

export interface TaxSavings {
  fy: string;
  baseline_tax: number;
  baseline_regime: Regime;
  moves: TaxMove[];
}

export interface ChecklistField {
  label: string;
  value: number;
  where: string;
}

export interface ChecklistStep {
  n: number;
  title: string;
  detail: string;
  fields: ChecklistField[];
}

export interface FilingChecklist {
  form: string;
  regime: Regime;
  steps: ChecklistStep[];
  documents: string[];
}

export interface TaxExplanation {
  text: string;
  source: 'llm' | 'template';
  guard_passed: boolean;
}

export interface TaxReport {
  fy: string;
  ay: string;
  rules_status: 'filing' | 'planning';
  as_of: string;
  inputs: TaxInputs;
  new: TaxBreakdown;
  old: TaxBreakdown;
  cheaper: Regime;
  recommended: Regime;
  regime_saving: number;
  window: FilingWindow;
  late_fee: number;
  form: ItrFormChoice;
  verdict: TaxVerdict;
  savings: TaxSavings;
  checklist: FilingChecklist;
  explanation: TaxExplanation | null;
}

export interface TaxProfile {
  id: string;
  label: string;
  fy: string;
  inputs: TaxInputs;
  report: TaxReport | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TaxProfileSummary {
  id: string;
  label: string;
  fy: string;
  taxpayer_type: TaxpayerType;
  headline: string | null;
  form: string | null;
  updated_at: string | null;
}

export interface TaxProfileList {
  items: TaxProfileSummary[];
}

export interface TaxYearInfo {
  fy: string;
  ay: string;
  status: 'filing' | 'planning';
  standard_deduction_new: number;
  standard_deduction_old: number;
  rebate_limit_new: number;
  cap_80c: number;
  cap_80ccd1b: number;
  cap_80d_self: number;
  cap_80d_self_senior: number;
  cap_80d_parents: number;
  cap_80d_parents_senior: number;
  cap_24b: number;
  ltcg_112a_exempt: number;
  limit_44ada: number;
  limit_44ada_digital: number;
  limit_44ad: number;
  limit_44ad_digital: number;
  due_date_salaried: string;
  due_date_business: string;
  belated_until: string;
}

export interface TaxRulesResponse {
  default_fy: string;
  years: TaxYearInfo[];
}

export interface ApiError {
  error: string;
  message: string;
}
