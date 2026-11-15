"""
FutureFork Optimization Engine Data Model
Pure Python domain models for timetable scheduling, resources, and constraints.
The engine knows nothing about HTTP, databases, or LLMs.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

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
