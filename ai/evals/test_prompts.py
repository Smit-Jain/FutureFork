"""
FutureFork Financial Evaluation Benchmark Suite (Member 4)

6 financial test prompts covering personal, institute, and startup datasets.
Works both as:
  - pytest: pytest ai/evals/test_prompts.py -v
  - standalone: python ai/evals/test_prompts.py

FUTUREFORK_OFFLINE=1 must be set before import to disable LLM calls.
"""

from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Always run offline for deterministic tests
os.environ.setdefault("FUTUREFORK_OFFLINE", "1")

# Ensure repo root on sys.path
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# ===========================================================================
# Imports (after path setup)
# ===========================================================================

from ai.agents.explainer import (
    _build_allowed_facts,
    explain_branches,
    run_numeric_guard,
)
from ai.agents.mapper import propose_mapping
from ai.agents.parser import ParsedDecision, parse_financial_decision, parse_indian_amount
from ai.agents.scenario import ForkSet, build_forks
from data.loader import load_sample_csv_bytes, load_sample_instance
from engine.model import ColumnMapping, ScenarioEvaluationResult

# ===========================================================================
# Test prompt definitions
# ===========================================================================

TEST_PROMPTS = [
    # (id, prompt, csv_name, starting_balance, dataset_type, expected)
    {
        "id": "P1",
        "label": "Personal laptop EMI",
        "prompt": "Buy a ₹1.2L laptop on EMI without dropping below ₹30k emergency savings",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {
            "total_cost": 120000.0,
            "emergency_floor": 30000.0,
            "financing_preference": "emi",
            "quantity": None,
        },
    },
    {
        "id": "P2",
        "label": "Personal smartphone upfront",
        "prompt": "Buy a ₹45k smartphone upfront without dropping below ₹25k reserve",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {
            "total_cost": 45000.0,
            "emergency_floor": 25000.0,
            "financing_preference": "upfront",
            "quantity": None,
        },
    },
    {
        "id": "I1",
        "label": "Institute 40 GPU PCs",
        "prompt": "Buy 40 GPU lab PCs for ₹60L without dropping below ₹25L reserve",
        "csv_name": "institute_erp_1.8cr.csv",
        "starting_balance": 2500000.0,
        "dataset_type": "institute",
        "expected": {
            "total_cost": 6000000.0,
            "emergency_floor": 2500000.0,
            "quantity": 40,
        },
    },
    {
        "id": "I2",
        "label": "Institute generator",
        "prompt": "Purchase lab generator replacement for ₹8L without dropping below ₹10L reserve",
        "csv_name": "institute_erp_1.8cr.csv",
        "starting_balance": 2500000.0,
        "dataset_type": "institute",
        "expected": {
            "total_cost": 800000.0,
            "emergency_floor": 1000000.0,
            "quantity": None,
        },
    },
    {
        "id": "S1",
        "label": "Startup GPU cloud credits",
        "prompt": "Buy GPU cloud credits worth ₹5L without dropping below ₹3L reserve",
        "csv_name": "startup_pnl.csv",
        "starting_balance": 6000000.0,
        "dataset_type": "startup",
        "expected": {
            "total_cost": 500000.0,
            "emergency_floor": 300000.0,
            "quantity": None,
        },
    },
    {
        "id": "S2",
        "label": "Startup 2 engineers",
        "prompt": "Hire 2 engineers for ₹18L annual cost without dropping below ₹5L reserve",
        "csv_name": "startup_pnl.csv",
        "starting_balance": 6000000.0,
        "dataset_type": "startup",
        "expected": {
            # "₹18L annual cost" for both engineers is ₹1.5L/month of payroll, not a one-off purchase
            "decision_kind": "recurring_expense",
            "monthly_amount": 150000.0,
            "emergency_floor": 500000.0,
            "quantity": 2,
        },
    },
    {
        "id": "S3",
        "label": "Startup per-head hiring",
        "prompt": "Hire 3 engineers at ₹1.2L per month each",
        "csv_name": "startup_pnl.csv",
        "starting_balance": 6000000.0,
        "dataset_type": "startup",
        "expected": {"decision_kind": "recurring_expense", "monthly_amount": 360000.0, "emergency_floor": 0.0},
    },
    {
        "id": "P3",
        "label": "Personal pay cut",
        "prompt": "What if my salary drops by 20% for 6 months? Keep at least 50k",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {"decision_kind": "income_change", "income_change_pct": -20.0, "duration_months": 6,
                     "emergency_floor": 50000.0},
    },
    {
        "id": "P4",
        "label": "Personal job loss",
        "prompt": "I might lose my job for 3 months",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {"decision_kind": "income_change", "income_change_pct": -100.0, "duration_months": 3,
                     "emergency_floor": 0.0},
    },
    {
        "id": "P5",
        "label": "Hinglish purchase",
        "prompt": "mujhe 50 hazar ka phone lena hai",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {"total_cost": 50000.0, "emergency_floor": 0.0},
    },
    {
        "id": "P6",
        "label": "Home loan with down payment",
        "prompt": "Buy a house worth 75L with 20% down payment on a 20 year loan",
        "csv_name": "personal_upi.csv",
        "starting_balance": 150000.0,
        "dataset_type": "personal",
        "expected": {"total_cost": 7500000.0, "emergency_floor": 0.0, "financing_preference": "emi",
                     "emi_months": 240, "downpayment_pct": 0.2},
    },
]

