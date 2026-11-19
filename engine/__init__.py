"""
FutureFork Optimization and Simulation Engine
Includes OR-Tools CP-SAT financial cash-flow solver, scenario branching,
and backward-compatible academic timetable scheduling.
"""

# Financial Models
from engine.model import (
    ColumnMapping,
    FinancialProblemInstance,
    PurchaseGoal,
    MonthlyCashSchedule,
    CategoryTrim,
    ScenarioEvaluationResult,
    # Timetable models (backward compatibility)
    Slot,
    Room,
    Faculty,
    StudentGroup,
    Event,
    Assignment,
    ProblemInstance,
)

# Financial Change Transformers
from engine.changes import (
    apply_upfront,
    apply_emi_split,
    apply_phased_delay,
    apply_discretionary_trim,
    apply_financial_change,
    apply_change,
)

# Financial & Timetable Solvers
from engine.solver import (
    solve_financial_scenario,
    solve_all_financial_scenarios,
    evaluate_financial_baseline,
    solve_upfront_branch,
    solve_emi_branch,
    solve_phased_branch,
    solve_trim_branch,
    # Timetable solvers (backward compatibility)
    solve_scenario,
    evaluate_scenario,
    evaluate_baseline,
)

# Simulation & Metrics
from engine.metrics import evaluate
from engine.simulator import run_simulation

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
