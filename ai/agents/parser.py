"""
FutureFork Financial Decision Parser Agent (Member 4)

Parses plain-English financial decision prompts into ParsedDecision objects.

Tier 1: LLM — structured JSON extraction.
Tier 2: Deterministic regex — always works offline.

Public API:
  parse_financial_decision(prompt, baseline=None, dataset_type="personal") -> ParsedDecision
  parse_indian_amount(text: str) -> float | None

Backward compat:
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("futurefork.ai.agents.parser")

# ===========================================================================
# Public types
# ===========================================================================


class DecisionParseError(Exception):
    """Raised when a prompt truly cannot be parsed into a financial decision."""


class OffTopicPromptError(DecisionParseError):
    """Raised when a prompt isn't about money at all."""


@dataclass
class ParsedDecision:
    """
    Parsed financial purchase decision.

    Attributes:
        item_label:            Human-readable item name.
        total_cost:            Total cost in rupees.
        emergency_floor:       Minimum reserve floor in rupees.
        quantity:              Number of units (or None).
        target_month:          Intended month index 0-11.
        financing_preference:  "auto"|"upfront"|"emi"|"phased"|"trim".
        emi_months:            EMI duration in months.
        dataset_type:          "personal"|"institute"|"startup".
        raw_prompt:            Original input prompt.
        defaulted_fields:      Fields that used baseline defaults.
    """

    item_label: str
    total_cost: float
    emergency_floor: float
    quantity: Optional[int]
    target_month: int
    financing_preference: str
    emi_months: int
    dataset_type: str
    raw_prompt: str
    defaulted_fields: List[str] = field(default_factory=list)
    # Decision kind: "one_time" | "recurring_expense" | "income_change"
    decision_kind: str = "one_time"
    monthly_amount: float = 0.0            # recurring_expense: ₹ per month
    income_change_pct: float = 0.0         # income_change: e.g. -20.0
    income_change_monthly: float = 0.0     # income_change: ₹ per month (negative = less income)
    start_month: int = 0                   # first affected month (0-11)
    duration_months: int = 12              # months affected within the 12-month horizon
    downpayment_pct: float = 0.0           # 0.2 for "20% down"
    interest_rate_annual: Optional[float] = None
    understood: str = ""                   # plain-English summary of what was understood


# ===========================================================================
# Indian number parser
# ===========================================================================

# Multipliers for Indian shorthand
_MULTIPLIERS: Dict[str, float] = {
    "cr": 10_000_000.0,
    "crore": 10_000_000.0,
    "crores": 10_000_000.0,
    "l": 100_000.0,
    "lakh": 100_000.0,
    "lakhs": 100_000.0,
    "lac": 100_000.0,
    "lacs": 100_000.0,
    "k": 1_000.0,
}

# Regex for Indian-style numbers: ₹60L, Rs 1.2L, 1.8 crore, 30k, 60,00,000, ₹25L
_INDIAN_AMOUNT_RE = re.compile(
    r"""
    (?:₹|Rs\.?\s*|INR\s*)?         # optional currency prefix
    ([\d,]+(?:\.\d+)?)             # digits with optional commas and decimals
    \s*
    (Cr(?:ore)?s?|L(?:akh)?s?|K)?  # optional multiplier suffix (case-insensitive)
    """,
    re.VERBOSE | re.IGNORECASE,
)


def parse_indian_amount(text: str) -> Optional[float]:
    """
    Parse a single Indian-format amount string to rupees.

    Handles:
        ₹60L, ₹1.2L, 1.2 lakh, 1.8Cr, 1.8 crore, 30k, ₹30,000,
        60,00,000 (Indian grouping), Rs 1.2L, ₹25L

    Args:
        text: Amount string such as "₹60L" or "1.8 crore".

    Returns:
        Float value in rupees, or None if unparseable.
    """
    text = text.strip()
    m = _INDIAN_AMOUNT_RE.search(text)
    if not m:
        return None

    num_str = m.group(1).replace(",", "")
    suffix = (m.group(2) or "").lower().strip()

    try:
        value = float(num_str)
    except ValueError:
        return None

    multiplier = 1.0
    for key, mult in _MULTIPLIERS.items():
        if suffix.startswith(key):
            multiplier = mult
            break

    return value * multiplier


# ===========================================================================
# Deterministic tier: amounts, periods, floors, timing, decision kind
# ===========================================================================

_NUM = r"(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
_MULT = (r"(k|thousands?|hazaa?r|hajar|lakhs?|lacs?|lpa|l|crores?|cr|mn|millions?|m|bn|billions?)")
_AMOUNT_RE = re.compile(
    r"(?P<cur>₹|\brs\.?|\binr\b|\$|\busd\b|€|£)?\s*" + _NUM.replace("(", "(?P<num>", 1)
    + r"\s*(?:(?P<mult>" + _MULT[1:-1] + r")\b\.?)?\s*(?P<curpost>rupees?|rs\b\.?|inr\b|dollars?|bucks)?",
    re.IGNORECASE,
)
_MULT_VALUES = {
    "k": 1e3, "thousand": 1e3, "thousands": 1e3, "hazar": 1e3, "hazaar": 1e3, "hajar": 1e3,
    "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "lpa": 1e5, "l": 1e5,
    "crore": 1e7, "crores": 1e7, "cr": 1e7,
    "mn": 1e6, "million": 1e6, "millions": 1e6, "m": 1e6,
    "bn": 1e9, "billion": 1e9, "billions": 1e9,
}
_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s*cent\b)", re.IGNORECASE)
_MONTH_NAMES = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
    "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_MONTH_RE = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_WORD_NUMS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
              "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "eighteen": 18, "twenty": 20}

