# PYLOOM — Drag, Connect and Execute

PYLOOM is a browser-based visual Python programming competition platform. Participants (solo players or two-person teams) assemble Python workflows by dragging nodes onto a canvas, connecting ports and typing parameters. A controlled Python engine runs the graph and scores it against visible and hidden test cases. An admin console runs the event: approvals, timers, live monitoring, violations and the leaderboard.

**Live app:** participants <https://pyloom-three.vercel.app> · admin <https://pyloom-three.vercel.app/admin>

---

## Features

**Participant console**
- Visual node editor: drag-and-drop palette, SVG connections (double-click a link to unlink), zoom / pan / auto-layout, autosave of every mapping.
- **Team login** (team name, team code, two member names, college, year) and **Solo login** (name, Player ID, college, year), plus a choice of avatar from the `avatar/` folder.
- Instructions and rules pop-ups after login (reopen any time with the **Instructions** button), **Exit event** and **Log out** buttons.
- **Run flow** only evaluates the mapping against the test cases. **Submit solution** records progress, awards the score and updates the leaderboard.
- Hints (step by step, cost 3 credits), 3 mapping trials per question, level and total score shown live.
- Fully responsive: phones, tablets, laptops and 2K/4K screens.

**Admin console**
- Approve, deactivate, unlock or delete participants (solo or team); delete all users when the event is complete.
- Shared main and level timers (start / pause / resume / restart), reset questions.
- Live online list, full-screen violation alerts (also for inactive/offline players), leaderboard (score out of 100), submissions log.

**Engine**
- Safe topological execution of the graph (no `eval()`/`exec()` of user code), module registry for Data, Math, String, Logic and Charts, Matplotlib chart output.

---

## Event rules implemented

| Topic | Behaviour |
|---|---|
| Levels | Easy (5 questions), Medium (3), Hard (2) - the set from `PYLOOM_Question_Set.pdf` (see below). Medium/Hard open after every question of the previous level has been submitted. |
| Timers | Main 45 min. Level timers: Easy 20, Medium 15, Hard 10 min. One shared clock for everyone, controlled only by the admin; logging out/in never changes it. |
| Score (100 total) | Easy 4 per question (20), Medium 10 (30), Hard 25 (50). By checks passed (Mapping Flow, Logic building, Output compare with sample output, Output check): 4 = full score, 3 = 3/4, 2 = 1/2, 1 = 1/4, 0 = nothing. Best score per question is kept. |
| Event credits | Start at 10. Hints cost 3. Completing a level and entering the next adds +10. |
| Access | A participant only enters the canvas after the admin approves them. Every new login needs approval again. |
| Strict mode | Full screen is mandatory. Leaving full screen, switching tab/window, split screen or losing focus locks that participant, alerts the admin and blocks Run/Submit until the admin unlocks them. One open console per participant (a newer tab supersedes an older one). Dev-tool shortcuts and the context menu are disabled. |
| Log out / re-login | Log out (and a fresh login with an existing ID) erases the participant's saved mappings, scores and submissions. After **Exit event** the final score is kept. |
| Capacity | Up to **50** participants (a team counts as one). The 51st registration is refused. |

---

## Question set

Questions live in `backend/data/missions.json` (each with a step-by-step `guide` shown by the Hint button) and their visible + hidden test cases in `backend/data/tests.json`. A question can set its own `credits`; otherwise the level default applies.

| Level | Question | Block flow |
|---|---|---|
| Easy | 1 Voting Eligibility Checker | Input → Compare (`>= 18`) → Output |
| Easy | 2 BMI Calculator | Input → Get ×2 → Square → Divide → Round (1 decimal) → Output |
| Easy | 3 Palindrome String Checker | Input → Reverse, Compare (`==`) → Output |
| Easy | 4 Fahrenheit to Celsius | Input → Convert → Output |
| Easy | 5 Average of Numbers | Input → Sum, Length → Divide → Output |
| Medium | 1 Binary Search Locator | Input → Midpoint → BinaryCompare → RepeatSearch → Output |
| Medium | 2 Leap Year Checker | Input → Div4Check → CenturyRule → Output |
| Medium | 3 Sorting a List (Bubble Sort) | Input → CompareSwap → PassRepeat → Output |
| Hard | 1 Monthly Expense Pie Chart | Input → TotalSum → Percentage → PieChart → Output |
| Hard | 2 Weekly Sales Bar Chart | Input → TargetCompare → BarChart → Output |

Chart blocks return the picture *and* the data they drew (`ChartResult.summary`); the checker compares that data, so a chart question is graded like any other. Reference pictures are in `frontend/public/assets/`. Division is ordered: the first connection into **Divide** is the dividend.

---

## Tech stack and structure

- **Frontend:** React 18 + Vite (JavaScript, no TypeScript) in `frontend/`.
- **Backend:** Flask (`backend/app.py`) with the execution engine in `backend/engine/` and modules in `backend/modules/`.
- **Storage:** Supabase (key/value table, see `supabase_setup.sql`) in production; an in-memory + JSON file store (`backend/data/local_kv_store.json`) when Supabase is not configured.
- **Deployment:** Vercel (`vercel.json`): the Vite build is served statically and Flask runs as a serverless function (`api/index.py`).

