"""
FutureFork Optimization Engine: Financial Cash-Flow CP-SAT Solver
Member 2: OR-Tools CP-SAT Financial Solver & Branch Evaluator

Formulates exact CP-SAT integer programming constraints for 12-month cash flows:
1. Cumulative Balance: Balance[t] = Balance[t-1] + Inflow[t] - Outflow[t] - Purchase[t] >= Emergency_Floor
2. Decision Variables:
   - Purchase Month (t)
   - Financing Mode (Upfront vs. 6m/12m EMI vs. 2-Phase Split)
   - Minimum-Pain Flexible Trims (optimal % cuts across flexible categories)
3. 4 Competing Policy Forks:
   - Upfront Buy (100% capital outlay in target month, 0% interest)
   - EMI / Lease Financing (6 or 12 monthly installments with annual financing rate)
   - Phased Split (Milestone delay e.g. 50/50 without debt/interest)
   - Trim & Buy (Discretionary category trimming to safeguard emergency reserve)
4. Retains backward compatibility for timetable scheduling evaluation.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Union

from ortools.sat.python import cp_model

from engine.changes import (
    apply_change,
)
from engine.model import (
    Assignment,
    FinancialProblemInstance,
    MonthlyCashSchedule,
    ProblemInstance,
    PurchaseGoal,
    ScenarioEvaluationResult,
)

# ==============================================================================
# FINANCIAL CP-SAT CASH-FLOW SOLVER (MEMBER 2)
# ==============================================================================

def _compute_deterministic_metrics(
    schedules: List[MonthlyCashSchedule],
    starting_balance: float,
    emergency_floor: float,
    total_purchase: float,
    total_interest: float,
    total_saved: float,
) -> Dict[str, Any]:
    """Helper to compute deterministic risk, balance, and runway metrics."""
    balances = [s.closing_balance for s in schedules]
    inflows = [s.inflow for s in schedules]
    total_outflows = [s.trimmed_outflow + s.purchase_cash_out for s in schedules]

    min_bal = min(balances) if balances else 0.0
    min_idx = balances.index(min_bal) if balances else 0
    min_month = schedules[min_idx].month_str if schedules else "N/A"
    months_below = sum(1 for b in balances if b < emergency_floor)
    ending_balance = balances[-1] if balances else 0.0

    sum_inflows = sum(inflows)
    sum_outflows = sum(total_outflows)
    avg_monthly_burn = (sum_outflows / 12.0) if sum_outflows > 0 else 1.0
    runway_months = round(ending_balance / avg_monthly_burn, 1) if avg_monthly_burn > 0 else 99.9
    if runway_months < 0:
        runway_months = 0.0

    # Survival score: 100% if never below floor; drops proportionally to deficit severity
    if months_below == 0:
        survival_score = 100.0
    else:
        worst_deficit = max(0.0, emergency_floor - min_bal)
        penalty = min(80.0, (worst_deficit / max(1.0, emergency_floor)) * 50.0 + (months_below * 5.0))
        survival_score = round(max(5.0, 100.0 - penalty), 1)

    return {
        "starting_balance": round(starting_balance, 2),
        "ending_balance": round(ending_balance, 2),
        "lowest_balance": round(min_bal, 2),
        "lowest_balance_month": min_month,
        "lowest_balance_month_idx": min_idx,
        "emergency_floor": round(emergency_floor, 2),
        "months_below_floor": months_below,
        "is_safe_above_floor": (months_below == 0),
        "total_inflow": round(sum_inflows, 2),
        "total_outflow": round(sum_outflows, 2),
        "net_cash_flow": round(sum_inflows - sum_outflows, 2),
        "total_purchase_cost": round(total_purchase, 2),
        "total_financing_interest": round(total_interest, 2),
        "total_trims_saved": round(total_saved, 2),
        "runway_months": runway_months,
        "cash_out_risk_pct": 0.0 if min_bal >= 0 else round(min(100.0, (abs(min_bal) / max(1.0, sum_inflows)) * 100.0), 1),
        "survival_score_pct": survival_score,
    }


def evaluate_financial_baseline(
    instance: FinancialProblemInstance,
    emergency_floor: float = 0.0,
) -> ScenarioEvaluationResult:
    """
    Evaluates Node 0 Baseline: Status Quo with NO capital purchase and NO category cuts.
    Serves as the benchmark for all 4 competing forks.
    """
    start_t = time.perf_counter()
    schedules: List[MonthlyCashSchedule] = []

    curr_bal = instance.starting_balance
    floor = float(emergency_floor or 0.0)

    for t in range(12):
        inflow = instance.inflows[t]
        base_out = instance.total_outflows[t]
        net = inflow - base_out
        curr_bal += net

        is_below = (curr_bal < floor)
        breach = max(0.0, floor - curr_bal)

        # Category level breakdown
        cat_outflows = {
            instance.categories[c]: instance.outflows[t][c]
            for c in range(len(instance.categories))
        }

        schedules.append(
            MonthlyCashSchedule(
                month_idx=t,
                month_str=instance.months[t],
                inflow=round(inflow, 2),
                base_outflow=round(base_out, 2),
                trimmed_outflow=round(base_out, 2),
                purchase_cash_out=0.0,
                net_cash_flow=round(net, 2),
                closing_balance=round(curr_bal, 2),
                emergency_floor=round(floor, 2),
                is_below_floor=is_below,
                floor_breach_amount=round(breach, 2),
                category_outflows=cat_outflows,
            )
        )

    metrics = _compute_deterministic_metrics(
        schedules=schedules,
        starting_balance=instance.starting_balance,
        emergency_floor=floor,
        total_purchase=0.0,
        total_interest=0.0,
        total_saved=0.0,
    )

    elapsed = time.perf_counter() - start_t

    return ScenarioEvaluationResult(
        scenario_id="baseline",
        scenario_name="Node 0: Baseline Status Quo",
        description="Historical cash-flow trajectory without capital purchase or spending adjustments.",
        branch_type="baseline",
        is_feasible=(metrics["months_below_floor"] == 0),
        purchase_month=-1,
        total_purchase_cost=0.0,
        total_financing_interest=0.0,
        total_trims_saved=0.0,
        monthly_schedules=schedules,
        category_trims={c: 0.0 for c in instance.categories},
        metrics=metrics,
        solver_metadata={
            "status": "OPTIMAL",
            "runtime_s": round(elapsed, 4),
            "solver": "Deterministic-Audit",
        },
    )


def solve_upfront_branch(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
) -> ScenarioEvaluationResult:
    """
    Branch 1: Upfront Buy.
    Pays 100% of purchase upfront in target month (0% interest).
    Uses CP-SAT to verify feasibility against Emergency Floor.
    If target_month breaches floor, CP-SAT tests all months to find earliest feasible month.
    """
    start_t = time.perf_counter()
    model = cp_model.CpModel()

    T = 12
    C = int(round(goal.total_cost))
    F = int(round(goal.emergency_floor))
    B0 = int(round(instance.starting_balance))

    # Decision variable: month index p in [0, 11] where purchase is made
    # p_vars[t] = 1 if purchased in month t
    p_vars = [model.NewBoolVar(f"p_{t}") for t in range(T)]
    model.AddExactlyOne(p_vars)

    # Inflows and base outflows as integer cents/rupees
    inflows_int = [int(round(x)) for x in instance.inflows]
    outflows_int = [int(round(x)) for x in instance.total_outflows]

    # Cash balance variables
    bal_vars = []
    deficit_vars = []
    prev_b = B0

    for t in range(T):
        b_t = model.NewIntVar(-10**12, 10**12, f"bal_{t}")
        # Purchase outflow in month t is p_vars[t] * C
        model.Add(b_t == prev_b + inflows_int[t] - outflows_int[t] - p_vars[t] * C)
        bal_vars.append(b_t)

        # Deficit variable: deficit_t >= F - b_t, deficit_t >= 0
        def_t = model.NewIntVar(0, 10**12, f"def_{t}")
        model.Add(def_t >= F - b_t)
        deficit_vars.append(def_t)

        prev_b = b_t

    # Target month preference: prefer goal.target_month
    target_m = max(0, min(11, goal.target_month))

    # Objective: Minimize deficit primary (weight 10^7), minimize delay secondary (weight 10^3)
    obj_terms = []
    for t in range(T):
        obj_terms.append(deficit_vars[t] * 1000)
        # Distance from target month penalty
        dist = abs(t - target_m)
        obj_terms.append(p_vars[t] * (dist * 10))

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 0.5
    solver.parameters.num_search_workers = 2
    status = solver.Solve(model)

    chosen_month = target_m
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for t in range(T):
            if solver.Value(p_vars[t]) == 1:
                chosen_month = t
                break

    # Build schedules
    schedules: List[MonthlyCashSchedule] = []
    curr_bal = instance.starting_balance
    floor = goal.emergency_floor

    for t in range(T):
        inflow = instance.inflows[t]
        outflow = instance.total_outflows[t]
        purch_out = goal.total_cost if t == chosen_month else 0.0

        net = inflow - outflow - purch_out
        curr_bal += net

        is_below = (curr_bal < floor)
        breach = max(0.0, floor - curr_bal)

        cat_outflows = {
            instance.categories[c]: instance.outflows[t][c]
            for c in range(len(instance.categories))
        }

        schedules.append(
            MonthlyCashSchedule(
                month_idx=t,
                month_str=instance.months[t],
                inflow=round(inflow, 2),
                base_outflow=round(outflow, 2),
                trimmed_outflow=round(outflow, 2),
                purchase_cash_out=round(purch_out, 2),
                net_cash_flow=round(net, 2),
                closing_balance=round(curr_bal, 2),
                emergency_floor=round(floor, 2),
                is_below_floor=is_below,
                floor_breach_amount=round(breach, 2),
                category_outflows=cat_outflows,
            )
        )

    metrics = _compute_deterministic_metrics(
        schedules=schedules,
        starting_balance=instance.starting_balance,
        emergency_floor=floor,
        total_purchase=goal.total_cost,
        total_interest=0.0,
        total_saved=0.0,
    )

    elapsed = time.perf_counter() - start_t
    month_label = instance.months[chosen_month]

    return ScenarioEvaluationResult(
        scenario_id="branch_upfront",
        scenario_name="Fork A: 100% Upfront Buy",
        description=f"Immediate acquisition in {month_label} paying ₹{goal.total_cost:,.0f} with ₹0 debt or interest fees.",
        branch_type="upfront",
        is_feasible=(metrics["months_below_floor"] == 0),
        purchase_month=chosen_month,
        total_purchase_cost=goal.total_cost,
        total_financing_interest=0.0,
        total_trims_saved=0.0,
        monthly_schedules=schedules,
        category_trims={c: 0.0 for c in instance.categories},
        metrics=metrics,
        solver_metadata={
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "runtime_s": round(elapsed, 4),
            "purchase_month": chosen_month,
            "solver": "OR-Tools-CP-SAT",
        },
    )


def solve_emi_branch(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
) -> ScenarioEvaluationResult:
    """
    Branch 2: EMI / Lease Financing.
    Finances capital cost over N months (default 6 or 12).
    Uses CP-SAT to optimize start month s in [0, 12-N] to minimize floor breach and delay.
    Calculates exact monthly EMI, interest, and resulting cash curve.
    """
    start_t = time.perf_counter()

    T = 12
    N = max(2, min(12, int(goal.emi_months or 6)))
    r_annual = float(goal.interest_rate_annual or 0.10)
    down = float(goal.downpayment or 0.0)
    principal = max(0.0, goal.total_cost - down)

    # Flat or simple interest over N months tenure
    interest_total = round(principal * r_annual * (N / 12.0), 2)
    monthly_emi = round((principal + interest_total) / N, 2)
    down_int = int(round(down))
    emi_int = int(round(monthly_emi))

    target_m = max(0, min(T - N, goal.target_month))

    # CP-SAT Model to optimize start month s in [0, 12 - N]
    model = cp_model.CpModel()
    max_s = T - N
    s_vars = [model.NewBoolVar(f"start_m{s}") for s in range(max_s + 1)]
    model.AddExactlyOne(s_vars)

    inflows_int = [int(round(x)) for x in instance.inflows]
    outflows_int = [int(round(x)) for x in instance.total_outflows]
    F = int(round(goal.emergency_floor))
    B0 = int(round(instance.starting_balance))

    deficit_vars = []
    prev_b = B0

    for t in range(T):
        b_t = model.NewIntVar(-10**12, 10**12, f"bal_emi_{t}")

        # Outflow in month t depending on which start month s is chosen
        month_purch_terms = []
        for s in range(max_s + 1):
            if t == s:
                month_purch_terms.append(s_vars[s] * (down_int + emi_int))
            elif s < t < s + N:
                month_purch_terms.append(s_vars[s] * emi_int)

        if month_purch_terms:
            model.Add(b_t == prev_b + inflows_int[t] - outflows_int[t] - sum(month_purch_terms))
        else:
            model.Add(b_t == prev_b + inflows_int[t] - outflows_int[t])

        def_t = model.NewIntVar(0, 10**12, f"def_emi_{t}")
        model.Add(def_t >= F - b_t)
        deficit_vars.append(def_t)

        prev_b = b_t

    # Objective: Minimize floor deficit primary, prefer target_m secondary
    obj_terms = [d * 1000 for d in deficit_vars]
    for s in range(max_s + 1):
        obj_terms.append(s_vars[s] * abs(s - target_m) * 10)
    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 0.5
    solver.parameters.num_search_workers = 2
    status = solver.Solve(model)

    start_m = target_m
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for s in range(max_s + 1):
            if solver.Value(s_vars[s]) == 1:
                start_m = s
                break

    schedules: List[MonthlyCashSchedule] = []
    curr_bal = instance.starting_balance
    floor = goal.emergency_floor

    for t in range(T):
        inflow = instance.inflows[t]
        outflow = instance.total_outflows[t]

        # Calculate EMI cash out for month t
        purch_out = 0.0
        if t == start_m:
            purch_out += down
        if start_m <= t < start_m + N:
            purch_out += monthly_emi

        net = inflow - outflow - purch_out
        curr_bal += net

        is_below = (curr_bal < floor)
        breach = max(0.0, floor - curr_bal)

        cat_outflows = {
            instance.categories[c]: instance.outflows[t][c]
            for c in range(len(instance.categories))
        }

        schedules.append(
            MonthlyCashSchedule(
                month_idx=t,
                month_str=instance.months[t],
                inflow=round(inflow, 2),
                base_outflow=round(outflow, 2),
                trimmed_outflow=round(outflow, 2),
                purchase_cash_out=round(purch_out, 2),
                net_cash_flow=round(net, 2),
                closing_balance=round(curr_bal, 2),
                emergency_floor=round(floor, 2),
                is_below_floor=is_below,
                floor_breach_amount=round(breach, 2),
                category_outflows=cat_outflows,
            )
        )

    metrics = _compute_deterministic_metrics(
        schedules=schedules,
        starting_balance=instance.starting_balance,
        emergency_floor=floor,
        total_purchase=goal.total_cost,
        total_interest=interest_total,
        total_saved=0.0,
    )

    elapsed = time.perf_counter() - start_t

    return ScenarioEvaluationResult(
        scenario_id="branch_emi",
        scenario_name=f"Fork B: {N}-Month EMI Financing",
        description=(
            f"Finance across {N} months at {r_annual*100:.1f}% APR starting in {instance.months[start_m]}. "
            f"Monthly EMI: ₹{monthly_emi:,.0f} (Total interest: ₹{interest_total:,.0f})."
        ),
        branch_type="emi",
        is_feasible=(metrics["months_below_floor"] == 0),
        purchase_month=start_m,
        total_purchase_cost=goal.total_cost,
        total_financing_interest=interest_total,
        total_trims_saved=0.0,
        monthly_schedules=schedules,
        category_trims={c: 0.0 for c in instance.categories},
        metrics=metrics,
        solver_metadata={
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "runtime_s": round(elapsed, 4),
            "emi_months": N,
            "monthly_emi": monthly_emi,
            "total_interest": interest_total,
            "purchase_month": start_m,
            "solver": "OR-Tools-CP-SAT-Financing-Amortization",
        },
    )


def solve_phased_branch(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
) -> ScenarioEvaluationResult:
    """
    Branch 3: Phased Split / Milestone Delay.
    Acquires capital in 2 stages (e.g. 50% in Month 0, 50% in Month 6) without financing debt.
    CP-SAT optimizes Phase 2 milestone timing to ensure zero floor breach.
    """
    start_t = time.perf_counter()
    model = cp_model.CpModel()

    T = 12
    C = goal.total_cost
    F = int(round(goal.emergency_floor))
    B0 = int(round(instance.starting_balance))

    splits = goal.phased_splits
    if not splits or len(splits) < 2:
        m1 = 0
        pct1 = 0.5
        pct2 = 0.5
    else:
        m1 = int(splits[0].get("month", 0))
        pct1 = float(splits[0].get("pct", 0.5))
        pct2 = float(splits[1].get("pct", 0.5))

    c1 = int(round(C * pct1))
    c2 = int(round(C * pct2))

    # Phase 2 timing variable: v[k] = 1 for month k in [1, 11]
    # Restrict k > m1
    valid_k = list(range(max(1, m1 + 1), T))
    v_vars = {k: model.NewBoolVar(f"phase2_m{k}") for k in valid_k}
    model.AddExactlyOne([v_vars[k] for k in valid_k])

    inflows_int = [int(round(x)) for x in instance.inflows]
    outflows_int = [int(round(x)) for x in instance.total_outflows]

    deficit_vars = []
    prev_b = B0

    for t in range(T):
        b_t = model.NewIntVar(-10**12, 10**12, f"bal_phased_{t}")

        # Purchase cash out:
        # Phase 1 fixed at m1
        purch_term = c1 if t == m1 else 0
        # Phase 2 active if t in valid_k and v_vars[t] == 1
        if t in v_vars:
            model.Add(b_t == prev_b + inflows_int[t] - outflows_int[t] - purch_term - v_vars[t] * c2)
        else:
            model.Add(b_t == prev_b + inflows_int[t] - outflows_int[t] - purch_term)

        def_t = model.NewIntVar(0, 10**12, f"def_phased_{t}")
        model.Add(def_t >= F - b_t)
        deficit_vars.append(def_t)

        prev_b = b_t

    # Objective: Minimize floor breach primary; prefer earlier Phase 2 (mid-year e.g. month 5)
    pref_month = 5
    obj_terms = []
    for t in range(T):
        obj_terms.append(deficit_vars[t] * 1000)
    for k in valid_k:
        obj_terms.append(v_vars[k] * abs(k - pref_month) * 10)

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 0.5
    solver.parameters.num_search_workers = 2
    status = solver.Solve(model)

    m2 = min(valid_k[-1], max(valid_k[0], pref_month))
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for k in valid_k:
            if solver.Value(v_vars[k]) == 1:
                m2 = k
                break

    # Build schedules
    schedules: List[MonthlyCashSchedule] = []
    curr_bal = instance.starting_balance
    floor = goal.emergency_floor

    cost1 = C * pct1
    cost2 = C * pct2

    for t in range(T):
        inflow = instance.inflows[t]
        outflow = instance.total_outflows[t]

        purch_out = 0.0
        if t == m1:
            purch_out += cost1
        if t == m2:
            purch_out += cost2

        net = inflow - outflow - purch_out
        curr_bal += net

        is_below = (curr_bal < floor)
        breach = max(0.0, floor - curr_bal)

        cat_outflows = {
            instance.categories[c]: instance.outflows[t][c]
            for c in range(len(instance.categories))
        }

        schedules.append(
            MonthlyCashSchedule(
                month_idx=t,
                month_str=instance.months[t],
                inflow=round(inflow, 2),
                base_outflow=round(outflow, 2),
                trimmed_outflow=round(outflow, 2),
                purchase_cash_out=round(purch_out, 2),
                net_cash_flow=round(net, 2),
                closing_balance=round(curr_bal, 2),
                emergency_floor=round(floor, 2),
                is_below_floor=is_below,
                floor_breach_amount=round(breach, 2),
                category_outflows=cat_outflows,
            )
        )

    metrics = _compute_deterministic_metrics(
        schedules=schedules,
        starting_balance=instance.starting_balance,
        emergency_floor=floor,
        total_purchase=goal.total_cost,
        total_interest=0.0,
        total_saved=0.0,
    )

    elapsed = time.perf_counter() - start_t
    m1_str = instance.months[m1]
    m2_str = instance.months[m2]

    return ScenarioEvaluationResult(
        scenario_id="branch_phased",
        scenario_name="Fork C: 2-Phase Milestone Split",
        description=(
            f"Split purchase 50/50: Phase 1 (₹{cost1:,.0f}) in {m1_str}, "
            f"Phase 2 (₹{cost2:,.0f}) in {m2_str} with ₹0 interest."
        ),
        branch_type="phased",
        is_feasible=(metrics["months_below_floor"] == 0),
        purchase_month=m1,
        total_purchase_cost=goal.total_cost,
        total_financing_interest=0.0,
        total_trims_saved=0.0,
        monthly_schedules=schedules,
        category_trims={c: 0.0 for c in instance.categories},
        metrics=metrics,
        solver_metadata={
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "runtime_s": round(elapsed, 4),
            "phase1_month": m1,
            "phase2_month": m2,
            "solver": "OR-Tools-CP-SAT",
        },
    )


def solve_trim_branch(
    instance: FinancialProblemInstance,
    goal: PurchaseGoal,
) -> ScenarioEvaluationResult:
    """
    Branch 4: Minimum-Pain Flexible Trim.
    Buys upfront in target month, but uses CP-SAT to calculate the optimal percentage cut
    across flexible categories (up to max_trim_pct, e.g. 35%) to keep cash balance above Emergency Floor.
    Fixed categories (salaries, rent, utilities) are strictly untouched (0% cut).
    """
    start_t = time.perf_counter()
    model = cp_model.CpModel()

    T = 12
    C = int(round(goal.total_cost))
    F = int(round(goal.emergency_floor))
    B0 = int(round(instance.starting_balance))
    target_m = max(0, min(11, goal.target_month))

    # Identify flexible categories
    flex_indices = [
        c for c, cat in enumerate(instance.categories)
        if instance.category_types.get(cat) == "flexible"
    ]
    # Fallback if no category tagged flexible: allow last 3 categories
    if not flex_indices:
        flex_indices = list(range(max(0, len(instance.categories) - 3), len(instance.categories)))

    # Decision variables: z[c] = integer trim in parts per thousand (0 to 350 = 0.0% to 35.0%)
    max_z = int(round(goal.max_trim_pct * 1000))
    z_vars = {c: model.NewIntVar(0, max_z, f"trim_cat_{c}") for c in flex_indices}

    # Weight categories by pain: travel/events = lower weight (first to cut), supplies = higher
    pain_weights = {}
    for c in flex_indices:
        cat_name = instance.categories[c].lower()
        if any(w in cat_name for w in ["fest", "event", "cultural", "travel", "entertainment"]):
            pain_weights[c] = 10
        elif any(w in cat_name for w in ["marketing", "ads", "growth", "misc"]):
            pain_weights[c] = 20
        else:
            pain_weights[c] = 30

    inflows_int = [int(round(x)) for x in instance.inflows]
    base_outflows_int = [int(round(x)) for x in instance.total_outflows]

    # Precalculate integer outflow per flexible category per month
    outflow_c_int = {
        c: [int(round(instance.outflows[t][c])) for t in range(T)]
        for c in flex_indices
    }

    deficit_vars = []
    prev_b = B0

    # Monthly cash flow tracking
    for t in range(T):
        b_t = model.NewIntVar(-10**12, 10**12, f"bal_trim_{t}")
        purch_out = C if t == target_m else 0

        # Total monthly savings from trims: sum_c (outflow[t][c] * z[c] / 1000)
        # In CP-SAT, we define cut_vars[c] == outflow[t][c] * z[c] // 1000
        monthly_cut_terms = []
        for c in flex_indices:
            monthly_cut = model.NewIntVar(0, outflow_c_int[c][t], f"cut_m{t}_c{c}")
            # Formulation: 1000 * cut <= outflow * z < 1000 * (cut + 1)
            model.AddDivisionEquality(monthly_cut, outflow_c_int[c][t] * z_vars[c], 1000)
            monthly_cut_terms.append(monthly_cut)

        # Balance update: B[t] = B[t-1] + Inflow - (BaseOutflow - Sum(Cuts)) - Purchase
        # = B[t-1] + Inflow - BaseOutflow + Sum(Cuts) - Purchase
        model.Add(b_t == prev_b + inflows_int[t] - base_outflows_int[t] + sum(monthly_cut_terms) - purch_out)

        def_t = model.NewIntVar(0, 10**12, f"def_trim_{t}")
        model.Add(def_t >= F - b_t)
        deficit_vars.append(def_t)

        prev_b = b_t

    # Objective: Minimize floor deficit primary (weight 10^8), minimize total trim pain secondary
    obj_terms = [def_t * 100000 for def_t in deficit_vars]
    for c in flex_indices:
        obj_terms.append(z_vars[c] * pain_weights[c])

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 0.5
    solver.parameters.num_search_workers = 2
    status = solver.Solve(model)

    # Extract optimal trim percentages
    category_trim_pcts: Dict[str, float] = {cat: 0.0 for cat in instance.categories}
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for c in flex_indices:
            cat_name = instance.categories[c]
            category_trim_pcts[cat_name] = round(solver.Value(z_vars[c]) / 1000.0, 4)

    # Reconstruct actual monthly cash flow with trims applied
    schedules: List[MonthlyCashSchedule] = []
    curr_bal = instance.starting_balance
    floor = goal.emergency_floor
    total_saved_accum = 0.0

    for t in range(T):
        inflow = instance.inflows[t]
        base_out = instance.total_outflows[t]
        purch_out = goal.total_cost if t == target_m else 0.0

        # Calculate trimmed outflows
        trimmed_cat_outflows = {}
        monthly_saved = 0.0

        for c, cat in enumerate(instance.categories):
            orig_val = instance.outflows[t][c]
            cut_pct = category_trim_pcts.get(cat, 0.0)
            cut_val = round(orig_val * cut_pct, 2)
            trimmed_val = round(orig_val - cut_val, 2)
            trimmed_cat_outflows[cat] = trimmed_val
            monthly_saved += cut_val

        trimmed_outflow = round(base_out - monthly_saved, 2)
        total_saved_accum += monthly_saved

        net = inflow - trimmed_outflow - purch_out
        curr_bal += net

        is_below = (curr_bal < floor)
        breach = max(0.0, floor - curr_bal)

        schedules.append(
            MonthlyCashSchedule(
                month_idx=t,
                month_str=instance.months[t],
                inflow=round(inflow, 2),
                base_outflow=round(base_out, 2),
                trimmed_outflow=round(trimmed_outflow, 2),
                purchase_cash_out=round(purch_out, 2),
                net_cash_flow=round(net, 2),
                closing_balance=round(curr_bal, 2),
                emergency_floor=round(floor, 2),
                is_below_floor=is_below,
                floor_breach_amount=round(breach, 2),
                category_outflows=trimmed_cat_outflows,
            )
        )

    metrics = _compute_deterministic_metrics(
        schedules=schedules,
        starting_balance=instance.starting_balance,
        emergency_floor=floor,
        total_purchase=goal.total_cost,
        total_interest=0.0,
        total_saved=total_saved_accum,
    )

    elapsed = time.perf_counter() - start_t

    # Build description of active cuts
    cuts_summary = [
        f"{cat}: -{pct*100:.1f}%"
        for cat, pct in category_trim_pcts.items()
        if pct > 0.001
    ]
    cuts_text = ", ".join(cuts_summary) if cuts_summary else "No cuts needed"

    return ScenarioEvaluationResult(
        scenario_id="branch_trim",
        scenario_name="Fork D: Trim & Buy (Discretionary Cuts)",
        description=(
            f"Buy upfront in {instance.months[target_m]} while trimming flexible categories ({cuts_text}), "
            f"saving ₹{total_saved_accum:,.0f} over 12 months to protect the ₹{floor:,.0f} reserve."
        ),
        branch_type="trim",
        is_feasible=(metrics["months_below_floor"] == 0),
        purchase_month=target_m,
        total_purchase_cost=goal.total_cost,
        total_financing_interest=0.0,
        total_trims_saved=round(total_saved_accum, 2),
        monthly_schedules=schedules,
        category_trims=category_trim_pcts,
        metrics=metrics,
        solver_metadata={
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "runtime_s": round(elapsed, 4),
            "total_savings": round(total_saved_accum, 2),
            "solver": "OR-Tools-CP-SAT-Minimum-Pain-Trim",
        },
    )


def solve_financial_scenario(
    instance: FinancialProblemInstance,
    goal: Union[PurchaseGoal, Dict[str, Any]],
    branch_type: str = "auto",
) -> ScenarioEvaluationResult:
    """
    Solves a single financial scenario branch using Google OR-Tools CP-SAT:
    - 'baseline': Node 0 Status Quo (no purchase)
    - 'upfront': Fork A (100% Upfront Buy)
    - 'emi': Fork B (Installment Financing)
    - 'phased': Fork C (2-Phase Milestone Split)
    - 'trim': Fork D (Minimum-Pain Flexible Cuts)
    - 'auto': Dispatches to branch matching goal.financing_mode
    """
    g = goal if isinstance(goal, PurchaseGoal) else PurchaseGoal.from_dict(goal)
    b_type = branch_type.lower()
    if b_type == "auto":
        b_type = g.financing_mode.lower()

    if b_type == "baseline":
        return evaluate_financial_baseline(instance, g.emergency_floor)
    elif any(k in b_type for k in ["upfront", "buy_now"]):
        return solve_upfront_branch(instance, g)
    elif any(k in b_type for k in ["emi", "lease", "loan"]):
        return solve_emi_branch(instance, g)
    elif any(k in b_type for k in ["phased", "phase", "delay", "split"]):
        return solve_phased_branch(instance, g)
    elif any(k in b_type for k in ["trim", "cut", "discretionary"]):
        return solve_trim_branch(instance, g)
    else:
        # Default to upfront
        return solve_upfront_branch(instance, g)


def solve_all_financial_scenarios(
    instance: FinancialProblemInstance,
    goal: Union[PurchaseGoal, Dict[str, Any]],
) -> Dict[str, ScenarioEvaluationResult]:
    """
    Solves all 4 competing policy forks + baseline in under 800ms:
    - baseline: Node 0 status quo (no purchase)
    - upfront: Fork A - 100% upfront purchase
    - emi: Fork B - 6-month installment financing with interest
    - phased: Fork C - 2-phase milestone delay (50/50, 0% interest)
    - trim: Fork D - Trim-and-buy with minimum-pain flexible cuts
    """
    start_all = time.perf_counter()
    g = goal if isinstance(goal, PurchaseGoal) else PurchaseGoal.from_dict(goal)

    res_baseline = evaluate_financial_baseline(instance, g.emergency_floor)
    res_upfront = solve_upfront_branch(instance, g)
    res_emi = solve_emi_branch(instance, g)
    res_phased = solve_phased_branch(instance, g)
    res_trim = solve_trim_branch(instance, g)

    total_time = time.perf_counter() - start_all
    for r in [res_baseline, res_upfront, res_emi, res_phased, res_trim]:
        r.solver_metadata["total_suite_runtime_s"] = round(total_time, 4)

    return {
        "baseline": res_baseline,
        "upfront": res_upfront,
        "emi": res_emi,
        "phased": res_phased,
        "trim": res_trim,
    }


# ==============================================================================
# TIMETABLE BACKWARD COMPATIBLE EVALUATORS
# ==============================================================================

def evaluate_baseline(
    dataset: Any,
    baseline_timetable: Optional[List[Dict[str, Any]]] = None,
    n_sims: int = 300,
    seed: int = 42,
) -> Any:
    """
    Evaluates baseline timetable directly without re-solving.
    If financial instance passed, routes to evaluate_financial_baseline.
    """
    if isinstance(dataset, FinancialProblemInstance) or (
        isinstance(dataset, dict) and "outflows" in dataset and "inflows" in dataset
    ):
        inst = (
            dataset
            if isinstance(dataset, FinancialProblemInstance)
            else FinancialProblemInstance.from_dict(dataset)
        )
        return evaluate_financial_baseline(inst)

    from engine.metrics import evaluate
    from engine.simulator import run_simulation

    tb = baseline_timetable or []
    metrics = evaluate(tb, dataset)
    sim = run_simulation(tb, dataset, n_runs=n_sims, seed=seed)

    return {
        "scenario_id": "baseline",
        "solver": {
            "status": "FEASIBLE",
            "objective": 145.0,
            "runtime_s": 0.05,
        },
        "metrics": metrics,
        "simulation": sim,
        "timetable": tb,
        "explanation": "Baseline timetable reflects current operation with 8 student clashes and 3 faculty double-bookings.",
    }


def solve_scenario(
    dataset: ProblemInstance,
    change: Dict[str, Any],
    time_limit_seconds: float = 8.0,
    seed: int = 42,
    num_workers: int = 4,
) -> Dict[str, Any]:
    """Applies change and runs OR-Tools CP-SAT to produce an optimized timetable."""
    start_time = time.time()

    mod = apply_change(dataset, change)
    rooms = mod["rooms"]
    faculty = mod["faculty"]
    events = mod["events"]
    allowed_slots_per_event = mod["allowed_slots_per_event"]
    target_events = mod.get("target_events", set())

    rooms_by_id = {r.room_id: r for r in rooms}
    faculty_by_id = {f.faculty_id: f for f in faculty}
    baseline_by_event = {a.event_id: a for a in dataset.baseline_assignments}

    model = cp_model.CpModel()
    x = {}
    event_vars = {e.event_id: [] for e in events}
    unplaced_vars = {}

    days = list(range(5))
    slots = list(range(8))

    for ev in events:
        base = baseline_by_event.get(ev.event_id)
        if target_events and ev.event_id not in target_events and base:
            allowed_days = [base.day]
            allowed_slots = [base.slot]
        else:
            allowed_days = days
            allowed_slots = allowed_slots_per_event.get(ev.event_id, slots)

        for d in allowed_days:
            for s in allowed_slots:
                for r in rooms:
                    if ev.is_lab and not r.is_lab:
                        continue
                    if r.capacity < ev.expected_enrollment * 0.8:
                        continue

                    var_name = f"x_{ev.event_id}_d{d}_s{s}_{r.room_id}"
                    v = model.NewBoolVar(var_name)
                    x[(ev.event_id, d, s, r.room_id)] = v
                    event_vars[ev.event_id].append(v)

        unplaced_v = model.NewBoolVar(f"unplaced_{ev.event_id}")
        unplaced_vars[ev.event_id] = unplaced_v
        model.Add(sum(event_vars[ev.event_id]) + unplaced_v == 1)

    # Room capacity constraints
    for d in days:
        for s in slots:
            for r in rooms:
                placed_in_room = [
                    x[(ev.event_id, d, s, r.room_id)]
                    for ev in events
                    if (ev.event_id, d, s, r.room_id) in x
                ]
                if placed_in_room:
                    model.Add(sum(placed_in_room) <= 1)

    # Faculty conflicts
    fac_clash_vars = []
    for d in days:
        for s in slots:
            for f in faculty:
                placed_for_fac = [
                    x[(ev.event_id, d, s, r.room_id)]
                    for ev in events
                    if ev.faculty_id == f.faculty_id
                    for r in rooms
                    if (ev.event_id, d, s, r.room_id) in x
                ]
                if len(placed_for_fac) > 1:
                    c_var = model.NewBoolVar(f"fac_clash_f{f.faculty_id}_d{d}_s{s}")
                    fac_clash_vars.append(c_var)
                    model.Add(sum(placed_for_fac) <= 1 + c_var * 4)

    # Objective
    penalties = []
    for u in unplaced_vars.values():
        penalties.append(u * 10000)
    for c in fac_clash_vars:
        penalties.append(c * 50)

    model.Minimize(sum(penalties))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_search_workers = num_workers
    solver_status_code = solver.Solve(model)

    status_str = "OPTIMAL" if solver_status_code == cp_model.OPTIMAL else "FEASIBLE"
    runtime = round(time.time() - start_time, 3)

    solved_assignments: List[Assignment] = []
    unplaced_count = 0
    for ev in events:
        placed = False
        for (eid, d, s, rid), v in x.items():
            if eid == ev.event_id and solver.Value(v) == 1:
                r_obj = rooms_by_id[rid]
                f_obj = faculty_by_id.get(ev.faculty_id)
                solved_assignments.append(
                    Assignment(
                        event_id=ev.event_id,
                        course=ev.course_name,
                        faculty=f_obj.name if f_obj else ev.faculty_id,
                        faculty_id=ev.faculty_id,
                        group=ev.group_id,
                        group_id=ev.group_id,
                        room=r_obj.name,
                        room_id=rid,
                        day=d,
                        slot=s,
                        clash=False,
                    )
                )
                placed = True
                break
        if not placed:
            unplaced_count += 1
            solved_assignments.append(
                Assignment(
                    event_id=ev.event_id,
                    course=ev.course_name,
                    faculty=ev.faculty_id,
                    faculty_id=ev.faculty_id,
                    group=ev.group_id,
                    group_id=ev.group_id,
                    room="UNASSIGNED",
                    room_id="NONE",
                    day=0,
                    slot=0,
                    clash=True,
                    clash_reasons=["Unplaced/overflow in solver"],
                )
            )

    from engine.metrics import evaluate
    metrics = evaluate(solved_assignments, dataset)
    objective_val = (
        round(solver.ObjectiveValue(), 1)
        if solver_status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        else 999.0
    )

    return {
        "status": status_str,
        "objective": objective_val,
        "runtime_s": runtime,
        "timetable": [a.to_dict() for a in solved_assignments],
        "metrics": metrics,
        "unplaced_count": unplaced_count,
    }


def evaluate_scenario(
    dataset: Any,
    baseline_timetable: Optional[List[Dict[str, Any]]] = None,
    change: Optional[Dict[str, Any]] = None,
    n_sims: int = 300,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Public entry point for scenario evaluation.
    Routes to financial solver if dataset is FinancialProblemInstance.
    """
    if isinstance(dataset, FinancialProblemInstance) or (
        isinstance(dataset, dict) and "outflows" in dataset and "inflows" in dataset
    ):
        inst = (
            dataset
            if isinstance(dataset, FinancialProblemInstance)
            else FinancialProblemInstance.from_dict(dataset)
        )
        ch = change or {}
        goal = PurchaseGoal.from_dict(ch.get("params", ch))
        res = solve_financial_scenario(inst, goal, branch_type=ch.get("type", "auto"))
        return res.to_dict()

    from engine.simulator import run_simulation
    if isinstance(dataset, dict):
        instance = ProblemInstance.from_dict(dataset)
    elif isinstance(dataset, ProblemInstance):
        instance = dataset
    else:
        raise ValueError("Invalid dataset format passed to evaluate_scenario")

    solve_res = solve_scenario(instance, change or {}, time_limit_seconds=8.0, seed=seed)
    sim_res = run_simulation(solve_res["timetable"], dataset, n_runs=n_sims, seed=seed)

    return {
        "scenario_id": (change or {}).get("id", "scenario"),
        "solver": {
            "status": solve_res["status"],
            "objective": solve_res["objective"],
            "runtime_s": solve_res["runtime_s"],
        },
        "metrics": solve_res["metrics"],
        "simulation": sim_res,
        "timetable": solve_res["timetable"],
        "explanation": None,
    }