_PER_MONTH_AFTER = re.compile(
    r"^\s*(?:/\s*(?:month|mo|mon|m)\b|per\s+month|a\s+month|an?\s+month|every\s+month|each\s+month|monthly|"
    r"p\.?\s?m\.?(?=\s|$|[,.;!?])|pm\b|/-?\s*pm\b|a\s+mo\b)", re.IGNORECASE)
_PER_YEAR_AFTER = re.compile(
    r"^\s*(?:/\s*(?:year|yr|annum|y)\b|per\s+(?:year|annum|yr)|a\s+year|an?\s+year|every\s+year|each\s+year|"
    r"yearly|annually|annual|p\.?\s?a\.?(?=\s|$|[,.;!?])|pa\b|ctc\b)", re.IGNORECASE)
_PER_MONTH_BEFORE = re.compile(r"(?:monthly|per\s+month|every\s+month|each\s+month)\s+(?:\w+\s+){0,4}$", re.IGNORECASE)
_PER_YEAR_BEFORE = re.compile(r"(?:annual|yearly|per\s+year|every\s+year|ctc\s+of)\s+(?:\w+\s+){0,4}$", re.IGNORECASE)

_FLOOR_BEFORE = re.compile(
    r"(?:without\s+(?:going|dropping|falling|dipping|getting|letting\s+\w+\s+(?:go|drop|fall))\s+(?:below|under|beneath|less\s+than)"
    r"|(?:not|never|don'?t|doesn'?t|won'?t)\s+(?:let\s+\w+\s+)?(?:go|drop|fall|dip|get)\s+(?:below|under|less\s+than)"
    r"|(?:stay|staying|remain|remaining)\s+(?:above|over)"
    r"|keep(?:ing)?|maintain(?:ing)?|retain(?:ing)?|leav(?:e|ing)|preserv(?:e|ing)|hold(?:ing)?|protect(?:ing)?"
    r"|min(?:imum|\.)?(?:\s+(?:bank\s+)?balance)?(?:\s+of)?|at\s+least|floor\s+of|reserve\s+of|buffer\s+of"
    r"|cushion\s+of|safety\s+net\s+of|emergency\s+(?:fund|savings?|reserve|corpus)s?(?:\s+of)?)"
    r"\s*(?:at\s+least\s+|a\s+minimum\s+of\s+|minimum\s+|a\s+|an\s+|of\s+|my\s+|our\s+)?$",
    re.IGNORECASE,
)
_FLOOR_AFTER = re.compile(
    r"^\s*(?:as|in|of|for)?\s*(?:an?\s+|my\s+|our\s+|the\s+)?(?:emergency\s+)?"
    r"(?:reserves?|savings?|buffer|cushion|minimum|floor|balance|in\s+the\s+bank|in\s+bank|bank\s+balance|"
    r"safety\s+net|emergency\s+fund|corpus)\b",
    re.IGNORECASE,
)

_INCOME_WORDS = re.compile(
    r"\b(?:salary|salaries|income|revenue|revenues|sales|earnings|pay|paycheck|stipend|business|clients?|"
    r"inflows?|fees?|mrr|arr|bonus|commission|funding|turnover|profits?)\b", re.IGNORECASE)
_DOWN_WORDS = re.compile(
    r"\b(?:drops?|dropped|dropping|falls?|fell|falling|cut|cuts|decreases?|decreased|reduce[sd]?|reduction|"
    r"lower(?:s|ed)?|down|declin\w*|loss|lose|loses|losing|lost|shrinks?|shrinking|dips?|slumps?|halved?|"
    r"stops?|stopped|delayed)\b", re.IGNORECASE)
_PAY_CHANGE = re.compile(
    r"\b(?:raise(?!\s+(?:prices?|rates?|funds?|funding|capital|money|a\s+round|an?\s+invoice))|hike(?!\s+(?:prices?|rates?))|"
    r"increment|appraisal|promotion|pay\s*cut|salary\s*cut|wage\s*cut)\b",
    re.IGNORECASE,
)
_UP_WORDS = re.compile(r"\b(?:increases?|increased|hikes?|hiked|raises?|raised|rises?|grows?|growth|up|boost\w*|"
                       r"doubles?|jumps?)\b", re.IGNORECASE)
_JOB_LOSS = re.compile(
    r"lose\s+(?:my|our|the|his|her)?\s*job|losing\s+(?:my|our)?\s*job|lost\s+(?:my|our)?\s*job|laid\s+off|"
    r"layoffs?|\bget\s+fired|\bfired\b|unemploy\w*|jobless|no\s+(?:income|salary|job)|career\s+break|sabbatical|"
    r"quit\s+(?:my\s+)?job|resign\w*|maternity\s+leave|paternity\s+leave|without\s+(?:a\s+)?(?:job|salary|income)|"
    r"naukri\s+(?:chali|chhoot)", re.IGNORECASE)
_ONE_TIME_INFLOW = re.compile(
    r"\b(?:raise|raising|raised)\s+(?:funds?|funding|capital|money|a\s+round|seed|series)"
    r"|\b(?:receive|receiving|get|getting|expect(?:ing)?|win|winning|collect(?:ing)?)\s+(?:a\s+|an\s+|my\s+|our\s+|the\s+)?"
    r"(?:\w+\s+)?(?:bonus|grant|funding|investment|refund|inheritance|payout|settlement|prize|arrears|maturity)"
    r"|\b(?:sell|selling|sold)\s+(?:my\s+|our\s+|the\s+|a\s+|an\s+)?\w+|\binheritance\b",
    re.IGNORECASE,
)
_RECURRING_WORDS = re.compile(
    r"\b(?:hire|hiring|recruit\w*|employ(?:ing)?|subscriptions?|subscribe|membership|rent|rental|sip|retainer|"
    r"tuition|premium|allowance|monthly|salary\s+of|ctc|wages?|payroll|headcount)\b", re.IGNORECASE)
