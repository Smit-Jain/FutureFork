"""
FutureFork End-to-End Test Suite
Runs demo prompts and contract tests against the FastAPI backend.
Supports both Direct Router Integration (instant, sandboxed) and Live HTTP URL testing.
"""

import argparse
import sys
import time
from pathlib import Path

# Add project root to sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

from backend.api import routes
from backend.db.repository import SessionLocal, init_db

DEMO_PROMPTS = [
    "Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week.",
    "Remove Room 101 and reallocate all classes to remaining rooms with minimum clashes.",
    "Cap faculty load at 15 teaching hours per week across all departments.",
]

class DirectApiClient:
    """Invokes API routes directly in-process without loopback socket restrictions."""
    def __init__(self):
        init_db()
        self.db = SessionLocal()

    def get_health(self):
        return routes.health_check()

    def get_datasets(self):
        return routes.list_datasets(db=self.db)

    def get_dataset(self, dataset_id: str):
        return routes.get_dataset(dataset_id, db=self.db)

    def create_decision(self, text: str, dataset_id: str):
        req = routes.CreateDecisionRequest(text=text, dataset_id=dataset_id)
        return routes.create_decision(req, db=self.db)

    def generate_scenarios(self, decision_id: str):
        return routes.generate_scenarios_endpoint(decision_id, db=self.db)

    def start_run(self, decision_id: str):
        return routes.start_run(decision_id, db=self.db)

    def get_run_status(self, run_id: str):
        return routes.get_run_status(run_id, db=self.db)

    def get_scenario_result(self, scenario_id: str):
        return routes.get_scenario_result(scenario_id, db=self.db)

    def get_comparison(self, decision_id: str):
        return routes.get_decision_comparison(decision_id, db=self.db)

    def branch_scenario(self, parent_id: str, name: str, change: dict):
        req = routes.BranchScenarioRequest(name=name, change=change)
        return routes.branch_scenario_endpoint(parent_id, req, db=self.db)

    def close(self):
        self.db.close()

class LiveApiClient:
    """Invokes live HTTP endpoints on Render or local host."""
    def __init__(self, base_url: str):
        import httpx
        self.client = httpx.Client(base_url=base_url, timeout=30.0)

    def get_health(self):
        return self.client.get("/health").json()

    def get_datasets(self):
        return self.client.get("/datasets").json()

    def get_dataset(self, dataset_id: str):
        return self.client.get(f"/datasets/{dataset_id}").json()

    def create_decision(self, text: str, dataset_id: str):
        return self.client.post("/decisions", json={"text": text, "dataset_id": dataset_id}).json()

    def generate_scenarios(self, decision_id: str):
        return self.client.post(f"/decisions/{decision_id}/scenarios").json()

    def start_run(self, decision_id: str):
        return self.client.post(f"/decisions/{decision_id}/run").json()

    def get_run_status(self, run_id: str):
        return self.client.get(f"/runs/{run_id}").json()

    def get_scenario_result(self, scenario_id: str):
        return self.client.get(f"/scenarios/{scenario_id}/result").json()

    def get_comparison(self, decision_id: str):
        return self.client.get(f"/decisions/{decision_id}/compare").json()

    def branch_scenario(self, parent_id: str, name: str, change: dict):
        return self.client.post(f"/scenarios/{parent_id}/branch", json={"name": name, "change": change}).json()

    def close(self):
        self.client.close()

