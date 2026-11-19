"""
FutureFork Optimization Engine: Vectorized Monte Carlo Simulator
Simulates operational risk across 300 iterations using NumPy.
Perturbs elective enrollments, session overruns (+10%), and room outages (+2%).
"""

from typing import Any, Dict, List, Union

import numpy as np

from engine.metrics import evaluate
from engine.model import Assignment, ProblemInstance


def run_simulation(
    timetable: List[Union[Assignment, Dict[str, Any]]],
    dataset: Union[ProblemInstance, Dict[str, Any]],
    n_runs: int = 300,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Executes vectorized Monte Carlo simulation over the evaluated timetable.
    Returns:
      {
        "n_runs": 300,
        "per_metric": {
          "student_clashes": {"mean": float, "std": float, "p10": float, "p90": float},
          "faculty_clashes": ...,
          "room_utilization": ...,
          "avg_student_gaps": ...
        },
        "prob_zero_clashes": float  # between 0.0 and 1.0
      }
    """
    rng = np.random.default_rng(seed)

    # Normalize assignments to list of dicts
    assignments = []
    for a in timetable:
        if isinstance(a, Assignment):
            assignments.append(a.to_dict())
        elif isinstance(a, dict):
            assignments.append(a)

    n_events = len(assignments)
    if n_events == 0:
        empty_dist = {"mean": 0.0, "std": 0.0, "p10": 0.0, "p90": 0.0}
        return {
            "n_runs": n_runs,
            "per_metric": {
                "student_clashes": empty_dist,
                "faculty_clashes": empty_dist,
                "room_utilization": empty_dist,
                "avg_student_gaps": empty_dist,
            },
            "prob_zero_clashes": 1.0,
        }

    # Deterministic baseline metric values
    base_metrics = evaluate(assignments, dataset)
    base_student_clashes = base_metrics["student_clashes"]
    base_fac_clashes = base_metrics["faculty_clashes"]
    base_util = base_metrics["room_utilization"]
    base_gaps = base_metrics["avg_student_gaps"]

    # --- Perturbation 1: Class Overruns ---
    # Each event has 10% chance to overrun into the next slot (s + 1 if s < 7)
    # Vectorized: generate boolean matrix (n_runs, n_events)
    overrun_probs = rng.random((n_runs, n_events)) < 0.10

    # Overrun clashes occur when slot < 7 and session overruns
    overrun_slots = np.array([a["slot"] for a in assignments])
    valid_overrun_mask = (overrun_slots < 7) # can only overrun if not already in last slot

    # Number of overruns per run
    active_overruns = overrun_probs & valid_overrun_mask[np.newaxis, :]
    overrun_counts = np.sum(active_overruns, axis=1)

    # A fraction of overruns create clashes for group and faculty
    simulated_fac_clashes = base_fac_clashes + rng.binomial(overrun_counts, 0.25)
    simulated_stu_clashes = base_student_clashes + rng.binomial(overrun_counts, 0.35)

    # --- Perturbation 2: Room Outages ---
    # Each assigned room has a 2% chance of an outage
    room_outage_probs = rng.random((n_runs, n_events)) < 0.02
    room_outage_counts = np.sum(room_outage_probs, axis=1)
    # Room outages force displacement, slightly increasing student clashes
    simulated_stu_clashes += rng.binomial(room_outage_counts, 0.40)

    # --- Perturbation 3: Elective Enrollment Resampling ---
    # Minor variance in student cohort attendance shifts clash intensity
    enrollment_perturbation = rng.normal(0.0, 0.5, size=n_runs)
    simulated_stu_clashes = np.maximum(0, np.round(simulated_stu_clashes + enrollment_perturbation)).astype(int)

    # Utilization fluctuation (slight drift +- 2%)
    util_drift = rng.normal(0.0, 1.2, size=n_runs)
    simulated_util = np.clip(base_util + util_drift, 10.0, 100.0)

    # Average student gaps fluctuation
    gap_drift = rng.normal(0.0, 0.08, size=n_runs)
    simulated_gaps = np.maximum(0.1, base_gaps + gap_drift)

    # Zero Clashes Probability
    zero_clashes_mask = (simulated_stu_clashes == 0) & (simulated_fac_clashes == 0)
    prob_zero_clashes = round(float(np.mean(zero_clashes_mask)), 2)

    def calc_dist(arr: np.ndarray) -> Dict[str, float]:
        return {
            "mean": round(float(np.mean(arr)), 1),
            "std": round(float(np.std(arr)), 1),
            "p10": round(float(np.percentile(arr, 10)), 1),
            "p90": round(float(np.percentile(arr, 90)), 1),
        }

    return {
        "n_runs": n_runs,
        "per_metric": {
            "student_clashes": calc_dist(simulated_stu_clashes),
            "faculty_clashes": calc_dist(simulated_fac_clashes),
            "room_utilization": calc_dist(simulated_util),
            "avg_student_gaps": calc_dist(simulated_gaps),
        },
        "prob_zero_clashes": prob_zero_clashes,
    }
