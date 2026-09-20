# PYLOOM — Drag, Connect and Execute

PYLOOM is a browser-based visual Python programming platform where users assemble and execute Python workflows visually by dragging modules, connecting ports, configuring parameters, and running graph workflows against a controlled Python execution engine.

---

## Features

- **Visual DAG Programming Engine**: Safe topological execution without arbitrary `exec()` / `eval()`.
- **Drag-and-Drop Canvas**: Glassmorphic UI with SVG Bezier connection lines, port snapping, zoom/pan/auto-layout.
- **Controlled Module Registry**: Standard library of Data, Math, String, Logic, and Charting modules.
- **Missions & Test Engine**: Real-time visible and hidden unit tests with credit scoring (100 credits total across Round 1 & Round 2).
- **Matplotlib Charting Support**: Dynamic line charts, bar plots, and visualization node rendering.
- **Admin Dashboard**: Live submission monitoring for competition judging.

---

## Quick Start Guide

### 1. Install Dependencies
```powershell
pip install -r backend/requirements.txt
```
script activation :
    .venv\Scripts\activate

### 2. Run Python Server
```powershell
py backend/app.py
```

### 3. Open in Browser
- **Visual IDE**: [http://127.0.0.1:5000](http://127.0.0.1:5000)
- **Admin Dashboard**: [http://127.0.0.1:5000/admin](http://127.0.0.1:5000/admin)

---

## Running Automated Tests
```powershell
python -m unittest discover tests
```