def run_tests(base_url: str = None):
    print("==================================================", flush=True)
    print(" FutureFork End-to-End Test Suite (Person B)", flush=True)
    print("==================================================", flush=True)

    if base_url:
        client = LiveApiClient(base_url)
        mode = f"Live URL ({base_url})"
    else:
        client = DirectApiClient()
        mode = "In-Process Direct API Client"

    print(f"Test Execution Mode: {mode}\n", flush=True)
    passed = 0
    failed = 0

    def assert_test(condition: bool, name: str):
        nonlocal passed, failed
        if condition:
            print(f" [PASS] {name}", flush=True)
            passed += 1
        else:
            print(f" [FAIL] {name}", flush=True)
            failed += 1

    try:
        # 1. Health Check
        health = client.get_health()
        assert_test(health.get("status") == "ok", "GET /health liveness check")

        # 2. Datasets
        datasets = client.get_datasets()
        assert_test(len(datasets) > 0, "GET /datasets returns dataset list")

        ds = client.get_dataset("sample_univ_v1")
        assert_test(
            ds.get("baseline_metrics", {}).get("student_clashes") == 8,
            "GET /datasets/sample_univ_v1 returns valid baseline metrics (8 student clashes)",
        )

        # 3. Demo Prompt 1: Shift Time Window
        print("\n--- Testing Demo Prompt 1 (Shift Time Window) ---", flush=True)
        p1 = DEMO_PROMPTS[0]
        spec = client.create_decision(p1, "sample_univ_v1")
        d_id = spec["id"]
        assert_test(spec.get("status") == "ok", "POST /decisions DecisionSpec status is 'ok'")
        assert_test(
            spec.get("change", {}).get("type") == "shift_time_window",
            "Change type parsed as 'shift_time_window'",
        )

        scenarios = client.generate_scenarios(d_id)
        assert_test(any(s["id"] == "baseline" for s in scenarios), "Baseline root scenario exists")
        assert_test(len(scenarios) >= 3, "At least 3 scenarios generated (Baseline + A + B)")

        run_res = client.start_run(d_id)
        run_id = run_res["run_id"]
        assert_test(bool(run_id), "POST /decisions/{id}/run successfully dispatches execution")

        # Poll status
        print(" Polling run status until completion...", flush=True)
        run_data = {}
        for _ in range(25):
            run_data = client.get_run_status(run_id)
            if run_data.get("overall_status") == "done":
                break
            time.sleep(0.3)

        assert_test(run_data.get("overall_status") == "done", "GET /runs/{run_id} completes with 'done'")

        # Scenario Result
        res_b = client.get_scenario_result("scenario_b")
        assert_test(
            res_b.get("metrics", {}).get("faculty_clashes") == 0,
            "Scenario B achieves 0 faculty clashes",
        )
        assert_test(
            res_b.get("simulation", {}).get("prob_zero_clashes", 0) > 0.1,
            "Monte Carlo simulation reports positive zero-clash probability",
        )

        # Comparison Endpoint
        comp = client.get_comparison(d_id)
        assert_test(
            "explanation" in comp and comp["explanation"].get("recommendation"),
            "GET /decisions/{id}/compare includes AI recommendation grounded in numbers",
        )

        # Phase 2 Stub: Branch Scenario
        child = client.branch_scenario(
            "scenario_b",
            "Scenario D: Custom Departmental Branch",
            {"type": "room_change", "params": {"action": "add", "capacity": 40}},
        )
        assert_test(child.get("id") and child.get("parent_id") == "scenario_b", "POST /scenarios/{id}/branch creates child scenario")

        # 4. Demo Prompt 2: Room Change
        print("\n--- Testing Demo Prompt 2 (Room Change) ---", flush=True)
        p2 = DEMO_PROMPTS[1]
        spec2 = client.create_decision(p2, "sample_univ_v1")
        assert_test(spec2.get("change", {}).get("type") == "room_change", "Detected 'room_change' change type")

        # 5. Demo Prompt 3: Faculty Load Cap
        print("\n--- Testing Demo Prompt 3 (Faculty Load Cap) ---", flush=True)
        p3 = DEMO_PROMPTS[2]
        spec3 = client.create_decision(p3, "sample_univ_v1")
        assert_test(spec3.get("change", {}).get("type") == "faculty_load_cap", "Detected 'faculty_load_cap' change type")

        # 6. Edge Cases: Unsupported and Clarification
        print("\n--- Testing Edge Cases ---", flush=True)
        unsupported = client.create_decision("Predict bitcoin crypto price forecast", "sample_univ_v1")
        assert_test(unsupported.get("status") == "unsupported", "Unsupported domain returns status 'unsupported'")

        vague = client.create_decision("make it better", "sample_univ_v1")
        assert_test(vague.get("status") == "needs_clarification", "Vague prompt returns status 'needs_clarification'")

    finally:
        client.close()

    print("\n==================================================", flush=True)
    print(f" E2E Test Results: {passed} PASSED, {failed} FAILED", flush=True)
    print("==================================================", flush=True)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FutureFork E2E Test Suite")
    parser.add_argument("--url", type=str, default=None, help="Base URL of deployed API")
    args = parser.parse_args()
    run_tests(args.url)