_HIRE_WORDS = re.compile(r"\b(?:hire|hiring|recruit\w*|employ(?:ing)?|onboard\w*)\b", re.IGNORECASE)
_SAVE_GOAL = re.compile(r"\b(?:save|saving|set\s+aside|put\s+aside|accumulate|build\s+up)\b", re.IGNORECASE)
_FINANCE_WORDS = re.compile(
    r"buy|purchas|spend|save|saving|invest|hire|hiring|pay|loan|emi|salary|income|rent|cost|afford|budget|expens|"
    r"revenue|money|price|fee|subscri|trip|travel|car\b|house|home|flat\b|laptop|phone|wedding|course|business|debt|"
    r"credit|card|mortgage|lakh|crore|rupee|₹|\brs\b|job|bonus|tax|insurance|gold|stock|bike|vacation|holiday|"
    r"marriage|renovat|furniture|gadget|equipment|server|gpu|machine|upgrade|fund|cash|bank|balance|reserve|"
    r"lena|kharid|paisa|paise",
    re.IGNORECASE,
)
_QTY_RE = re.compile(
    r"\b(\d+|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+(?:[a-z\-]+\s+){0,2}?"
    r"(engineers?|developers?|designers?|people|persons?|employees?|staff|interns?|hires?|members?|analysts?|"
    r"teachers?|faculty|nurses?|drivers?|laptops?|pcs?|computers?|desktops?|monitors?|units?|phones?|servers?|"
    r"machines?|licen[cs]es?|seats?|devices?|systems?|tablets?|gpus?|nodes?|cars?|bikes?|chairs?|desks?)\b",
    re.IGNORECASE,
)
_EACH_RE = re.compile(r"\b(?:each|apiece|per\s+(?:head|person|engineer|employee|unit|piece|hire|seat)|/\s*head|a\s+head)\b",
                      re.IGNORECASE)
_FINANCING_KEYWORDS: Dict[str, str] = {
    "upfront": "upfront", "in cash": "upfront", "cash": "upfront", "outright": "upfront", "one shot": "upfront",
    "lump sum": "upfront", "full payment": "upfront",
    "emi": "emi", "installment": "emi", "instalment": "emi", "loan": "emi", "lease": "emi", "financ": "emi",
    "mortgage": "emi",
    "phased": "phased", "phase": "phased", "milestone": "phased", "in parts": "phased", "two parts": "phased",
    "tranche": "phased", "split": "phased",
    "trim": "trim", "cutting back": "trim", "cut back": "trim", "cut spending": "trim", "cut costs": "trim",
}
_ITEM_VERB_RE = re.compile(
    r"\b(?:buy(?:ing)?|purchas(?:e|ing)|get(?:ting)?|take|taking|book(?:ing)?|spend(?:ing)?(?:\s+\S+)?\s+on|"
    r"pay(?:ing)?\s+(?:off|for)|repay(?:ing)?|clear(?:ing)?|upgrad(?:e|ing)|renovat(?:e|ing)|add(?:ing)?|start(?:ing)?|"
    r"subscrib(?:e|ing)\s+to|hire|hiring|recruit(?:ing)?|invest(?:ing)?\s+in|fund(?:ing)?|go(?:ing)?\s+on|"
    r"afford|plan(?:ning)?)\s+(?:a\s+|an\s+|the\s+|my\s+|our\s+|some\s+|new\s+)*",
    re.IGNORECASE,
)
_LABEL_STOP = re.compile(
    r"\s+(?:for|worth|at|@|on|with|without|by|in|next|from|costing|priced|of\s+(?:₹|rs|\d)|under|every|per|each|"
    r"while|keeping|and\s+keep|but|so|if|which|that|to\s+(?:my|our))\b|[,.;?!(]|₹|\$|\brs\b|\d",
    re.IGNORECASE,
)


@dataclass
class _Amount:
    value: float
    start: int
    end: int
    per: Optional[str]        # None | "month" | "year"
    explicit: bool            # had a currency or multiplier


def _to_number(token: str) -> Optional[float]:
    try:
        return float(token.replace(",", ""))
    except ValueError:
        return None


def _find_amounts(text: str) -> List[_Amount]:
    found: List[_Amount] = []
    for m in _AMOUNT_RE.finditer(text):
        num = _to_number(m.group("num"))
        if num is None or num == 0:
            continue
        mult = (m.group("mult") or "").lower().rstrip(".")
        cur = m.group("cur") or m.group("curpost")
        after = text[m.end():m.end() + 25]
        before = text[max(0, m.start() - 40):m.start()]
        if re.match(r"\s*(?:%|percent|per\s*cent)", after, re.IGNORECASE):
            continue
        # "2 engineers", "20 year loan", "6 months": bare small numbers are not money
        if not cur and not mult:
            if num < 1000 or "," not in m.group("num") and 1900 <= num <= 2100:
                continue
            if re.match(r"\s*(?:months?|years?|yrs?|days?|weeks?|people|units?|pcs)\b", after, re.IGNORECASE):
                continue
        if mult == "m" and re.match(r"\s*(?:onths?|o\b)", after, re.IGNORECASE):
            continue
        value = num * _MULT_VALUES.get(mult, 1.0)
        per = None
        if mult == "lpa" or _PER_YEAR_AFTER.match(after) or _PER_YEAR_BEFORE.search(before):
            per = "year"
        elif _PER_MONTH_AFTER.match(after) or _PER_MONTH_BEFORE.search(before):
            per = "month"
        found.append(_Amount(value=value, start=m.start(), end=m.end(), per=per, explicit=bool(cur or mult)))
    return found


