# grades-and-chores-manager

![Version](https://img.shields.io/badge/version-v3.2.1-brightgreen)
![Python](https://img.shields.io/badge/python-3.10+-blue)
![Flask](https://img.shields.io/badge/flask-3.0+-lightgrey)
![Status](https://img.shields.io/badge/status-web%20interface-blue)

A combined **Notenrechner + Taschengeld-Manager** — track school grades (Bavarian 1–6) and household chores in one place, with a shared reward wallet.

Two modes (switcher in the header):  
- **Notenrechner** — grades, weighted averages, statistics  
- **Taschengeld** — task/chore management with daily/weekly/monthly recurring tasks

Both feed into the same wallet for a unified reward system.

> **v3.0.0** adds the Taschengeld (chores) system with a mode switcher. The original grade calculator is preserved as the "Notenrechner" mode.

> **v2.0.0** replaces the CLI with a full web interface. The original CLI (`main.py`) is preserved on the `cli` branch.

---

## Table of Contents 📄

- [Introduction](#introduction)
- [Features](#features)
- [Technologies](#technologies)
- [Setup](#setup)
- [Running](#running)
- [Mobile & PWA](#mobile--pwa)
- [Architecture](#architecture)
- [Data Files](#data-files)
- [Backup & Reset](#backup--reset)
- [CLI Legacy](#cli-legacy)
- [License](#license)

---

## Introduction 🚀

**grades-and-chores-manager** is a self-hosted web application combining grade tracking (Notenrechner) with a chore-based allowance system (Taschengeld). Grades and chores both feed into a shared reward wallet, giving you a single place to manage school performance and household tasks.

Everything is stored locally in JSON files on the server. The web interface is a Material Design 3 SPA accessible from any browser on the same network, and is installable as a PWA on mobile.

---

## Features ✨

### Grades & Subjects
- Add, edit, and delete grades per subject with weighted averages
- **Labels** — tag grades (e.g. `Schulaufgabe`, `Abfrage`) for filtering
- **Chip-based multi-label filter** with AND / OR logic across all subjects
- Subject reordering, rename, and bulk delete

### Reward System
- Three reward modes: **Money (€)**, **Custom unit** (e.g. trading cards), **Points only**
- Configurable points per grade value (defaults: `1→10 pts`, `2→6 pts`, `3→2 pts`, `4–6→0`)
- Per-grade **"Belohnung buchen"** toggle — optionally skip wallet credit when adding a grade
- Wallet with running balance, redemption log, and full grade change history
- Grade change log visible even when rewards are disabled

### Statistics
- Overall and per-subject averages, best/worst subject and grade
- **Fächer & Trends** — per-subject trend direction (↑ →↓) via linear regression
- **Notenverlauf** — individual grade history + running average, rendered as inline SVG
- **Guthaben-Verlauf** — cumulative earned reward over time (when rewards enabled)
- Grade distribution bar chart, top labels, two-export comparison

### Export
- TXT export with custom label, timestamped `YYYYMMDD_HHMM`
- Configurable sections: statistics, grades per subject, grade log, redemptions
- Import two exports for side-by-side comparison (averages + subject deltas)

### Chores & Allowance
- **Two-mode switcher** — toggle between "Notenrechner" (grades) and "Taschengeld" (chores) from the header; each mode has its own navigation and pages
- **Task templates** — create recurring tasks with a name, reward amount, and period (once / daily / weekly / monthly)
- **Custom intervals** — for daily/weekly/monthly tasks you can set an interval (e.g. every 3 days, every 2 weeks); weekly tasks support day-of-week selection (Mon–Sun), monthly tasks support day-of-month selection (1–31)
- **Availability logic** — tasks show as available based on their period, interval, and last_completed timestamp; daily tasks reset after N days, weekly tasks follow on/off week cycles, monthly tasks activate on the selected day
- **One-click completion** — completing a task credits the shared wallet immediately and logs the completion
- **Undo completion** — reverses the wallet credit and makes the task available again, restoring `last_completed` and `active` state
- **Completion history** — wallet page shows a "Taschengeld-Buchungen" section with all completed tasks and an undo button
- **Shared wallet** — grades and chores both feed into the same balance, enabling combined reward scenarios (e.g. pocket money for chores + bonus for good grades)

### App
- Responsive Material Design 3 UI — nav drawer on desktop, bottom nav + FAB on mobile
- Dark / light mode toggle (system preference + manual override in settings)
- **Multi-User** — each user has isolated data files under `data/users/<name>/`; switch via dropdown in nav drawer or mobile top bar
- 8-step onboarding tour on first launch, re-triggerable from settings
- Verbose loading toggle, startup file status check
- Backup as ZIP download

---

## Technologies 🛠️

| Layer       | Stack                                                        |
|-------------|--------------------------------------------------------------|
| Backend     | Python 3.10+, Flask 3, python-dotenv, Gunicorn (production)  |
| Frontend    | Vanilla ES Modules, no build step                            |
| UI          | Material Design 3 Web Components (`@material/web` via CDN)   |
| Styling     | CSS Custom Properties (M3 tokens), no framework              |
| Storage     | Local JSON files                                             |

---

## Setup ⚙️

```bash
git clone https://github.com/Mango505/grades-and-chores-manager.git
cd grades-and-chores-manager
pip install -r requirements.txt
```

Copy and edit the environment file:

```bash
cp _env .env
```

Key `.env` settings:

```ini
HOST=127.0.0.1      # use 0.0.0.0 to expose on your network (e.g. for mobile access)
PORT=5000
FLASK_DEBUG=1       # set to 0 in production

# Import source paths – only used when creating a new user and importing
# existing data. Can also be overridden per-file in the dialog.
#GRADES_PATH=~/grades.json
#WALLET_PATH=~/wallet.json
```

> **Note:** Always use `python app.py` to start the server — not `flask run`. The app reads `HOST` and `PORT` from `.env` via `python-dotenv`; `flask run` uses different variable names and will ignore them.

---

## Running 🚀

### Development

```bash
python app.py
# → http://localhost:5000
```

### Production (Raspberry Pi / home server)

```bash
gunicorn "app:app" --bind 0.0.0.0:5000 --workers 2
```

To keep it running permanently, use `systemd` or `screen`:

```bash
# Quick option with screen:
screen -S notenrechner
python app.py
# Ctrl+A, D to detach
```

---

## Mobile & PWA 📱

The app is installable as a Progressive Web App — it behaves like a native app with no browser chrome.

**Setup:**

1. Set `HOST=0.0.0.0` in `.env` and restart the server.
2. Find your computer's/Pi's local IP address:
   ```bash
   # macOS / Linux:
   hostname -I
   # Windows:
   ipconfig   # → IPv4 address under the Wi-Fi adapter
   ```
3. Open `http://<local-ip>:5000` on your phone (must be on the same Wi-Fi).
4. Install to home screen:
   - **iOS Safari:** Share → "Zum Home-Bildschirm"
   - **Android Chrome:** Menu → "App installieren"

The service worker caches the app shell (JS, CSS, HTML) so the UI loads even when the server is unreachable. API data (grades, wallet) is served from the last cached response when offline — writes are not possible without the server.

---

## Architecture 🏗️

```
grades-and-chores-manager/
├── app.py              # Flask server, all API routes
├── config.py           # Path resolution, env vars
├── models.py           # Grade, Subject, Wallet, RewardConfig, AppConfig, TaskTemplate, TaskCompletion, TasksData
├── storage.py          # JSON load/save for all models
├── requirements.txt
├── .env                # Local config (not committed)
├── templates/
│   └── index.html      # SPA shell
└── static/
    ├── css/app.css
    ├── manifest.json   # PWA manifest
    ├── sw.js           # Service worker (cache-first shell, network-first API)
    └── js/
        ├── app.js          # Router, dark mode, FAB, snackbar, skeletons
        ├── components.js   # Dialog, cards, badges, validation helpers
        ├── tour.js         # Onboarding tour
        └── pages/
            ├── overview.js  # Subject grid + detail view (grade CRUD)
            ├── wallet.js    # Balance + logs
            ├── stats.js     # Charts, export, comparison
            ├── settings.js  # Reward config, paths, backup/reset
            └── tasks.js     # Tasks overview + completions
```

**API routes:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | SPA shell (index.html) |
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user (with optional import) |
| GET | `/api/subjects` | List all subjects |
| POST | `/api/subjects` | Create subject |
| DELETE | `/api/subjects/<name>` | Delete subject |
| PUT | `/api/subjects/reorder` | Reorder subjects |
| POST | `/api/subjects/<name>/grades` | Add grade |
| PUT | `/api/subjects/<name>/grades/<i>` | Edit grade |
| DELETE | `/api/subjects/<name>/grades/<i>` | Delete grade |
| GET | `/api/wallet` | Wallet balance + logs |
| POST | `/api/wallet/redeem` | Redeem balance |
| GET | `/api/reward-config` | Get reward config |
| POST | `/api/reward-config` | Save reward config |
| GET | `/api/overview` | Aggregated grade overview |
| GET | `/api/export` | TXT export of all data |
| GET | `/api/app-config` | Get app config |
| PATCH | `/api/app-config` | Update app config |
| GET | `/api/backup` | Download ZIP backup |
| GET | `/api/startup-status` | Load status of all files |
| POST | `/api/reset` | Reset logs / config |
| GET | `/api/tasks` | List task templates + completions |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/<id>` | Update task |
| DELETE | `/api/tasks/<id>` | Delete task |
| POST | `/api/tasks/<id>/complete` | Complete task |
| DELETE | `/api/tasks/complete/<id>` | Undo completion |

---

## Data Files 💾

All data is stored as human-readable JSON, isolated per user under `data/users/<username>/`:

| File                      | Contents                                             |
|---------------------------|------------------------------------------------------|
| `data/users/<name>/grades.json`        | All subjects and their grades (value, weight, labels)|
| `data/users/<name>/wallet.json`        | Balance, redemption log, grade change history        |
| `data/users/<name>/reward_config.json` | Points map, reward mode, rate, unit name             |
| `data/users/<name>/app_config.json`    | File paths, verbose loading flag                     |
| `data/users/<name>/tasks.json`         | Tasks, completion history                            |

Multi-user data directories are created automatically on first API call. Switch users via the dropdown in the nav drawer or mobile top bar.

> On the first start (no `data/users/` directory), the app shows a blocking dialog to create a user. Existing data from old CLI files can be imported during this step.

Paths from `.env` (`GRADES_PATH`, `WALLET_PATH`) are only used for this **import-on-creation** feature — they are not used for regular operation. You can also type a custom path directly in the dialog.

---

## Backup & Reset 🔄

Both are accessible from **Settings → Backup & Reset**:

- **Backup** — downloads all five data files as a single ZIP (`noten_taschengeld_backup_YYYYMMDD_HHMMSS.zip`)

Before any reset action, the confirmation dialog recommends downloading a backup first.

Individual reset actions (each requires confirmation):

| Action                        | Effect                                    |
|-------------------------------|-------------------------------------------|
| Notenänderungen-Log leeren    | Clears grade change history               |
| Einlösungen-Log leeren        | Clears redemption log (balance unchanged) |
| Guthaben zurücksetzen         | Sets wallet balance to 0                  |
| Belohnungskonfiguration reset | Restores default points map and mode      |
| App-Konfiguration reset       | Restores default file paths               |
| Aufgaben-Log leeren           | Clears completion log (balance unchanged) |
| Aufgaben-Vorlagen reset       | Clears all task templates                 |

> ⚠️ Grade and subject deletion from the overview is permanent outside of a backup restore.

---

## CLI Legacy 🖥️

The original command-line interface is available on the `cli` branch:

```bash
git checkout cli
python main.py
```

The CLI and web app share the same data format — you can switch between them by pointing both at the same JSON files.

> **Note:** The CLI doesn't have a chores system and thus doesn't need a `tasks.json` file

---

## License ⚖️

This project is licensed under the terms of the **MIT** license.
See [LICENSE](https://github.com/Mango505/grades-and-chores-manager/blob/main/LICENSE) for details.
