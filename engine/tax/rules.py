"""
Income-tax rules for Indian resident individuals, one frozen table per financial year.

Every figure here was checked against public sources during implementation:
  - Finance Act 2025 / Budget 2025 (new-regime slabs, ₹12L rebate, ₹75k standard deduction),
    as summarised by the Income Tax Department and ClearTax/Bajaj Finserv slab tables.
  - ITR forms for AY 2026-27 (ITR-1/ITR-4 allow LTCG u/s 112A up to ₹1.25L; ITR-1 allows up
    to two house properties): CBDT notification, Business Standard / ClearTax summaries.
  - Due dates: 31 Jul 2026 (ITR-1/2), 31 Aug 2026 (non-audit ITR-3/4); belated returns
    until 31 Dec 2026 (incometax.gov.in help: "Income Tax Returns").
  - Section 115BAC(6): the old regime can only be chosen in a return filed by the due date,
    so a belated return is taxed under the new regime.

Add a new year by adding a new entry to RULES; never edit a year once people have used it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Tuple

# (upper limit of the band, rate). The last band uses float("inf").
Slabs = Tuple[Tuple[float, float], ...]

INF = float("inf")


@dataclass(frozen=True)
class RegimeRules:
    slabs: Slabs
    standard_deduction: float
    rebate_income_limit: float     # 87A: total income up to this
    rebate_max: float              # 87A: rebate cap
    rebate_marginal_relief: bool   # tax can't exceed income above the limit
    employer_nps_pct: float        # 80CCD(2) cap, % of basic + DA
    surcharge_cap: float           # highest surcharge rate allowed
    chapter_via: bool              # 80C, 80D, ... allowed
    hra_exemption: bool
    self_occupied_interest: bool   # 24(b) on a self-occupied home
    professional_tax: bool         # 16(iii)
    house_loss_setoff: float       # house-property loss set off against other heads


@dataclass(frozen=True)
class TaxRules:
    fy: str
    ay: str
    status: str                    # "filing" | "planning"
    new: RegimeRules
    old: RegimeRules
    old_slabs_by_age: Dict[str, Slabs]
    cess_rate: float
    # (income above, surcharge rate), ascending
    surcharge_bands: Tuple[Tuple[float, float], ...]
    special_surcharge_cap: float   # 111A / 112A gains
    stcg_111a_rate: float
    ltcg_112a_rate: float
    ltcg_112a_exempt: float
    # Chapter VI-A caps (old regime)
    cap_80c: float
    cap_80ccd1b: float
    cap_80d_self: float
    cap_80d_self_senior: float
    cap_80d_parents: float
    cap_80d_parents_senior: float
    cap_80tta: float
    cap_80ttb: float
    cap_24b: float
    cap_professional_tax: float
    house_std_deduction_pct: float  # 30% of net annual value of a let-out house
    # ITR form limits
    itr1_income_limit: float = 5_000_000
    itr1_ltcg_limit: float = 125_000
    itr1_max_houses: int = 2
    # Filing calendar
    due_date_salaried: date = date(2026, 7, 31)
    due_date_business: date = date(2026, 8, 31)
    belated_until: date = date(2026, 12, 31)
    late_fee: float = 5_000
    late_fee_small: float = 1_000
    late_fee_small_income: float = 500_000
    # 44ADA / 44AD
    rate_44ada: float = 0.50
    limit_44ada: float = 5_000_000
    limit_44ada_digital: float = 7_500_000
    rate_44ad_cash: float = 0.08
    rate_44ad_digital: float = 0.06
    limit_44ad: float = 20_000_000
    limit_44ad_digital: float = 30_000_000
    digital_threshold: float = 0.95   # higher limits apply if cash receipts are at most 5%
    advance_tax_threshold: float = 10_000

    def regime(self, name: str) -> RegimeRules:
        return self.new if name == "new" else self.old

    def old_slabs(self, age_band: str) -> Slabs:
        return self.old_slabs_by_age.get(age_band, self.old_slabs_by_age["below_60"])


_NEW_SLABS_2025: Slabs = (
    (400_000, 0.0),
    (800_000, 0.05),
    (1_200_000, 0.10),
    (1_600_000, 0.15),
    (2_000_000, 0.20),
    (2_400_000, 0.25),
    (INF, 0.30),
)

_OLD_SLABS: Dict[str, Slabs] = {
    "below_60": ((250_000, 0.0), (500_000, 0.05), (1_000_000, 0.20), (INF, 0.30)),
    "60_to_80": ((300_000, 0.0), (500_000, 0.05), (1_000_000, 0.20), (INF, 0.30)),
    "above_80": ((500_000, 0.0), (1_000_000, 0.20), (INF, 0.30)),
}

_SURCHARGE = ((5_000_000, 0.10), (10_000_000, 0.15), (20_000_000, 0.25), (50_000_000, 0.37))


def _year(fy: str, ay: str, status: str, **calendar) -> TaxRules:
    return TaxRules(
        fy=fy,
        ay=ay,
        status=status,
        new=RegimeRules(
            slabs=_NEW_SLABS_2025,
            standard_deduction=75_000,
            rebate_income_limit=1_200_000,
            rebate_max=60_000,
            rebate_marginal_relief=True,
            employer_nps_pct=0.14,
            surcharge_cap=0.25,
            chapter_via=False,
            hra_exemption=False,
            self_occupied_interest=False,
            professional_tax=False,
            house_loss_setoff=0,
        ),
        old=RegimeRules(
            slabs=_OLD_SLABS["below_60"],
            standard_deduction=50_000,
            rebate_income_limit=500_000,
            rebate_max=12_500,
            rebate_marginal_relief=False,
            employer_nps_pct=0.10,
            surcharge_cap=0.37,
            chapter_via=True,
            hra_exemption=True,
            self_occupied_interest=True,
            professional_tax=True,
            house_loss_setoff=200_000,
        ),
        old_slabs_by_age=_OLD_SLABS,
        cess_rate=0.04,
        surcharge_bands=_SURCHARGE,
        special_surcharge_cap=0.15,
        stcg_111a_rate=0.20,
        ltcg_112a_rate=0.125,
        ltcg_112a_exempt=125_000,
        cap_80c=150_000,
        cap_80ccd1b=50_000,
        cap_80d_self=25_000,
        cap_80d_self_senior=50_000,
        cap_80d_parents=25_000,
        cap_80d_parents_senior=50_000,
        cap_80tta=10_000,
        cap_80ttb=50_000,
        cap_24b=200_000,
        cap_professional_tax=2_500,
        house_std_deduction_pct=0.30,
        **calendar,
    )


RULES: Dict[str, TaxRules] = {
    # Returns being filed now (AY 2026-27).
    "2025-26": _year("2025-26", "2026-27", "filing"),
    # Budget 2026 kept the slabs unchanged for FY 2026-27, the first year under the
    # Income-tax Act 2025. Section numbers and ITR forms change, so this year is planning-only.
    "2026-27": _year(
        "2026-27",
        "2027-28",
        "planning",
        due_date_salaried=date(2027, 7, 31),
        due_date_business=date(2027, 8, 31),
        belated_until=date(2027, 12, 31),
    ),
}

DEFAULT_FY = "2025-26"


def get_rules(fy: str) -> TaxRules:
    try:
        return RULES[fy]
    except KeyError as exc:
        raise ValueError(f"Unsupported financial year {fy!r}; supported: {', '.join(RULES)}") from exc
