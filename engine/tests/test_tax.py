"""
Income-tax engine, FY 2025-26 (AY 2026-27). Every expected figure below was worked out by hand
from the slab tables in engine/tax/rules.py; the working is in each docstring.
"""

from __future__ import annotations

from datetime import date

import pytest

from engine.tax import TaxInputs, build_tax_report, compute_tax, hra_exemption
from engine.tax.report import fmt_inr

ON_TIME = date(2026, 7, 1)
BELATED = date(2026, 11, 22)
CLOSED = date(2027, 1, 15)


def tax(regime: str, **kw) -> float:
    return compute_tax(TaxInputs.from_dict(kw), regime)["total_tax"]


# A salaried taxpayer with HRA, rent, a home loan and full deductions: old regime wins
OLD_WINS = dict(
    basic_da=1_000_000, hra_received=500_000, other_salary=300_000, rent_paid=600_000, metro_city=True,
    professional_tax=2_500, home_loan_interest=200_000, d_80c=150_000, d_80ccd1b=50_000,
    d_80d_self=25_000, d_80d_parents=50_000, parents_senior=True,
)


# ─── New regime ──────────────────────────────────────────────────────────────

def test_salary_of_12_75_lakh_pays_no_tax_in_new_regime():
    """12.75L − 75k standard deduction = 12L. Slab tax 20k + 40k = 60k, fully rebated u/s 87A."""
    assert tax("new", basic_da=600_000, other_salary=675_000) == 0


def test_marginal_relief_just_above_12_lakh():
    """13L − 75k = 12.25L. Slab tax 63,750 is capped at the 25k above 12L; + 4% cess = 26,000."""
    b = compute_tax(TaxInputs.from_dict(dict(basic_da=600_000, other_salary=700_000)), "new")
    assert b["slab_tax"] == 63_750
    assert b["rebate"] == 38_750
    assert b["total_tax"] == 26_000


def test_twenty_lakh_salary_new_regime():
    """20L − 75k = 19.25L: 20k + 40k + 60k + 65k = 1,85,000; + 7,400 cess = 1,92,400."""
    assert tax("new", basic_da=1_000_000, hra_received=400_000, other_salary=600_000) == 192_400


# ─── Old regime ──────────────────────────────────────────────────────────────

def test_hra_exemption_is_the_least_of_three():
    # min(3L received, 3L − 60k = 2.4L, 50% × 6L = 3L) = 2.4L
    assert hra_exemption(600_000, 300_000, 300_000, metro=True) == 240_000
    # non-metro: 40% × 6L = 2.4L; rent − 10% = 3.4L; received 2.5L → 2.4L
    assert hra_exemption(600_000, 250_000, 400_000, metro=False) == 240_000
    assert hra_exemption(600_000, 300_000, 0, metro=True) == 0


def test_old_regime_with_hra_and_deductions():
    """12L gross − 2.4L HRA − 50k − 2.5k PT = 9,07,500; − 2.25L (80C, 80D, 1B) = 6,82,500.
    Tax 12,500 + 36,500 = 49,000; + 1,960 cess = 50,960. The new regime is 0 (11.25L ≤ 12L)."""
    kw = dict(basic_da=600_000, hra_received=300_000, other_salary=300_000, rent_paid=300_000, metro_city=True,
              professional_tax=2_500, d_80c=150_000, d_80d_self=25_000, d_80ccd1b=50_000)
    assert tax("old", **kw) == 50_960
    assert tax("new", **kw) == 0


def test_old_regime_wins_with_heavy_deductions():
    """Old: 18L − 5L HRA − 50k − 2.5k = 12,47,500; − 2L home loan = 10,47,500; − 2.75L = 7,72,500.
    Tax 12,500 + 54,500 = 67,000 → 69,680 with cess. New: 17.25L → 1,45,000 → 1,50,800."""
    assert tax("old", **OLD_WINS) == 69_680
    assert tax("new", **OLD_WINS) == 150_800
    r = build_tax_report(OLD_WINS, as_of=ON_TIME)
    assert r["recommended"] == "old" and r["regime_saving"] == 81_120
    assert r["verdict"]["headline"] == "Your tax is ₹69,680 if you opt for the old regime."


