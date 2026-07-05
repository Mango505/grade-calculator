# AGENTS.md

Instructions for AI agents working on this repository.

---

## Project Overview

**grade-calculator** is a self-hosted Flask web app for tracking school grades (Bavarian 1–6 system) with an optional reward system. The web interface (`main` branch) is a Material Design 3 SPA backed by a Flask JSON API. The original CLI (`cli` branch) shares the same data layer.

**Multi-User:** Each user's data lives in `data/users/<name>/`. On first start (no users exist), the app shows a user-creation dialog. Existing data from the old `Config.*_PATH` locations can be imported during user creation via `POST /api/users {name, import_files: ["grades", "wallet", ...]}`. The old `.env` path overrides (`GRADES_PATH`, `WALLET_PATH`) are only used for this import feature.

**Import with custom paths:** When creating a user, the dialog shows a text field per importable file pre-filled with the default path (from `.env` or fallback). You can override any path before confirming. The frontend sends `custom_paths: {grades: "/custom/path.json"}` to `POST /api/users`. `GET /api/import-sources` returns all available files with their paths and existence status.

---

## Repository Layout

```
grades-and-chores-manager/
├── app.py              # Flask entry point — all API routes (+ tasks)
├── config.py           # Absolute path resolution via env vars / .env
├── models.py           # Data models: Grade, Subject, Wallet, RewardConfig,
│                       #   AppConfig, TaskTemplate, TaskCompletion, TasksData
├── storage.py          # JSON load/save for all models (+ tasks)
├── requirements.txt    # flask, python-dotenv, gunicorn
├── _env                # .env template (copy to .env, never commit .env)
├── templates/
│   └── index.html      # SPA shell — mode switcher, dynamic nav
└── static/
    ├── css/app.css         # All styles — M3 CSS custom properties + mode switcher
    ├── manifest.json       # PWA manifest
    ├── sw.js               # Service worker
    └── js/
        ├── app.js          # Router, mode-switcher, user state (nt-user), exports: apiFetch,
        │                   #   showSnackbar, setPrimaryAction, clearPrimaryAction,
        │                   #   skeletonCard, skeletonGrid, navigateTo, getCurrentMode,
        │                   #   setTheme, getThemePreference, switchUser
        ├── components.js   # openDialog, card, statChip, gradeBadge, emptyState,
        │                   #   errorBanner, injectComponentStyles, validateAll, validators
        ├── tour.js         # Onboarding tour: checkTour(), startTour()
        └── pages/
            ├── overview.js
            ├── wallet.js   # Now includes Taschengeld-Buchungen section
            ├── stats.js
            ├── settings.js
            └── tasks.js    # Chore/allowance task management
```

---

## Strict Constraints

### Modify rarely
- `models.py` — shared with CLI (`cli` branch); only modify when strictly necessary and ensure backward compatibility
- `storage.py` — same reason
- `_env` — this is the committed template; `.env` is gitignored

### Branch rules
- `main` — web interface only
- `cli` — original CLI (`main.py`); `models.py` / `storage.py` originate here

---

## Python / Backend

- **Python 3.10+** required (uses union type hints `X | Y`)
- No additional dependencies beyond `requirements.txt`; do not add new packages without explicit instruction
- All routes live in `app.py`; use `_load_all()` / `_save_all()` for data access — never call storage functions directly in route handlers
- Return `jsonify(...)` for all API responses; use `abort(code, message)` for errors
- The `book_reward` boolean field on `POST /api/subjects/:name/grades` controls whether the grade credits the wallet; default `True`
- Path resolution: use `Config.*_PATH` constants — paths under `data/users/<username>/` are resolved via `Config.USER_DIR(name)`. Old `GRADES_PATH`/`WALLET_PATH` overrides in `.env` are only used for the import feature on user creation

## JavaScript / Frontend

