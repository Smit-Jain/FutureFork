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


class ApiError(BaseModel):
    error: str
    message: str
