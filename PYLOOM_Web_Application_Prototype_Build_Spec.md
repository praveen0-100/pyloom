# PYLOOM — Web Application Prototype Build Specification

> **Catchphrase:** Drag, Connect and Execute  
> **Stack:** HTML + CSS + JavaScript + Python Flask  
> **Goal:** Build a browser-based visual Python programming simulation.

## 1. Concept

PYLOOM lets participants build a small Python application visually instead of typing Python code.

```text
Drag Module → Place → Connect → Configure → RUN → Test → Submit
```

The browser stores the visual program as JSON. The Flask backend validates the graph and executes only approved Python functions through a controlled module registry.

The core idea is based on the PYLOOM/Python Flow Lab blueprint: a canvas with draggable Python-function modules, connections, configuration, execution, tests, and credit-based evaluation. fileciteturn1file0L10-L12

---

## 2. Prototype Objectives

The V1 prototype must support:

1. Drag modules from a library.
2. Drop modules onto a canvas.
3. Move and delete nodes.
4. Connect node ports.
5. Configure node parameters.
6. Load a mission.
7. Convert the canvas into Flow JSON.
8. Send Flow JSON to Python.
9. Execute the flow through safe predefined functions.
10. Display numerical and string results.
11. Run visible and hidden tests.
12. Calculate credits.
13. Submit a solution.
14. Later support pattern and Matplotlib/chart outputs.

---

## 3. Technology Stack

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- SVG for connection lines
- Fetch API
- Optional Chart.js for browser-side chart rendering

### Backend

- Python 3.11+
- Flask
- Flask-CORS
- NumPy
- Matplotlib

### Prototype Storage

Use JSON files initially:

```text
backend/data/missions.json
backend/data/tests.json
backend/data/submissions.json
```

A database can be added later.

---

# 4. Architecture

```text
                    PYLOOM WEB APP
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
    FRONTEND                            BACKEND
 HTML + CSS + JS                    Python Flask
        │                                 │
        ▼                                 ▼
 Module Library                      Flow Validator
        │                                 │
        ▼                                 ▼
 Drag/Drop Canvas                    Execution Engine
        │                                 │
        ▼                                 ▼
 Node + Edge JSON                    Module Registry
        │                                 │
        └────────────────┬────────────────┘
                         ▼
                  Test + Scoring
                         │
                         ▼
                    Final Result
```

---

# 5. UI Layout

```text
┌───────────────────────────────────────────────────────────────────┐
│ PYLOOM      Mission 01     Round 1     Credits 00/100     20:00  │
├───────────────┬─────────────────────────────────┬─────────────────┤
│ MODULES       │                                 │ OUTPUT / TESTS  │
│               │              CANVAS             │                 │
│ Search        │                                 │ Execution       │
│               │          [Input]                │                 │
│ DATA          │             │                   │ Test 1 ✓        │
│ Input         │          [Average]              │ Test 2 ✓        │
│ List          │             │                   │ Test 3 ✗        │
│ Dictionary    │          [Output]               │                 │
│               │                                 │ Credits         │
│ MATH          │                                 │ 35 / 50         │
│ Add           │                                 │                 │
│ Divide        │                                 │                 │
├───────────────┴─────────────────────────────────┴─────────────────┤
│ Input Console     [ RUN ] [ RESET ] [ AUTO LAYOUT ] [ SUBMIT ]    │
└───────────────────────────────────────────────────────────────────┘
```

The original blueprint specifies a top bar, left module panel, central canvas, output/test area, and bottom controls. fileciteturn1file3L482-L510

---

# 6. Module Library

## Data

```text
Input
Output
List
Dictionary
Tuple
Set
CSV Reader
JSON Reader
```

## Collection / Transformation

```text
Sum
Average
Min
Max
Sort
Filter
Map
Reduce
```

## Logic

```text
If
Else
If / Else
Comparison
AND
OR
NOT
```

## Control

```text
For Loop
While Loop
Break
Continue
```

## String

```text
Split
Join
Replace
Uppercase
Lowercase
Search
```

## Math

```text
Add
Subtract
Multiply
Divide
Modulus
Power
Round
```

## Visualization

```text
Plot
Line Chart
Bar Chart
Scatter Plot
Histogram
```

These categories are taken from the existing event blueprint. fileciteturn1file0L14-L60

---

# 7. Canvas Nodes

Each node should contain:

