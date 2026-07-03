"""
app.py – Flask entry point.
Data is stored per user under data/users/<name>/.
models.py and storage.py are shared with the CLI branch.
"""
import io
import json
import os
import re
import shutil
import zipfile
from collections import Counter
from datetime import datetime

from flask import Flask, jsonify, request, render_template, abort, send_file
from config import Config
from models import Grade, Subject, Wallet, RewardConfig, AppConfig, TasksData, TaskTemplate, TaskCompletion, LoadStatus
from storage import (
    load_app_config, save_app_config,
    load_subjects,   save_subjects,
    load_wallet,     save_wallet,
    load_reward_config, save_reward_config,
    load_tasks,      save_tasks,
)

app = Flask(__name__)
app.config.from_object(Config)


# Return JSON for HTTP errors on /api/* routes
@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(409)
@app.errorhandler(500)
def api_error_handler(e):
    return jsonify({"error": e.description or str(e)}), e.code


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_all(user=None):
    if user is None:
        user = request.args.get("user")
        if not user:
            abort(400, "user query parameter required")

    user_dir = os.path.join(Config.DATA_DIR, "users", user)
    os.makedirs(user_dir, exist_ok=True)

    def _upath(filename: str) -> str:
        return os.path.join(user_dir, filename)

    grades_path        = _upath("grades.json")
    wallet_path        = _upath("wallet.json")
    reward_config_path = _upath("reward_config.json")
    tasks_path         = _upath("tasks.json")
    app_config_path    = _upath("app_config.json")
    backup_path        = _upath("backups")

    app_config, status = load_app_config(app_config_path)
    if status != LoadStatus.OK:
        app_config = AppConfig(
            data_path=grades_path,
            wallet_path=wallet_path,
            reward_config_path=reward_config_path,
            tasks_path=tasks_path,
            backup_path=backup_path,
        )
    # Always use deterministic paths within user directory
    app_config.data_path          = grades_path
    app_config.wallet_path        = wallet_path
    app_config.reward_config_path = reward_config_path
    app_config.tasks_path         = tasks_path
    app_config.backup_path        = backup_path
    app_config.app_config_path    = app_config_path

    subjects,      _ = load_subjects(app_config.data_path)
    wallet,        _ = load_wallet(app_config.wallet_path)
    reward_config, _ = load_reward_config(app_config.reward_config_path)
    tasks,         _ = load_tasks(app_config.tasks_path)
    return app_config, subjects, wallet, reward_config, tasks


def _save_all(app_config, subjects, wallet, reward_config, tasks):
    save_app_config(app_config,       app_config.app_config_path)
    save_subjects(subjects,           app_config.data_path)
    save_wallet(wallet,               app_config.wallet_path)
    save_reward_config(reward_config, app_config.reward_config_path)
    save_tasks(tasks,                 app_config.tasks_path)


def _subject_index(subjects: list, name: str) -> int:
    for i, s in enumerate(subjects):
        if s.name == name:
            return i
    return -1


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# ---------------------------------------------------------------------------
# API – Subjects
# ---------------------------------------------------------------------------

@app.route("/api/subjects", methods=["GET"])
def get_subjects():
    _, subjects, _, _, _ = _load_all()
    return jsonify([s.to_dict() for s in subjects])


@app.route("/api/subjects", methods=["POST"])
def create_subject():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        abort(400, "name is required")
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    if any(s.name == name for s in subjects):
        abort(409, f"Subject '{name}' already exists")
    subjects.append(Subject(name))
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify({"name": name}), 201


@app.route("/api/subjects/<string:subject_name>", methods=["DELETE"])
def delete_subject(subject_name):
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    idx = _subject_index(subjects, subject_name)
    if idx == -1:
        abort(404, f"Subject '{subject_name}' not found")
    subjects.pop(idx)
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return "", 204


@app.route("/api/subjects/reorder", methods=["PUT"])
def reorder_subjects():
    data  = request.get_json(force=True)
    order = data.get("order", [])
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    name_map  = {s.name: s for s in subjects}
    reordered = [name_map[n] for n in order if n in name_map]
    remaining = [s for s in subjects if s.name not in set(order)]
    subjects  = reordered + remaining
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify([s.to_dict() for s in subjects])


# ---------------------------------------------------------------------------
# API – Grades
# ---------------------------------------------------------------------------

