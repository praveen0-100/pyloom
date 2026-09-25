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

set "PATH=%PATH%;C:\Users\PRAVEEN PRABAKARN\.local\bin"

### 2. Run Python Server
```powershell
py backend/app.py
```

### 3. Open in Browser
- **Visual IDE**: [http://127.0.0.1:5000](http://127.0.0.1:5000)
- **Admin Dashboard**: [http://127.0.0.1:5000/admin](http://127.0.0.1:5000/admin)

---

## Using Both Consoles Like the Real Product

PYLOOM has two consoles that share one server and one database, so they stay in sync automatically (both poll the server every moment):

- **Admin console** - the organiser/judge screen at `/admin`.
- **Participant console (Visual IDE)** - what each contestant uses at `/`.

Use one browser (or window) per role. For a local demo, open the admin in a normal window and the participant in a second browser or an incognito window, so their sessions don't mix.

### Step 1 - Start the app
```powershell
.venv\Scripts\activate
py backend/app.py
```
Then open `http://127.0.0.1:5000/admin` (admin) and `http://127.0.0.1:5000` (participant). For a live event, deploy to Vercel (`vercel.json` is included) with the environment variables listed below and share the deployed URLs instead. Admin at `<your-url>/admin`, participants at `<your-url>/`.

### Step 2 - Organiser: prepare the event (Admin console)
1. Go to `/admin`, enter the admin **Username** and **Password**, and click **Open admin panel**.
2. Optionally pre-register contestants: fill **Team / Player ID**, **Player name**, **College**, **Year of study** and click **Add pending**. Use **Allow** on a pending row to let that person in.
3. Click **Full screen ON** to lock participants into fullscreen. Leaving fullscreen or losing focus is then flagged as a violation on your dashboard. **Release** switches it off and clears violations.

### Step 3 - Contestant: join (Participant console)
1. Open `/`, fill **Player name**, **Player ID** (e.g. `PLAYER_01`), **College**, **Year of study**, then click **Enter competition**.
2. If the lock is on, click **Enter full screen** when prompted. Stay in fullscreen for the whole round.
3. Pick a level tab (**Easy**, **Medium**, **Hard**). This starts the timers if they haven't started yet.

### Step 4 - Contestant: solve a question
1. Read the mission and use **Hint** if needed.
2. Search the module palette (**Search nodes...**) and drag nodes onto the canvas.
3. Connect output ports to input ports, then double-click/configure a node's parameters and **Save**.
4. Use zoom, **Fit view** and **Auto layout** to keep the graph tidy; **Clear canvas** starts over.
5. Click **Run flow** to test. Node outputs and charts appear on the canvas.
6. Click **Submit solution** to run the visible and hidden tests and earn credits. Your best score per question is kept even if a later attempt is worse.
7. Move between questions with **Prev Ques** / **Next Ques**.

### Step 5 - Organiser: run and monitor the round (Admin console)
- Watch live submissions, the summary, and the leaderboard update in near real time.
- Use **Pause / Resume / Restart** on the **main timer** (40 min total) and the **level timer** (Easy 18, Medium 15, Hard 12 min). Participants' clocks follow instantly.
- If a participant breaks the fullscreen lock, the violation and reason show on the dashboard. Click **Release** (or re-enable) to let them continue.
- Fix mistakes with **Save mapping** (override a participant's progress on a question) or edit the participant's details.

### Step 6 - Finish
When the main timer reaches 0 it stops automatically. Review the leaderboard for final rankings, then click **Log out**.

> Tip: the participant's `Player ID` is their team ID everywhere. Reusing an ID on another device resumes that player's saved work.

---

## Commands & Controls (API reference)

### Visual IDE (participant console, `/`)

| Action | How |
|---|---|
| Register a team | Enter team details on the landing screen (`POST /api/participant/register`) |
| Load missions | `GET /api/missions`, `GET /api/mission/<mission_id>` |
| Add a module | Drag it from the module palette onto the canvas |
| Connect ports | Drag from an output port to an input port (Bezier link, snaps to port) |
| Run the flow | **Run flow** button (`POST /api/run-flow`) - executes the graph and shows node outputs/charts |
| Submit for credits | **Submit solution** button (`POST /api/submit`) - runs visible + hidden tests and scores credits |
| Resume progress | `GET /api/progress/<team_id>` - saved flow and best credits per question |
| Change difficulty | Select Easy / Medium / Hard (`POST /api/timer/level`) - resets the level timer (18 / 15 / 12 min) |
| Poll timer | `GET /api/timer/state` - main timer (40 min) and level timer are synced from the server |

When the admin enables the **participant lock**, the IDE requires fullscreen and window focus. Losing either is reported (`POST /api/participant/lock-violation`) and shown on the admin dashboard.

### Admin Dashboard (`/admin`)

Sign in with the admin credentials (`POST /api/admin/login`; `/api/admin/session` and `/api/admin/logout` check/end the session). All other `/api/admin/*` routes require the session.

| Control | Endpoint / payload |
|---|---|
| Pause / resume / restart a timer | `POST /api/admin/timer/control` `{"timer": "main" \| "level", "action": "pause" \| "resume" \| "restart"}` |
| Enable / release participant lock | `POST /api/admin/participant-control` `{"action": "enable" \| "release"}` (release also clears violations) |
| View submissions | `GET /api/admin/submissions` |
| Summary stats | `GET /api/admin/summary` |
| Leaderboard | `GET /api/admin/leaderboard` |
| Live activity feed | `GET /api/admin/live` (polled for near-instant sync) |
| Add a participant | `POST /api/admin/participants` |
| Allow a participant back in | `POST /api/admin/participants/<team_id>/allow` |
| Edit a participant | `PUT /api/admin/participants/<team_id>` |
| Override progress | `PUT /api/admin/progress/<team_id>/<mission_id>` |

Example (PowerShell, after logging in with a session cookie):
```powershell
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$body = '{"username":"<admin user>","password":"<admin password>"}'
Invoke-RestMethod http://127.0.0.1:5000/api/admin/login -Method Post -Body $body -ContentType application/json -WebSession $s
Invoke-RestMethod http://127.0.0.1:5000/api/admin/timer/control -Method Post -WebSession $s -ContentType application/json `
  -Body '{"timer":"main","action":"pause"}'
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (shared state for participants, progress, submissions, timer) |
| `SUPABASE_SERVICE_KEY` | Supabase service key |
| `PYLOOM_ADMIN_SESSION_SECRET` | Flask session secret for admin login |

---

## Running Automated Tests
```powershell
python -m unittest discover tests
```
