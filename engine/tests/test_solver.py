"""
Unit tests for engine/solver.py
Verifies OR-Tools CP-SAT model and benchmark time constraints (<15s).
"""

import time

import pytest

from data.loader import default_loader
from engine.model import ProblemInstance
from engine.solver import evaluate_baseline, evaluate_scenario


@pytest.fixture
def instance():
    data = default_loader.load_bundle()
    return ProblemInstance.from_dict(data)

def test_evaluate_baseline(instance):
    data = default_loader.load_bundle()
    res = evaluate_baseline(data, data["baseline_timetable"], n_sims=50, seed=42)
    assert res["scenario_id"] == "baseline"
    assert res["metrics"]["student_clashes"] == 8
    assert res["metrics"]["faculty_clashes"] == 3
    assert len(res["timetable"]) == 68

def test_solve_scenario_shift_electives(instance):
    data = default_loader.load_bundle()
    change = {
        "id": "scenario_b",
        "type": "shift_time_window",
        "params": {"from": "afternoon", "to": "morning", "selection": "electives"},
    }

    start = time.time()
    res = evaluate_scenario(data, data["baseline_timetable"], change, n_sims=50, seed=42)
    elapsed = time.time() - start

    assert elapsed < 15.0, f"Scenario solve took {elapsed:.2f}s (must be < 15s)"
    assert res["solver"]["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(res["timetable"]) == 68
    assert "per_metric" in res["simulation"]