@app.route("/api/subjects/<string:subject_name>/grades", methods=["POST"])
def add_grade(subject_name):
    """
    Body: { "value": float, "weight"?: float, "labels"?: [str], "book_reward"?: bool }
    book_reward defaults to true. Set to false to skip wallet credit for this grade.
    """
    data = request.get_json(force=True)
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    idx = _subject_index(subjects, subject_name)
    if idx == -1:
        abort(404, f"Subject '{subject_name}' not found")
    try:
        value  = float(data["value"])
        weight = float(data.get("weight", 1.0))
        labels = data.get("labels", [])
    except (KeyError, TypeError, ValueError):
        abort(400, "value (float) required; weight (float) and labels ([str]) optional")

    grade = Grade(value, weight, labels)
    if not grade.is_valid():
        abort(400, "value must be 1–6 and weight > 0")

    # book_reward: whether to credit wallet for this grade (default True)
    book_reward = bool(data.get("book_reward", True))

    subjects[idx].add_grade(grade)

    earned = None
    if reward_config.enabled:
        pts = reward_config.points_for_grade(value)
        if pts:
            earned = reward_config.units_for_points(pts)
            if book_reward:
                wallet.balance += earned

    wallet.log_grade_event(
        "+", subject_name, value, weight, labels,
        value_delta=earned if book_reward else None
    )
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify(grade.to_dict()), 201


@app.route("/api/subjects/<string:subject_name>/grades/<int:grade_index>", methods=["PUT"])
def edit_grade(subject_name, grade_index):
    data = request.get_json(force=True)
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    idx = _subject_index(subjects, subject_name)
    if idx == -1:
        abort(404)
    subject = subjects[idx]
    if not (0 <= grade_index < len(subject.grades)):
        abort(404, f"Grade index {grade_index} out of range")

    old = subject.grades[grade_index]
    new_value  = float(data["value"])  if "value"  in data else old.value
    new_weight = float(data["weight"]) if "weight" in data else old.weight
    new_labels = data["labels"]        if "labels" in data else old.labels

    new_grade = Grade(new_value, new_weight, new_labels)
    if not new_grade.is_valid():
        abort(400, "value must be 1–6 and weight > 0")

    value_delta = None
    if reward_config.enabled:
        old_e = reward_config.units_for_points(reward_config.points_for_grade(old.value))
        new_e = reward_config.units_for_points(reward_config.points_for_grade(new_value))
        value_delta = new_e - old_e
        wallet.balance += value_delta

    subject.grades[grade_index] = new_grade
    wallet.log_grade_event("~", subject_name, new_value, new_weight, new_labels, value_delta=value_delta)
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify(new_grade.to_dict())


@app.route("/api/subjects/<string:subject_name>/grades/<int:grade_index>", methods=["DELETE"])
def delete_grade(subject_name, grade_index):
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    idx = _subject_index(subjects, subject_name)
    if idx == -1:
        abort(404)
    subject = subjects[idx]
    if not (0 <= grade_index < len(subject.grades)):
        abort(404)

    grade  = subject.grades[grade_index]
    adjust = request.args.get("adjust_wallet", "0") == "1"
    value_delta = None
    if reward_config.enabled and adjust:
        lost = reward_config.units_for_points(reward_config.points_for_grade(grade.value))
        wallet.balance -= lost
        value_delta = -lost

    wallet.log_grade_event("-", subject_name, grade.value, grade.weight, grade.labels, value_delta=value_delta)
    subject.remove_grade(grade_index)
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return "", 204


# ---------------------------------------------------------------------------
# API – Wallet
# ---------------------------------------------------------------------------

@app.route("/api/wallet", methods=["GET"])
def get_wallet():
    _, _, wallet, reward_config, _ = _load_all()
    return jsonify({
        **wallet.to_dict(),
        "formatted_balance": reward_config.format_value(wallet.balance) if reward_config.enabled else None,
    })


@app.route("/api/wallet/redeem", methods=["POST"])
def redeem():
    data = request.get_json(force=True)
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    if not reward_config.enabled:
        abort(400, "Reward system is disabled")
    try:
        cost = float(data["cost"])
    except (KeyError, TypeError, ValueError):
        abort(400, "cost (float) required")
    if cost <= 0:
        abort(400, "cost must be > 0")
    if cost > wallet.balance:
        abort(400, f"Insufficient balance: {wallet.balance:.2f}")
    wallet.redeem(cost, (data.get("description") or "<keine Beschreibung>").strip())
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify(wallet.to_dict())


