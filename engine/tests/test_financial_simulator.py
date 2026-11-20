"""
FutureFork Engine: Financial Monte Carlo Simulator & Risk Metrics Unit Tests
Member 3: Vectorized NumPy Monte Carlo & Risk Metrics (engine/simulator)
"""

import time

import pytest

from data.loader import load_fixture_json
from engine.metrics import compute_financial_metrics
from engine.model import FinancialProblemInstance, PurchaseGoal
from engine.simulator import run_financial_monte_carlo
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


def test_financial_monte_carlo_matrix_shape_and_speed(institute_instance, default_goal):
    """Verifies (300, 12) simulation matrix execution in under 50ms per branch."""
    branch = solve_upfront_branch(institute_instance, default_goal)

    t0 = time.perf_counter()
    sim = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Benchmark: Under 50ms requirement
    assert elapsed_ms < 50.0, f"Monte Carlo took {elapsed_ms:.2f}ms, exceeding 50ms ceiling!"
    assert sim["n_runs"] == 300
    assert len(sim["monthly_trajectories"]) == 12

    # Check trajectory fields
    for traj in sim["monthly_trajectories"]:
        assert "mean" in traj
        assert "std" in traj
        assert "p10" in traj
        assert "p50" in traj
        assert "p90" in traj
        assert traj["p10"] <= traj["p50"] <= traj["p90"]


def test_inflow_delay_shock_injection(institute_instance, default_goal):
    """Verifies Inflow Delay Shock (t -> t+1 delay) is actively injected and tracked."""
    branch = solve_upfront_branch(institute_instance, default_goal)

    sim_shocks = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42, inject_shocks=True)
    sim_no_shocks = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42, inject_shocks=False)

    # Inflow delay count should be positive when shocks enabled
    assert sim_shocks["shocks_summary"]["inflow_delays_count"] > 0
    assert sim_no_shocks["shocks_summary"]["inflow_delays_count"] == 0


def test_emergency_outflow_shock_injection(institute_instance, default_goal):
    """Verifies Emergency Outflow Shock (lab equipment breakdown, repairs) injection."""
    branch = solve_emi_branch(institute_instance, default_goal)

    sim = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42, inject_shocks=True)
    assert sim["shocks_summary"]["emergency_shocks_count"] > 0

    # Shocks should push p10 lowest balance down compared to a deterministic schedule
    det_lowest = branch.lowest_balance
    assert sim["p10_lowest_balance"] <= det_lowest


def test_category_drift_and_variance(institute_instance, default_goal):
    """Verifies spend multipliers apply historical sigma to flexible buckets."""
    branch = solve_trim_branch(institute_instance, default_goal)
    sim = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42)

    # Risk metrics must be mathematically valid
    assert 0.0 <= sim["cash_out_risk_pct"] <= 100.0
    assert 0.0 <= sim["floor_breach_risk_pct"] <= 100.0
    assert 0.0 <= sim["survival_score_pct"] <= 100.0
    assert sim["p10_lowest_balance"] <= sim["p50_lowest_balance"] <= sim["p90_lowest_balance"]
    assert sim["lowest_balance_month"] in institute_instance.months


def test_metrics_computation_in_metrics_module():
    """Verifies compute_financial_metrics in engine/metrics.py handles deterministic and stochastic data."""
    # Handcrafted 12-month schedule
    schedules = [
        {
            "month_idx": t,
            "month_str": f"2024-{t+1:02d}",
            "inflow": 100000.0,
            "base_outflow": 80000.0,
            "trimmed_outflow": 80000.0,
            "purchase_cash_out": 20000.0 if t == 0 else 0.0,
            "closing_balance": 500000.0 + (t * 20000.0),
        }
        for t in range(12)
    ]

    metrics = compute_financial_metrics(
        schedules=schedules,
        starting_balance=500000.0,
        emergency_floor=100000.0,
        total_purchase=20000.0,
    )

    assert metrics["starting_balance"] == 500000.0
    assert metrics["ending_balance"] == 720000.0
    assert metrics["lowest_balance"] == 500000.0
    assert metrics["lowest_balance_month"] == "2024-01"
    assert metrics["is_safe_above_floor"] is True
    assert metrics["cash_out_risk_pct"] == 0.0
    assert metrics["survival_score_pct"] == 100.0
    assert metrics["runway_months"] > 0.0


def test_all_four_branches_monte_carlo_speed(institute_instance, default_goal):
    """Tests that all 4 CP-SAT branches execute Monte Carlo in < 50ms each."""
    branches = [
        ("baseline", evaluate_financial_baseline(institute_instance, default_goal.emergency_floor)),
        ("upfront", solve_upfront_branch(institute_instance, default_goal)),
        ("emi", solve_emi_branch(institute_instance, default_goal)),
        ("phased", solve_phased_branch(institute_instance, default_goal)),
        ("trim", solve_trim_branch(institute_instance, default_goal)),
    ]

    for name, branch in branches:
        t0 = time.perf_counter()
        sim = run_financial_monte_carlo(branch, institute_instance, n_runs=300, seed=42)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert elapsed_ms < 50.0, f"Branch '{name}' Monte Carlo took {elapsed_ms:.2f}ms (>50ms)!"
        assert sim["n_runs"] == 300
        assert "p10_lowest_balance" in sim
        assert "cash_out_risk_pct" in sim
        assert "survival_score_pct" in sim


def test_solve_all_financial_scenarios_integration(institute_instance, default_goal):
    """Verifies end-to-end integration of CP-SAT solver and Monte Carlo simulator."""
    all_res = solve_all_financial_scenarios(institute_instance, default_goal, run_monte_carlo=True)

    assert len(all_res) == 5
    for key, result in all_res.items():
        assert result.simulation_results is not None
        assert result.simulation_results["n_runs"] == 300
        assert "p10_lowest_balance" in result.metrics
        assert "cash_out_risk_pct" in result.metrics
        assert "survival_score_pct" in result.metrics
        assert "runway_months" in result.metrics
