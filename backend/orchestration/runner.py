"""
FutureFork Orchestration Runner
Executes decision evaluation across all scenario branches asynchronously.
Provides per-scenario status, caching, timeouts, and error isolation.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from backend.db.repository import Repository
from backend.db.session import SessionLocal
from backend.orchestration.caching import compute_cache_key
from backend.orchestration.integrations import (
    call_evaluate_scenario,
    call_explain,
)

logger = logging.getLogger("futurefork.runner")

# Thread pool executor for background async jobs
background_executor = ThreadPoolExecutor(max_workers=4)

def execute_decision_pipeline(decision_id: str, run_id: str):
    """Background task executing the end-to-end evaluation pipeline."""
    db = SessionLocal()
    repo = Repository(db)

    try:
        decision = repo.get_decision(decision_id)
        if not decision:
            logger.error(f"Decision {decision_id} not found in DB")
            return

        dataset_id = decision.get("dataset_id", "sample_univ_v1")
        dataset_row = repo.get_dataset(dataset_id)
        dataset_payload = dataset_row["payload"] if dataset_row and dataset_row.get("payload") else {}
        baseline_timetable = dataset_payload.get("baseline_timetable", [])

        scenarios = repo.get_scenarios(decision_id)
        if not scenarios:
            logger.error(f"No scenarios found for decision {decision_id}")
            return

        scenario_statuses = {s["id"]: "queued" for s in scenarios}
        repo.update_run_status(run_id, "running", 10.0, scenario_statuses)

        completed_count = 0
        total_scenarios = len(scenarios)
        results: Dict[str, Any] = {}

        for sc in scenarios:
            sc_id = sc["id"]
            scenario_statuses[sc_id] = "running"
            repo.update_scenario_status(sc_id, "running")
            repo.update_run_status(
                run_id,
                "running",
                10.0 + (completed_count / total_scenarios) * 80.0,
                scenario_statuses,
            )

            # Check cache
            cache_key = compute_cache_key(dataset_id, sc.get("change", {}))
            cached = repo.get_cached_result(cache_key)

            if cached:
                logger.info(f"Cache hit for scenario {sc_id} (key: {cache_key[:8]}...)")
                res = dict(cached)
                res["scenario_id"] = sc_id
            else:
                start_time = time.time()
                try:
                    res = call_evaluate_scenario(
                        dataset=dataset_payload,
                        baseline_timetable=baseline_timetable,
                        scenario=sc,
                        n_sims=300,
                        seed=42,
                    )
                    # Cache result
                    repo.set_cached_result(cache_key, res)
                    elapsed = time.time() - start_time
                    logger.info(f"Evaluated scenario {sc_id} in {elapsed:.2f}s")
                except Exception as ex:
                    logger.exception(f"Error evaluating scenario {sc_id}: {ex}")
                    scenario_statuses[sc_id] = "failed"
                    repo.update_scenario_status(sc_id, "failed")
                    continue

            # Save result to DB
            repo.save_result(res)
            results[sc_id] = res
            scenario_statuses[sc_id] = "done"
            repo.update_scenario_status(sc_id, "done")
            completed_count += 1

            repo.update_run_status(
                run_id,
                "running",
                10.0 + (completed_count / total_scenarios) * 80.0,
                scenario_statuses,
            )

        # Generate AI explanation with strict numeric grounding
        try:
            explanation = call_explain(decision, results)
        except Exception as ex:
            logger.exception(f"Explainer error: {ex}")
            explanation = {
                "summary": "Completed optimization evaluation across scenario branches.",
                "tradeoffs": {},
                "recommendation": "Review side-by-side dashboard metrics for optimal selection.",
                "model_generated": False,
            }

        # Store explanation in baseline result or comparison
        if "baseline" in results:
            results["baseline"]["explanation"] = explanation.get("summary")
            repo.save_result(results["baseline"])

        # Finalize run
        repo.update_run_status(run_id, "done", 100.0, scenario_statuses)
        logger.info(f"Pipeline finished successfully for decision {decision_id}, run {run_id}")

    except Exception as e:
        logger.exception(f"Pipeline failed for run {run_id}: {e}")
        repo.update_run_status(run_id, "failed", 0.0, {})
    finally:
        db.close()


def dispatch_decision_run(decision_id: str, run_id: str):
    """Schedules background pipeline run without blocking HTTP response."""
    background_executor.submit(execute_decision_pipeline, decision_id, run_id)