# ---------------------------------------------------------------------------
# API – Reward config
# ---------------------------------------------------------------------------

@app.route("/api/reward-config", methods=["GET"])
def get_reward_config():
    _, _, _, reward_config, _ = _load_all()
    return jsonify(reward_config.to_dict())


@app.route("/api/reward-config", methods=["POST"])
def update_reward_config():
    data = request.get_json(force=True)
    app_config, subjects, wallet, _rc, _tasks = _load_all()
    try:
        new_config = RewardConfig.from_dict(data)
    except (KeyError, TypeError, ValueError) as e:
        abort(400, f"Invalid reward config: {e}")
    _save_all(app_config, subjects, wallet, new_config, _tasks)
    return jsonify(new_config.to_dict())


# ---------------------------------------------------------------------------
# API – Overview
# ---------------------------------------------------------------------------

@app.route("/api/overview", methods=["GET"])
def get_overview():
    _, subjects, _, _, _ = _load_all()
    total_value = total_weight = 0.0
    result = []
    for s in subjects:
        avg = s.average()
        result.append({"name": s.name, "average": round(avg, 4), "grade_count": len(s.grades)})
        for g in s.grades:
            total_value  += g.value  * g.weight
            total_weight += g.weight
    overall = round(total_value / total_weight, 4) if total_weight else None
    return jsonify({"subjects": result, "overall_average": overall})


# ---------------------------------------------------------------------------
# API – Export
# ---------------------------------------------------------------------------

@app.route("/api/export", methods=["GET"])
def get_export():
    _, subjects, wallet, reward_config, _tasks = _load_all()
    swg        = [s for s in subjects if s.grades]
    all_grades = [g for s in swg for g in s.grades]
    tw         = sum(g.weight for g in all_grades)
    overall    = sum(g.value * g.weight for g in all_grades) / tw if tw else None

    def savg(s):
        w = sum(g.weight for g in s.grades)
        return sum(g.value * g.weight for g in s.grades) / w if w else 0.0

    sorted_s    = sorted(swg, key=savg)
    best_g      = min(all_grades, key=lambda g: g.value, default=None)
    worst_g     = max(all_grades, key=lambda g: g.value, default=None)
    lc          = Counter(l for g in all_grades for l in g.labels if l)

    def gsub(target):
        return next((s.name for s in swg if any(
            g.value == target.value and g.weight == target.weight for g in s.grades)), "?")

    return jsonify({
        "overall_average": round(overall, 4) if overall is not None else None,
        "grade_count":     len(all_grades),
        "best_subject":    {"name": sorted_s[0].name,  "average": round(savg(sorted_s[0]),  2)} if sorted_s else None,
        "worst_subject":   {"name": sorted_s[-1].name, "average": round(savg(sorted_s[-1]), 2)} if sorted_s else None,
        "best_grade":      {**best_g.to_dict(),  "subject": gsub(best_g)}  if best_g  else None,
        "worst_grade":     {**worst_g.to_dict(), "subject": gsub(worst_g)} if worst_g else None,
        "top_labels":      [{"label": l, "count": n} for l, n in lc.most_common(3)],
        "subjects":        [s.to_dict() for s in subjects],
        "grade_log":       wallet.grade_log,
        "redemptions":     wallet.redemptions,
        "reward_config":   reward_config.to_dict(),
        "wallet_balance":  wallet.balance,
        "total_redeemed":  sum(r["cost"] for r in wallet.redemptions),
        "tasks":           _tasks.to_dict(),
    })


# ---------------------------------------------------------------------------
# API – App config
# ---------------------------------------------------------------------------

@app.route("/api/app-config", methods=["GET"])
def get_app_config():
    app_config, _, _, _, _ = _load_all()
    return jsonify({**app_config.to_dict(), "resolved_data_dir": Config.DATA_DIR})


# ---------------------------------------------------------------------------
# API – Backup download
# ---------------------------------------------------------------------------

@app.route("/api/backup", methods=["GET"])
def download_backup():
    app_config, _, _, _, _ = _load_all()
    files = {
        app_config.data_path:          "grades.json",
        app_config.wallet_path:        "wallet.json",
        app_config.reward_config_path: "reward_config.json",
        app_config.app_config_path:    "app_config.json",
        app_config.tasks_path:         "tasks.json",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for src, arc in files.items():
            if os.path.exists(src):
                zf.write(src, arc)
    buf.seek(0)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"noten_taschengeld_backup_{stamp}.zip")