def _is_floor(text: str, a: _Amount) -> bool:
    before = text[max(0, a.start - 60):a.start]
    after = text[a.end:a.end + 40]
    return bool(_FLOOR_BEFORE.search(before) or _FLOOR_AFTER.match(after))


def _month_index(month_num: int, months: Optional[List[str]]) -> Optional[int]:
    if months:
        for i, label in enumerate(months):
            mm = re.match(r"\d{4}-(\d{2})", str(label))
            if mm and int(mm.group(1)) == month_num:
                return i
        return None
    return None


def _word_or_int(tok: str) -> Optional[int]:
    tok = tok.lower()
    if tok.isdigit():
        return int(tok)
    return _WORD_NUMS.get(tok)


def _extract_timing(text: str, months: Optional[List[str]]) -> Optional[int]:
    t = text.lower()
    if re.search(r"\b(?:now|today|immediately|right away|this month|asap)\b", t):
        return 0
    if re.search(r"\bnext\s+month\b", t):
        return 1
    if re.search(r"\bnext\s+quarter\b", t):
        return 3
    m = re.search(r"\b(?:in|after|within)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven)\s+months?\b", t)
    if m:
        n = _word_or_int(m.group(1))
        return min(11, n) if n is not None else None
    m = re.search(r"\b(\d+)\s+months?\s+(?:from\s+now|later)\b", t)
    if m:
        return min(11, int(m.group(1)))
    m = re.search(r"\b(?:in|by|from|starting|during|this|before|around|on|till|until)\s+(?:the\s+)?(?:end\s+of\s+)?" + _MONTH_RE + r"\b", t)
    if m:
        return _month_index(_MONTH_NAMES[m.group(1)[:3] if m.group(1)[:4] != "sept" else "sep"], months)
    if re.search(r"\b(?:end\s+of\s+(?:the\s+)?year|year[- ]end|by\s+year\s+end)\b", t):
        idx = _month_index(12, months)
        return idx if idx is not None else 11
    return None


def _extract_duration(text: str) -> Optional[int]:
    t = text.lower()
    m = re.search(r"\bfor\s+(?:the\s+)?(?:next\s+|first\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)"
                  r"\s+(months?|years?|yrs?|weeks?|quarters?)\b", t)
    if not m:
        m = re.search(r"\b(\d+|a|an|one|two|three|four|five|six|twelve)[- ]?(month|year|quarter)s?[- ](?:break|gap|pause|cut|drop|loss)\b", t)
    if not m:
        return None
    n = _word_or_int(m.group(1)) or 1
    unit = m.group(2)
    if unit.startswith("week"):
        return max(1, round(n / 4.3))
    if unit.startswith("quarter"):
        return 3 * n
    if unit.startswith(("year", "yr")):
        return 12 * n
    return n


def _extract_tenure(text: str) -> Optional[int]:
    t = text.lower()
    pats = [
        r"\b(\d+)\s*[- ]?(years?|yrs?|months?|mo)\s+(?:loan|emi|tenure|term|plan|installments?|instalments?|financing)\b",
        r"\b(?:loan|emi|tenure|term|financing|mortgage)\s+(?:of\s+|for\s+|over\s+)?(\d+)\s*[- ]?(years?|yrs?|months?)\b",
        r"\bover\s+(\d+)\s+(years?|yrs?|months?)\b",
        r"\b(\d+)\s+(emis|installments|instalments)\b",
    ]
    for p in pats:
        m = re.search(p, t)
        if m:
            n, unit = int(m.group(1)), m.group(2)
            return n if not unit.startswith(("year", "yr")) else n * 12
    return None


