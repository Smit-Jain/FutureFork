import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json
import time
from data.loader import load_fixture_json
from engine.model import PurchaseGoal, FinancialProblemInstance
from engine.solver import solve_all_financial_scenarios

def test_financial_solver():
    print("=================================================================")
    print("Testing Member 2: OR-Tools CP-SAT Financial Solver on Fixture")
    print("=================================================================")

    # 1. Load Member 1's fixture
    data = load_fixture_json("data/samples/fixture_institute_node0.json")
    inst = FinancialProblemInstance.from_dict(data)
    print(f"Loaded instance: {inst.name}")
    print(f"Starting Treasury Balance: ₹{inst.starting_balance:,.0f}")
    print(f"Total 12-Month Inflows:    ₹{sum(inst.inflows):,.0f}")
    print(f"Total 12-Month Outflows:   ₹{sum(inst.total_outflows):,.0f}")

    # 2. Purchase Goal: Buy 40 GPU Lab PCs for ₹60L without dropping below ₹25L reserve
    goal = PurchaseGoal(
        item_name="40 GPU Lab PCs",
        total_cost=6000000.0,
        emergency_floor=2500000.0,
        target_month=0,
        emi_months=6,
        max_trim_pct=0.35,
    )
    print(f"\nGoal: Buy '{goal.item_name}' for ₹{goal.total_cost:,.0f}")
    print(f"Emergency Reserve Floor: ₹{goal.emergency_floor:,.0f}")

    # 3. Solve all scenarios
    t0 = time.perf_counter()
    results = solve_all_financial_scenarios(inst, goal)
    t_elapsed = (time.perf_counter() - t0) * 1000

    print(f"\nAll 4 Competing Forks + Baseline solved in {t_elapsed:.2f}ms (Target < 800ms)!")
    print("=" * 70)
    for k, res in results.items():
        print(f"[{k.upper()}] {res.scenario_name}")
        print(f"  Feasible above floor: {res.is_feasible}")
        print(f"  Lowest Balance:       ₹{res.metrics['lowest_balance']:,.0f} in {res.metrics['lowest_balance_month']}")
        print(f"  Months Below Reserve: {res.metrics['months_below_floor']}/12")
        print(f"  Ending Balance:       ₹{res.metrics['ending_balance']:,.0f}")
        print(f"  Total Trims Saved:    ₹{res.total_trims_saved:,.0f}")
        print(f"  Financing Interest:   ₹{res.total_financing_interest:,.0f}")
        print(f"  Description:          {res.description}")
        print("-" * 70)

    # Assertions
    assert "baseline" in results, "Missing baseline scenario"
    assert "upfront" in results, "Missing upfront scenario"
    assert "emi" in results, "Missing emi scenario"
    assert "phased" in results, "Missing phased scenario"
    assert "trim" in results, "Missing trim scenario"

    assert len(results["upfront"].monthly_schedules) == 12
    assert len(results["emi"].monthly_schedules) == 12
    assert len(results["phased"].monthly_schedules) == 12
    assert len(results["trim"].monthly_schedules) == 12

    assert t_elapsed < 800.0, f"Solver too slow: {t_elapsed}ms >= 800ms"
    print("\n[SUCCESS] Member 2 Verification Completed Perfectly!")

if __name__ == "__main__":
    test_financial_solver()


def test_personal_upi_goal():
    print("\n" + "=" * 70)
    print("Testing Personal UPI Goal: Buy Laptop on EMI without dropping below ₹30k")
    print("=" * 70)
    from data.loader import load_sample_instance

    inst = load_sample_instance("personal_upi", starting_balance=120000.0)
    print(f"Loaded: {inst.name} | Starting Balance: ₹{inst.starting_balance:,.0f}")

    goal = PurchaseGoal(
        item_name="MacBook Pro M3",
        total_cost=120000.0,
        emergency_floor=30000.0,
        target_month=0,
        emi_months=6,
        max_trim_pct=0.30,
    )

    t0 = time.perf_counter()
    results = solve_all_financial_scenarios(inst, goal)
    t_elapsed = (time.perf_counter() - t0) * 1000

    print(f"Personal scenarios solved in {t_elapsed:.2f}ms!")
    for k, res in results.items():
        print(f"[{k.upper()}] Feasible: {res.is_feasible} | Lowest Bal: ₹{res.metrics['lowest_balance']:,.0f} | Months < Floor: {res.metrics['months_below_floor']}/12")
        print(f"  {res.description}")
        print("-" * 70)

if __name__ == "__main__":
    test_personal_upi_goal()
