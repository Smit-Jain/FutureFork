from __future__ import annotations
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

MetricDirection = Literal["minimize", "maximize"]
MetricName = Literal["student_clashes", "faculty_clashes", "room_utilization", "avg_student_gaps"]
DecisionStatus = Literal["ok", "needs_clarification", "unsupported"]
ScenarioStatus = Literal["queued", "running", "done", "failed"]

class Objective(BaseModel):
    metric: MetricName
    direction: MetricDirection

class Constraint(BaseModel):
    kind: str
    params: Dict[str, Any] = Field(default_factory=dict)

class ChangeSpec(BaseModel):
    type: str
    params: Dict[str, Any] = Field(default_factory=dict)

class DecisionSpec(BaseModel):
    id: str
    text: str
    dataset_id: str
    objectives: List[Objective] = Field(default_factory=list)
    constraints: List[Constraint] = Field(default_factory=list)
    change: ChangeSpec
    status: DecisionStatus
    message: Optional[str] = None

class Scenario(BaseModel):
    id: str
    decision_id: str
    parent_id: Optional[str] = None
    name: str
    description: str
    change: ChangeSpec
    status: ScenarioStatus

class SolverInfo(BaseModel):
    status: str
    objective: float
    runtime_s: float

class ScenarioMetrics(BaseModel):
    student_clashes: int
    faculty_clashes: int
    room_utilization: float
    avg_student_gaps: float
    capacity_fit: Optional[float] = None

class MetricDistribution(BaseModel):
    mean: float
    std: float
    p10: float
    p90: float

class SimulationResult(BaseModel):
    n_runs: int
    per_metric: Dict[str, MetricDistribution]
    prob_zero_clashes: float

class TimetableAssignment(BaseModel):
    event_id: str
    course: str
    faculty: str
    group: str
    room: str
    day: int
    slot: int
    clash: bool
    clash_reasons: Optional[List[str]] = None

class ScenarioResult(BaseModel):
    scenario_id: str
    solver: SolverInfo
    metrics: ScenarioMetrics
    simulation: SimulationResult
    timetable: List[TimetableAssignment]
    explanation: Optional[str] = None

class RunStatus(BaseModel):
    run_id: str
    decision_id: str
    overall_status: str
    scenarios: Dict[str, ScenarioStatus]
    progress_percent: Optional[float] = None

class ApiError(BaseModel):
    error: str
    message: str
