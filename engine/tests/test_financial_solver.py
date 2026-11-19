"""
FutureFork Engine: Financial Solver & Branch Transformer Unit Tests
Member 2: OR-Tools CP-SAT Financial Solver (engine/solver)
"""

import time

import pytest

from data.loader import load_fixture_json
from engine.changes import (
    apply_discretionary_trim,
    apply_emi_split,
    apply_financial_change,
    apply_phased_delay,
    apply_upfront,
)
from engine.model import (
    ColumnMapping,
    FinancialProblemInstance,
    PurchaseGoal,
    ScenarioEvaluationResult,
)
from engine.solver import (
    evaluate_financial_baseline,
    solve_all_financial_scenarios,
    solve_emi_branch,
    solve_phased_branch,
    solve_trim_branch,
    solve_upfront_branch,
)


@pytest.fixture
def institute_instance():
    data = load_fixture_json("data/samples/fixture_institute_node0.json")
    return FinancialProblemInstance.from_dict(data)


@pytest.fixture
def default_goal():
    return PurchaseGoal(
        item_name="40 GPU Lab PCs",
        total_cost=6000000.0,
        emergency_floor=2500000.0,
        target_month=0,
        emi_months=6,
        max_trim_pct=0.35,
    )


def test_dataclasses_serialization(institute_instance, default_goal):
    # Verify ColumnMapping serialization
    mapping = ColumnMapping(date_col="Date", amount_col="Amount", starting_balance=100000.0)
    m_dict = mapping.to_dict()
    assert m_dict["date_col"] == "Date"
    assert m_dict["starting_balance"] == 100000.0

    # Verify FinancialProblemInstance serialization
    inst_dict = institute_instance.to_dict()
    assert inst_dict["dataset_id"] == "institute_erp_1.8cr"
    assert len(inst_dict["months"]) == 12
    assert len(inst_dict["categories"]) == 8

    # Verify PurchaseGoal serialization
    g_dict = default_goal.to_dict()
    assert g_dict["item_name"] == "40 GPU Lab PCs"
    assert g_dict["total_cost"] == 6000000.0
    assert g_dict["emergency_floor"] == 2500000.0


def test_financial_baseline_evaluation(institute_instance):
    res = evaluate_financial_baseline(institute_instance, emergency_floor=2500000.0)
    assert res.scenario_id == "baseline"
    assert res.branch_type == "baseline"
    assert len(res.monthly_schedules) == 12
    assert res.total_purchase_cost == 0.0
    assert res.total_financing_interest == 0.0
    assert res.total_trims_saved == 0.0

    # Verify balance continuity: B[t] = B[t-1] + net_cash_flow
    prev_bal = institute_instance.starting_balance
    for s in res.monthly_schedules:
        expected = round(prev_bal + s.net_cash_flow, 2)
        assert abs(s.closing_balance - expected) < 0.05
        prev_bal = s.closing_balance


def test_branch_upfront_solving(institute_instance, default_goal):
    res = solve_upfront_branch(institute_instance, default_goal)
    assert res.scenario_id == "branch_upfront"
    assert res.branch_type == "upfront"
    assert res.total_purchase_cost == 6000000.0
    assert res.total_financing_interest == 0.0
    assert res.total_trims_saved == 0.0
    assert len(res.monthly_schedules) == 12

    # Exactly one month should have purchase_cash_out == total_cost
    purch_months = [s for s in res.monthly_schedules if s.purchase_cash_out > 0.0]
    assert len(purch_months) == 1
    assert purch_months[0].purchase_cash_out == 6000000.0


