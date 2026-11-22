"""
FutureFork API contracts (source of truth).

These Pydantic models define the JSON the backend returns for evaluated scenarios and
comparisons. `contracts/types.ts` and `frontend/src/contracts/types.ts` mirror them, and
`contracts/openapi.json` is generated from the running app (`python scripts/export_openapi.py`).
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

BranchType = Literal["baseline", "upfront", "emi", "phased", "trim", "absorb", "delay", "phase_in"]
DecisionKind = Literal["one_time", "recurring_expense", "income_change"]
DecisionStatus = Literal["ok", "needs_clarification", "unsupported"]
ScenarioStatus = Literal["queued", "running", "done", "failed"]
CategoryType = Literal["fixed", "flexible"]


# ---------------------------------------------------------------------------
# Decisions & scenarios
# ---------------------------------------------------------------------------

class ChangeSpec(BaseModel):
    type: str = Field(..., description="baseline, or a fork type: upfront | emi | phased | trim | absorb | delay | phase_in")
    params: Dict[str, Any] = Field(default_factory=dict, description="PurchaseGoal fields")


class Scenario(BaseModel):
    id: str
    decision_id: str
    parent_id: Optional[str] = None
    name: str
    description: str
    change: ChangeSpec
    status: ScenarioStatus


class RunStatus(BaseModel):
    run_id: str
    decision_id: str
    overall_status: ScenarioStatus
    scenarios: Dict[str, ScenarioStatus]
    progress_percent: Optional[float] = None


# ---------------------------------------------------------------------------
# Evaluated scenario (FinancialScenarioResult)
# ---------------------------------------------------------------------------

class SolverInfo(BaseModel):
    status: str = Field(..., description="OPTIMAL | FEASIBLE | INFEASIBLE | UNKNOWN")
    solver: Optional[str] = None
    runtime_s: float


class FinancialMetrics(BaseModel):
    cash_out_risk_pct: float = Field(..., description="% of Monte Carlo runs that go below ₹0")
    floor_breach_risk_pct: float = Field(..., description="% of runs that breach the emergency floor")
    survival_score_pct: float = Field(..., description="Composite solvency / floor-preservation score")
    p10_worst_balance: float = Field(..., description="10th-percentile lowest balance across runs (₹)")
    lowest_balance: float = Field(..., description="Deterministic lowest closing balance (₹)")
    lowest_balance_month: str
    months_below_floor: int
    runway_months: float
    ending_balance: float
    emergency_floor: float
    total_purchase_cost: float
    total_financing_interest: float
    total_trims_saved: float
    income_change_total: float = Field(0.0, description="Change in total income over the horizon (₹)")
    monthly_emi: Optional[float] = None
    remaining_loan_principal: Optional[float] = Field(None, description="Loan principal still owed after 12 months (₹)")


class MetricDistribution(BaseModel):
    mean: float
    std: float
    p10: float
    p90: float


class FinancialSimulation(BaseModel):
    n_runs: int
    prob_cash_out: float = Field(..., description="0–1")
    monthly_balances: List[float] = Field(..., description="Deterministic closing balance per month")
    balance_p10: List[float] = Field(..., description="Monte Carlo P10 balance per month")
    balance_p90: List[float] = Field(..., description="Monte Carlo P90 balance per month")
    per_metric: Dict[str, MetricDistribution]


class CashFlowCategory(BaseModel):
    name: str
    type: CategoryType
    values: List[float] = Field(..., description="Outflow per month (₹), after any trims")


class CashFlowMatrix(BaseModel):
    months: List[str]
    projected: List[bool] = Field(default_factory=list, description="True for months projected from averages")
    inflows: List[float]
    purchase_cash_out: List[float]
    categories: List[CashFlowCategory]


class FinancialScenarioResult(BaseModel):
    scenario_id: str
    decision_id: Optional[str] = None
    branch_type: BranchType
    name: Optional[str] = None
    description: Optional[str] = Field(None, description="What this fork did, e.g. the start month the solver chose")
    is_feasible: bool
    purchase_month: int = Field(..., description="Month index of the (first) purchase; -1 for baseline")
    solver: SolverInfo
    metrics: FinancialMetrics
    simulation: FinancialSimulation
    cash_flow: CashFlowMatrix
    category_trims: Dict[str, float] = Field(default_factory=dict, description="category -> cut fraction")
    explanation: Optional[str] = None


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

class Explanation(BaseModel):
    summary: str
    source: str = Field(..., description="llm | template | none")
    guard_passed: bool = Field(..., description="True if every number passed the Numeric Guard")
    violations: List[Dict[str, Any]] = Field(default_factory=list)


class ComparisonResponse(BaseModel):
    decision_id: str
    decision_spec: Dict[str, Any]
    scenarios: List[Scenario]
    results: Dict[str, FinancialScenarioResult]
    explanation: Explanation
    answer: Optional[Dict[str, Any]] = Field(
        None, description="Max safe amount, best month and shortfall for one-time decisions (engine/answers.py)"
    )


# ---------------------------------------------------------------------------
# Crisis Playground (engine-backed stress test)
# ---------------------------------------------------------------------------

class StressRequest(BaseModel):
    inflow_delay_days: float = Field(0.0, ge=0, le=90, description="Every inflow arrives this many days late")
    surprise_outflow: float = Field(0.0, ge=0, description="One-off unexpected bill in the first month (₹)")
    spend_increase_pct: float = Field(0.0, ge=-50, le=100, description="All regular spending is this % higher")
    income_change_pct: float = Field(0.0, ge=-100, le=100, description="Every month's income changes by this % (-15 = a 15% drop)")
    emergency_floor: Optional[float] = Field(None, ge=0, description="Score against this floor (₹); default: the plan's")


class StressedResult(BaseModel):
    scenario_id: str
    branch_type: BranchType
    survival_score_pct: float
    cash_out_risk_pct: float
    floor_breach_risk_pct: float
    p10_worst_balance: float = Field(..., description="10th-percentile lowest balance under stress (₹)")
    p50_worst_balance: float = Field(..., description="Median lowest balance under stress (₹)")
    balance_p10: List[float] = Field(..., description="Monte Carlo P10 balance per month under stress")
    balance_p50: List[float] = Field(..., description="Monte Carlo P50 balance per month under stress")
    balance_p90: List[float] = Field(..., description="Monte Carlo P90 balance per month under stress")


class StressResponse(BaseModel):
    decision_id: str
    stress: StressRequest
    emergency_floor: float = Field(..., description="Floor the results were scored against (₹)")
    n_runs: int
    runtime_ms: float = Field(..., description="Total engine time for all forks")
    results: Dict[str, StressedResult]


# ---------------------------------------------------------------------------
# Accounts & history
# ---------------------------------------------------------------------------

class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None


class AuthConfig(BaseModel):
    google_client_id: Optional[str] = Field(None, description="OAuth client ID for Google Identity Services")
    dev_login: bool = Field(False, description="True when POST /auth/dev-login is enabled (development only)")


class HistoryItem(BaseModel):
    id: str
    text: str
    dataset_id: str
    dataset_name: str
    status: DecisionStatus
    decision_kind: Optional[DecisionKind] = None
    understood: Optional[str] = None
    run_status: Optional[ScenarioStatus] = Field(None, description="Latest run's overall status, if it was run")
    created_at: Optional[str] = None


class HistoryResponse(BaseModel):
    items: List[HistoryItem]


# ---------------------------------------------------------------------------
# ITR helper (engine/tax). Every amount is computed by the tax engine.
# ---------------------------------------------------------------------------

TaxpayerType = Literal["salaried", "freelancer", "business"]
AgeBand = Literal["below_60", "60_to_80", "above_80"]
Regime = Literal["new", "old"]


class TaxInputsModel(BaseModel):
    """What the taxpayer tells us. Annual rupees; all optional except the basics."""

    fy: str = "2025-26"
    taxpayer_type: TaxpayerType = "salaried"
    age_band: AgeBand = "below_60"
    resident: bool = True
    basic_da: float = Field(0, ge=0)
    hra_received: float = Field(0, ge=0)
    other_salary: float = Field(0, ge=0)
    employer_nps: float = Field(0, ge=0)
    professional_tax: float = Field(0, ge=0)
    rent_paid: float = Field(0, ge=0)
    metro_city: bool = False
    gross_receipts: float = Field(0, ge=0)
    digital_receipts: float = Field(0, ge=0)
    declared_profit: float = Field(0, ge=0)
    home_loan_interest: float = Field(0, ge=0)
    let_out_rent: float = Field(0, ge=0)
    let_out_municipal_tax: float = Field(0, ge=0)
    let_out_loan_interest: float = Field(0, ge=0)
    savings_interest: float = Field(0, ge=0)
    deposit_interest: float = Field(0, ge=0)
    dividends: float = Field(0, ge=0)
    other_income: float = Field(0, ge=0)
    stcg_111a: float = Field(0, ge=0)
    ltcg_112a: float = Field(0, ge=0)
    d_80c: float = Field(0, ge=0)
    d_80ccd1b: float = Field(0, ge=0)
    d_80d_self: float = Field(0, ge=0)
    d_80d_parents: float = Field(0, ge=0)
    parents_senior: bool = False
    d_80e: float = Field(0, ge=0)
    tds: float = Field(0, ge=0)
    tcs: float = Field(0, ge=0)
    advance_tax: float = Field(0, ge=0)


class TaxLine(BaseModel):
    key: str
    label: str
    amount: float
    kind: str = Field(..., description="income | exemption | deduction | subtotal | tax | relief | total | paid | result | info")
    section: str = ""


class TaxPresumptive(BaseModel):
    section: Optional[str] = None
    income: float
    within_limit: bool
    limit: float


class TaxBreakdown(BaseModel):
    regime: Regime
    gross_total_income: float
    total_deductions: float
    taxable_income: float
    slab_tax: float
    special_rate_tax: float
    rebate: float
    surcharge: float
    cess: float
    total_tax: float
    taxes_paid: float
    payable: float
    refund: float
    effective_rate_pct: float
    heads: Dict[str, float]
    exemptions: Dict[str, float]
    deductions: Dict[str, float]
    presumptive: TaxPresumptive
    lines: List[TaxLine]
    notes: List[str]


class FilingWindow(BaseModel):
    status: Literal["planning", "on_time", "belated", "closed"]
    section: Optional[str] = None
    due_date: str
    belated_until: str
    old_regime_allowed: bool
    message: str


class ItrFormChoice(BaseModel):
    form: Literal["ITR-1", "ITR-2", "ITR-3", "ITR-4"]
    name: str
    supported: bool
    reasons: List[str]


class TaxVerdict(BaseModel):
    headline: str
    subline: str
    result: str
    outcome: Literal["refund", "payable", "settled"]
    outcome_amount: float
    regime: Regime
    saving_vs_other: float


class TaxMove(BaseModel):
    key: str
    title: str
    detail: str
    extra_outlay: float
    tax_before: float
    tax_after: float
    saving: float
    regime_after: Regime
    benefit: bool
    locks_money: bool


class TaxSavings(BaseModel):
    fy: str = Field(..., description="Year the moves are evaluated for (the next planning year)")
    baseline_tax: float
    baseline_regime: Regime
    moves: List[TaxMove]


class ChecklistField(BaseModel):
    label: str
    value: float
    where: str = Field(..., description="Where it goes on the e-filing portal")


class ChecklistStep(BaseModel):
    n: int
    title: str
    detail: str
    fields: List[ChecklistField]


class FilingChecklist(BaseModel):
    form: str
    regime: Regime
    steps: List[ChecklistStep]
    documents: List[str]


class TaxExplanation(BaseModel):
    text: str
    source: Literal["llm", "template"]
    guard_passed: bool


class TaxReport(BaseModel):
    fy: str
    ay: str
    rules_status: Literal["filing", "planning"]
    as_of: str
    inputs: TaxInputsModel
    new: TaxBreakdown
    old: TaxBreakdown
    cheaper: Regime
    recommended: Regime
    regime_saving: float
    window: FilingWindow
    late_fee: float
    form: ItrFormChoice
    verdict: TaxVerdict
    savings: TaxSavings
    checklist: FilingChecklist
    explanation: Optional[TaxExplanation] = None


class TaxProfile(BaseModel):
    id: str
    label: str
    fy: str
    inputs: TaxInputsModel
    report: Optional[TaxReport] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TaxProfileSummary(BaseModel):
    id: str
    label: str
    fy: str
    taxpayer_type: TaxpayerType
    headline: Optional[str] = None
    form: Optional[str] = None
    updated_at: Optional[str] = None


class TaxProfileList(BaseModel):
    items: List[TaxProfileSummary]


class TaxProfileSave(BaseModel):
    label: Optional[str] = Field(None, max_length=120)
    inputs: TaxInputsModel


class TaxYearInfo(BaseModel):
    fy: str
    ay: str
    status: Literal["filing", "planning"]
    standard_deduction_new: float
    standard_deduction_old: float
    rebate_limit_new: float
    cap_80c: float
    cap_80ccd1b: float
    cap_80d_self: float
    cap_80d_self_senior: float
    cap_80d_parents: float
    cap_80d_parents_senior: float
    cap_24b: float
    ltcg_112a_exempt: float
    limit_44ada: float
    limit_44ada_digital: float
    limit_44ad: float
    limit_44ad_digital: float
    due_date_salaried: str
    due_date_business: str
    belated_until: str


class TaxRulesResponse(BaseModel):
    default_fy: str
    years: List[TaxYearInfo]


class ApiError(BaseModel):
    error: str
    message: str
