"""The taxpayer's inputs for one financial year. All amounts are annual rupees."""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields, replace
from typing import Any, Dict

TAXPAYER_TYPES = ("salaried", "freelancer", "business")
AGE_BANDS = ("below_60", "60_to_80", "above_80")


@dataclass(frozen=True)
class TaxInputs:
    fy: str = "2025-26"
    taxpayer_type: str = "salaried"      # salaried | freelancer (44ADA) | business (44AD)
    age_band: str = "below_60"
    resident: bool = True

    # Salary (Form 16, Part B)
    basic_da: float = 0.0                # basic + dearness allowance
    hra_received: float = 0.0
    other_salary: float = 0.0            # special allowance, bonus, taxable perquisites
    employer_nps: float = 0.0            # employer's NPS contribution: part of gross salary, then deducted u/s 80CCD(2)
    professional_tax: float = 0.0
    rent_paid: float = 0.0
    metro_city: bool = False             # Delhi, Mumbai, Kolkata, Chennai

    # Presumptive business / profession (ITR-4)
    gross_receipts: float = 0.0
    digital_receipts: float = 0.0        # part of gross receipts received via bank / UPI
    declared_profit: float = 0.0         # 0 = use the presumptive rate

    # House property
    home_loan_interest: float = 0.0      # self-occupied home, 24(b)
    let_out_rent: float = 0.0            # annual rent received
    let_out_municipal_tax: float = 0.0
    let_out_loan_interest: float = 0.0

    # Other sources
    savings_interest: float = 0.0
    deposit_interest: float = 0.0        # FD / RD / post-office
    dividends: float = 0.0
    other_income: float = 0.0

    # Capital gains on listed equity / equity funds
    stcg_111a: float = 0.0
    ltcg_112a: float = 0.0

    # Deductions (old regime)
    d_80c: float = 0.0                   # EPF, PPF, ELSS, LIC, home-loan principal, tuition
    d_80ccd1b: float = 0.0               # own NPS, beyond 80C
    d_80d_self: float = 0.0              # health insurance: self, spouse, children
    d_80d_parents: float = 0.0
    parents_senior: bool = False
    d_80e: float = 0.0                   # education-loan interest

    # Taxes already paid
    tds: float = 0.0
    tcs: float = 0.0
    advance_tax: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TaxInputs":
        known = {f.name for f in fields(cls)}
        clean: Dict[str, Any] = {}
        for k, v in (data or {}).items():
            if k not in known or v is None:
                continue
            default = getattr(cls, k)
            if isinstance(default, bool):
                clean[k] = bool(v)
            elif isinstance(default, float):
                value = float(v)
                if value < 0:
                    raise ValueError(f"{k} can't be negative")
                clean[k] = value
            else:
                clean[k] = str(v)
        inputs = cls(**clean)
        if inputs.taxpayer_type not in TAXPAYER_TYPES:
            raise ValueError(f"taxpayer_type must be one of {', '.join(TAXPAYER_TYPES)}")
        if inputs.age_band not in AGE_BANDS:
            raise ValueError(f"age_band must be one of {', '.join(AGE_BANDS)}")
        if inputs.digital_receipts > inputs.gross_receipts:
            raise ValueError("digital_receipts can't exceed gross_receipts")
        return inputs

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def with_changes(self, **changes: Any) -> "TaxInputs":
        return replace(self, **changes)

    # Convenience
    @property
    def senior(self) -> bool:
        return self.age_band != "below_60"

    @property
    def gross_salary(self) -> float:
        return self.basic_da + self.hra_received + self.other_salary + self.employer_nps

    @property
    def has_presumptive(self) -> bool:
        return self.taxpayer_type in ("freelancer", "business") and self.gross_receipts > 0

    @property
    def house_count(self) -> int:
        return int(self.home_loan_interest > 0) + int(self.let_out_rent > 0)
