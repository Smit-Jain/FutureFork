"""
Unit tests for engine/simulator.py
Verifies vectorized Monte Carlo simulation.
"""

from data.loader import default_loader
from engine.simulator import run_simulation


def test_monte_carlo_simulation():
    data = default_loader.load_bundle()
    sim = run_simulation(data["baseline_timetable"], data, n_runs=100, seed=42)

    assert sim["n_runs"] == 100
    assert "student_clashes" in sim["per_metric"]
    assert "faculty_clashes" in sim["per_metric"]
    assert "room_utilization" in sim["per_metric"]
    assert "avg_student_gaps" in sim["per_metric"]

    sc_dist = sim["per_metric"]["student_clashes"]
    assert sc_dist["mean"] > 0
    assert sc_dist["p10"] <= sc_dist["mean"] <= sc_dist["p90"]
    assert 0.0 <= sim["prob_zero_clashes"] <= 1.0