# CSV headers for each dataset type (used in mapper tests)
_PERSONAL_HEADERS = ["Date", "Narration", "Category", "Debit", "Credit", "Balance"]
_INSTITUTE_HEADERS = ["Voucher_No", "Date", "Account_Head", "Department", "Narration", "Debit", "Credit"]
_STARTUP_HEADERS = ["Date", "Description", "Category", "Amount", "Type"]

# ===========================================================================
# Helper: load baseline instance
# ===========================================================================


def _load_baseline(csv_name: str, starting_balance: float, dataset_type: str) -> Any:
    """Load a FinancialProblemInstance for the given CSV."""
    # Determine mapping from dataset type
    if dataset_type == "institute":
        mapping = ColumnMapping(
            date_col="Date",
            debit_col="Debit",
            credit_col="Credit",
            category_col="Account_Head",
            description_col="Narration",
            date_format="%d/%m/%Y",
            starting_balance=starting_balance,
        )
    elif dataset_type == "startup":
        mapping = ColumnMapping(
            date_col="Date",
            amount_col="Amount",
            category_col="Category",
            description_col="Description",
            type_col="Type",
            date_format="%Y-%m-%d",
            starting_balance=starting_balance,
        )
    else:  # personal
        mapping = ColumnMapping(
            date_col="Date",
            debit_col="Debit",
            credit_col="Credit",
            category_col="Category",
            description_col="Narration",
            starting_balance=starting_balance,
        )
    return load_sample_instance(csv_name, starting_balance=starting_balance, mapping=mapping)


# ===========================================================================
# Full-pipeline test runner
# ===========================================================================


