# FutureFork Optimization & Simulation Engine

**Team FutureLabs | Elite Coders CodeSprint 2026 | Person C**

> **The Golden Rule**: AI agents interpret and explain. Mathematical models calculate and validate. The LLM never produces a number that ends up on screen. Every number comes from the solver or the simulator.

The engine is a pure Python package with zero dependencies on HTTP, databases, or LLMs. Given dataset inputs and a policy change specification, it applies mathematical modifications, solves for the optimal timetable using Google OR-Tools CP-SAT, computes four domain metrics, and performs a 300-run vectorized Monte Carlo simulation using NumPy.

---

## 1. Domain Model

- **Time Grid**: 5 days (Monday to Friday) $\times$ 8 hourly slots (09:00 to 17:00).
  - *Morning*: Slots 0 to 3 (09:00 - 13:00).
  - *Afternoon*: Slots 4 to 7 (13:00 - 17:00).
- **Entities**:
  - `Event`: One weekly session of a course (faculty, student group, duration in slots, type: `lecture` | `lab` | `elective`, enrollment).
  - `Room`: Physical venue with seating capacity and type (`lecture` | `lab`).
  - `Faculty`: Teaching staff member with maximum teaching hours cap.
  - `StudentGroup`: Student cohort (e.g. CS-Year1, CS-Year2).
  - `Assignment`: An allocated `(event, day, slot, room)` mapping.

---

## 2. Exact Metric Definitions

All metrics are computed strictly in [`engine/metrics.py`](metrics.py):

1. **Student Clashes** (*Direction: Minimize*):
   For each student cohort $g$ and each time slot $(d, s)$, if the group has $k > 1$ events scheduled concurrently:
   $$\text{Student Clashes} = \sum_{g, d, s} \max(0, k_{g, d, s} - 1)$$

2. **Faculty Clashes** (*Direction: Minimize*):
   For each faculty member $f$ and each time slot $(d, s)$, if the instructor has $k > 1$ events scheduled concurrently:
   $$\text{Faculty Clashes} = \sum_{f, d, s} \max(0, k_{f, d, s} - 1)$$

3. **Room Utilization** (*Direction: Maximize*):
   Occupied room-hours divided by active operational room capacity, expressed as a percentage:
   $$\text{Room Utilization} = \left( \frac{\text{Occupied Room-Slots}}{\text{Available Room Capacity}} \right) \times 100\%$$

4. **Average Student Gaps** (*Direction: Minimize*):
   For each student cohort and day, count empty slots between that day's first and last class. Average over all group-days with classes, reported in hours:
   $$\text{Avg Gaps} = \frac{1}{|GD|} \sum_{(g, d) \in GD} (\text{Last Slot} - \text{First Slot} + 1 - \text{Classes Count})$$

---

## 3. Mathematical Optimization Formulation (OR-Tools CP-SAT)

The solver is implemented in [`engine/solver.py`](solver.py).

### Decision Variables
- $x_{e, d, s, r} \in \{0, 1\}$: Binary variable indicating whether event $e$ is assigned to day $d$, slot $s$, and room $r$.
- $u_e \in \{0, 1\}$: Slack variable indicating an unplaced event (heavily penalized with cost $10,000$).

### Hard Operational Constraints
1. **Single Placement**: Every event must either be scheduled into exactly one valid room-slot or marked unplaced:
   $$\sum_{d, s, r} x_{e, d, s, r} + u_e = 1 \quad \forall e \in E$$
2. **Room Exclusivity**: A room hosts at most one event in any given slot:
   $$\sum_{e} x_{e, d, s, r} \le 1 \quad \forall r, d, s$$
3. **Room Compatibility**: Events requiring laboratories ($e.\text{is\_lab}$) cannot be placed in standard lecture halls.
4. **Capacity Threshold**: A room must provide at least 80% seating for the expected enrollment.

### Soft Constraints & Penalties
To prevent radical policy decisions (such as cramming 100% of afternoon classes into the morning) from crashing the engine with an `INFEASIBLE` error, clashes are modeled as soft constraints with high penalties:
- **Faculty Double-Booking Penalty**: Weight $20$ per clash.
- **Student Cohort Overlap Penalty**: Weight $10$ per clash.
- **Schedule Spacing / Gaps Penalty**: Weight $1$ per slot index.

### Objective Function
$$\min \sum \left( 20 \times \text{FacultyClash} + 10 \times \text{StudentClash} + 1 \times \text{GapPenalty} + 10000 \times u_e \right)$$

### Warm-Starting (AddHint)
The solver injects the baseline timetable into the CP-SAT model using `model.AddHint()`, drastically accelerating convergence to under 1 second.

---

## 4. Vectorized Monte Carlo Simulation

Implemented in [`engine/simulator.py`](simulator.py) using NumPy across 300 iterations:

1. **Session Overruns**: Each class has a $10\%$ probability of overrunning into the subsequent slot, modeling real-world lecture drift.
2. **Room Outages**: Each room has a $2\%$ chance of experiencing an HVAC, projector, or maintenance outage, forcing sudden room swaps.
3. **Elective Enrollment Variations**: Perturbs attendance rosters to simulate fluctuating student section choices.

Outputs per metric: $\text{Mean}$, $\text{Std}$, $\text{P10}$, $\text{P90}$, and $\text{Prob(Zero Clashes)}$.

---

## 5. Public API

```python
from engine.solver import evaluate_scenario, evaluate_baseline

# 1. Baseline path (measures and simulates existing timetable without solving)
baseline_result = evaluate_baseline(dataset, baseline_timetable, n_sims=300, seed=42)

# 2. Scenario path (applies change, solves with CP-SAT, evaluates metrics and runs MC)
scenario_result = evaluate_scenario(dataset, baseline_timetable, change_spec, n_sims=300, seed=42)
```
