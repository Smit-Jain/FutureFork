# 🌟 FutureFork Good First Issues

Looking to contribute to FutureFork? Here is a curated list of beginner-friendly and intermediate issues across frontend, backend, engine, and AI agent domains.

---

### 1. 🏥 Hospital Nurse Shift Scheduling Domain Adapter
- **Area**: `engine/` & `ai/catalog.py`
- **Difficulty**: Intermediate
- **Goal**: Add a domain schema and change types for hospital nurse rostering (`shift_nurses`, `ward_cap`, `night_shift_rotation`).
- **Files Involved**: `ai/catalog.py`, `engine/model.py`, `engine/changes.py`
- **Definition of Done**: A sample 14-day ward roster dataset with OR-Tools constraint checking nurse shifts and consecutive rest days.

---

### 2. ✈️ Airport Gate Assignment Solver Extension
- **Area**: `engine/`
- **Difficulty**: Intermediate
- **Goal**: Formulate gate allocation constraints (aircraft size vs gate bridge compatibility, minimum turnaround time).
- **Files Involved**: `engine/solver.py`, `engine/metrics.py`
- **Definition of Done**: Metric for gate idle time and passenger walking distance evaluated across flight arrivals.

---

### 3. 🚶 Faculty Walking Distance & Building Proximity Metric
- **Area**: `engine/metrics.py`
- **Difficulty**: Beginner
- **Goal**: Calculate inter-building transit penalties when a professor has consecutive classes in distant campus buildings.
- **Files Involved**: `engine/metrics.py`, `engine/model.py`, `frontend/src/components/ComparisonDashboard.tsx`
- **Definition of Done**: Metric `faculty_walking_meters` added to evaluation output and displayed on the comparison radar chart.

---

### 4. ✂️ Split-Lecture Decision Change Type
- **Area**: `ai/catalog.py` & `engine/changes.py`
- **Difficulty**: Beginner
- **Goal**: Allow users to say *"Split 3-hour marathon lectures into two 1.5-hour sessions on alternate days"*.
- **Files Involved**: `ai/catalog.py`, `ai/agents/parser.py`, `engine/changes.py`
- **Definition of Done**: 100% parser detection on split-lecture queries and valid event splitting in `apply_split_lecture`.

---

### 5. 🌙 Dark Mode Theme for Scenario Tree & Timetable Grid
- **Area**: `frontend/`
- **Difficulty**: Beginner
- **Goal**: Add a theme toggle supporting system preferences and dark mode styling for React Flow nodes, edge connections, and timetable cells.
- **Files Involved**: `frontend/src/App.tsx`, `frontend/src/components/ScenarioTree.tsx`, `frontend/src/index.css`
- **Definition of Done**: Smooth color transition with high-contrast accessibility compliance.

---

### 6. 📊 CSV & iCalendar (.ics) Timetable Export
- **Area**: `frontend/` & `backend/api/`
- **Difficulty**: Beginner
- **Goal**: Provide a button on `TimetableGrid` to export the currently selected scenario schedule to `.csv` or `.ics` for Google Calendar / Apple Calendar import.
- **Files Involved**: `frontend/src/components/TimetableGrid.tsx`, `backend/api/routes.py`
- **Definition of Done**: Click-to-download functional file containing all 68 scheduled events with correct slot timestamps.

---

### 7. 🎛️ Interactive Monte Carlo Parameter Sliders
- **Area**: `frontend/` & `engine/simulator.py`
- **Difficulty**: Beginner
- **Goal**: Allow users in the Comparison Dashboard to adjust perturbation probabilities (e.g. sick leave rate: 2% &rarr; 8%, storm outage: 0% &rarr; 5%) and re-run the 300-run simulation in real time.
- **Files Involved**: `frontend/src/components/ComparisonDashboard.tsx`, `backend/api/routes.py`
- **Definition of Done**: Sliders update simulation box-plots without reloading the page.

---

### 8. 🔔 Webhook / Slack Notification on Solver Completion
- **Area**: `backend/`
- **Difficulty**: Beginner
- **Goal**: Add optional webhook dispatcher when large optimization runs or multi-scenario branch runs finish.
- **Files Involved**: `backend/api/routes.py`, `backend/config.py`
- **Definition of Done**: Configurable `WEBHOOK_URL` receives a JSON summary payload with scenario comparison deltas.

---

### 9. 🧠 Multi-Turn Conversational Branch Refinement
- **Area**: `ai/agents/parser.py`
- **Difficulty**: Intermediate
- **Goal**: Allow users to click a scenario node and say *"Branch from this scenario, but relax room caps by 10%"*.
- **Files Involved**: `ai/agents/parser.py`, `frontend/src/components/NodeDrawer.tsx`
- **Definition of Done**: Parent scenario parameters inherit into child branch with differential prompt modifications.

---

### 10. ⚡ WebAssembly (Wasm) Client-Side Monte Carlo Simulation
- **Area**: `frontend/` & `engine/`
- **Difficulty**: Advanced
- **Goal**: Compile the Monte Carlo simulation to Rust / Wasm for client-side zero-latency execution in browser memory.
- **Files Involved**: `frontend/src/wasm/`, `engine/simulator.py`
- **Definition of Done**: 300 runs executed in &lt; 50ms entirely inside the user's browser.
