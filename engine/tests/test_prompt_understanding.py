"""
Robustness: a wide range of real prompts must parse into the right kind of decision,
ask a specific question when an amount is missing, or be recognised as off-topic.
Runs the deterministic parser (FUTUREFORK_OFFLINE=1 via conftest).
"""

from __future__ import annotations

import pytest

from ai.agents.parser import DecisionParseError, OffTopicPromptError, parse_financial_decision
from data.loader import load_sample_instance


@pytest.fixture(scope="module")
def personal():
    # Months run 2024-04 .. 2025-03
    return load_sample_instance("personal_upi.csv")


CASES = [
    # prompt, expected fields
    ("Buy a car for 8 lakh", {"decision_kind": "one_time", "total_cost": 800000, "item_label": "car"}),
    ("I want to purchase a MacBook worth Rs 1,50,000", {"total_cost": 150000, "item_label": "MacBook"}),
    ("Should I buy a ₹45,000 phone next month?", {"total_cost": 45000, "target_month": 1, "item_label": "phone"}),
    ("Spend 50k on a Goa trip in December without going below 1 lakh",
     {"total_cost": 50000, "emergency_floor": 100000, "target_month": 8}),
    ("Buy ₹12L of GPU servers on EMI while keeping ₹20L in reserve",
     {"total_cost": 1200000, "emergency_floor": 2000000, "financing_preference": "emi"}),
    ("Buy a house worth 75L with 20% down payment on a 20 year loan",
     {"total_cost": 7500000, "emi_months": 240, "downpayment_pct": 0.2, "financing_preference": "emi"}),
    ("Buy a bike for 1.2 lakh at 11% interest over 24 months, keep minimum balance of 40k",
     {"total_cost": 120000, "emi_months": 24, "emergency_floor": 40000, "interest_rate_annual": 0.11}),
    ("mujhe 50 hazar ka phone lena hai", {"total_cost": 50000, "item_label": "phone"}),
    ("$2000 laptop", {"total_cost": 2000, "item_label": "laptop"}),
    ("Buy a phone under 30k", {"total_cost": 30000}),
    ("Can I save 3 lakh by March?", {"total_cost": 300000, "target_month": 11, "interest_rate_annual": 0.0}),
    ("Hire 2 engineers at 20L per year each",
     {"decision_kind": "recurring_expense", "monthly_amount": 333333.33, "quantity": 2}),
    ("Add a ₹15k/month gym and coaching subscription",
     {"decision_kind": "recurring_expense", "monthly_amount": 15000}),
    ("rent goes up by 5000 per month from next month",
     {"decision_kind": "recurring_expense", "monthly_amount": 5000, "start_month": 1, "item_label": "rent"}),
    ("start a SIP of 10000 monthly", {"decision_kind": "recurring_expense", "monthly_amount": 10000}),
    ("Can we afford a new office at 1.5L monthly rent?",
     {"decision_kind": "recurring_expense", "monthly_amount": 150000}),
    ("What if my salary drops by 20%?", {"decision_kind": "income_change", "income_change_pct": -20}),
    ("I might lose my job for 3 months",
     {"decision_kind": "income_change", "income_change_pct": -100, "duration_months": 3}),
    ("Revenue falls 30% next quarter",
     {"decision_kind": "income_change", "income_change_pct": -30, "start_month": 3, "duration_months": 3}),
    ("what if I get a 15% raise", {"decision_kind": "income_change", "income_change_pct": 15}),
    ("I'll get a bonus of 1 lakh in March",
     {"decision_kind": "income_change", "income_change_monthly": 100000, "duration_months": 1, "start_month": 11}),
    ("Sell my old car for 3L", {"decision_kind": "income_change", "income_change_monthly": 300000}),
]


@pytest.mark.parametrize("prompt, expected", CASES, ids=[c[0][:40] for c in CASES])
def test_prompt_is_understood(personal, prompt, expected):
    d = parse_financial_decision(prompt, baseline=personal)
    for field, value in expected.items():
        actual = getattr(d, field)
        if isinstance(value, float) or isinstance(value, int) and not isinstance(value, bool):
            assert actual == pytest.approx(value, rel=0.01), f"{field}: {actual} != {value}"
        else:
            assert actual == value, f"{field}: {actual!r} != {value!r}"
    assert d.understood, "every parse explains what was understood"


@pytest.mark.parametrize("prompt, hint", [
    ("buy laptop", "How much will laptop cost"),
    ("What if my income changes?", "By how much"),
    ("Hire an engineer", "per month"),
])
def test_missing_amount_asks_a_specific_question(personal, prompt, hint):
    with pytest.raises(DecisionParseError, match=hint) as exc:
        parse_financial_decision(prompt, baseline=personal)
    assert not isinstance(exc.value, OffTopicPromptError)


@pytest.mark.parametrize("prompt", ["what is the weather today", "tell me a joke", "who won the match?"])
def test_off_topic_prompts_are_flagged(personal, prompt):
    with pytest.raises(OffTopicPromptError):
        parse_financial_decision(prompt, baseline=personal)
