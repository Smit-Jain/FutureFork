"""
Unit tests for engine/changes.py
Verifies catalog change appliers and selection rules.
"""

import pytest

from data.loader import default_loader
from engine.changes import apply_change
from engine.model import ProblemInstance


@pytest.fixture
def instance():
    data = default_loader.load_bundle()
    return ProblemInstance.from_dict(data)

def test_shift_time_window_all(instance):
    change = {
        "type": "shift_time_window",
        "params": {"from": "afternoon", "to": "morning", "selection": "all"},
    }
    mod = apply_change(instance, change)
    assert mod["change_type"] == "shift_time_window"
    assert len(mod["target_events"]) > 0
    # Every target event must have allowed_slots restricted to morning slots (0..3)
    for ev_id in mod["target_events"]:
        assert mod["allowed_slots_per_event"][ev_id] == [0, 1, 2, 3]

def test_shift_time_window_electives(instance):
    change = {
        "type": "shift_time_window",
        "params": {"from": "afternoon", "to": "morning", "selection": "electives"},
    }
    mod = apply_change(instance, change)
    for ev_id in mod["target_events"]:
        ev = next(e for e in instance.events if e.event_id == ev_id)
        assert ev.is_elective

def test_room_change_remove_and_add(instance):
    # Remove R101
    change_remove = {
        "type": "room_change",
        "params": {"action": "remove", "room_ids": ["R101"]},
    }
    mod_rem = apply_change(instance, change_remove)
    assert all(r.room_id != "R101" for r in mod_rem["rooms"])
    assert len(mod_rem["rooms"]) == len(instance.rooms) - 1

    # Add Lab 204
    change_add = {
        "type": "room_change",
        "params": {"action": "add", "capacity": 55, "type": "lab"},
    }
    mod_add = apply_change(instance, change_add)
    assert len(mod_add["rooms"]) == len(instance.rooms) + 1
    assert any(r.capacity == 55 and r.is_lab for r in mod_add["rooms"])

def test_faculty_load_cap(instance):
    change = {
        "type": "faculty_load_cap",
        "params": {"max_hours_per_week": 14},
    }
    mod = apply_change(instance, change)
    assert all(f.max_hours == 14 for f in mod["faculty"])