def _extract_downpayment(text: str, amounts: List[_Amount]) -> Tuple[float, float]:
    """Returns (downpayment_pct, downpayment_amount)."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:as\s+)?(?:a\s+)?down(?:\s*-?\s*payment)?", text, re.IGNORECASE)
    if m:
        return float(m.group(1)) / 100.0, 0.0
    m = re.search(r"down\s*-?\s*payment\s+(?:of\s+)?", text, re.IGNORECASE)
    if m:
        for a in amounts:
            if 0 <= a.start - m.end() <= 3:
                return 0.0, a.value
    return 0.0, 0.0


def _extract_interest(text: str) -> Optional[float]:
    m = re.search(r"(?:at|@)\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(?:interest|apr|p\.?a\.?|per\s+annum|annual\s+interest|rate)",
                  text, re.IGNORECASE)
    if not m:
        return None
    return float(m.group(1) or m.group(2)) / 100.0


def _extract_quantity(text: str) -> Optional[int]:
    m = _QTY_RE.search(text)
    return _word_or_int(m.group(1)) if m else None


def _extract_financing(text: str) -> str:
    lower = text.lower()
    for keyword, pref in _FINANCING_KEYWORDS.items():
        if re.search(r"\b" + re.escape(keyword), lower):
            return pref
    return "auto"


_LABEL_TRIM = re.compile(r"^/\s*(?:month|mo|year|yr)\b\s*|^(?:of|a|an|the|my|our|new|some|worth|for)\s+|\s+(?:of|for|worth|at|a|an|the|monthly|per|every|each|and|to)$",
                         re.IGNORECASE)


_LABEL_STOPWORDS = {
    "of", "for", "a", "an", "the", "on", "at", "spend", "spending", "cost", "costs", "costing", "worth", "around",
    "about", "approx", "approximately", "rs", "inr", "is", "be", "will", "would", "my", "our", "me", "we", "i", "to",
    "by", "with", "need", "want", "buy", "pay", "paying", "goes", "go", "going", "up", "down", "increase",
    "increases", "rise", "rises", "if", "what", "should", "can", "could", "may", "might", "meanwhile", "and",
    "it", "us", "you", "do", "does", "this", "that", "new", "add", "extra", "some", "just", "only", "like",
}


def _clean_label(label: str) -> str:
    label = re.sub(r"\s+", " ", label).strip(" -:")
    prev = None
    while prev != label:
        prev, label = label, _LABEL_TRIM.sub("", label).strip()
    return label


def _extract_item_label(text: str, kind: str, amounts: Optional[List[_Amount]] = None) -> str:
    # Blank out amounts so "buy a ₹45,000 phone" reads "buy a phone"
    clean = list(text)
    for a in amounts or []:
        clean[a.start:a.end] = " " * (a.end - a.start)
    clean_text = "".join(clean)
    stop_re = re.compile(_LABEL_STOP.pattern.replace(r"|\d", ""), re.IGNORECASE)

    m = _ITEM_VERB_RE.search(clean_text)
    if m:
        rest = clean_text[m.end():]
        stop = stop_re.search(rest)
        label = _clean_label(rest[: stop.start()] if stop else rest[:60])
        if label and len(label.split()) <= 7:
            return label
    m = re.search(r"\b(?:ka|ki|ke)\s+(\w+(?:\s+\w+)?)\s+(?:lena|leni|lene|kharid\w*|chahiye|lunga|lungi)", text, re.IGNORECASE)
    if m:
        return m.group(1)
    if amounts:
        after = clean_text[amounts[0].end:]
        m = re.match(r"\s*(?:worth\s+of\s+|of\s+)?([A-Za-z][A-Za-z\- ]{1,40})", after)
        if m:
            stop = stop_re.search(" " + m.group(1))
            label = _clean_label((" " + m.group(1))[: stop.start()] if stop else m.group(1))
            if label and len(label.split()) <= 5 and not _FLOOR_AFTER.match(" " + label):
                return label
    if amounts:
        clause = re.split(r"[;,.!?]", clean_text[: amounts[0].start])[-1]
        words = re.findall(r"[A-Za-z']+", clause)
        words = [w for w in words if w.lower() not in _LABEL_STOPWORDS][-3:]
        if words:
            return " ".join(words)
    m = _RECURRING_WORDS.search(text)
    if kind == "recurring_expense" and m:
        return m.group(0).lower()
    if kind == "income_change":
        return "Income change"
    if kind == "recurring_expense":
        return "New recurring cost"
    return "This purchase"


def _fmt_inr(x: float) -> str:
    """₹ formatting with Indian digit grouping, for the 'understood' summary."""
    neg, x = x < 0, abs(round(x))
    s = str(int(x))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"{'-' if neg else ''}₹{s}"


def _month_label(idx: int, months: Optional[List[str]]) -> str:
    """Month name of a horizon slot (the horizon replays the uploaded data's calendar months)."""
    if idx <= 0:
        return "now"
    if months and idx < len(months):
        mm = re.match(r"\d{4}-(\d{2})", str(months[idx]))
        if mm:
            names = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                     "October", "November", "December"]
            return f"in {names[int(mm.group(1)) - 1]} (month {idx + 1})"
    return f"in month {idx + 1}"


def describe_decision(d: "ParsedDecision", months: Optional[List[str]] = None) -> str:
    """One-sentence summary of what FutureFork understood (shown to the user)."""
    when = _month_label(d.start_month if d.decision_kind != "one_time" else d.target_month, months)
    floor = f", keeping at least {_fmt_inr(d.emergency_floor)} in the bank" if d.emergency_floor > 0 \
        else ", with no minimum balance stated"
    if d.decision_kind == "recurring_expense":
        dur = f" for {d.duration_months} months" if d.duration_months < 12 - d.start_month else ""
        return f"A recurring cost of {_fmt_inr(d.monthly_amount)}/month for {d.item_label}, starting {when}{dur}{floor}."
    if d.decision_kind == "income_change":
        if d.income_change_pct:
            change = f"{'drops' if d.income_change_pct < 0 else 'rises'} by {abs(d.income_change_pct):g}%"
        else:
            change = f"{'drops' if d.income_change_monthly < 0 else 'rises'} by {_fmt_inr(abs(d.income_change_monthly))}/month"
        if d.duration_months == 1 and d.income_change_monthly > 0 and not d.income_change_pct:
            return f"A one-time inflow of {_fmt_inr(d.income_change_monthly)} ({d.item_label}) {when if when != 'now' else 'this month'}{floor}."
        return f"Income {change} for {d.duration_months} month(s) starting {when}{floor}."
    loan = ""
    if d.financing_preference == "emi":
        years = d.emi_months / 12
        loan = f", preferably on a {d.emi_months}-month" + (f" ({years:g}-year)" if d.emi_months >= 24 else "") + " EMI"
        if d.downpayment_pct:
            loan += f" with {d.downpayment_pct * 100:g}% down"
    elif d.financing_preference in ("upfront", "phased", "trim"):
        loan = {"upfront": ", paid upfront", "phased": ", paid in phases", "trim": ", funded by cutting spending"}[d.financing_preference]
    timing = f" {when}" if d.target_month else ""
    return f"A one-time cost of {_fmt_inr(d.total_cost)} for {d.item_label}{timing}{loan}{floor}."


