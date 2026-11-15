# FutureFork 5-Minute Pitch & Demo Script

**Team FutureLabs | Elite Coders CodeSprint 2026**

## Timing & Flow

### 1. Hook (30s)
> *"Organizations make critical resource decisions blindly: they implement policy changes first and discover painful downstream consequences later. What if campus administrators, hospital managers, and logistics planners could test a decision before implementing it?"*

### 2. Define (30s)
- Navigate to `http://localhost:5173` or public URL.
- Show the Decision Input interface.
- Select sample university dataset (68 events, 15 faculty, 10 rooms, 8 cohorts).
- Click Demo Prompt 1:
  > *"Move all afternoon classes to the morning, but keep every faculty member under 18 teaching hours per week."*
- Highlight that the system parses constraints and policy changes into a structured `DecisionSpec`.

### 3. Branch (45s)
- Click **"Run Decision Engine"**.
- Watch the **Scenario Tree** (the USP) expand dynamically:
  - **Baseline Root (Green)**: Current operating timetable (flawed: 8 student clashes, 3 faculty clashes).
  - **Scenario A (Red)**: Full morning shift (all classes compressed).
  - **Scenario B (Purple)**: Selective elective shift (preserves core lecture flexibility).
  - **Scenario C (Amber)**: Morning shift supplemented with backup Lab 204.
- Explain the animated edges indicating live OR-Tools CP-SAT solving and NumPy Monte Carlo simulation.

### 4. Compare (90s)
- Switch to the **Comparison Dashboard**.
- Walk through the side-by-side metrics table:
  - Scenario A raises room utilization to **84.5%**, but surges student clashes to **14**.
  - Scenario B drops student clashes to **2** and completely eliminates faculty double-bookings (**0**), while keeping room utilization healthy at **75.2%**.
- Show the Grouped Bar Chart and Trade-off Radar Chart.

### 5. Risk & Robustness (45s)
- Point to the **Monte Carlo Simulation (300 runs)** section:
  - Show how perturbing elective enrollment, class overruns (+10%), and room outages (+2%) tests resilience.
  - Scenario B boasts a **38% probability of zero clashes**, whereas Scenario A has **0%**.
  - *"This robustness modeling is what no spreadsheet or manual planning tool can provide."*

### 6. Timetable & Explain (30s)
- Show the **Weekly Timetable Grid** (Mon-Fri, 8 slots).
  - Highlight red clash indicators and click to inspect the clash diagnosis modal.
- Open **AI Decision Synthesis**:
  - Show the plain-English recommendation.
  - Emphasize the **Golden Rule**: AI interpreted and explained; CP-SAT and NumPy calculated all numbers.

### 7. Vision & Open Source (30s)
- Outline Phase 2 (deeper child branching via "Branch from here" stub) and Phase 3 (hospital shifts, airport gate allocations).
- Highlight open-source readiness on GitHub.