- Module icon
- Module name
- Description
- Input port
- Output port
- Settings button
- Delete button
- Status indicator

Example:

```text
       ● INPUT
┌───────────────────┐
│     AVERAGE       │
│                   │
│  Calculates mean  │
│              ⚙ × │
└───────────────────┘
       ● OUTPUT
```

Canvas requirements:

- Grid background
- Drag/move nodes
- Connect nodes
- Delete nodes
- Delete connections
- Zoom
- Pan
- Auto layout
- Arrow connections

---

# 8. Flow JSON

The visual program should be represented as:

```json
{
  "mission_id": "mission_01",
  "nodes": [
    {
      "id": "node_1",
      "type": "Input",
      "config": {
        "data": [85, 72, 91, 68, 79]
      }
    },
    {
      "id": "node_2",
      "type": "Average",
      "config": {}
    },
    {
      "id": "node_3",
      "type": "Output",
      "config": {
        "format": "Average: {value}"
      }
    }
  ],
  "edges": [
    {"from": "node_1", "to": "node_2"},
    {"from": "node_2", "to": "node_3"}
  ]
}
```

The earlier blueprint uses this node/edge representation for the execution engine. fileciteturn1file3L512-L550

---

# 9. Python Execution Engine

**Do not execute arbitrary participant Python.**

Never use:

```python
exec(user_code)
eval(user_code)
```

Instead create a controlled registry:

```python
MODULE_REGISTRY = {
    "Input": execute_input,
    "List": execute_list,
    "Sum": execute_sum,
    "Length": execute_length,
    "Average": execute_average,
    "Min": execute_min,
    "Max": execute_max,
    "Sort": execute_sort,
    "Filter": execute_filter,
    "Map": execute_map,
    "Add": execute_add,
    "Subtract": execute_subtract,
    "Multiply": execute_multiply,
    "Divide": execute_divide,
    "Uppercase": execute_uppercase,
    "Lowercase": execute_lowercase,
    "Replace": execute_replace,
    "Output": execute_output
}
```

Execution:

```text
Flow JSON
   ↓
Validate
   ↓
Build graph
   ↓
Determine execution order
   ↓
Execute approved module
   ↓
Pass result to next module
   ↓
Generate output
```

The source concept specifically recommends that the visual blocks represent predefined Python operations and that the simulator use a controlled execution engine. fileciteturn1file2L362-L398

---

# 10. Graph Validation

Before execution:

```text
✓ Input exists
✓ Output exists
✓ Connections are valid
✓ Required nodes are present
✓ No invalid cycles
✓ Required configuration exists
✓ No disconnected required flow
```

Return structured errors:

```json
{
  "success": false,
  "error": {
    "type": "MISSING_OUTPUT",
    "message": "The flow requires an Output node."
  }
}
```

Possible error types:

```text
MISSING_INPUT
MISSING_OUTPUT
INVALID_CONNECTION
INVALID_CONFIGURATION
EMPTY_DATA
TYPE_ERROR
UNKNOWN_MODULE
CYCLE_DETECTED
DIVISION_BY_ZERO
```

---

# 11. First Mission — Student Result Analyzer

## Problem

Build a flow that accepts student marks and calculates the average.

Input:

```text
[85, 72, 91, 68, 79]
```

Expected:

```text
Average: 79.0
```

Suggested flow:

```text
INPUT
  ↓
LIST
  ↓
SUM
  ↓
LENGTH
  ↓
DIVIDE
  ↓
OUTPUT
```

The original blueprint also presents the Student Result Analyzer with the same input and expected average. fileciteturn1file4L588-L632

---

# 12. Mission JSON

`backend/data/missions.json`

```json
[
  {
    "id": "mission_01",
    "title": "Student Result Analyzer",
    "description": "Calculate the average of student marks.",
    "input": [85, 72, 91, 68, 79],
    "expected_output": {
      "average": 79.0
    },
    "required_modules": [
      "Input",
      "List",
      "Sum",
      "Length",
      "Divide",
      "Output"
    ]
  }
]
```

---

# 13. Round 1

## Build + Mapping Check

**Time:** 20 minutes  
**Credits:** 50

Participants:

1. Read the problem.
2. Select modules.
3. Drag modules.
4. Configure modules.
5. Connect modules.
6. Create the complete flow.

### Scoring