# ---------------------------------------------------------------------------
# API – Startup status
# ---------------------------------------------------------------------------

@app.route("/api/startup-status", methods=["GET"])
def startup_status():
    from storage import (load_app_config as _lac, load_subjects as _ls,
                         load_wallet as _lw, load_reward_config as _lr,
                         load_tasks as _lt)

    user = request.args.get("user", "default")
    user_dir = os.path.join(Config.DATA_DIR, "users", user)

    def _upath(fn):
        return os.path.join(user_dir, fn)

    ap = _upath("app_config.json")
    dp = _upath("grades.json")
    wp = _upath("wallet.json")
    rp = _upath("reward_config.json")
    tp = _upath("tasks.json")

    _, ac_st = _lac(ap)
    _,  s_st = _ls(dp)
    _,  w_st = _lw(wp)
    _, rc_st = _lr(rp)
    _,  t_st = _lt(tp)

    return jsonify({"files": [
        {"name": "App-Konfiguration",       "path": ap, "status": ac_st.value},
        {"name": "Noten",                   "path": dp, "status":  s_st.value},
        {"name": "Wallet",                  "path": wp, "status":  w_st.value},
        {"name": "Belohnungskonfiguration", "path": rp, "status": rc_st.value},
        {"name": "Aufgaben",                "path": tp, "status":  t_st.value},
    ]})


# ---------------------------------------------------------------------------
# API – Reset
# ---------------------------------------------------------------------------

@app.route("/api/reset", methods=["POST"])
def reset_data():
    data   = request.get_json(force=True)
    action = data.get("action", "")
    app_config, subjects, wallet, reward_config, _tasks = _load_all()

    if action == "grade_log":
        wallet.grade_log = []
    elif action == "redemptions":
        wallet.redemptions = []
    elif action == "balance":
        wallet.balance = 0.0
    elif action == "app_config":
        app_config = AppConfig(
            data_path=app_config.data_path,
            wallet_path=app_config.wallet_path,
            reward_config_path=app_config.reward_config_path,
            backup_path=app_config.backup_path,
        )
    elif action == "reward_config":
        reward_config = RewardConfig()
    elif action == "task_log":
        _tasks.completions = []
    elif action == "tasks":
        _tasks.templates = []
        _tasks.completions = []
    else:
        abort(400, f"Unknown action: {action}")

    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify({"ok": True, "action": action})


# ---------------------------------------------------------------------------
# API – App config update
# ---------------------------------------------------------------------------

@app.route("/api/app-config", methods=["PATCH"])
def update_app_config():
    data = request.get_json(force=True)
    app_config, subjects, wallet, reward_config, _tasks = _load_all()
    if "verbose_loading" in data:
        app_config.verbose_loading = bool(data["verbose_loading"])
    _save_all(app_config, subjects, wallet, reward_config, _tasks)
    return jsonify(app_config.to_dict())


# ---------------------------------------------------------------------------
# API – Backup cleanup
# ---------------------------------------------------------------------------

@app.route("/api/backups/cleanup", methods=["POST"])
def cleanup_backups():
    import shutil
    app_config, _, _, _, _ = _load_all()
    backup_path = app_config.backup_path

    if not os.path.exists(backup_path):
        return jsonify({"message": "Kein Backup-Verzeichnis gefunden.", "deleted": 0})

    entries = sorted(
        [e for e in os.scandir(backup_path) if e.is_dir() and e.name.startswith("backup_")],
        key=lambda e: e.name
    )

    if len(entries) <= 1:
        return jsonify({"message": "Nur ein Backup vorhanden, nichts zu löschen.", "deleted": 0})

    to_delete = entries[:-1]
    failed, deleted = [], 0
    for e in to_delete:
        try:
            shutil.rmtree(e.path)
            deleted += 1
        except OSError:
            failed.append(e.name)

    msg = f"{deleted} altes Backup/Backups gelöscht."
    if failed:
        msg += f" Fehlgeschlagen: {', '.join(failed)}"
    return jsonify({"message": msg, "deleted": deleted, "failed": failed})