### Module system
- Vanilla ES Modules, no bundler, no TypeScript, no framework
- All page modules export a single `default async function render(container)` — `app.js` calls this
- Import only from `"../app.js"` or `"../components.js"` (relative paths); never import from pages cross-page

### String construction
- **No nested template literals** — they caused a production outage. Use string concatenation (`+`) for any HTML that contains dynamic content inside `${}` expressions
- Template literals are fine for simple, flat strings with no nested backticks

### Buttons
- Use native `<button class="btn-text">`, `<button class="btn-tonal">`, or `<button class="btn-filled">` for any button that needs reliable padding/margin
- `md-filled-button`, `md-filled-tonal-button`, `md-text-button` from the M3 web components library have shadow-DOM styling that ignores external CSS margin rules — only use them where appearance is acceptable without margin control
- The three native button classes are defined in `app.css`

### CSS
- All design tokens are M3 CSS custom properties on `:root` (light) with dark overrides
- Do not use Tailwind, Bootstrap, or any utility framework
- `#subjectGrid` must keep `display:grid !important` — the `!important` overrides service worker cached styles in some browsers
- `.st-stats-wrapper` is a flex-column container that provides consistent `gap:16px` between the tall and short stats sections — do not add `margin-bottom` to `.st-grid-tall`

### Dialogs
- Always use `openDialog(headline, bodyHTML, confirmLabel?, danger?)` from `components.js`
- Never use `<md-dialog>` — it has centering issues
- Validation errors in dialog close handlers should show `showSnackbar(msg, "error")` — the dialog has already closed at that point, so `return` early prevents the API call but the snackbar gives user feedback

### Service Worker (`sw.js`)
- Cache name is `nr-shell-v3` / `nr-api-v3` — increment the version suffix when static assets change in a way that must invalidate existing caches
- Shell assets list must be updated if new JS page files are added

### User Switcher
- User state lives in `localStorage["nt-user"]` (set key in `USER_KEY`)
- `ensureUser()` runs during boot: if no user, calls `GET /api/users` — empty list shows a create dialog, otherwise shows a picker
- The user can create a new user at any time via the settings page
- Desktop: user switcher in `nav-drawer__footer`; Mobile: user icon in `top-app-bar__actions`
- `switchUser(name)` sets `currentUser`, updates localStorage, and re-renders the current page
- `apiFetch()` appends `?user=<currentUser>` to every API call — backend reads it from `request.args`

---

## API Contract

| Method | Path | Body / Query | Notes |
|--------|------|-------------|-------|
| GET | `/api/subjects` | — | Array of subject objects |
| POST | `/api/subjects` | `{name}` | 409 if duplicate |
| DELETE | `/api/subjects/:name` | — | 204 |
| PUT | `/api/subjects/reorder` | `{order:[]}` | |
| POST | `/api/subjects/:name/grades` | `{value,weight?,labels?,book_reward?}` | 400 if value not 1–6 |
| PUT | `/api/subjects/:name/grades/:i` | `{value?,weight?,labels?}` | Partial update |
| DELETE | `/api/subjects/:name/grades/:i` | `?adjust_wallet=1` | Reverses wallet credit |
| GET | `/api/wallet` | — | Includes `formatted_balance` |
| POST | `/api/wallet/redeem` | `{cost,description?}` | 400 if rewards disabled |
| GET/POST | `/api/reward-config` | Full config object on POST | |
| GET | `/api/app-config` | — | Includes `resolved_data_dir` |
| PATCH | `/api/app-config` | `{verbose_loading?}` | Partial update |
| GET | `/api/overview` | — | Aggregated averages |
| GET | `/api/export` | — | Full data for TXT export |
| GET | `/api/backup` | — | ZIP download |
| POST | `/api/reset` | `{action}` | See actions below |
| GET | `/api/startup-status` | — | Load status of all 4 files |