| Category | Credits |
|---|---:|
| Correct module selection | 10 |
| Module configuration | 10 |
| Correct connections | 15 |
| Correct execution sequence | 10 |
| Complete flow | 5 |
| **Total** | **50** |

---

# 14. Round 2

## Output Check + Testing + Finalize

**Time:** 20 minutes  
**Credits:** 50

Test different output types.

### Numerical

```text
Input:
[80, 90, 70]

Expected:
80.0
```

### String

```text
Input:
python programming

Expected:
PYTHON-PROGRAMMING
```

### Pattern

```text
Input:
5

Expected:
*
**
***
****
*****
```

### Matplotlib

```text
X = [1, 2, 3, 4, 5]
Y = [10, 20, 15, 30, 25]
```

Expected: a line chart.

### Round 2 scoring

| Category | Credits |
|---|---:|
| Numerical output | 5 |
| Numerical edge case | 5 |
| String output | 5 |
| Pattern output | 5 |
| Matplotlib/chart | 10 |
| Hidden input | 10 |
| Final execution | 10 |
| **Total** | **50** |

Overall:

```text
Round 1 = 50
Round 2 = 50
TOTAL    = 100
```

---

# 15. Test Engine

Support:

```text
Visible Tests
Hidden Tests
Edge Cases
```

Test object:

```json
{
  "test_id": "T01",
  "input": [80, 90, 70],
  "expected": 80.0
}
```

Frontend:

```text
TEST RESULTS

✓ Test 1 PASS
✓ Test 2 PASS
✗ Test 3 FAIL
```

For a failed visible test:

```text
Expected: 80.0
Received: 75.0
```

For hidden tests, expose only:

```text
Hidden Test 01
✓ PASS
```

---

# 16. String Operations

Implement:

### Uppercase

```text
python
↓
PYTHON
```

### Lowercase

```text
PYTHON
↓
python
```

### Replace

```text
hello world
↓
hello-world
```

### Split

```text
python,java,c++
↓
["python", "java", "c++"]
```

### Join

```text
["PYTHON", "FLOW"]
↓
PYTHON-FLOW
```

---

# 17. Pattern Output

Use a safe predefined function:

```python
def execute_pattern(n):
    return "
".join("*" * i for i in range(1, n + 1))
```

Input:

```text
5
```

Output:

```text
*
**
***
****
*****
```

---

# 18. Matplotlib Output

For chart missions:

```python
import matplotlib.pyplot as plt

def execute_line_chart(x, y):
    plt.figure()
    plt.plot(x, y, marker="o")
    plt.xlabel("X")
    plt.ylabel("Y")
    plt.title("PYLOOM Chart")

    path = "backend/generated/chart.png"
    plt.savefig(path)
    plt.close()

    return path
```

Return:

```json
{
  "success": true,
  "type": "chart",
  "image": "/generated/chart.png"
}
```

Then display the image in the output panel.

---

# 19. Flask API

## Get Mission

```text
GET /api/mission/<mission_id>
```

## Run Flow

```text
POST /api/run-flow
```

Request:

```json
{
  "mission_id": "mission_01",
  "flow": {
    "nodes": [],
    "edges": []
  }
}
```

Response:

```json
{
  "success": true,
  "output": "Average: 79.0",
  "tests": [
    {
      "id": "T01",
      "passed": true
    }
  ],
  "credits": 35
}
```

## Submit

```text
POST /api/submit
```

Request:

```json
{
  "team_id": "TEAM_07",
  "mission_id": "mission_01",
  "round": 2,
  "flow": {
    "nodes": [],
    "edges": []
  }
}
```

Response:

```json
{
  "submitted": true,
  "credits": 87,
  "status": "accepted"
}
```

---

# 20. Project Folder Structure

```text
PYLOOM/
│
├── README.md
│
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   │
│   ├── engine/
│   │   ├── executor.py
│   │   ├── validator.py
│   │   ├── registry.py
│   │   └── scorer.py
│   │
│   ├── modules/
│   │   ├── data_modules.py
│   │   ├── math_modules.py
│   │   ├── string_modules.py
│   │   ├── logic_modules.py
│   │   └── chart_modules.py
│   │
│   ├── data/
│   │   ├── missions.json
│   │   └── tests.json
│   │
│   └── generated/
│
├── frontend/
│   ├── index.html
│   │
│   ├── css/
│   │   ├── style.css
│   │   └── canvas.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   ├── canvas.js
│   │   ├── nodes.js
│   │   ├── connections.js
│   │   ├── api.js
│   │   ├── timer.js
│   │   └── scoring.js
│   │
│   └── assets/
│
└── tests/
    ├── test_executor.py
    ├── test_validator.py
    └── test_scorer.py
```

