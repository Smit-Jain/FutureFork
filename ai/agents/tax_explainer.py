"""
Plain-language explanation of a tax report (ITR helper).

The engine (engine/tax) computes every rupee. This agent only writes 3–4 sentences about the
numbers it is given, and the Numeric Guard rejects any ₹ amount or % that isn't in the report.
Offline, or if the guard keeps failing, a deterministic template is used instead.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional, Set, Tuple

from ai.agents.explainer import fmt_inr, run_numeric_guard

logger = logging.getLogger("futurefork.ai.agents.tax_explainer")

_SYSTEM = (
    "You explain an Indian income-tax computation to someone with no finance background. "
    "Write 3 or 4 short sentences in plain English: which regime to file under and why, whether they get "
    "a refund or must pay, which ITR form to use, and the single most useful tax-saving move for next year "
    "if it saves anything. Use only rupee amounts and percentages that appear in the data, written exactly "
    "as given (Indian format like ₹1,52,980). Never compute new numbers. No jargon without a short gloss. "
    'Respond with a single JSON object: {"explanation": "..."}.'
)


def _money_values(obj: Any, out: Set[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        out.add(float(abs(obj)))
    elif isinstance(obj, dict):
        for v in obj.values():
            _money_values(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _money_values(v, out)


def allowed_facts(report: Dict[str, Any]) -> Tuple[Set[float], Set[float]]:
    money: Set[float] = set()
    for key in ("new", "old", "verdict", "savings", "inputs"):
        _money_values(report.get(key), money)
    money.update({float(report.get("regime_saving", 0)), float(report.get("late_fee", 0))})
    # Limits quoted in the engine's own reasons and notes (ITR-1/4 income cap, 112A exemption, caps)
    money.update({5_000_000.0, 125_000.0, 150_000.0, 50_000.0, 75_000.0, 1_200_000.0, 25_000.0, 200_000.0})
    pcts = {0.0, 4.0, 5.0, 10.0, 12.5, 14.0, 15.0, 20.0, 25.0, 30.0}
    for regime in ("new", "old"):
        pcts.add(float(report[regime]["effective_rate_pct"]))
    return money, pcts


def template_explanation(report: Dict[str, Any]) -> str:
    v = report["verdict"]
    form = report["form"]
    parts = [v["headline"], v["result"]]
    if form["supported"]:
        parts.append(f"Use {form['name']}: {form['reasons'][0][0].lower()}{form['reasons'][0][1:]}")
    else:
        parts.append(form["reasons"][0])
    best = next((m for m in report["savings"]["moves"] if m["benefit"]), None)
    if best:
        parts.append(
            f"For FY {report['savings']['fy']}, the biggest saving is to {best['title'][0].lower()}{best['title'][1:]}: "
            f"it cuts your tax by {fmt_inr(best['saving'])}."
        )
    return " ".join(p.strip() for p in parts if p)


def _llm_explanation(report: Dict[str, Any], money: Set[float], pcts: Set[float]) -> Optional[str]:
    if os.environ.get("FUTUREFORK_OFFLINE", "").strip() in ("1", "true", "yes"):
        return None
    try:
        from pydantic import BaseModel

        from ai.llm import call_structured_llm

        class _Schema(BaseModel):
            explanation: str

        best = [m for m in report["savings"]["moves"] if m["benefit"]][:2]
        facts = {
            "financial_year": report["fy"],
            "filing_status": report["window"]["message"],
            "verdict": report["verdict"]["headline"] + " " + report["verdict"]["subline"],
            "outcome": report["verdict"]["result"],
            "new_regime_tax": fmt_inr(report["new"]["total_tax"]),
            "old_regime_tax": fmt_inr(report["old"]["total_tax"]),
            "itr_form": report["form"]["name"],
            "form_reason": report["form"]["reasons"][0],
            "next_year_moves": [
                {"move": m["title"], "tax_saved": fmt_inr(m["saving"]), "extra_outlay": fmt_inr(m["extra_outlay"])}
                for m in best
            ],
        }
        for _ in range(2):
            result = call_structured_llm(
                prompt=json.dumps(facts, ensure_ascii=False, indent=2),
                system_prompt=_SYSTEM,
                response_model=_Schema,
                fallback_generator=lambda: None,
                max_retries=1,
            )
            if result is None:
                return None
            guard = run_numeric_guard(result.explanation, money, pcts, set())
            if guard.passed:
                return result.explanation.strip()
            logger.info("Tax explanation failed the Numeric Guard (%d violations)", len(guard.violations))
    except Exception as exc:  # the template always works
        logger.warning("Tax explainer LLM call failed: %s", exc)
    return None


def explain_tax_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """{"text", "source": "llm" | "template", "guard_passed"}"""
    money, pcts = allowed_facts(report)
    text = _llm_explanation(report, money, pcts)
    source = "llm"
    if text is None:
        text, source = template_explanation(report), "template"
    guard = run_numeric_guard(text, money, pcts, set())
    if not guard.passed and source == "llm":
        text, source = template_explanation(report), "template"
        guard = run_numeric_guard(text, money, pcts, set())
    return {"text": text, "source": source, "guard_passed": guard.passed}