def test_belated_return_is_forced_into_new_regime():
    r = build_tax_report(OLD_WINS, as_of=BELATED)
    assert r["window"]["status"] == "belated" and r["window"]["section"] == "139(4)"
    assert r["cheaper"] == "old" and r["recommended"] == "new"
    assert r["verdict"]["headline"] == "Your tax is ₹1,50,800 under the new regime."
    assert "only option for a late" in r["verdict"]["subline"]
    assert r["late_fee"] == 5_000
    assert r["verdict"]["outcome_amount"] == 155_800


def test_after_december_only_an_updated_return_is_possible():
    r = build_tax_report(OLD_WINS, as_of=CLOSED)
    assert r["window"]["status"] == "closed" and r["window"]["section"] == "139(8A)"


def test_senior_citizen_slabs_and_80ttb():
    """Age 60–80, old regime, ₹6L pension-like salary + ₹80k FD interest.
    6L − 50k + 80k = 6,30,000; − 50k 80TTB = 5,80,000. Tax: 3L–5L 10,000 + 80k × 20% = 26,000 → 27,040."""
    assert tax("old", age_band="60_to_80", basic_da=600_000, deposit_interest=80_000) == 27_040


# ─── Presumptive income ──────────────────────────────────────────────────────

def test_freelancer_44ada_files_itr4():
    """40L receipts × 50% = 20L + 20k interest = 20.2L. New: 20k+40k+60k+80k+5k = 2,05,000 → 2,13,200."""
    kw = dict(taxpayer_type="freelancer", gross_receipts=4_000_000, digital_receipts=4_000_000, savings_interest=20_000)
    assert tax("new", **kw) == 213_200
    r = build_tax_report(kw, as_of=BELATED)
    assert r["form"]["form"] == "ITR-4"
    assert r["window"]["due_date"] == "2026-08-31"


def test_44ada_limit_depends_on_cash_share():
    digital = dict(taxpayer_type="freelancer", gross_receipts=6_000_000, digital_receipts=6_000_000)
    cashy = dict(taxpayer_type="freelancer", gross_receipts=6_000_000, digital_receipts=3_000_000)
    assert build_tax_report(digital, as_of=BELATED)["form"]["form"] == "ITR-4"  # within ₹75L
    r = build_tax_report(cashy, as_of=BELATED)  # above ₹50L with heavy cash
    assert r["form"]["form"] == "ITR-3" and r["form"]["supported"] is False


def test_44ad_business_uses_6_and_8_percent():
    """1 Cr receipts: 80L digital × 6% + 20L cash × 8% = 6.4L → rebated to 0 in the new regime."""
    b = compute_tax(TaxInputs.from_dict(dict(taxpayer_type="business", gross_receipts=10_000_000,
                                             digital_receipts=8_000_000)), "new")
    assert b["heads"]["business"] == 640_000
    assert b["total_tax"] == 0


def test_declared_profit_never_goes_below_presumptive_rate():
    b = compute_tax(TaxInputs.from_dict(dict(taxpayer_type="freelancer", gross_receipts=2_000_000,
                                             digital_receipts=2_000_000, declared_profit=500_000)), "new")
    assert b["heads"]["business"] == 1_000_000


# ─── Capital gains ───────────────────────────────────────────────────────────

def test_equity_gains_are_taxed_at_special_rates_without_rebate():
    """Salary 8L − 75k = 7.25L: slab 16,250, rebated. STCG 1L × 20% = 20k; LTCG (3L − 1.25L) × 12.5% = 21,875.
    41,875 + 4% = 43,550."""
    kw = dict(basic_da=500_000, other_salary=300_000, stcg_111a=100_000, ltcg_112a=300_000)
    assert tax("new", **kw) == 43_550
    assert build_tax_report(kw, as_of=BELATED)["form"]["form"] == "ITR-2"


def test_ltcg_within_exemption_keeps_itr1():
    kw = dict(basic_da=500_000, other_salary=300_000, ltcg_112a=100_000)
    assert tax("new", **kw) == 0
    assert build_tax_report(kw, as_of=BELATED)["form"]["form"] == "ITR-1"


def test_unused_basic_exemption_absorbs_ltcg():
    """No other income: 5L LTCG − 1.25L exempt − 4L unused basic exemption = 0 taxable."""
    assert tax("new", ltcg_112a=500_000) == 0


# ─── Surcharge ───────────────────────────────────────────────────────────────

