# FutureFork 🍴

> **Simulate &gt; Compare &gt; Decide.**  
> *Not just what to do, but what could happen if you choose differently.*

[![Elite Coders CodeSprint 2026](https://img.shields.io/badge/CodeSprint-2026_Finalist-blueviolet?style=for-the-badge)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg?style=for-the-badge)](https://python.org)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=for-the-badge)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/Frontend-React_19_+_Vite-61DAFB.svg?style=for-the-badge)](https://reactjs.org)
[![OR-Tools](https://img.shields.io/badge/Optimization-Google_OR--Tools-FF6F00.svg?style=for-the-badge)](https://developers.google.com/optimization)

**Team FutureLabs** | Elite Coders CodeSprint 2026  
*Idea &rarr; MVP &rarr; Open Source &rarr; Pitch*

---

## 🌟 What is FutureFork?

Every organizational decision involves trade-offs that human intuition alone cannot forecast. Moving classes into morning slots sounds convenient until room capacity overflows and professor schedules collide. 

**FutureFork** bridges natural language decision-making with industrial-grade operations research:
1. **Describe a decision in plain English**: e.g., *"Move all afternoon classes to morning, but keep faculty under 18 hours."*
2. **Autonomous scenario branching**: AI agents parse the intent, construct mathematical decision specifications, and automatically branch into alternative policy pathways (Baseline, Conservative, Aggressive, Balanced).
3. **Rigorous mathematical evaluation**: Google OR-Tools CP-SAT constraint programming produces exact schedules, while a NumPy Monte Carlo simulator stress-tests every scenario over 300 runs (simulating attendance surges, faculty sick leave, and room equipment failures).
4. **Interactive Scenario Tree & Side-by-Side Dashboard**: Explore consequences on an interactive React Flow graph, inspect timetable heatmaps, and read AI explanations strictly grounded in mathematical evidence.

### 🛡️ The Golden Rule

> **AI agents interpret and explain. Mathematical models calculate and validate.**  
> The LLM never invents, estimates, or mutates numbers displayed on screen. Every metric, percentage, clash count, and schedule coordinate is deterministically produced by **Google OR-Tools CP-SAT** or the **NumPy Monte Carlo simulator**, strictly enforced by an automated **Numeric Guard**.

---

## 🏗️ System Architecture

```
+---------------------------------------------------------------------------------+
|                        FRONTEND (React 19 + TypeScript)                         |
|   - DecisionInput: Natural language prompt + change catalog chip selection       |
|   - ScenarioTree: Interactive DAG branching visualization (React Flow + Dagre)  |
|   - NodeDrawer & ComparisonDashboard: Radar charts, clash meters & metric deltas|
|   - TimetableGrid: 5 days x 8 slots weekly grid with instant clash popovers     |
|   - ExplanationPanel: LLM synthesis guarded by regex Numeric Verification       |
+---------------------------------------+-----------------------------------------+
                                        | REST API / JSON Contracts
+---------------------------------------v-----------------------------------------+
|                           BACKEND (FastAPI + SQLAlchemy)                        |
|   - Routes: /datasets, /decisions, /scenarios, /run, /compare, /branch         |
|   - Orchestration: Dispatches solver jobs, caches scenario evaluations          |
|   - Storage: SQLite (Local) / PostgreSQL Supabase (Cloud Production)           |
+--------------------+------------------------------------+-----------------------+
                     |                                    |
+--------------------v-------------+     +----------------v-----------------------+
|    AI LAYER (LangGraph + OpenAI) |     | OPTIMIZATION & SIMULATION ENGINE       |
|   - Parser Agent (Catalog Schema)|     |   - Google OR-Tools CP-SAT Solver      |
|   - Scenario Agent (Branching)   |     |   - Vectorized NumPy Monte Carlo (300) |
|   - Explainer Agent              |     |   - Metrics: Clashes, Util, Gaps, Fit  |
|   - Regex Numeric Guard          |     |   - Change Appliers (Window/Room/Cap)  |
+----------------------------------+     +----------------------------------------+
```

---

## ⚡ 3 Live Demo Prompts

Try these interactive prompts directly in FutureFork's UI:

| # | Plain English Prompt | Scenario Branching & Expected Mathematical Outcome |
|---|---|---|
| **Demo 1** | *"Move all afternoon classes to morning, but keep faculty under 18 hours."* | **Baseline**: 8 student clashes, 3 faculty clashes, 64.8% util.<br>**Scenario A**: Shifts 32 afternoon classes &rarr; 0 clashes, 88.5% util.<br>**Scenario B**: Relaxed cap &rarr; 91.2% util, 0 clashes.<br>**Scenario C**: Strict 16h cap &rarr; 82.1% util. |
| **Demo 2** | *"Shift classes out of Room 101 due to projector repair."* | Takes Room 101 out of commission.<br>Relocates 7 events to available rooms without creating conflicts.<br>Utilization of remaining rooms climbs to 71.4%. |
| **Demo 3** | *"Cap faculty load at 15 hours per week across all departments."* | Hard cap at 15 contact hours.<br>Eliminates all faculty overload clashes (3 &rarr; 0).<br>Monte Carlo reliability score reaches 97.4%. |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & **pnpm** (or npm)
- *Optional*: Docker and Docker Compose

### Option 1: Running with Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/team-futurelabs/futurefork.git
cd futurefork

# Build and start all services
docker-compose up --build
```
- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **FastAPI Backend & Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Option 2: Local Development Setup

#### 1. Backend & Optimization Engine
```bash
# Navigate to project root
cd FutureFork

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt
pip install ortools numpy scipy

# Generate sample university dataset (68 events, 15 faculty, 10 rooms, 8 groups)
python data/make_sample.py

# Start FastAPI server (hot-reload enabled)
python backend/main.py
# Server running at http://localhost:8000
```

#### 2. React Frontend
```bash
# In a new terminal window:
cd FutureFork/frontend

# Install dependencies
pnpm install

# Start Vite development server
pnpm dev
# Client running at http://localhost:5173
```

---

## 🧪 Running the Verification Test Suite

FutureFork maintains 100% test passing across all layers:

```bash
# 1. Run Engine & Backend Unit Tests (20 tests)
pytest backend/tests engine/tests -v

# 2. Run Comprehensive 17-Step API E2E Pipeline
python scripts/e2e.py

# 3. Run AI Parser & Numeric Guard 15-Prompt Evaluation Suite
python ai/evals/test_prompts.py

# 4. Verify Frontend TypeScript Compilation & Production Build
cd frontend && pnpm run build
```

---

## 🧩 How to Add a New Decision Change Type

FutureFork's modular engine makes adding new decision types straightforward:

1. **Register in Change Catalog (`ai/catalog.py`)**:
   Add the specification with parameter definitions, enum bounds, and examples.
   ```python
   "online_hybrid_shift": {
       "name": "Shift Lectures to Online Hybrid",
       "description": "Frees room allocations by marking lecture classes as remote.",
       "parameters": { ... }
   }
   ```
2. **Extend Parser Recognition (`ai/agents/parser.py`)**:
   Add keyword intents to extract parameters into `DecisionSpec`.
3. **Implement Transformer Applier (`engine/changes.py`)**:
   Implement `apply_online_hybrid_shift(problem, params)` returning an updated `ProblemInstance`.
4. **Solver & Simulator Handshake**:
   The engine automatically runs CP-SAT and Monte Carlo on the updated instance.
5. **Add UI Chip in Frontend (`frontend/src/components/DecisionInput.tsx`)**:
   Add the quick-fill chip for instant user testing.

---

## 📁 Repository Structure

```
FutureFork/
├── ai/                         # LangGraph Multi-Agent AI Layer
│   ├── agents/
│   │   ├── parser.py           # NLP Decision Spec Parser & Fallback
│   │   ├── scenario.py         # Autonomous Scenario Branching Agent
│   │   └── explainer.py        # Explainability Agent with Numeric Guard
│   ├── catalog.py              # Machine-readable Change Catalog
│   ├── graph.py                # LangGraph StateGraph Definition
│   ├── llm.py                  # LLM Wrapper with Telemetry & Fallbacks
│   └── evals/test_prompts.py   # 15-Prompt Evaluation Benchmark
├── backend/                    # FastAPI Server & Database Layer
│   ├── api/routes.py           # REST Endpoints
│   ├── db/                     # Models, Engine & SQLite/Postgres Store
│   └── tests/                  # Backend Route Unit Tests
├── contracts/
│   └── openapi.json            # Machine-readable OpenAPI 3.1 Contract
├── data/                       # University Seed Dataset
│   ├── make_sample.py          # Deterministic Dataset Generator
│   ├── sample_university.json  # 68 events, 15 faculty, 10 rooms
│   └── loader.py               # Data Validator & Loader
├── engine/                     # Optimization & Simulation Engine
│   ├── model.py                # Core Domain Dataclasses
│   ├── metrics.py              # Exact Metric Evaluator
│   ├── changes.py              # Change Catalog Transformers
│   ├── solver.py               # Google OR-Tools CP-SAT Optimizer
│   ├── simulator.py            # Vectorized NumPy Monte Carlo Engine
│   └── tests/                  # Engine Unit Tests
├── frontend/                   # React 19 + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/         # ScenarioTree, TimetableGrid, Dashboard
│   │   ├── api.ts              # Type-Safe REST Client
│   │   └── types.ts            # Frontend Type Contracts
│   └── package.json
├── docs/                       # Pitch, Good First Issues, Mathematics
├── scripts/e2e.py              # Automated 17-Step E2E Verification
├── Dockerfile                  # Production Multi-Stage Container
├── docker-compose.yml          # Container Orchestration
└── render.yaml                 # 1-Click Cloud Deployment Spec
```

---

## 🤝 Contributing & Community

FutureFork is 100% open-source under the [MIT License](LICENSE).
- Check out our [Contributing Guidelines](CONTRIBUTING.md).
- Adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
- Looking to contribute? Pick up an item from our [Good First Issues](docs/GOOD_FIRST_ISSUES.md)!

---

## 📜 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

**Team FutureLabs** | CodeSprint 2026