def _regex_parse(
    prompt: str,
    baseline_starting_balance: float = 0.0,
    dataset_type: str = "personal",
    months: Optional[List[str]] = None,
    monthly_income: float = 0.0,
) -> ParsedDecision:
    """
    Deterministic parser. Raises OffTopicPromptError for prompts unrelated to money and
    DecisionParseError (with a specific question) when a needed amount is missing.
    """
    text = prompt.strip()
    amounts = _find_amounts(text)
    pcts = [float(m.group(1)) for m in _PCT_RE.finditer(text)]
    defaulted: List[str] = []

    # --- Floor -------------------------------------------------------------
    floor_amts = [a for a in amounts if _is_floor(text, a)]
    floor = floor_amts[0].value if floor_amts else 0.0
    if not floor_amts:
        defaulted.append("emergency_floor")
    money = [a for a in amounts if a not in floor_amts]

    # --- Decision kind -----------------------------------------------------
    job_loss = bool(_JOB_LOSS.search(text))
    income_shift = bool(
        (_INCOME_WORDS.search(text) and (_DOWN_WORDS.search(text) or _UP_WORDS.search(text)
                                         or re.search(r"\bchang(?:e|es|ed|ing)\b", text, re.IGNORECASE)))
        or (_PAY_CHANGE.search(text) and (pcts or amounts))
    )
    pay_change = bool(_PAY_CHANGE.search(text) and (pcts or amounts))
    one_time_inflow = bool(_ONE_TIME_INFLOW.search(text) and amounts and not any(a.per for a in amounts))
    if one_time_inflow:
        kind = "income_change"
    elif job_loss or pay_change or (income_shift and not _HIRE_WORDS.search(text) and not _ITEM_VERB_RE.search(text)):
        kind = "income_change"
    elif any(a.per for a in money) or (_RECURRING_WORDS.search(text) and not _SAVE_GOAL.search(text)):
        kind = "recurring_expense"
    else:
        kind = "one_time"

    if not amounts and not pcts and not job_loss and not _FINANCE_WORDS.search(text):
        raise OffTopicPromptError(
            "FutureFork answers money decisions about your uploaded data, like 'Buy a car for ₹8L without "
            "dropping below ₹1L' or 'What if my salary drops 20%?'."
        )

    timing = _extract_timing(text, months)
    duration = _extract_duration(text)
    quantity = _extract_quantity(text)
    label = _extract_item_label(text, kind, amounts)
    financing = _extract_financing(text)
    interest = _extract_interest(text)

    total_cost = 0.0
    monthly_amount = 0.0
    income_pct = 0.0
    income_monthly = 0.0
    start = timing or 0
    tenure = _extract_tenure(text)
    down_pct, down_amt = _extract_downpayment(text, money)
    money_nondown = [a for a in money if not (down_amt and a.value == down_amt)]

    if kind == "income_change":
        down = bool(_DOWN_WORDS.search(text) or re.search(r"\bcut\b", text, re.IGNORECASE)) or job_loss
        if re.search(r"\b(?:raise|hike|increment|appraisal|promotion|increase|rise|grows?|boost)\b", text, re.IGNORECASE) \
                and not re.search(r"\bcut\b|\bdrop|\bfall|\blose|\bloss", text, re.IGNORECASE):
            down = False
        sign = -1.0 if down else 1.0
        non_interest_pcts = [p for p in pcts if not (interest and abs(p / 100 - interest) < 1e-9)]
        if one_time_inflow and money_nondown:
            down, sign = False, 1.0
            mm = re.search(r"\b(?:sell|selling|sold)\s+(?:my\s+|our\s+|the\s+|a\s+|an\s+)?((?:[a-z]+\s+){0,2}?[a-z]+)\b(?=\s+(?:for|at|worth|of|to|and)|\s*[₹$\d]|\s*$)",
                           text, re.IGNORECASE)
            if mm:
                label = f"sale of {mm.group(1)}"
            elif re.search(r"\braise|raising|raised", text, re.IGNORECASE):
                label = "fundraise"
            else:
                kw = re.search(r"bonus|grant|funding|investment|refund|inheritance|payout|settlement|prize|arrears|maturity",
                               text, re.IGNORECASE)
                label = kw.group(0).lower() if kw else label
            income_monthly = money_nondown[0].value
            duration = 1
        elif non_interest_pcts:
            income_pct = sign * non_interest_pcts[0]
        elif money_nondown:
            a = money_nondown[0]
            per_month = a.value / 12.0 if a.per == "year" else a.value
            income_monthly = sign * per_month
        elif job_loss or re.search(r"\b(?:stops?|stopped|no)\b", text, re.IGNORECASE):
            income_pct = -100.0
        elif re.search(r"\bhalve|half\b", text, re.IGNORECASE):
            income_pct = -50.0 if down else 50.0
        elif re.search(r"\bdoubles?\b", text, re.IGNORECASE):
            income_pct = 100.0
        else:
            raise DecisionParseError(
                "By how much would your income change? For example: 'What if my salary drops by 20%?' "
                "or 'What if revenue falls by ₹2L a month?'."
            )
        if job_loss and duration is None:
            duration = 6
            defaulted.append("duration_months")
        if timing is None and re.search(r"\bnext\b|\bif\b|\bmight\b|\bwhat if\b", text, re.IGNORECASE):
            start = 1 if re.search(r"\bnext\s+month\b", text, re.IGNORECASE) else 0
        if duration is None and re.search(r"\bnext\s+quarter\b", text, re.IGNORECASE):
            duration = 3
        duration = duration or (12 - start)
    elif kind == "recurring_expense":
        if not money_nondown:
            raise DecisionParseError(
                f"How much would {label} cost per month? For example: 'Hire an engineer at ₹80k per month'."
            )
        a = next((x for x in money_nondown if x.per), money_nondown[0])
        per_month = a.value / 12.0 if a.per == "year" else a.value
        before = text[max(0, a.start - 8):a.start].lower()
        if quantity and quantity > 1 and (_EACH_RE.search(text) or (_HIRE_WORDS.search(text) and re.search(r"\bat\b|@", before))):
            per_month *= quantity
        monthly_amount = round(per_month, 2)
        duration = duration or (12 - start)
    else:
        if not money_nondown:
            raise DecisionParseError(
                f"How much will {label} cost? For example: 'Buy {label.lower()} for ₹80,000'."
                if label != "This purchase" else
                "Please include an amount, for example: 'Buy a laptop for ₹80,000 without dropping below ₹30,000'."
            )
        explicit = [a for a in money_nondown if a.explicit] or money_nondown
        total_cost = explicit[0].value
        if quantity and quantity > 1 and _EACH_RE.search(text):
            total_cost *= quantity
        if _SAVE_GOAL.search(text):
            label = "savings goal"
            interest = 0.0 if interest is None else interest
        if down_amt and not down_pct and total_cost:
            down_pct = round(min(0.95, down_amt / total_cost), 4)
        if tenure:
            financing = "emi" if financing in ("auto", "upfront") and re.search(r"loan|emi|financ|mortgage|instal|interest",
                                                                              text, re.IGNORECASE) else financing
        if not tenure and interest and re.search(r"\bover\s+\d+\s+(?:months?|years?)", text, re.IGNORECASE):
            financing = "emi"
        if financing == "emi" and not tenure:
            tenure = 12 if re.search(r"\b12[- ]?months?\b", text) else None

    if timing is None:
        defaulted.append("target_month")

    parsed = ParsedDecision(
        item_label=label,
        total_cost=round(total_cost, 2),
        emergency_floor=round(floor, 2),
        quantity=quantity,
        target_month=start if kind == "one_time" else 0,
        financing_preference=financing,
        emi_months=tenure or 6,
        dataset_type=dataset_type,
        raw_prompt=prompt,
        defaulted_fields=defaulted,
        decision_kind=kind,
        monthly_amount=monthly_amount,
        income_change_pct=income_pct,
        income_change_monthly=round(income_monthly, 2),
        start_month=start if kind != "one_time" else 0,
        duration_months=max(1, min(12, duration or 12)),
        downpayment_pct=down_pct,
        interest_rate_annual=interest,
    )
    parsed.understood = describe_decision(parsed, months)
    return parsed


