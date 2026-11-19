"""
FutureFork Optimization Engine Data Model
Pure Python domain models for financial problem instances, constraints, schedules,
and scenario evaluations (Member 2: OR-Tools CP-SAT Financial Solver).
Also retains backward-compatible definitions for academic scheduling instances.
The engine knows nothing about HTTP, databases, or LLMs.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Union
import numpy as np


# ==============================================================================
# FINANCIAL DATA MODELS (FUTUREFORK 2.0 FINANCIAL ENGINE)
# ==============================================================================

@dataclass
class ColumnMapping:
    """Specifies the column header mappings for parsing financial CSV files."""
    date_col: str = "Date"
    amount_col: Optional[str] = None
    debit_col: Optional[str] = None
    credit_col: Optional[str] = None
    category_col: Optional[str] = None
    description_col: Optional[str] = None
    type_col: Optional[str] = None
    date_format: Optional[str] = None
    starting_balance: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ColumnMapping":
        """Instantiate ColumnMapping from dictionary with flexible aliases."""
        if not data:
            return cls()

        date_col = (
            data.get("date_col") or data.get("date") or data.get("Date") or "Date"
        )
        amount_col = data.get("amount_col") or data.get("amount") or data.get("Amount")
        debit_col = (
            data.get("debit_col") or data.get("debit") or data.get("Debit") or
            data.get("withdrawal") or data.get("Withdrawal") or data.get("expense")
        )
        credit_col = (
            data.get("credit_col") or data.get("credit") or data.get("Credit") or
            data.get("deposit") or data.get("Deposit") or data.get("inflow")
        )
        category_col = (
            data.get("category_col") or data.get("category") or data.get("Category") or
            data.get("head") or data.get("Account_Head") or data.get("account_head")
        )
        description_col = (
            data.get("description_col") or data.get("description") or data.get("Description") or
            data.get("narration") or data.get("Narration") or data.get("particulars")
        )
        type_col = (
            data.get("type_col") or data.get("type") or data.get("Type") or
            data.get("transaction_type") or data.get("Txn Type")
        )
        date_format = data.get("date_format") or data.get("format")
        starting_balance = float(data.get("starting_balance") or 0.0)

        return cls(
            date_col=str(date_col).strip(),
            amount_col=str(amount_col).strip() if amount_col else None,
            debit_col=str(debit_col).strip() if debit_col else None,
            credit_col=str(credit_col).strip() if credit_col else None,
            category_col=str(category_col).strip() if category_col else None,
            description_col=str(description_col).strip() if description_col else None,
            type_col=str(type_col).strip() if type_col else None,
            date_format=str(date_format).strip() if date_format else None,
            starting_balance=starting_balance,
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FinancialProblemInstance:
    """
    Standardized Node 0 Baseline Financial Model consumed by optimization (Member 2),
    Monte Carlo simulation (Member 3), and AI explainer (Member 4).
    12 Months x 8 Canonical Expense Categories outflow matrix and 12-month inflow vector.
    """
    dataset_id: str
    name: str
    months: List[str]                            # 12 monthly periods e.g. ["2024-04", ...]
    categories: List[str]                        # Exactly 8 canonical expense categories
    category_types: Dict[str, str]               # category_name -> "fixed" | "flexible"
    outflows: List[List[float]]                  # 12 x 8 matrix of monthly outflows (>= 0.0)
    inflows: List[float]                         # 12-element vector of monthly inflows (>= 0.0)
    starting_balance: float                      # Starting treasury / bank balance
    category_means: Dict[str, float]             # mean (mu) per category (len 8)
    category_stds: Dict[str, float]              # standard deviation (sigma) per category (len 8)
    total_outflows: List[float]                  # monthly sum of outflows across categories (len 12)
    net_cash_flows: List[float]                  # monthly inflow - total_outflow (len 12)
    cash_balances: List[float]                   # cumulative cash balance at end of each month (len 12)
    summary: Dict[str, Any]                      # High-level aggregate statistics
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def outflow_matrix(self) -> np.ndarray:
        """Returns the (12, 8) outflow matrix as a float64 numpy array."""
        return np.array(self.outflows, dtype=np.float64)

    @property
    def inflow_vector(self) -> np.ndarray:
        """Returns the (12,) inflow vector as a float64 numpy array."""
        return np.array(self.inflows, dtype=np.float64)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize instance to a pure Python dictionary (JSON serializable)."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FinancialProblemInstance":
        """Reconstruct instance from serialized dictionary."""
        return cls(
            dataset_id=str(data["dataset_id"]),
            name=str(data["name"]),
            months=list(data["months"]),
            categories=list(data["categories"]),
            category_types=dict(data["category_types"]),
            outflows=[[float(x) for x in row] for row in data["outflows"]],
            inflows=[float(x) for x in data["inflows"]],
            starting_balance=float(data["starting_balance"]),
            category_means={k: float(v) for k, v in data["category_means"].items()},
            category_stds={k: float(v) for k, v in data["category_stds"].items()},
            total_outflows=[float(x) for x in data["total_outflows"]],
            net_cash_flows=[float(x) for x in data["net_cash_flows"]],
            cash_balances=[float(x) for x in data["cash_balances"]],
            summary=dict(data["summary"]),
            raw_metadata=dict(data.get("raw_metadata", {})),
        )


@dataclass
class PurchaseGoal:
    """
    Financial Purchase Decision Spec parsed from plain English:
    e.g. 'Buy 40 GPU lab PCs for ₹60L without dropping below ₹25L reserve'
    or 'Buy a ₹1.2L laptop on EMI without dropping below ₹30k emergency savings'
    """
    item_name: str                               # e.g. "GPU Lab PCs", "Laptop"
    total_cost: float                            # e.g. 6,000,000.0 or 120,000.0
    emergency_floor: float = 0.0                 # Minimum required reserve e.g. 2,500,000.0
    target_month: int = 0                        # Intended month (0 to 11, default 0: immediate)
    financing_mode: str = "auto"                 # "upfront" | "emi" | "phased" | "trim" | "auto"
    emi_months: int = 6                          # 3, 6, 9, or 12 months
    downpayment: float = 0.0                     # Upfront downpayment for EMI / lease
    interest_rate_annual: float = 0.10           # 10% annual financing rate
    phased_splits: List[Dict[str, Any]] = field(default_factory=list) # e.g. [{"month": 0, "pct": 0.5}, {"month": 6, "pct": 0.5}]
    max_trim_pct: float = 0.35                   # Maximum cut allowed across flexible categories (0.0 to 1.0)
    flexible_categories: List[str] = field(default_factory=list) # Categories eligible for trim

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PurchaseGoal":
        return cls(
            item_name=str(data.get("item_name") or "Capital Purchase"),
            total_cost=float(data.get("total_cost") or data.get("cost") or data.get("amount") or 0.0),
            emergency_floor=float(data.get("emergency_floor") or data.get("floor") or data.get("reserve") or 0.0),
            target_month=int(data.get("target_month") or 0),
            financing_mode=str(data.get("financing_mode") or "auto"),
            emi_months=int(data.get("emi_months") or 6),
            downpayment=float(data.get("downpayment") or 0.0),
            interest_rate_annual=float(data.get("interest_rate_annual") or 0.10),
            phased_splits=list(data.get("phased_splits") or []),
            max_trim_pct=float(data.get("max_trim_pct") or 0.35),
            flexible_categories=list(data.get("flexible_categories") or []),
        )


@dataclass
class MonthlyCashSchedule:
    """12-Month cash-flow coordinate record for a scenario schedule."""
    month_idx: int                               # 0 to 11
    month_str: str                               # e.g. "2024-04"
    inflow: float                                # Inflow for this month
    base_outflow: float                          # Baseline total outflow before trims
    trimmed_outflow: float                       # Actual total outflow after category trims
    purchase_cash_out: float                     # Cash outflow from purchase (upfront, EMI, phased)
    net_cash_flow: float                         # inflow - trimmed_outflow - purchase_cash_out
    closing_balance: float                       # Cumulative cash balance at end of month
    emergency_floor: float                       # Emergency reserve threshold
    is_below_floor: bool                         # True if closing_balance < emergency_floor
    floor_breach_amount: float                   # max(0, emergency_floor - closing_balance)
    category_outflows: Dict[str, float] = field(default_factory=dict) # breakdown per category

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CategoryTrim:
    """Detailed category-level trim recommendation."""
    category: str
    original_monthly_avg: float
    trimmed_monthly_avg: float
    cut_pct: float                               # 0.0 to 1.0 (e.g. 0.20 = 20% cut)
    monthly_savings: float                       # Savings per month (INR)
    annual_savings: float                        # Savings over 12 months (INR)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScenarioEvaluationResult:
    """
    Complete mathematical output of CP-SAT optimization + Monte Carlo simulation
    for a single scenario branch. Every number on screen comes from this structure.
    """
    scenario_id: str                             # "baseline" | "branch_upfront" | "branch_emi" | "branch_phased" | "branch_trim"
    scenario_name: str                           # Display name
    description: str                             # Policy explanation
    branch_type: str                             # "baseline" | "upfront" | "emi" | "phased" | "trim"
    is_feasible: bool                            # True if CP-SAT found a feasible schedule
    purchase_month: int                          # Optimized month index when purchase occurs
    total_purchase_cost: float                   # Principal purchase amount
    total_financing_interest: float              # Additional interest paid (for EMI/lease)
    total_trims_saved: float                     # Total expenditure trimmed across 12 months
    monthly_schedules: List[MonthlyCashSchedule] # 12 months detailed cash flow
    category_trims: Dict[str, float]             # category_name -> trim fraction (0.0 to 1.0)
    metrics: Dict[str, Any]                      # Deterministic risk and balance metrics
    solver_metadata: Dict[str, Any] = field(default_factory=dict)
    simulation_results: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d

    @property
    def cash_balances(self) -> List[float]:
        return [s.closing_balance for s in self.monthly_schedules]

    @property
    def lowest_balance(self) -> float:
        balances = self.cash_balances
        return min(balances) if balances else 0.0

    @property
    def months_below_floor(self) -> int:
        return sum(1 for s in self.monthly_schedules if s.is_below_floor)


# ==============================================================================
# BACKWARD COMPATIBLE SCHEDULING DATA MODELS (TIMETABLE MVP)
# ==============================================================================

@dataclass(frozen=True)
class Slot:
    day: int    # 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri
    index: int  # 0 to 7 (0-3 morning, 4-7 afternoon)

    @property
    def is_morning(self) -> bool:
        return 0 <= self.index <= 3

    @property
    def is_afternoon(self) -> bool:
        return 4 <= self.index <= 7

    @property
    def global_index(self) -> int:
        return self.day * 8 + self.index

    @classmethod
    def from_global(cls, idx: int) -> "Slot":
        return cls(day=idx // 8, index=idx % 8)


@dataclass
class Room:
    room_id: str
    name: str
    capacity: int
    type: str  # "lecture" | "lab"

    @property
    def is_lab(self) -> bool:
        return self.type == "lab"


@dataclass
class Faculty:
    faculty_id: str
    name: str
    dept: str = ""
    max_hours: int = 18


@dataclass
class StudentGroup:
    group_id: str
    name: str
    size: int = 30


@dataclass
class Event:
    event_id: str
    course_id: str
    course_name: str
    faculty_id: str
    group_id: str
    duration: int = 1  # in slots
    type: str = "lecture"  # "lecture" | "lab" | "elective"
    expected_enrollment: int = 30
    requires_lab: bool = False
    session_index: int = 1

    @property
    def is_lab(self) -> bool:
        return self.type == "lab" or self.requires_lab

    @property
    def is_elective(self) -> bool:
        return self.type == "elective"


@dataclass
class Assignment:
    event_id: str
    course: str
    faculty: str
    faculty_id: str
    group: str
    group_id: str
    room: str
    room_id: str
    day: int
    slot: int
    clash: bool = False
    clash_reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "course": self.course,
            "faculty": self.faculty,
            "faculty_id": self.faculty_id,
            "group": self.group,
            "group_id": self.group_id,
            "room": self.room,
            "room_id": self.room_id,
            "day": self.day,
            "slot": self.slot,
            "clash": self.clash,
            "clash_reasons": self.clash_reasons,
        }


@dataclass
class ProblemInstance:
    summary: Dict[str, Any]
    rooms: List[Room]
    faculty: List[Faculty]
    groups: List[StudentGroup]
    events: List[Event]
    students: List[Dict[str, Any]]
    baseline_assignments: List[Assignment]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProblemInstance":
        rooms = [
            Room(
                room_id=r["room_id"],
                name=r["name"],
                capacity=r["capacity"],
                type=r["type"],
            )
            for r in data.get("rooms", [])
        ]

        faculty = [
            Faculty(
                faculty_id=f["faculty_id"],
                name=f["name"],
                dept=f.get("dept", ""),
                max_hours=f.get("max_hours", 18),
            )
            for f in data.get("faculty", [])
        ]

        groups = [
            StudentGroup(
                group_id=g["group_id"],
                name=g["name"],
                size=g.get("size", 30),
            )
            for g in data.get("groups", [])
        ]

        events = [
            Event(
                event_id=e["event_id"],
                course_id=e["course_id"],
                course_name=e.get("course_name", e["course_id"]),
                faculty_id=e["faculty_id"],
                group_id=e["group_id"],
                duration=e.get("duration", 1),
                type=e.get("type", "lecture"),
                expected_enrollment=e.get("expected_enrollment", 30),
                requires_lab=e.get("requires_lab", e.get("type") == "lab"),
                session_index=e.get("session_index", 1),
            )
            for e in data.get("events", [])
        ]

        baseline_assignments = [
            Assignment(
                event_id=a["event_id"],
                course=a.get("course", a["event_id"]),
                faculty=a.get("faculty", ""),
                faculty_id=a.get("faculty_id", ""),
                group=a.get("group", ""),
                group_id=a.get("group_id", ""),
                room=a.get("room", ""),
                room_id=a.get("room_id", ""),
                day=a["day"],
                slot=a["slot"],
                clash=a.get("clash", False),
                clash_reasons=a.get("clash_reasons", []),
            )
            for a in data.get("baseline_timetable", [])
        ]

        return cls(
            summary=data.get("summary", {}),
            rooms=rooms,
            faculty=faculty,
            groups=groups,
            events=events,
            students=data.get("students", []),
            baseline_assignments=baseline_assignments,
        )