---

# 21. JavaScript State

```javascript
const flowState = {
    missionId: "mission_01",
    nodes: [],
    edges: [],
    selectedNode: null,
    credits: 0,
    round: 1
};
```

Node:

```javascript
{
    id: crypto.randomUUID(),
    type: "Average",
    x: 420,
    y: 220,
    config: {}
}
```

Edge:

```javascript
{
    from: "node_1",
    to: "node_2"
}
```

---

# 22. Drag-and-Drop

Flow:

```text
Module Card
    ↓
dragstart
    ↓
Canvas drop
    ↓
Create node
    ↓
Add to flowState.nodes
    ↓
Render node
```

Function:

```javascript
function createNode(type, x, y) {
    const node = {
        id: crypto.randomUUID(),
        type,
        x,
        y,
        config: {}
    };

    flowState.nodes.push(node);
    renderNode(node);
}
```

---

# 23. Connections

For V1, use SVG.

Interaction:

```text
Click output port
       ↓
Click input port
       ↓
Create edge
       ↓
Draw SVG arrow
```

Function:

```javascript
function connectNodes(fromId, toId) {
    flowState.edges.push({
        from: fromId,
        to: toId
    });

    redrawConnections();
}
```

---

# 24. Node Configuration

Click ⚙ to open a modal.

Example:

```text
┌─────────────────────────────┐
│ Configure DIVIDE            │
├─────────────────────────────┤
│ Input A: [ previous ]       │
│ Input B: [ previous ]       │
│                             │
│       [ SAVE ]              │
└─────────────────────────────┘
```

Replace:

```text
Find:
[________]

Replace With:
[________]

[ SAVE ]
```

---

# 25. Output Panel

```text
┌─────────────────────────┐
│ EXECUTION RESULT        │
├─────────────────────────┤
│ Status: ✓ SUCCESS       │
│                         │
│ Average: 79.0           │
│                         │
├─────────────────────────┤
│ TESTS                   │
│ ✓ T01 PASS              │
│ ✓ T02 PASS              │
│ ✗ T03 FAIL              │
├─────────────────────────┤
│ CREDITS                 │
│ 35 / 50                 │
└─────────────────────────┘
```

---

# 26. Timer

For the prototype:

```javascript
let remainingSeconds = 20 * 60;

const timer = setInterval(() => {
    remainingSeconds--;

    if (remainingSeconds <= 0) {
        clearInterval(timer);
        lockSubmission();
    }

    updateTimerUI();
}, 1000);
```

For a real competition, the backend should eventually become the authoritative timer.

---

# 27. Credit Engine

`backend/engine/scorer.py`

```python
def calculate_round1_credits(result):
    credits = 0

    if result["modules_correct"]:
        credits += 10

    if result["configuration_correct"]:
        credits += 10

    if result["connections_correct"]:
        credits += 15

    if result["sequence_correct"]:
        credits += 10

    if result["complete"]:
        credits += 5

    return credits
```

Create a separate Round 2 scorer.

---

# 28. Admin Dashboard

Create:

```text
frontend/admin.html
```

Display:

```text
PYLOOM ADMIN DASHBOARD

Teams Online: 18
Submitted: 12
Running: 6

Team     Round     Credits     Status
TEAM01   R2        92          Done
TEAM02   R2        87          Done
TEAM03   R1        41          Active
```

Store submission records:

```json
{
  "team_id": "TEAM01",
  "mission_id": "mission_01",
  "round": 2,
  "credits": 92,
  "status": "accepted"
}
```

Also save the complete Flow JSON for judging/audit.

---

# 29. Requirement Change Simulation

A powerful Round 2 feature is a live requirement change.

Example:

```text
CLIENT REQUEST

Ignore invalid marks.
Only values from 0 to 100 should be included.

New module unlocked:
VALIDATION
```

Input:

```text
[85, 120, 72, -10, 90]
```

Expected valid values:

```text
[85, 72, 90]
```

Expected average:

```text
82.33
```

This is part of the original simulation concept and makes the event test adaptation as well as flow construction. fileciteturn1file4L670-L706

---