def test_branch_emi_solving(institute_instance, default_goal):
    res = solve_emi_branch(institute_instance, default_goal)
    assert res.scenario_id == "branch_emi"
    assert res.branch_type == "emi"
    assert res.total_purchase_cost == 6000000.0
    assert res.total_financing_interest > 0.0  # Interest is charged on EMI
    assert len(res.monthly_schedules) == 12

    # Verify EMI installments are distributed across 6 months
    active_emi_months = [s for s in res.monthly_schedules if s.purchase_cash_out > 0.0]
    assert len(active_emi_months) == default_goal.emi_months
    # Total paid through EMI = Principal + Interest
    total_emi_paid = sum(s.purchase_cash_out for s in res.monthly_schedules)
    expected_total = default_goal.total_cost + res.total_financing_interest
    assert abs(total_emi_paid - expected_total) < 1.0


def test_branch_phased_solving(institute_instance, default_goal):
    res = solve_phased_branch(institute_instance, default_goal)
    assert res.scenario_id == "branch_phased"
    assert res.branch_type == "phased"
    assert res.total_purchase_cost == 6000000.0
    assert res.total_financing_interest == 0.0  # 0% interest on phased split
    assert len(res.monthly_schedules) == 12

    # Two distinct milestone disbursements summing to total cost
    active_phase_months = [s for s in res.monthly_schedules if s.purchase_cash_out > 0.0]
    assert len(active_phase_months) == 2
    total_phased_paid = sum(s.purchase_cash_out for s in res.monthly_schedules)
    assert abs(total_phased_paid - default_goal.total_cost) < 1.0


def test_branch_trim_solving(institute_instance, default_goal):
    res = solve_trim_branch(institute_instance, default_goal)
    assert res.scenario_id == "branch_trim"
    assert res.branch_type == "trim"
    assert res.total_purchase_cost == 6000000.0
    assert res.total_financing_interest == 0.0
    assert res.total_trims_saved > 0.0  # Savings must be positive
    assert len(res.monthly_schedules) == 12

    # Check that fixed categories have 0% cut
    for cat, ctype in institute_instance.category_types.items():
        if ctype == "fixed":
            assert res.category_trims[cat] == 0.0, f"Fixed category {cat} was trimmed!"
        else:
            # Flexible categories cut at most max_trim_pct
            assert res.category_trims[cat] <= default_goal.max_trim_pct + 0.001


def test_solve_all_financial_scenarios_performance(institute_instance, default_goal):
    t0 = time.perf_counter()
    all_results = solve_all_financial_scenarios(institute_instance, default_goal)
    duration_ms = (time.perf_counter() - t0) * 1000

    assert len(all_results) == 5
    for key in ["baseline", "upfront", "emi", "phased", "trim"]:
        assert key in all_results
        assert isinstance(all_results[key], ScenarioEvaluationResult)
        assert len(all_results[key].monthly_schedules) == 12

    # Benchmark: Must solve all 4 branches in under 800ms
    assert duration_ms < 800.0, f"Solve time {duration_ms:.2f}ms exceeded 800ms limit!"


def test_financial_change_transformers(institute_instance, default_goal):
    # Upfront
    g1 = apply_upfront(institute_instance, default_goal, {"target_month": 2})
    assert g1.financing_mode == "upfront"
    assert g1.target_month == 2

    # EMI
    g2 = apply_emi_split(institute_instance, default_goal, {"emi_months": 12, "downpayment_pct": 0.10})
    assert g2.financing_mode == "emi"
    assert g2.emi_months == 12
    assert g2.downpayment == 600000.0

    # Phased
    g3 = apply_phased_delay(institute_instance, default_goal, {"month_1": 0, "month_2": 4})
    assert g3.financing_mode == "phased"
    assert len(g3.phased_splits) == 2

    # Trim
    g4 = apply_discretionary_trim(institute_instance, default_goal, {"max_trim_pct": 0.25})
    assert g4.financing_mode == "trim"
    assert g4.max_trim_pct == 0.25

    # Unified apply_financial_change
    g_dyn = apply_financial_change(institute_instance, {"type": "emi_lease_split", "params": {"emi_months": 9}}, default_goal)
    assert g_dyn.financing_mode == "emi"
    assert g_dyn.emi_months == 9