# ---------------------------------------------------------------------------
# API – Tasks / Taschengeld
# ---------------------------------------------------------------------------

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    _, _, _, _, tasks = _load_all()
    return jsonify({
        "templates": [{
            **t.to_dict(),
            "available": t.is_available(),
        } for t in tasks.templates],
        "completions": [c.to_dict() for c in tasks.completions],
        "missed_log": tasks.missed_log,
    })


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        abort(400, "name is required")
    try:
        reward = float(data["reward"])
    except (KeyError, TypeError, ValueError):
        abort(400, "reward (float) required")
    if reward <= 0:
        abort(400, "reward must be > 0")
    period = data.get("period", "once")
    if period not in ("once", "daily", "weekly", "monthly"):
        abort(400, "period must be once|daily|weekly|monthly")
    interval = data.get("interval", 1)
    if not isinstance(interval, int) or interval < 1:
        abort(400, "interval must be a positive integer")
    weekdays = data.get("weekdays")
    if weekdays is not None:
        if not isinstance(weekdays, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in weekdays):
            abort(400, "weekdays must be a list of ints 0-6")
    month_day = data.get("month_day")
    if month_day is not None and (not isinstance(month_day, int) or month_day < 1 or month_day > 31):
        abort(400, "month_day must be 1-31")
    app_config, subjects, wallet, reward_config, tasks = _load_all()
    t = TaskTemplate(name=name, reward=reward, period=period,
                     interval=interval, weekdays=weekdays, month_day=month_day,
                     task_id=tasks.next_template_id())
    tasks.templates.append(t)
    _save_all(app_config, subjects, wallet, reward_config, tasks)
    return jsonify(t.to_dict()), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json(force=True)
    app_config, subjects, wallet, reward_config, tasks = _load_all()
    idx = next((i for i, t in enumerate(tasks.templates) if t.id == task_id), -1)
    if idx == -1:
        abort(404, "Task not found")
    t = tasks.templates[idx]
    if "name" in data:
        t.name = (data["name"] or "").strip()
        if not t.name:
            abort(400, "name must not be empty")
    if "reward" in data:
        try:
            t.reward = float(data["reward"])
        except (TypeError, ValueError):
            abort(400, "reward must be a number")
        if t.reward <= 0:
            abort(400, "reward must be > 0")
    if "period" in data:
        if data["period"] not in ("once", "daily", "weekly", "monthly"):
            abort(400, "period must be once|daily|weekly|monthly")
        t.period = data["period"]
    if "interval" in data:
        val = data["interval"]
        if not isinstance(val, int) or val < 1:
            abort(400, "interval must be a positive integer")
        t.interval = val
    if "weekdays" in data:
        val = data["weekdays"]
        if val is not None and (not isinstance(val, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in val)):
            abort(400, "weekdays must be a list of ints 0-6 or null")
        t.weekdays = val
    if "month_day" in data:
        val = data["month_day"]
        if val is not None and (not isinstance(val, int) or val < 1 or val > 31):
            abort(400, "month_day must be 1-31 or null")
        t.month_day = val
    if "active" in data:
        t.active = bool(data["active"])
    _save_all(app_config, subjects, wallet, reward_config, tasks)
    return jsonify(t.to_dict())


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    app_config, subjects, wallet, reward_config, tasks = _load_all()
    idx = next((i for i, t in enumerate(tasks.templates) if t.id == task_id), -1)
    if idx == -1:
        abort(404, "Task not found")
    tasks.templates.pop(idx)
    tasks.completions = [c for c in tasks.completions if c.task_id != task_id]
    _save_all(app_config, subjects, wallet, reward_config, tasks)
    return "", 204


@app.route("/api/tasks/<int:task_id>/complete", methods=["POST"])
def complete_task(task_id):
    from datetime import date, datetime, timedelta
    app_config, subjects, wallet, reward_config, tasks = _load_all()
    idx = next((i for i, t in enumerate(tasks.templates) if t.id == task_id), -1)
    if idx == -1:
        abort(404, "Task not found")
    t = tasks.templates[idx]
    if not t.is_available():
        abort(400, "Task is not available (already completed this period)")

    old_last = t.last_completed
    t.mark_completed()
    comp = TaskCompletion(
        task_id=t.id, task_name=t.name, reward=t.reward,
        comp_id=tasks.next_completion_id(),
    )
    tasks.completions.append(comp)
    wallet.balance += t.reward

    # Detect missed scheduled days since last completion (or creation)
    old_ref = old_last or t.created_at
    if old_ref and t.period != "once":
        try:
            old_date = datetime.strptime(old_ref, "%Y-%m-%d").date()
            new_date = date.today()
            # Include creation day when no completion yet (it could have been missed)
            start = old_date if old_ref == t.created_at else old_date + timedelta(days=1)
            d = start
            while d < new_date:
                if _is_scheduled_day(t, d):
                    tasks.missed_log.append({
                        "task_name": t.name,
                        "scheduled_date": d.isoformat(),
                        "detected_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
                    })
                d += timedelta(days=1)
        except (ValueError, TypeError):
            pass

    _save_all(app_config, subjects, wallet, reward_config, tasks)
    return jsonify(comp.to_dict()), 201