def test_surcharge_at_sixty_lakh():
    """59.25L taxable: 3,00,000 + 35.25L × 30% = 13,57,500; + 10% surcharge 1,35,750; + 4% = 15,52,980."""
    assert tax("new", basic_da=6_000_000) == 1_552_980


def test_marginal_relief_on_surcharge():
    """50.1L taxable: tax 10,83,000. At 50L tax is 10,80,000, so tax + surcharge can't exceed
    10,80,000 + 10,000. Surcharge 1,08,300 → 7,000. Total 10,90,000 × 1.04 = 11,33,600."""
    b = compute_tax(TaxInputs.from_dict(dict(basic_da=5_085_000)), "new")
    assert b["surcharge"] == 7_000
    assert b["total_tax"] == 1_133_600
    assert build_tax_report(dict(basic_da=5_085_000), as_of=BELATED)["form"]["form"] == "ITR-2"


# ─── Refund, payable, fees, forms ────────────────────────────────────────────

def test_refund_and_payable_after_tds():
    refund = build_tax_report(dict(basic_da=600_000, other_salary=675_000, tds=12_000), as_of=ON_TIME)
    assert refund["verdict"]["outcome"] == "refund" and refund["verdict"]["outcome_amount"] == 12_000
    payable = build_tax_report(dict(basic_da=600_000, other_salary=700_000, tds=20_000), as_of=ON_TIME)
    assert payable["verdict"]["outcome"] == "payable" and payable["verdict"]["outcome_amount"] == 6_000


def test_late_fee_is_smaller_for_small_incomes_and_zero_below_exemption():
    small = build_tax_report(dict(basic_da=525_000), as_of=BELATED)  # 4.5L taxable
    assert small["late_fee"] == 1_000
    tiny = build_tax_report(dict(basic_da=400_000), as_of=BELATED)  # 3.25L, below 4L
    assert tiny["late_fee"] == 0


def test_non_resident_files_itr2_and_gets_no_rebate():
    kw = dict(resident=False, basic_da=600_000, other_salary=675_000)
    assert tax("new", **kw) == 62_400  # 60,000 + 4% cess, no 87A
    assert build_tax_report(kw, as_of=BELATED)["form"]["form"] == "ITR-2"


# ─── Moves, checklist, validation ────────────────────────────────────────────

def test_employer_nps_is_the_best_move_for_a_new_regime_salary():
    """20L salary: shifting 14% of 10L basic (1.4L) into employer NPS cuts new-regime tax
    from 1,92,400 to 1,63,280 (17.85L taxable)."""
    r = build_tax_report(dict(basic_da=1_000_000, hra_received=400_000, other_salary=600_000), as_of=BELATED)
    moves = r["savings"]["moves"]
    assert r["savings"]["fy"] == "2026-27"
    assert moves[0]["key"] == "employer_nps"
    assert moves[0]["saving"] == 29_120 and moves[0]["tax_after"] == 163_280


def test_checklist_carries_engine_numbers():
    r = build_tax_report(dict(basic_da=600_000, other_salary=700_000, tds=20_000), as_of=BELATED)
    steps = r["checklist"]["steps"]
    assert steps[0]["title"].startswith("Log in")
    values = {f["label"]: f["value"] for s in steps for f in s["fields"]}
    assert values["Total tax liability (portal should match)"] == 26_000
    assert values["Self-assessment tax"] == 6_000
    assert values["Late fee u/s 234F"] == 5_000
    assert steps[-1]["title"].startswith("Submit and e-verify")


def test_planning_year_has_no_portal_steps():
    r = build_tax_report(dict(fy="2026-27", basic_da=1_000_000), as_of=BELATED)
    assert r["window"]["status"] == "planning"
    assert len(r["checklist"]["steps"]) == 1


@pytest.mark.parametrize("bad", [dict(basic_da=-1), dict(taxpayer_type="ceo"), dict(fy="1999-00"),
                                 dict(gross_receipts=10, digital_receipts=20)])
def test_invalid_inputs_are_rejected(bad):
    with pytest.raises(ValueError):
        build_tax_report(bad, as_of=BELATED)


def test_indian_number_format():
    assert fmt_inr(1_52_980) == "₹1,52,980"
    assert fmt_inr(1_00_00_000) == "₹1,00,00,000"
    assert fmt_inr(999) == "₹999"