# 30. Surprise Input

A final robustness test can use:

```text
["85", 72, "90", None, 65]
```

The mission should explicitly define how invalid/mixed data must be handled.

Do not leave judging rules ambiguous.

---

# 31. Recommended Missions

## Mission 01 — Student Result Analyzer

```text
Input → List → Sum → Length → Average → Output
```

## Mission 02 — E-Commerce Order System

```text
Products
→ Filter Stock
→ Calculate Cart
→ Apply Discount
→ Tax
→ Final Price
→ Invoice
```

## Mission 03 — Bus Reservation

```text
Passenger Input
→ Seat Availability
→ Validation
→ Reserve Seat
→ Calculate Fare
→ Ticket
```

## Mission 04 — Agriculture Analyzer

```text
Soil Data
→ Validation
→ Soil Classification
→ Crop Matching
→ Recommendation
→ Report
```

## Mission 05 — Library System

```text
Book Data
→ Search
→ Availability
→ Borrow
→ Due-Date Calculation
→ Fine Calculation
→ Output
```

These mission ideas come from the existing PYLOOM blueprint. fileciteturn1file1L84-L188

---

# 32. Development Phases

## Phase 1 — Static UI

Build:

```text
Header
Module Panel
Canvas
Output Panel
Bottom Controls
```

## Phase 2 — Drag and Drop

Implement:

```text
Drag → Drop → Create Node → Move → Delete
```

## Phase 3 — Connections

Implement:

```text
Output Port → Input Port → SVG Arrow
```

## Phase 4 — Flow JSON

Make the canvas state exportable as JSON.

## Phase 5 — Flask

Implement:

```text
/api/mission/<id>
/api/run-flow
/api/submit
```

## Phase 6 — Execution Engine

Implement the first modules:

```text
Input
List
Sum
Length
Average
Add
Subtract
Multiply
Divide
Uppercase
Replace
Output
```

## Phase 7 — Tests

Add visible, hidden, and edge-case tests.

## Phase 8 — Scoring

Implement 100-credit evaluation.

## Phase 9 — Charts

Add Matplotlib/Chart.js support.

## Phase 10 — Admin

Add team monitoring and submission review.

---

# 33. V1 Minimum Viable Prototype

Start with only:

```text
Input
List
Sum
Length
Average
Add
Divide
Uppercase
Replace
Pattern
Output
```

And:

```text
✓ Drag
✓ Drop
✓ Move
✓ Connect
✓ Delete
✓ Configure
✓ Run
✓ Test
✓ Score
✓ Submit
```

Do not build every module before the first end-to-end demo works.

---

# 34. Development Commands

Create the project:

```powershell
mkdir PYLOOM
cd PYLOOM

mkdir backend
mkdir frontend
```

Create a virtual environment:

```powershell
python -m venv venv
```

Activate it:

```powershell
.env\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install flask flask-cors numpy matplotlib
```

Run:

```powershell
python backend/app.py
```

Open:

```text
http://127.0.0.1:5000
```

`requirements.txt`:

```text
Flask
Flask-CORS
numpy
matplotlib
```

---

# 35. Implementation Priority

Build in this order:

```text
01  Static PYLOOM UI
02  Module cards
03  Drag/drop
04  Canvas nodes
05  Move nodes
06  Connection system
07  Flow JSON
08  Flask API
09  Execution engine
10  Module registry
11  RUN button
12  Output panel
13  Test engine
14  Credit system
15  Timer
16  Submit
17  Chart output
18  Admin dashboard
```

---

# 36. Final Success Criteria

The V1 prototype is complete when a participant can perform this entire workflow without manually writing Python:

```text
Drag Input
→ Drag List
→ Drag Sum
→ Drag Length
→ Drag Divide
→ Drag Output
→ Connect nodes
→ Configure input
→ RUN
→ Flask receives Flow JSON
→ Validator checks graph
→ Python execution engine runs modules
→ Output appears
→ Tests execute
→ Credits are calculated
→ Submit
```

The complete architecture is:

```text
VISUAL PROGRAM
      ↓
FLOW JSON
      ↓
VALIDATOR
      ↓
CONTROLLED PYTHON MODULES
      ↓
EXECUTION ENGINE
      ↓
TEST ENGINE
      ↓
SCORING ENGINE
      ↓
RESULT
```

This is the core technical prototype for **PYLOOM — Drag, Connect and Execute**.