| GET | `/api/users` | — | Array of user names found in data/users/ |
| POST | `/api/users` | `{name, import_files?, custom_paths?}` | Creates a new user dir; `custom_paths` overrides source paths per file key |
| GET | `/api/tasks` | — | Templates + completions, each template has `available` |
| POST | `/api/tasks` | `{name,reward,period?}` | period: once/daily/weekly/monthly |
| PUT | `/api/tasks/<id>` | Partial update | |
| DELETE | `/api/tasks/<id>` | — | 204, removes template + linked completions |
| POST | `/api/tasks/<id>/complete` | — | Credits wallet, logs completion |
| DELETE | `/api/tasks/complete/<id>` | — | Reverses wallet credit, restores template |

**Reset actions:** `grade_log`, `redemptions`, `balance`, `app_config`, `reward_config`, `task_log`, `tasks`

---

## Data Models (summary)

```python
Grade(value: float, weight: float, labels: list[str])
  # value must be 1.0–6.0, weight > 0

Subject(name: str)
  # .grades: list[Grade]
  # .average() → float (weighted)

Wallet(balance: float, redemptions: list[dict], grade_log: list[dict])
  # grade_log entry: {action, subject, value, weight, labels, value_delta, date}
  # action: "+" add | "-" delete | "~" edit

RewardConfig(enabled, points_map, money_per_point, reward_mode, unit_name, unit_per_point)
  # reward_mode: "money" | "unit" | "points"
  # points_map: {int grade → int points}

AppConfig(data_path, wallet_path, reward_config_path, backup_path, verbose_loading)

TaskTemplate(name, reward, period, active, last_completed, interval, weekdays, month_day)
  # period: "once" | "daily" | "weekly" | "monthly"
  # interval: int (default 1) – repeat every N periods
  # weekdays: list[int] | None (0=Mon..6=Sun) – for weekly tasks
  # month_day: int | None (1-31) – for monthly tasks
  # is_available() checks period/interval/weekdays/month_day against last_completed

TaskCompletion(task_id, task_name, reward, completed_at)
  # linked to task template; snapshot of task_name/reward at completion time

TasksData(templates, completions, missed_log)
  # container for task templates, completions, and auto-detected misses
```

---

## Coding Conventions

- **Python:** follow existing style (no type annotations in function bodies, docstrings on storage functions only)
- **JavaScript:** string concatenation for HTML; `async/await` everywhere; no `var`; use `const` / `let`
- **Error handling:** all `apiFetch` calls must be wrapped in `try/catch`; show `showSnackbar(e.message, "error")` on failure
- **Comments in English**, UI strings in German (app is German-language)
- Version number lives only in `README.md` badge — nowhere else

---

## Common Pitfalls

1. **Nested template literals** — caused the entire app to stop loading (exports not found). Always use string concatenation for HTML with dynamic inner content.
2. **`md-*` button margins** — the M3 web components ignore `margin` from stylesheets due to shadow DOM. Use `.btn-text`, `.btn-tonal`, `.btn-filled` native button classes instead.
3. **`filter-mode-row` CSS** — the `#filterModeRow` div must have `class="filter-mode-row"` for the CSS `gap` to apply. Missing the class means the chips and radios clump together.
4. **`_load_all()` on every request** — this is intentional; there is no in-memory state between requests. Do not cache loaded data across requests. `_load_all()` reads `request.args["user"]` to resolve paths.
5. **`navigateTo` export** — `app.js` exports `navigateTo`; `tour.js` imports it dynamically (`import("/static/js/app.js")`) to avoid circular dependencies.
6. **First-start dialog** — `ensureUser()` calls `fetch("/api/users")` directly (not `apiFetch`) because there's no user yet. If the user dismisses the create dialog, the app stays on the loading skeleton — the dialog is blocking (they must create or pick a user).
7. **Service worker cache** — when making JS changes, bump the cache version suffix in `sw.js`. Users must hard-refresh (Ctrl+Shift+R) or close all tabs to get the new SW.