# Backward-compatible helpers used by older code/tests
def _extract_all_amounts(text: str) -> List[tuple]:
    return [(a.start, a.end, a.value) for a in _find_amounts(text)]


def _extract_floor(text: str) -> Optional[float]:
    for a in _find_amounts(text):
        if _is_floor(text, a):
            return a.value
    return None


# ===========================================================================
# LLM Tier (optional; merged over the deterministic result)
# ===========================================================================

_LLM_SYSTEM_PROMPT = """You are a financial decision parser for FutureFork.
Parse the user's prompt into JSON with these fields:
  is_financial_decision: bool (false if the prompt isn't about money/spending/income)
  decision_kind: "one_time" (a purchase, trip, debt payoff, savings goal),
                 "recurring_expense" (hiring, subscription, rent, SIP, any cost paid every month/year),
                 or "income_change" (salary cut, job loss, revenue drop or rise)
  item_label: string (what it is, e.g. "laptop", "2 engineers", "gym subscription")
  quantity: integer or null
  total_cost: float rupees for one_time (₹60L → 6000000, ₹1.2L → 120000, 1.8Cr → 18000000, 30k → 30000)
  monthly_amount: float rupees PER MONTH for recurring_expense (yearly amounts / 12; multiply per-person costs by quantity)
  income_change_pct: float, e.g. -20 for "drops 20%", -100 for job loss; 0 if an amount is given instead
  income_change_monthly: float rupees per month change in income (negative for a drop), 0 if a percent is given
  emergency_floor: float rupees the balance must not drop below, 0 if not stated
  start_month: integer 0-11 months from now when it starts (0 = now, 1 = next month)
  duration_months: integer 1-12 months it lasts within the next year
  financing_preference: one of "auto","upfront","emi","phased","trim"
  emi_months: integer loan/EMI tenure in months (default 6; a 20-year loan is 240)
  downpayment_pct: float 0-1 (0.2 for 20% down), 0 if not stated
  interest_rate_pct: float annual interest percent, or null if not stated
Output ONLY valid JSON. No explanation."""


