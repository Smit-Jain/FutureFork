"""
Unit tests for engine/metrics.py
Verifies mathematical definitions of the four core metrics.
"""

import pytest
from engine.metrics import evaluate
from engine.model import ProblemInstance
from data.loader import default_loader

def test_tiny_handcrafted_metrics():
    # Tiny test with 2 events:
    # Event 1: GRP1, FAC1, Day 0, Slot 1, Room R1
    # Event 2: GRP1, FAC1, Day 0, Slot 1, Room R2 (Student clash AND Faculty clash!)
    tiny_timetable = [
        {"event_id": "E1", "group_id": "GRP1", "faculty_id": "FAC1", "room_id": "R1", "day": 0, "slot": 1},
        {"event_id": "E2", "group_id": "GRP1", "faculty_id": "FAC1", "room_id": "R2", "day": 0, "slot": 1},
    ]
    tiny_dataset = {
        "rooms": [{"room_id": "R1", "capacity": 50}, {"room_id": "R2", "capacity": 50}],
        "events": [
            {"event_id": "E1", "expected_enrollment": 30},
            {"event_id": "E2", "expected_enrollment": 30},
        ],
    }

    metrics = evaluate(tiny_timetable, tiny_dataset)
    assert metrics["student_clashes"] == 1
    assert metrics["faculty_clashes"] == 1
    assert metrics["avg_student_gaps"] == 0.0

def test_handcrafted_student_gaps():
    # Group has class at slot 1 and slot 4 on Monday (Day 0)
    # Empty slots strictly between 1 and 4 are slots 2 and 3 => 2 hours gap!
    gap_timetable = [
        {"event_id": "E1", "group_id": "GRP1", "faculty_id": "FAC1", "room_id": "R1", "day": 0, "slot": 1},
        {"event_id": "E2", "group_id": "GRP1", "faculty_id": "FAC2", "room_id": "R1", "day": 0, "slot": 4},
    ]
    gap_dataset = {"rooms": [{"room_id": "R1", "capacity": 50}], "events": []}
    metrics = evaluate(gap_timetable, gap_dataset)
    assert metrics["student_clashes"] == 0
    assert metrics["avg_student_gaps"] == 2.0

def test_baseline_dataset_metrics():
    # Must report the planned flaws on B's baseline
    data = default_loader.load_bundle()
    metrics = evaluate(data["baseline_timetable"], data)
    assert metrics["student_clashes"] == 8
    assert metrics["faculty_clashes"] == 3
    assert metrics["room_utilization"] >= 60.0
