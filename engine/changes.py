"""
FutureFork Optimization Engine: Change Appliers & Branch Transformers
Member 2: OR-Tools CP-SAT Financial Solver & Branch Transformers

Provides:
- apply_upfront: Branch 1 - 100% upfront purchase in target/earliest feasible month.
- apply_emi_split: Branch 2 - Structured installment financing over 6/12 months with interest.
- apply_phased_delay: Branch 3 - Multi-milestone split (e.g. 50/50) avoiding debt/interest.
- apply_discretionary_trim: Branch 4 - Optimized cuts across flexible categories to protect reserve.
- apply_financial_change: Unified financial change dispatcher.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from engine.model import (
    FinancialProblemInstance,
    PurchaseGoal,
)

# ==============================================================================
# FINANCIAL BRANCH TRANSFORMERS (MEMBER 2)
# ==============================================================================

def apply_upfront(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 1: Upfront Purchase.
    Allocates 100% of purchase cost in target month (default Month 0) with 0% interest.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "upfront"
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    new_goal.interest_rate_annual = 0.0
    new_goal.emi_months = 1
    new_goal.downpayment = new_goal.total_cost
    new_goal.phased_splits = [{"month": new_goal.target_month, "pct": 1.0}]
    return new_goal


def apply_emi_split(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 2: EMI / Lease Financing.
    Spreads capital outlay across N months (default 6 or 12 months) with annual financing rate.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "emi"
    new_goal.emi_months = int(p.get("emi_months", p.get("months", new_goal.emi_months or 6)))
    if new_goal.emi_months < 2:
        new_goal.emi_months = 6

    # Downpayment percentage (e.g. 0.0 to 0.20)
    down_pct = float(p.get("downpayment_pct", 0.0))
    if down_pct > 0.0 and down_pct < 1.0:
        new_goal.downpayment = round(new_goal.total_cost * down_pct, 2)
    else:
        new_goal.downpayment = float(p.get("downpayment", 0.0))

    rate = p.get("interest_rate_annual", p.get("interest_rate", new_goal.interest_rate_annual))
    new_goal.interest_rate_annual = 0.10 if rate is None else float(rate)
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    return new_goal


def apply_phased_delay(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 3: Phased Split / Milestone Delay.
    Splits acquisition into milestones (e.g. 50% in Month 0, 50% in Month 6) without interest debt.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "phased"
    new_goal.interest_rate_annual = 0.0

    splits = p.get("phased_splits") or p.get("splits")
    if not splits:
        # Default smart split: 50% at target_month (Month 0), 50% at Month 5 or 6 (mid-cycle revenue peak)
        m1 = int(p.get("month_1", new_goal.target_month))
        m2 = int(p.get("month_2", min(11, m1 + 5)))
        pct1 = float(p.get("pct_1", 0.5))
        pct2 = float(p.get("pct_2", 0.5))
        splits = [
            {"month": m1, "pct": pct1},
            {"month": m2, "pct": pct2},
        ]

    new_goal.phased_splits = splits
    return new_goal


def apply_discretionary_trim(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    params: Optional[Dict[str, Any]] = None,
) -> PurchaseGoal:
    """
    Branch 4: Trim-and-Buy (Discretionary Expenditure Reduction).
    Enables minimum-pain cuts across flexible categories (e.g. up to 35% cut) while
    strictly safeguarding fixed categories (salaries, rent, utilities) and emergency reserves.
    """
    p = params or {}
    new_goal = copy.deepcopy(goal)
    new_goal.financing_mode = "trim"
    new_goal.target_month = int(p.get("target_month", new_goal.target_month))
    new_goal.max_trim_pct = float(p.get("max_trim_pct", p.get("max_cut", 0.35)))

    # Identify flexible categories from instance if not explicitly provided
    flex_cats = p.get("flexible_categories")
    if not flex_cats:
        flex_cats = [
            cat for cat, ctype in instance.category_types.items()
            if ctype == "flexible"
        ]
    new_goal.flexible_categories = flex_cats
    return new_goal


BRANCH_TYPES = ("upfront", "emi", "phased", "trim", "absorb", "delay", "phase_in")

# Forks evaluated for each kind of decision (baseline is always added first)
FORKS_BY_KIND = {
    "one_time": ("upfront", "emi", "phased", "trim"),
    "recurring_expense": ("absorb", "delay", "phase_in", "trim"),
    "income_change": ("absorb", "trim"),
}

_BRANCH_ALIASES = {
    # Order matters: more specific aliases first ("phased_delay" is phased, not delay)
    "phase_in": ("phase_in", "ramp"),
    "phased": ("phased", "phase", "milestone", "two_stage"),
    "absorb": ("absorb", "commit_now", "start_now", "do_nothing"),
    "delay": ("delay_start", "delay"),
    "upfront": ("upfront", "buy_now", "immediate"),
    "emi": ("emi", "lease", "loan", "installment", "instalment"),
    "trim": ("trim", "cut", "discretionary", "savings"),
}


def normalize_branch_type(change_type: str) -> str:
    """Maps a change type or alias (e.g. "phased_delay", "discretionary_trim") to a canonical fork type."""
    ct = str(change_type or "").lower()
    for canonical, aliases in _BRANCH_ALIASES.items():
        if any(a in ct for a in aliases):
            return canonical
    raise ValueError(
        f"Unsupported change type '{change_type}'. Supported fork types: {', '.join(BRANCH_TYPES)}"
    )


def apply_financial_change(
    instance: FinancialProblemInstance,
    change: Dict[str, Any],
    goal: Optional[PurchaseGoal] = None,
) -> PurchaseGoal:
    """
    Unified dispatcher for financial branch transformations.
    Accepts change spec dictionary and base PurchaseGoal.
    """
    change_type = str(change.get("type", "")).lower()
    params = change.get("params", {})

    base_goal = goal or PurchaseGoal.from_dict(params)

    appliers = {
        "upfront": apply_upfront,
        "emi": apply_emi_split,
        "phased": apply_phased_delay,
        "trim": apply_discretionary_trim,
    }
    return appliers[normalize_branch_type(change_type)](instance, base_goal, params)


# ==============================================================================
# DECISION ADJUSTMENTS (recurring costs and income changes)
# ==============================================================================

def _months_affected(goal: PurchaseGoal, T: int = 12) -> range:
    start = max(0, min(T - 1, int(goal.start_month or 0)))
    return range(start, min(T, start + max(1, int(goal.duration_months or T))))


def recurring_schedule(goal: PurchaseGoal, start_month: Optional[int] = None,
                       phase_in: bool = False, T: int = 12) -> List[float]:
    """Monthly cost of a recurring commitment over the horizon (optionally ramped in at 50% for 3 months)."""
    g = copy.copy(goal)
    if start_month is not None:
        g.start_month = start_month
    sched = [0.0] * T
    for i, t in enumerate(_months_affected(g, T)):
        factor = 0.5 if phase_in and i < 3 else 1.0
        sched[t] = round(float(goal.monthly_amount) * factor, 2)
    return sched


def adjust_instance(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
    recurring: Optional[List[float]] = None,
) -> FinancialProblemInstance:
    """
    Returns a copy of the baseline with the decision applied:
    - recurring_expense: adds the commitment as a new fixed category ("New: <label>").
    - income_change: scales (or shifts) inflows in the affected months.
    The original instance is never modified.
    """
    inst = copy.deepcopy(instance)
    T = len(inst.months)
    kind = goal.decision_kind

    if kind == "recurring_expense":
        sched = recurring if recurring is not None else recurring_schedule(goal, T=T)
        label = f"New: {goal.item_name}"[:48]
        inst.categories = list(inst.categories) + [label]
        inst.category_types = {**inst.category_types, label: "fixed"}
        inst.category_means = {**inst.category_means, label: round(sum(sched) / T, 2)}
        inst.category_stds = {**inst.category_stds, label: 0.0}
        inst.outflows = [list(row) + [sched[t]] for t, row in enumerate(inst.outflows)]
    elif kind == "income_change":
        months = set(_months_affected(goal, T))
        inst.inflows = [
            max(0.0, round(x * (1 + goal.income_change_pct / 100.0) + goal.income_change_monthly, 2))
            if t in months else x
            for t, x in enumerate(inst.inflows)
        ]

    inst.total_outflows = [round(sum(row), 2) for row in inst.outflows]
    inst.net_cash_flows = [round(inst.inflows[t] - inst.total_outflows[t], 2) for t in range(T)]
    bal, balances = inst.starting_balance, []
    for net in inst.net_cash_flows:
        bal += net
        balances.append(round(bal, 2))
    inst.cash_balances = balances
    return inst