def _llm_parse(
    prompt: str,
    dataset_type: str,
) -> Optional[ParsedDecision]:
    """Parses with the LLM. Returns None when offline, unavailable, or the output is not usable."""
    offline = os.environ.get("FUTUREFORK_OFFLINE", "").strip() in ("1", "true", "yes")
    if offline:
        logger.debug("FUTUREFORK_OFFLINE=1: skipping LLM tier in parser.")
        return None

    try:
        from pydantic import BaseModel

        from ai.llm import call_structured_llm

        class _ParseSchema(BaseModel):
            is_financial_decision: bool = True
            decision_kind: str = "one_time"
            item_label: str = "This purchase"
            quantity: Optional[int] = None
            total_cost: float = 0.0
            monthly_amount: float = 0.0
            income_change_pct: float = 0.0
            income_change_monthly: float = 0.0
            emergency_floor: float = 0.0
            start_month: int = 0
            duration_months: int = 12
            financing_preference: str = "auto"
            emi_months: int = 6
            downpayment_pct: float = 0.0
            interest_rate_pct: Optional[float] = None

        r = call_structured_llm(
            prompt=f"Dataset type: {dataset_type}\nPrompt: {prompt}",
            system_prompt=_LLM_SYSTEM_PROMPT,
            response_model=_ParseSchema,
            fallback_generator=lambda: None,
            max_retries=1,
        )
        if r is None:
            return None
        if not r.is_financial_decision:
            raise OffTopicPromptError("not financial")
        kind = r.decision_kind if r.decision_kind in ("one_time", "recurring_expense", "income_change") else "one_time"
        usable = (
            (kind == "one_time" and r.total_cost > 0)
            or (kind == "recurring_expense" and r.monthly_amount > 0)
            or (kind == "income_change" and (r.income_change_pct or r.income_change_monthly))
        )
        if not usable:
            return None
        start = max(0, min(11, int(r.start_month or 0)))
        return ParsedDecision(
            item_label=r.item_label or "This purchase",
            total_cost=float(r.total_cost or 0.0) if kind == "one_time" else 0.0,
            emergency_floor=max(0.0, float(r.emergency_floor or 0.0)),
            quantity=r.quantity,
            target_month=start if kind == "one_time" else 0,
            financing_preference=r.financing_preference if r.financing_preference in _FINANCING_PREFS else "auto",
            emi_months=max(2, int(r.emi_months or 6)),
            dataset_type=dataset_type,
            raw_prompt=prompt,
            defaulted_fields=[],
            decision_kind=kind,
            monthly_amount=float(r.monthly_amount or 0.0) if kind == "recurring_expense" else 0.0,
            income_change_pct=max(-100.0, float(r.income_change_pct or 0.0)) if kind == "income_change" else 0.0,
            income_change_monthly=float(r.income_change_monthly or 0.0) if kind == "income_change" else 0.0,
            start_month=start if kind != "one_time" else 0,
            duration_months=max(1, min(12 - start, int(r.duration_months or 12))),
            downpayment_pct=max(0.0, min(0.95, float(r.downpayment_pct or 0.0))),
            interest_rate_annual=(float(r.interest_rate_pct) / 100.0) if r.interest_rate_pct is not None else None,
        )
    except OffTopicPromptError:
        raise
    except Exception as exc:
        logger.warning("LLM parse failed: %s", exc)
        return None


_FINANCING_PREFS = ("auto", "upfront", "emi", "phased", "trim")


# ===========================================================================
# Public API
# ===========================================================================


def parse_financial_decision(
    prompt: str,
    baseline: Any = None,  # Optional[FinancialProblemInstance]
    dataset_type: str = "personal",
) -> ParsedDecision:
    """
    Parse a plain-English financial decision into a ParsedDecision.

    The deterministic tier always runs. When an LLM is configured, its answer is used and any
    field it left empty is filled from the deterministic result.

    Raises:
        OffTopicPromptError: the prompt isn't about money.
        DecisionParseError:  a required amount is missing (the message asks for it).
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise DecisionParseError("Please describe a decision, for example: 'Buy a car for ₹8L'.")
    if len(prompt) > 1000:
        prompt = prompt[:1000]

    months = list(getattr(baseline, "months", []) or []) or None
    balance = float(getattr(baseline, "starting_balance", 0.0) or 0.0)
    inflows = list(getattr(baseline, "inflows", []) or [])
    monthly_income = sum(inflows) / len(inflows) if inflows else 0.0

    regex_result: Optional[ParsedDecision] = None
    regex_error: Optional[DecisionParseError] = None
    try:
        regex_result = _regex_parse(prompt, balance, dataset_type, months, monthly_income)
    except DecisionParseError as exc:
        regex_error = exc

    try:
        llm_result = _llm_parse(prompt, dataset_type)
    except OffTopicPromptError:
        if regex_result is None:
            raise regex_error if isinstance(regex_error, OffTopicPromptError) else OffTopicPromptError(
                "FutureFork answers money decisions about your uploaded data, like 'Buy a car for ₹8L without "
                "dropping below ₹1L' or 'What if my salary drops 20%?'."
            )
        llm_result = None

    if llm_result is not None:
        if regex_result is not None and regex_result.decision_kind == llm_result.decision_kind:
            for name in ("emergency_floor", "quantity", "downpayment_pct", "interest_rate_annual"):
                if not getattr(llm_result, name) and getattr(regex_result, name):
                    setattr(llm_result, name, getattr(regex_result, name))
            if llm_result.financing_preference == "auto":
                llm_result.financing_preference = regex_result.financing_preference
        llm_result.understood = describe_decision(llm_result, months)
        logger.info("parser: used LLM tier (kind=%s)", llm_result.decision_kind)
        return llm_result

    if regex_result is None:
        raise regex_error  # type: ignore[misc]
    logger.info("parser: used deterministic tier (kind=%s, cost=%.0f, floor=%.0f)",
                regex_result.decision_kind, regex_result.total_cost, regex_result.emergency_floor)
    return regex_result
