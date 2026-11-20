"""
FutureFork Optimization and Simulation Engine
Includes OR-Tools CP-SAT financial cash-flow solver, scenario branching,
and backward-compatible academic timetable scheduling.
"""

# Financial Models
# Financial Change Transformers
from engine.changes import (
    apply_change,
    apply_discretionary_trim,
    apply_emi_split,
    apply_financial_change,
    apply_phased_delay,
    apply_upfront,
)

# Simulation & Metrics
from engine.metrics import compute_financial_metrics, evaluate
from engine.model import (
    Assignment,
    CategoryTrim,
    ColumnMapping,
    Event,
    Faculty,
    FinancialProblemInstance,
    MonthlyCashSchedule,
    ProblemInstance,
    PurchaseGoal,
    Room,
    ScenarioEvaluationResult,
    # Timetable models (backward compatibility)
    Slot,
    StudentGroup,
)
from engine.simulator import run_financial_monte_carlo, run_simulation

# Financial & Timetable Solvers
from engine.solver import (
    evaluate_baseline,
    evaluate_financial_baseline,
    evaluate_scenario,
    solve_all_financial_scenarios,
    solve_emi_branch,
    solve_financial_scenario,
    solve_phased_branch,
    # Timetable solvers (backward compatibility)
    solve_scenario,
    solve_trim_branch,
    solve_upfront_branch,
)

__all__ = [
    # Financial Models
    "ColumnMapping",
    "FinancialProblemInstance",
    "PurchaseGoal",
    "MonthlyCashSchedule",
    "CategoryTrim",
    "ScenarioEvaluationResult",
    # Financial Change Transformers
    "apply_upfront",
    "apply_emi_split",
    "apply_phased_delay",
    "apply_discretionary_trim",
    "apply_financial_change",
    # Financial Solvers
    "solve_financial_scenario",
    "solve_all_financial_scenarios",
    "evaluate_financial_baseline",
    "solve_upfront_branch",
    "solve_emi_branch",
    "solve_phased_branch",
    "solve_trim_branch",
    # Financial Simulation & Metrics (Member 3)
    "compute_financial_metrics",
    "run_financial_monte_carlo",
    # Timetable Backward Compatibility
    "Slot",
    "Room",
    "Faculty",
    "StudentGroup",
    "Event",
    "Assignment",
    "ProblemInstance",
    "evaluate",
    "apply_change",
    "solve_scenario",
    "evaluate_scenario",
    "evaluate_baseline",
    "run_simulation",
]