def run_prompt_test(tc: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Run all assertions for a single test prompt.

    Returns:
        (passed: bool, messages: list[str])
    """
    failures: List[str] = []
    prompt = tc["prompt"]
    csv_name = tc["csv_name"]
    starting_balance = tc["starting_balance"]
    dataset_type = tc["dataset_type"]
    expected = tc["expected"]

    # --- (a) Mapper returns valid ColumnMapping ---
    try:
        csv_bytes = load_sample_csv_bytes(csv_name)
        csv_text = csv_bytes.decode("utf-8", errors="replace")
        # Parse headers from first line
        first_line = csv_text.split("\n")[0].strip()
        headers = [h.strip() for h in first_line.split(",")]
        sample_lines = [line for line in csv_text.split("\n")[1:4] if line.strip()]
        sample_rows = [[v.strip() for v in line.split(",")] for line in sample_lines]

        mapper_result = propose_mapping(headers, sample_rows, dataset_type_hint=dataset_type)
        assert isinstance(mapper_result.mapping, ColumnMapping), "mapper did not return ColumnMapping"
        assert mapper_result.mapping.date_col, "mapper: date_col is empty"

        # Verify ingestor accepts the mapping
        baseline = _load_baseline(csv_name, starting_balance, dataset_type)
        assert baseline is not None, "Failed to load baseline instance"
        assert len(baseline.months) == 12, f"Expected 12 months, got {len(baseline.months)}"
    except Exception as exc:
        failures.append(f"(a) Mapper/Ingestor: {exc}")
        baseline = None

    if baseline is None:
        try:
            baseline = _load_baseline(csv_name, starting_balance, dataset_type)
        except Exception as exc:
            failures.append(f"(a) Fallback baseline load: {exc}")
            return False, failures

    # --- (b) Parser extracts correct fields ---
    try:
        parsed = parse_financial_decision(prompt, baseline=baseline, dataset_type=dataset_type)
        assert isinstance(parsed, ParsedDecision), "parser did not return ParsedDecision"

        def close(actual: float, exp: float) -> bool:
            return abs(actual - exp) / max(abs(exp), 1.0) < 0.02

        exp_kind = expected.get("decision_kind", "one_time")
        if parsed.decision_kind != exp_kind:
            failures.append(f"(b) decision_kind={parsed.decision_kind!r}, expected={exp_kind!r}")
        for name in ("total_cost", "emergency_floor", "monthly_amount", "income_change_pct", "downpayment_pct"):
            if name in expected and not close(float(getattr(parsed, name)), float(expected[name])):
                failures.append(f"(b) {name}={getattr(parsed, name)}, expected={expected[name]}")
        for name in ("quantity", "financing_preference", "duration_months", "emi_months"):
            if expected.get(name) is not None and getattr(parsed, name) != expected[name]:
                failures.append(f"(b) {name}={getattr(parsed, name)!r}, expected={expected[name]!r}")
        if not parsed.understood:
            failures.append("(b) missing 'understood' summary")

    except Exception as exc:
        failures.append(f"(b) Parser: {exc}")
        parsed = None

    if parsed is None:
        return False, failures

    # --- (c) Forks match the decision kind ---
    from engine.changes import FORKS_BY_KIND

    try:
        fork_set = build_forks(prompt, baseline=baseline, dataset_type=dataset_type)
        assert isinstance(fork_set, ForkSet), "build_forks did not return ForkSet"
        fork_ids = [f.fork_id for f in fork_set.forks]
        expected_ids = list(FORKS_BY_KIND[parsed.decision_kind])
        if fork_ids != expected_ids:
            failures.append(f"(c) forks={fork_ids}, expected={expected_ids}")
        not_ready = [f.fork_id for f in fork_set.forks if f.status != "ready"]
        if not_ready:
            failures.append(f"(c) forks not ready: {not_ready}")
    except Exception as exc:
        failures.append(f"(c) ForkSet: {exc}")
        fork_set = None

    if fork_set is None:
        return False, failures

    # --- (d) Every fork is solved by the engine (CP-SAT + Monte Carlo) ---
    from engine.solver import evaluate_financial_branch

    try:
        branch_results = {"baseline": evaluate_financial_branch(baseline, "baseline", fork_set.baseline_goal, n_sims=50)}
        for fork in fork_set.forks:
            branch_results[fork.fork_id] = evaluate_financial_branch(baseline, fork.fork_id, fork.goal, n_sims=50)

        required_keys = {"survival_score_pct", "cash_out_risk_pct", "lowest_balance", "p10_lowest_balance"}
        for scenario_id, result in branch_results.items():
            missing = required_keys - set(result.metrics)
            if missing:
                failures.append(f"(d) {scenario_id}: missing keys {sorted(missing)}")
    except Exception as exc:
        failures.append(f"(d) Solver: {exc}")
        branch_results = None

    if branch_results is None:
        return False, failures

    # Build branch results subset (non-baseline)
    fork_branch_results = {k: v for k, v in branch_results.items() if k != "baseline"}

    # --- (e) Explainer output passes NumericGuard with 0 violations ---
    try:
        explanation = explain_branches(
            decision=parsed,
            branch_results=fork_branch_results,
            baseline=baseline,
        )
        guard = explanation.guard_report
        if not guard.passed:
            violations_summary = [(v.offending_text, v.kind) for v in guard.violations]
            failures.append(
                f"(e) NumericGuard: {len(guard.violations)} violation(s): {violations_summary}"
            )
    except Exception as exc:
        failures.append(f"(e) Explainer: {exc}")

    return len(failures) == 0, failures


# ===========================================================================
# Unit tests (also run under pytest)
# ===========================================================================


def test_indian_amount_parser() -> None:
    """Verify parse_indian_amount handles all Indian number formats."""
    cases = [
        ("₹60L", 6_000_000.0),
        ("₹1.8Cr", 18_000_000.0),
        ("30k", 30_000.0),
        ("₹1.2L", 120_000.0),
        ("60,00,000", 6_000_000.0),
        ("1.8 crore", 18_000_000.0),
        ("1.2 lakh", 120_000.0),
        ("₹25L", 2_500_000.0),
        ("Rs 1.2L", 120_000.0),
    ]
    for text, expected_rupees in cases:
        result = parse_indian_amount(text)
        assert result is not None, f"parse_indian_amount({text!r}) returned None"
        assert abs(result - expected_rupees) < 1.0, (
            f"parse_indian_amount({text!r}) = {result}, expected {expected_rupees}"
        )

    # Test percent is not parsed as rupees (should work without multiplier confusion)
    # 12.5% → parse_indian_amount should still return 12.5 (no multiplier)
    pct_result = parse_indian_amount("12.5%")
    assert pct_result is not None and abs(pct_result - 12.5) < 0.01, (
        f"parse_indian_amount('12.5%') = {pct_result}"
    )


def test_numeric_guard_violations() -> None:
    """
    Craft an explanation with fabricated ₹99L, 42%, Month 11 → guard must flag all 3.
    """
    # Build a minimal branch_results with known values (survival=75%, lowest_balance=50000)
    from engine.model import MonthlyCashSchedule, ScenarioEvaluationResult

    # Build dummy schedules
    dummy_schedules = [
        MonthlyCashSchedule(
            month_idx=i,
            month_str=f"2024-{i+1:02d}",
            inflow=10000.0,
            base_outflow=8000.0,
            trimmed_outflow=8000.0,
            purchase_cash_out=0.0,
            net_cash_flow=2000.0,
            closing_balance=50000.0 + i * 2000,
            emergency_floor=30000.0,
            is_below_floor=False,
            floor_breach_amount=0.0,
        )
        for i in range(12)
    ]

    dummy_result = ScenarioEvaluationResult(
        scenario_id="upfront",
        scenario_name="Upfront",
        description="Test",
        branch_type="upfront",
        is_feasible=True,
        purchase_month=0,
        total_purchase_cost=120000.0,
        total_financing_interest=0.0,
        total_trims_saved=0.0,
        monthly_schedules=dummy_schedules,
        category_trims={},
        metrics={
            "survival_score_pct": 75.0,
            "cash_out_risk_pct": 5.0,
            "lowest_balance": 50000.0,
            "p10_lowest_balance": 40000.0,
            "emergency_floor": 30000.0,
        },
        simulation_results=None,
    )

    branch_results = {"upfront": dummy_result}

    # Fabricated text with invalid numbers
    bad_text = "The lowest balance is ₹99L which is 42% safe. Buy in Month 11."
    allowed_money, allowed_pcts, allowed_months = _build_allowed_facts(branch_results, None)
    allowed_months.update({0, 1, 2, 3, 4, 6, 9, 10, 12})

    report = run_numeric_guard(bad_text, allowed_money, allowed_pcts, allowed_months)

    assert not report.passed, "Guard should have FAILED on fabricated text"
    violation_kinds = [v.kind for v in report.violations]
    assert "money" in violation_kinds, f"Expected money violation, got: {violation_kinds}"
    assert "percent" in violation_kinds, f"Expected percent violation, got: {violation_kinds}"
    assert "month" in violation_kinds, f"Expected month violation, got: {violation_kinds}"


def test_numeric_guard_pass() -> None:
    """
    Template explanation from real branch_results must pass with 0 violations.
    """
    from ai.agents.explainer import _build_template_explanation
    from ai.agents.parser import ParsedDecision
    from engine.model import MonthlyCashSchedule, ScenarioEvaluationResult

    # Build a realistic set of branch_results
    def _make_result(fid: str, survival: float, risk: float, lb: float) -> ScenarioEvaluationResult:
        schedules = [
            MonthlyCashSchedule(
                month_idx=i,
                month_str=f"2024-{i+1:02d}",
                inflow=50000.0,
                base_outflow=40000.0,
                trimmed_outflow=40000.0,
                purchase_cash_out=10000.0 if i == 0 else 0.0,
                net_cash_flow=0.0,
                closing_balance=lb + i * 5000,
                emergency_floor=25000.0,
                is_below_floor=lb < 25000.0,
                floor_breach_amount=max(0.0, 25000.0 - lb),
            )
            for i in range(12)
        ]
        return ScenarioEvaluationResult(
            scenario_id=fid,
            scenario_name=fid.title(),
            description=f"{fid} branch",
            branch_type=fid,
            is_feasible=True,
            purchase_month=0,
            total_purchase_cost=120000.0,
            total_financing_interest=0.0,
            total_trims_saved=0.0,
            monthly_schedules=schedules,
            category_trims={},
            metrics={
                "survival_score_pct": survival,
                "cash_out_risk_pct": risk,
                "lowest_balance": lb,
                "p10_lowest_balance": lb * 0.9,
                "emergency_floor": 25000.0,
                "total_purchase_cost": 120000.0,
            },
            simulation_results={
                "cash_out_risk_pct": risk,
                "p10_lowest_balance": lb * 0.9,
                "survival_score_pct": survival,
            },
        )

    branch_results = {
        "upfront": _make_result("upfront", 82.0, 3.0, 55000.0),
        "emi": _make_result("emi", 90.0, 1.5, 70000.0),
        "phased": _make_result("phased", 87.0, 2.0, 62000.0),
        "trim": _make_result("trim", 85.0, 2.5, 58000.0),
    }

    decision = ParsedDecision(
        item_label="Laptop",
        total_cost=120000.0,
        emergency_floor=25000.0,
        quantity=None,
        target_month=0,
        financing_preference="emi",
        emi_months=12,
        dataset_type="personal",
        raw_prompt="Buy a ₹1.2L laptop on EMI without dropping below ₹25k reserve",
        defaulted_fields=[],
    )

    allowed_money, allowed_pcts, allowed_months = _build_allowed_facts(branch_results, decision)
    allowed_months.update({0, 1, 2, 3, 4, 6, 9, 10, 12})

    template_text = _build_template_explanation(
        decision, branch_results, allowed_money, allowed_pcts, allowed_months
    )

    report = run_numeric_guard(template_text, allowed_money, allowed_pcts, allowed_months)
    assert report.passed, (
        f"Template explanation FAILED guard with {len(report.violations)} violation(s):\n"
        + "\n".join(f"  {v.offending_text!r} ({v.kind})" for v in report.violations)
        + f"\n\nTemplate text:\n{template_text}"
    )


def test_mapper_hallucination_rejection() -> None:
    """If LLM returns a column not in headers, it's rejected and regex is used."""
    from ai.agents.mapper import _validate_llm_mapping

    headers = ["Date", "Narration", "Category", "Debit", "Credit", "Balance"]
    # Simulate LLM returning hallucinated columns
    llm_dict = {
        "date_col": "Date",          # valid
        "amount_col": "Amount",      # HALLUCINATED — not in headers
        "debit_col": "Withdrawal",   # HALLUCINATED
        "credit_col": "Credit",      # valid
        "category_col": "Category",  # valid
        "description_col": "Narration",  # valid
        "type_col": "TxnType",       # HALLUCINATED
        "date_format": None,
    }

    result = _validate_llm_mapping(llm_dict, headers)
    # With 3 hallucinations out of 7 non-null — 3/7 ≈ 43% < 50%, so it won't be entirely rejected
    # But the hallucinated columns should be set to None
    if result is not None:
        assert result.get("amount_col") is None, "Hallucinated amount_col should be None"
        assert result.get("debit_col") is None, "Hallucinated debit_col should be None"
        assert result.get("type_col") is None, "Hallucinated type_col should be None"
        assert result.get("date_col") == "Date", "Valid date_col should be preserved"
        assert result.get("credit_col") == "Credit", "Valid credit_col should be preserved"

    # Now test total rejection: >50% hallucinated
    llm_dict_bad = {
        "date_col": "FakeDate",          # HALLUCINATED
        "amount_col": "FakeAmount",      # HALLUCINATED
        "debit_col": "FakeDebit",        # HALLUCINATED
        "credit_col": "FakeCredit",      # HALLUCINATED
        "category_col": "Category",     # valid
        "description_col": "Narration", # valid
        "type_col": None,
        "date_format": None,
    }
    result_bad = _validate_llm_mapping(llm_dict_bad, headers)
    assert result_bad is None, "Should reject mapping with >50% hallucinations"


def test_mapper_regex_fallback_personal() -> None:
    """Regex fallback on personal_upi.csv headers returns correct mapping."""
    from ai.agents.mapper import propose_mapping

    headers = _PERSONAL_HEADERS
    result = propose_mapping(headers, [], dataset_type_hint="personal")

    assert result.tier_used == "regex", f"Expected 'regex', got {result.tier_used!r}"
    assert result.dataset_type == "personal"
    assert result.mapping.date_col == "Date"
    assert result.mapping.debit_col == "Debit"
    assert result.mapping.credit_col == "Credit"
    assert result.mapping.category_col == "Category"
    assert result.mapping.description_col == "Narration"
    assert result.confidence >= 0.7


def test_mapper_regex_fallback_institute() -> None:
    """Regex fallback on institute ERP headers returns correct mapping."""
    from ai.agents.mapper import propose_mapping

    headers = _INSTITUTE_HEADERS
    result = propose_mapping(headers, [], dataset_type_hint="institute")

    assert result.tier_used == "regex", f"Expected 'regex', got {result.tier_used!r}"
    assert result.dataset_type == "institute"
    assert result.mapping.date_col == "Date"
    assert result.mapping.debit_col == "Debit"
    assert result.mapping.credit_col == "Credit"
    assert result.mapping.category_col == "Account_Head"
    assert result.mapping.description_col == "Narration"
    assert result.confidence >= 0.7


def test_mapper_regex_fallback_startup() -> None:
    """Regex fallback on startup P&L headers returns correct mapping."""
    from ai.agents.mapper import propose_mapping

    headers = _STARTUP_HEADERS
    result = propose_mapping(headers, [], dataset_type_hint="startup")

    assert result.tier_used == "regex", f"Expected 'regex', got {result.tier_used!r}"
    assert result.dataset_type == "startup"
    assert result.mapping.date_col == "Date"
    assert result.mapping.amount_col == "Amount"
    assert result.mapping.category_col == "Category"
    assert result.mapping.description_col == "Description"
    assert result.mapping.type_col == "Type"
    assert result.confidence >= 0.7


def test_tax_explanations_pass_guard() -> None:
    """Tax explanations (template path) only quote engine numbers and name the right regime."""
    from datetime import date

    from ai.agents.tax_explainer import explain_tax_report
    from engine.tax import build_tax_report

    cases = [
        ({"basic_da": 600_000, "other_salary": 700_000, "tds": 20_000}, date(2026, 7, 1), "new regime"),
        ({"basic_da": 1_000_000, "hra_received": 500_000, "other_salary": 300_000, "rent_paid": 600_000,
          "metro_city": True, "home_loan_interest": 200_000, "d_80c": 150_000, "d_80ccd1b": 50_000,
          "d_80d_self": 25_000, "d_80d_parents": 50_000, "parents_senior": True}, date(2026, 7, 1), "old regime"),
        ({"taxpayer_type": "freelancer", "gross_receipts": 4_000_000, "digital_receipts": 4_000_000},
         date(2026, 11, 22), "ITR-4"),
    ]
    for inputs, as_of, expect in cases:
        out = explain_tax_report(build_tax_report(inputs, as_of=as_of))
        assert out["guard_passed"], out["text"]
        assert expect in out["text"], (expect, out["text"])
    # A made-up rupee figure is caught
    report = build_tax_report(cases[0][0], as_of=cases[0][1])
    from ai.agents.tax_explainer import allowed_facts
    money, pcts = allowed_facts(report)
    assert not run_numeric_guard("You save ₹37,123 by switching.", money, pcts, set()).passed


# Collect all unit tests
UNIT_TESTS = [
    ("test_indian_amount_parser", test_indian_amount_parser),
    ("test_numeric_guard_violations", test_numeric_guard_violations),
    ("test_numeric_guard_pass", test_numeric_guard_pass),
    ("test_mapper_hallucination_rejection", test_mapper_hallucination_rejection),
    ("test_mapper_regex_fallback_personal", test_mapper_regex_fallback_personal),
    ("test_mapper_regex_fallback_institute", test_mapper_regex_fallback_institute),
    ("test_mapper_regex_fallback_startup", test_mapper_regex_fallback_startup),
    ("test_tax_explanations_pass_guard", test_tax_explanations_pass_guard),
]

# ===========================================================================
# __main__ runner: PASS/FAIL table + pipeline tests
# ===========================================================================


def _run_unit_tests() -> Tuple[int, int]:
    """Run all unit tests. Returns (passed, total)."""
    passed = 0
    total = len(UNIT_TESTS)
    print("\n" + "=" * 70)
    print("UNIT TESTS")
    print("=" * 70)
    for name, fn in UNIT_TESTS:
        try:
            fn()
            print(f"  ✓  {name}")
            passed += 1
        except Exception as exc:
            print(f"  ✗  {name}")
            print(f"       {exc}")
            if os.environ.get("FUTUREFORK_VERBOSE_TESTS"):
                traceback.print_exc()
    return passed, total


def _run_pipeline_tests() -> Tuple[int, int]:
    """Run all 6 pipeline prompt tests. Returns (passed, total)."""
    passed = 0
    total = len(TEST_PROMPTS)
    print("\n" + "=" * 70)
    print("PIPELINE TESTS (6 Financial Prompts)")
    print("=" * 70)

    for tc in TEST_PROMPTS:
        tid = tc["id"]
        label = tc["label"]
        try:
            ok, failures = run_prompt_test(tc)
        except Exception as exc:
            ok = False
            failures = [f"Unexpected exception: {exc}"]
            if os.environ.get("FUTUREFORK_VERBOSE_TESTS"):
                traceback.print_exc()

        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {status}  [{tid}] {label}")
        if not ok:
            for f in failures:
                print(f"         → {f}")
        else:
            passed += 1

    return passed, total


def main() -> int:
    """Main entry point for standalone execution."""
    print("\n" + "=" * 70)
    print("FutureFork Financial Eval Suite  (FUTUREFORK_OFFLINE=1)")
    print("=" * 70)

    u_passed, u_total = _run_unit_tests()
    p_passed, p_total = _run_pipeline_tests()

    total_passed = u_passed + p_passed
    total_tests = u_total + p_total

    print("\n" + "=" * 70)
    print(f"SUMMARY: {total_passed}/{total_tests} passed")
    print(f"  Unit tests:     {u_passed}/{u_total}")
    print(f"  Pipeline tests: {p_passed}/{p_total}")
    print("=" * 70)

    if total_passed == total_tests:
        print("✓ ALL TESTS PASSED — 100% pass rate, 0 NumericGuard violations")
        return 0
    else:
        print(f"✗ {total_tests - total_passed} TEST(S) FAILED")
        return 1


# ===========================================================================
# pytest-compatible test functions (auto-discovered)
# ===========================================================================


def test_p1_personal_laptop_emi():
    ok, failures = run_prompt_test(TEST_PROMPTS[0])
    assert ok, "P1 failures:\n" + "\n".join(failures)


def test_p2_personal_smartphone_upfront():
    ok, failures = run_prompt_test(TEST_PROMPTS[1])
    assert ok, "P2 failures:\n" + "\n".join(failures)


def test_i1_institute_gpu_pcs():
    ok, failures = run_prompt_test(TEST_PROMPTS[2])
    assert ok, "I1 failures:\n" + "\n".join(failures)


def test_i2_institute_generator():
    ok, failures = run_prompt_test(TEST_PROMPTS[3])
    assert ok, "I2 failures:\n" + "\n".join(failures)


def test_s1_startup_gpu_credits():
    ok, failures = run_prompt_test(TEST_PROMPTS[4])
    assert ok, "S1 failures:\n" + "\n".join(failures)


def test_s2_startup_engineers():
    ok, failures = run_prompt_test(TEST_PROMPTS[5])
    assert ok, "S2 failures:\n" + "\n".join(failures)


if __name__ == "__main__":
    sys.exit(main())
