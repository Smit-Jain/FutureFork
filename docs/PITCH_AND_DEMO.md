# FutureFork: Pitch Deck, Script & Demo Checklist

**Team FutureLabs | Elite Coders CodeSprint 2026**  
*Tagline: Simulate > Compare > Decide. Not just what to do, but what could happen if you choose differently.*

---

## 🎤 2-Minute CodeSprint Pitch Script

> **[0:00 - 0:25] The Problem & The Hook**  
> *"Good afternoon, judges. Every single day, leaders and administrators make high-stakes operational decisions based on intuition.  
> Take a university dean who says: 'Let's move all afternoon classes to the morning.' It sounds convenient for students. But what actually happens?  
> Lecture halls overflow. Professor schedules collide. And 200 students end up with overlapping exams.  
> Today, people try asking ChatGPT to solve this. But LLMs hallucinate numbers, violate hard room constraints, and cannot guarantee feasibility."*

> **[0:25 - 0:55] Our Solution & The Golden Rule**  
> *"That is why we built **FutureFork**.  
> FutureFork lets you type your decision in plain English, branches that decision into alternative scenarios, evaluates every branch with industrial-grade operations research, and displays the consequences side by side in an interactive scenario tree.  
> And we adhere to one unbreakable Golden Rule:  
> **AI agents interpret and explain. Mathematical models calculate and validate.**  
> The LLM never invents a number. Every percentage, clash, and room coordinate comes from **Google OR-Tools CP-SAT** or our **NumPy Monte Carlo simulator**."*

> **[0:55 - 1:35] The Live Demo**  
> *"Let's see it in action.  
> Here is our college dataset: 68 courses, 15 faculty, 10 rooms. Right now, there are 8 student clashes and 3 faculty overloads.  
> We type: 'Move all afternoon classes to morning, but keep faculty under 18 hours.'  
> FutureFork's LangGraph agents parse the intent, identify our target change type, and branch into 3 distinct policy forks:  
> - Scenario A: Balanced shift into morning slots.  
> - Scenario B: Aggressive shift with relaxed load caps.  
> - Scenario C: Conservative shift with strict 16-hour faculty limits.  
> Within 600 milliseconds, Google OR-Tools solves all three schedules. In Scenario A, student clashes drop from 8 to 0, and room utilization rises to 88.5%.  
> Our Monte Carlo engine runs 300 stress tests per branch, showing Scenario A has a 96% reliability score even if professors take sick leave."*

> **[1:35 - 2:00] Impact & The Future**  
> *"FutureFork transforms planning from blind guessing into rigorous scenario exploration.  
> While our MVP tackles college timetabling, our core engine is domain-agnostic: the same architecture expands directly into hospital nurse rostering and airport gate management.  
> FutureFork: Simulate > Compare > Decide. Thank you!"*

---

## 📊 7-Slide Pitch Deck Structure

| Slide # | Slide Title | Visual & Core Content |
|---|---|---|
| **Slide 1** | **FutureFork** | - Logo & Tagline: *Simulate > Compare > Decide*<br>- Team FutureLabs | Elite Coders CodeSprint 2026 |
| **Slide 2** | **The Intuition Trap** | - The problem: Complex systems have non-linear trade-offs.<br>- LLMs hallucinate numbers; spreadsheets are static and brittle. |
| **Slide 3** | **The Golden Rule of FutureFork** | - Diagram: Plain English &rarr; LangGraph Parser &rarr; OR-Tools CP-SAT + Monte Carlo &rarr; Guarded Explanations.<br>- Strict separation of semantic reasoning and mathematical computation. |
| **Slide 4** | **Interactive Branching USP** | - Screenshot of the React Flow Scenario Tree.<br>- Branching from Baseline &rarr; Scenario A / B / C.<br>- Node drawer showing radar comparison and timetable clash popovers. |
| **Slide 5** | **Live Demo Walkthrough** | - Demo 1: Afternoon shift to morning with 18h cap.<br>- Metrics deltas: 8 clashes &rarr; 0 clashes; Monte Carlo 96% confidence. |
| **Slide 6** | **Production Architecture & Performance** | - OR-Tools CP-SAT solve time: &lt; 0.65s.<br>- 300 Monte Carlo runs: &lt; 0.05s.<br>- Full E2E verification: 17/17 tests passed; 100% eval benchmark. |
| **Slide 7** | **Future Vision & Open Source** | - MIT Licensed repository with issue templates and contribution guide.<br>- Roadmap: Hospital rostering, airport logistics, disaster evacuation. |

---

## 🎯 Demo Click-Through Checklist for Presenters

Follow this step-by-step path during live demonstrations:

1. **Load Dashboard (`http://localhost:5173`)**:
   - Point out the active dataset: `Sample University (68 events, 15 faculty, 10 rooms)`.
   - Point out current baseline issues: `8 student clashes, 3 faculty clashes, 64.8% utilization`.
2. **Submit Demo Prompt 1**:
   - Click the quick chip: *"Move all afternoon classes to morning, but keep faculty under 18 hours"*.
   - Click **Fork & Simulate**.
3. **Inspect the Scenario Tree**:
   - Show the auto-arranged DAG in React Flow.
   - Hover over **Scenario A** (Balanced Shift) vs **Scenario B** (Aggressive Shift).
4. **Open Node Drawer & Timetable**:
   - Click on **Scenario A** node.
   - Show the weekly 5x8 timetable grid.
   - Highlight that previous red clash badges are now green (0 clashes).
5. **Open Comparison Dashboard**:
   - Show side-by-side metric delta cards (clashes down 100%, utilization up 23.7%).
   - Show the Monte Carlo 300-run distribution graph.
6. **Show Explanation Panel & Point Out Numeric Guard**:
   - Show the AI narrative explaining *why* morning utilization increased.
   - Emphasize to the judges that every number in that explanation is guaranteed by the regex Numeric Guard.

---

## 💡 Judge Q&A Cheat Sheet

- **Q: Why not just ask an LLM like GPT-4 or Claude to output the timetable directly?**
  - **A**: *LLMs cannot solve combinatorial constraint satisfaction problems reliably. In a university with 68 events and room limits, an LLM consistently produces duplicate bookings, room overflows, and hallucinated time slots. In FutureFork, the LLM only translates human intent into math; Google OR-Tools CP-SAT solves the exact equation with zero errors.*
- **Q: What happens if a user's requested scenario is mathematically impossible (infeasible)?**
  - **A**: *Our CP-SAT model uses soft constraints with stratified penalty weights (unplaced events penalty: 10,000; faculty clash penalty: 20; student clash: 10). If a hard constraint cannot be satisfied, the solver returns the minimal-penalty feasible relaxation, and our Explainer agent explicitly informs the user which constraint was relaxed and why.*
- **Q: How fast is the system in practice?**
  - **A**: *The OR-Tools CP-SAT solver converges in 0.64 seconds with solution hints. The vectorized NumPy Monte Carlo engine finishes 300 stress-test runs in under 45 milliseconds. The total end-to-end latency including LangGraph parsing is under 2.5 seconds.*