```
pyloom/
├─ backend/            Flask API, engine, modules, missions/tests data, storage (db.py)
├─ frontend/           React + Vite app
│  └─ src/
│     ├─ pages/        ParticipantPage, ParticipantConsole, AdminPage
│     ├─ components/   Canvas, nodes, panels, modals, registration, avatars ...
│     ├─ hooks/        useSharedTimer, useParticipantLock
│     ├─ lib/          api, storage, player, node definitions, theme
│     └─ styles/       style.css, canvas.css, app.css (responsive rules)
├─ avatar/             images offered as avatars at login
├─ legacy-frontend/    the previous plain HTML/JS version (reference only)
├─ api/index.py        Vercel entry point
├─ tests/              unit tests
└─ vercel.json
```

---

## Quick start (local)

### 1. Install dependencies
```powershell
pip install -r requirements.txt
cd frontend
npm install
```

### 2. Configure the admin login
The admin credentials are **not** in the code. Create a git-ignored `.env` file in the project root:
```
PYLOOM_ADMIN_USERNAME=your-admin-user
PYLOOM_ADMIN_PASSWORD=your-admin-password
PYLOOM_ADMIN_SESSION_SECRET=a-long-random-string
```
Without a username and password the admin sign-in is disabled.

### 3. Build the frontend and run
```powershell
cd frontend
npm run build          # outputs frontend/dist, which Flask serves
cd ..
py backend/app.py      # http://127.0.0.1:5000
```
- Participants: <http://127.0.0.1:5000>
- Admin: <http://127.0.0.1:5000/admin>

For live frontend development run `npm run dev` in `frontend/` (http://localhost:5173) while Flask runs on port 5000; `/api` and `/avatar` are proxied.

Use one browser (or an incognito window) per role so sessions do not mix.

### Environment variables

| Variable | Purpose |
|---|---|
| `PYLOOM_ADMIN_USERNAME` / `PYLOOM_ADMIN_PASSWORD` | admin sign-in |
| `PYLOOM_ADMIN_SESSION_SECRET` | signs admin sessions (set it on Vercel) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | shared state in production (leave unset locally to use the local store) |

---

## Running the event

1. **Admin:** sign in at `/admin`. Participants who log in appear under **Participant access** as pending.
2. **Participant:** open the app, choose **Team login** or **Solo login**, pick an avatar and submit. Wait for approval.
3. **Admin:** click **Activate**. The participant's page opens automatically. They read the instructions and rules, agree, and enter full screen.
4. **Admin:** click **Start both timers**. Pause/resume/restart the main or level timer as needed. Everyone sees the same clocks.
5. **Participants:** build a flow, **Run flow** to check the test evaluation, **Submit solution** to record the score. They press **Exit event** when finished and see their score out of 100.
6. **Admin:** watch live participants, violation alerts (use **Unlock** to let someone continue), the leaderboard and submissions. When the event is over use **Delete all users** to clear every participant and their progress.

Useful admin shortcuts: **Ctrl+R** unlocks every locked participant. **Reset questions** clears all progress and submissions but keeps the participants.

---

## API reference

### Participant
| Endpoint | Purpose |
|---|---|
| `POST /api/participant/register` | solo or team login (`mode`, `team_id`, `player_name`, `members`, `college`, `year_of_study`, `avatar`, `login`) |
| `GET /api/participant/status/<id>` | `pending` / `active` / `removed` (polled while waiting for approval) |
| `POST /api/participant/heartbeat` | presence, one-session rule, violation/lock state |
| `POST /api/participant/lock-violation` | report a full-screen/tab violation |
| `POST /api/participant/leave` · `/exit` · `/logout` | log out (erases saved data) · exit the event (keeps the score) · page closed (marks offline) |
| `GET /api/participant/score/<id>` | final score summary (total, per level, rank) |
| `GET /api/missions` · `/api/mission/<id>` | questions |
| `POST /api/run-flow` | evaluate a mapping (records nothing) |
| `POST /api/submit` | record progress and score |
| `POST /api/save-flow` · `GET /api/progress/<id>` | autosave and restore mappings |
| `GET /api/timer/state` · `POST /api/timer/level` | shared timers |
| `GET /api/avatars` · `GET /avatar/<file>` | avatar list and images |

### Admin (`/api/admin/*`, requires the admin session)
| Endpoint | Purpose |
|---|---|
| `POST /login` · `GET /session` · `POST /logout` | admin session |
| `GET /live` | everything the dashboard polls (participants, leaderboard, submissions, violations, timer) |
| `POST /timer/control` | `{"timer": "main"\|"level"\|"both", "action": "start"\|"pause"\|"resume"\|"restart"}` |
| `POST /participants/<id>/allow` · `/revoke` | activate / deactivate |
| `POST /participants/<id>/fullscreen` | unlock a participant's session |
| `POST /participant-control` | `{"action": "release"}` unlocks everyone |
| `DELETE /participants/<id>` | delete one participant and all their data |
| `POST /delete-all-users` | end of event: delete every participant and progress |
| `POST /reset-questions` | clear all progress and submissions |
| `PUT /participants/<id>` · `PUT /progress/<id>/<mission>` | edit details / override a mapping |
| `GET /leaderboard` · `/submissions` · `/summary` | reports |

---

## Deployment (Vercel)

```powershell
vercel --prod
```
Set `PYLOOM_ADMIN_USERNAME`, `PYLOOM_ADMIN_PASSWORD`, `PYLOOM_ADMIN_SESSION_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as environment variables (`vercel env add`). The build runs `npm run build` in `frontend/` and publishes `frontend/dist`; the `avatar/` folder is bundled into the function.

---

## Tests
```powershell
python -m unittest discover tests
```
