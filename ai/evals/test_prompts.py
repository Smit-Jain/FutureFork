"""
FutureFork Evaluation Benchmark Suite
15 Test Prompts (10 Valid, 3 Vague, 2 Unsupported)
Target: >= 90% Pass Rate on Valid Prompts.
"""

import sys
from pathlib import Path
from typing import Dict, Any, List

# Add repo root to sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root))

from ai.agents.parser import parse_decision
from data.loader import default_loader

DATASET_SUMMARY = default_loader.load_summary()

TEST_CASES = [
    # 10 Valid Prompts (Including 3 permanent demo prompts)
    {
        "id": "V01_DEMO1",
        "prompt": "Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week.",
        "expected_status": "ok",
        "expected_change": "shift_time_window",
    },
    {
        "id": "V02_DEMO2",
        "prompt": "Remove Room 101 and reallocate all classes to remaining rooms with minimum clashes.",
        "expected_status": "ok",
        "expected_change": "room_change",
    },
    {
        "id": "V03_DEMO3",
        "prompt": "Cap faculty load at 15 teaching hours per week across all departments.",
        "expected_status": "ok",
        "expected_change": "faculty_load_cap",
    },
    {
        "id": "V04_ELECTIVES",
        "prompt": "Shift all elective lectures from afternoon to the morning band.",
        "expected_status": "ok",
        "expected_change": "shift_time_window",
    },
    {
        "id": "V05_LABS",
        "prompt": "Move computer science lab sessions to morning slots.",
        "expected_status": "ok",
        "expected_change": "shift_time_window",
    },
    {
        "id": "V06_ROOM_CLOSE",
        "prompt": "Close Auditorium 301 for maintenance and redistribute classes.",
        "expected_status": "ok",
        "expected_change": "room_change",
    },
    {
        "id": "V07_ROOM_ADD",
        "prompt": "Add reserve Lab 204 with 50 capacity for afternoon overflow.",
        "expected_status": "ok",
        "expected_change": "room_change",
    },
    {
        "id": "V08_HOURS_CAP",
        "prompt": "Restrict all professors to a maximum of 12 contact hours per week.",
        "expected_status": "ok",
        "expected_change": "faculty_load_cap",
    },
    {
        "id": "V09_LOWEST_ENROL",
        "prompt": "Shift lowest enrollment classes to morning slots.",
        "expected_status": "ok",
        "expected_change": "shift_time_window",
    },
    {
        "id": "V10_SHIFT_HOURS",
        "prompt": "Move afternoon classes to morning and limit faculty hours to 16.",
        "expected_status": "ok",
        "expected_change": "shift_time_window",
    },
    # 3 Vague Prompts
    {
        "id": "G01_VAGUE1",
        "prompt": "make it better",
        "expected_status": "needs_clarification",
    },
    {
        "id": "G02_VAGUE2",
        "prompt": "fix everything",
        "expected_status": "needs_clarification",
    },
    {
        "id": "G03_VAGUE3",
        "prompt": "help optimize",
        "expected_status": "needs_clarification",
    },
    # 2 Unsupported Prompts
    {
        "id": "U01_CRYPTO",
        "prompt": "Predict tomorrow's bitcoin price and stock market trends",
        "expected_status": "unsupported",
    },
    {
        "id": "U02_SALARY",
        "prompt": "Fire faculty members who have low ratings and give salary bonuses",
        "expected_status": "unsupported",
    },
]

def run_eval_suite():
    print("==================================================")
    print(" FutureFork 15-Prompt AI Parser Evaluation Suite")
    print("==================================================")

    passed_valid = 0
    total_valid = 10
    passed_other = 0
    total_other = 5

    for tc in TEST_CASES:
        res = parse_decision(tc["prompt"], DATASET_SUMMARY)
        actual_status = res.get("status")
        actual_change = res.get("change", {}).get("type")

        is_valid_type = tc["expected_status"] == "ok"
        status_match = (actual_status == tc["expected_status"])
        change_match = (
            actual_change == tc["expected_change"]
            if tc.get("expected_change")
            else True
        )

        test_passed = status_match and change_match

        mark = "[PASS]" if test_passed else "[FAIL]"
        print(f" {mark} {tc['id']}: Status={actual_status} (Expected={tc['expected_status']})")

        if is_valid_type:
            if test_passed:
                passed_valid += 1
        else:
            if test_passed:
                passed_other += 1

    valid_rate = (passed_valid / total_valid) * 100.0
    overall_rate = ((passed_valid + passed_other) / len(TEST_CASES)) * 100.0

    print("==================================================")
    print(f" Valid Prompt Accuracy: {passed_valid}/{total_valid} ({valid_rate:.1f}%) [Target >= 90%]")
    print(f" Edge Case Accuracy:    {passed_other}/{total_other} ({(passed_other/total_other)*100.0:.1f}%)")
    print(f" Overall Benchmark:     {passed_valid + passed_other}/{len(TEST_CASES)} ({overall_rate:.1f}%)")
    print("==================================================")

    assert valid_rate >= 90.0, f"Valid prompt accuracy {valid_rate}% is below 90% target"
    return valid_rate >= 90.0

if __name__ == "__main__":
    success = run_eval_suite()
    sys.exit(0 if success else 1)