def _is_scheduled_day(t, d):
    """Check if date d is a scheduled day for task template t."""
    from datetime import date
    if t.period == "daily":
        return True
    if t.period == "weekly" and t.weekdays:
        return d.weekday() in t.weekdays
    if t.period == "monthly" and t.month_day:
        return d.day == t.month_day
    return False


@app.route("/api/tasks/complete/<int:comp_id>", methods=["DELETE"])
def undo_task_completion(comp_id):
    app_config, subjects, wallet, reward_config, tasks = _load_all()
    idx = next((i for i, c in enumerate(tasks.completions) if c.id == comp_id), -1)
    if idx == -1:
        abort(404, "Completion not found")
    comp = tasks.completions[idx]

    # Restore template to available state
    t = next((t for t in tasks.templates if t.id == comp.task_id), None)
    if t:
        t.last_completed = None
        t.active = True

    wallet.balance -= comp.reward
    tasks.completions.pop(idx)
    _save_all(app_config, subjects, wallet, reward_config, tasks)
    return "", 204


# ---------------------------------------------------------------------------
# API – Multi-User
# ---------------------------------------------------------------------------

@app.route("/api/users", methods=["GET"])
def list_users():
    users_dir = os.path.join(Config.DATA_DIR, "users")
    if not os.path.exists(users_dir):
        return jsonify([])
    users = sorted([
        d.name for d in os.scandir(users_dir)
        if d.is_dir() and not d.name.startswith(".")
    ])
    return jsonify(users)


@app.route("/api/import-sources", methods=["GET"])
def import_sources():
    result = {}
    for key, (dst_name, src) in _IMPORTABLE_FILES.items():
        result[key] = {
            "filename": dst_name,
            "path": src,
            "exists": os.path.exists(src),
        }
    return jsonify(result)


_IMPORTABLE_FILES = {
    "grades":        ("grades.json",        Config.GRADES_PATH),
    "wallet":        ("wallet.json",        Config.WALLET_PATH),
    "reward_config": ("reward_config.json", Config.REWARD_CONFIG_PATH),
    "tasks":         ("tasks.json",         Config.TASKS_PATH),
    "app_config":    ("app_config.json",    os.path.join(Config.DATA_DIR, "app_config.json")),
}


@app.route("/api/users", methods=["POST"])
def create_user():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name or not re.match(r"^[a-zA-Z0-9_\u00e4\u00f6\u00fc\u00df -]+$", name):
        abort(400, "Ung\u00fcltiger Benutzername (Buchstaben, Zahlen, _, -, Leerzeichen)")
    user_dir = os.path.join(Config.DATA_DIR, "users", name)
    if os.path.exists(user_dir):
        abort(409, "Benutzer '" + name + "' existiert bereits")
    os.makedirs(user_dir)

    import_files = data.get("import_files") or []
    custom_paths = data.get("custom_paths") or {}
    imported = []
    for key in import_files:
        if key not in _IMPORTABLE_FILES:
            continue
        dst_name, src = _IMPORTABLE_FILES[key]
        src = custom_paths.get(key, src)
        src = os.path.abspath(os.path.expanduser(src))
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(user_dir, dst_name))
            imported.append(key)

    # Create default config files for any not imported
    for key, (dst_name, _) in _IMPORTABLE_FILES.items():
        if key in imported:
            continue
        fp = os.path.join(user_dir, dst_name)
        if not os.path.exists(fp):
            default = {}
            if dst_name == "reward_config.json":
                default = RewardConfig().to_dict()
            elif dst_name == "tasks.json":
                default = TasksData().to_dict()
            elif dst_name == "app_config.json":
                default = AppConfig().to_dict()
            with open(fp, "w") as f:
                json.dump(default, f)

    return jsonify({"name": name, "imported": imported}), 201


@app.route("/api/users/<name>", methods=["DELETE"])
def delete_user(name):
    user_dir = os.path.join(Config.DATA_DIR, "users", name)
    if not os.path.exists(user_dir):
        abort(404, "Benutzer '" + name + "' nicht gefunden")
    shutil.rmtree(user_dir)
    return "", 204


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
