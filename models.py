from datetime import date, datetime
from enum import Enum
DEFAULT_POINTS_MAP = {1: 10, 2: 6, 3: 2, 4: 0, 5: 0, 6: 0}  # 5€ / 3€ / 1€ / 0 / 0 / 0 at default 0.50€/pt
DEFAULT_MONEY_PER_POINT = 0.50                              # default
REWARD_MODE_MONEY  = "money"
REWARD_MODE_UNIT   = "unit"
REWARD_MODE_POINTS = "points"

class Grade:
    def __init__(self, value: float, weight: float = 1.0, labels: list[str] | None = None):
        self.value = value
        self.weight = weight
        self.labels = labels if labels is not None else []

    def is_valid(self) -> bool:
        return 1.0 <= self.value <= 6.0 and self.weight > 0.0

    def to_dict(self) -> dict:
        """Serialize Grade to a JSON-compatible dict."""
        return {"value": self.value, "weight": self.weight, "labels": self.labels}

    @classmethod
    def from_dict(cls, data: dict) -> "Grade":
        """Deserialize a Grade from a dict."""
        return cls(data["value"], data["weight"], data["labels"])


class Subject:
    def __init__(self, name: str):
        self.name = name
        self.grades: list[Grade] = []

    def add_grade(self, grade: Grade) -> None:
        self.grades.append(grade)

    def remove_grade(self, index: int) -> None:
        self.grades.pop(index)

    def average(self) -> float:
        """Weighted average of all grades in a subject."""
        if not self.grades:
            return 0.0
        return sum(g.value * g.weight for g in self.grades) / sum(g.weight for g in self.grades)

    def average_by_label(self, labels: list[str], mode: str) -> float:
        """Weighted average of grades by filter."""
        if mode == "and":
            filtered = [g for g in self.grades if all(t in g.labels for t in labels)]
        if mode == "or":
            filtered = [g for g in self.grades if any(t in g.labels for t in labels)]
        if not filtered:
            return 0.0
        return sum(g.value * g.weight for g in filtered) / sum(g.weight for g in filtered)

    def to_dict(self) -> dict:
        return{"name": self.name, "grades": [g.to_dict() for g in self.grades]}

    @classmethod
    def from_dict(cls, data: dict) -> "Subject":
        subject = cls(data["name"])
        subject.grades = [Grade.from_dict(g) for g in data["grades"]]
        return subject


class Wallet:
    def __init__(self, balance: float, redemptions: list[dict], grade_log: list[dict] = None):
        self.balance = balance          # earned but not yet redeemed money
        self.redemptions = redemptions  # list of dicts with "description" and "cost" for each redemption
        self.grade_log = grade_log if grade_log is not None else []

    def redeem(self, cost: float, description: str = "<keine Beschreibung>") -> None:
        """
            Subtract cost from balance and log the redemption.
        """
        self.balance -= cost
        self.redemptions.append({
            "description": description,
            "cost": cost,
            "date": datetime.now().strftime("%d.%m.%Y %H:%M")   # e.g. "11.04.2026 14:30"
        })

    def log_grade_event(self, action: str, subject: str, value: float, weight: float, labels: list[str], value_delta: float = None) -> None:
        """Log a grade add/edit/delete event. action: '+', '-', '~'"""
        self.grade_log.append({
            "action": action,
            "subject": subject,
            "value": value,
            "weight": weight,
            "labels": labels,
            "value_delta": value_delta,   # None if rewards disabled
            "date": datetime.now().strftime("%d.%m.%Y %H:%M")
        })

    def to_dict(self) -> dict:
        return {
            "balance": self.balance,
            "redemptions": self.redemptions,
            "grade_log": self.grade_log,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Wallet":
        return cls(
            balance=data["balance"],
            redemptions=data["redemptions"],
            grade_log=data.get("grade_log", [])  # backwards-compatible
        )


class RewardConfig:
    def __init__(
        self,
        enabled: bool = False,
        points_map: dict[int, int] = None,
        money_per_point: float = DEFAULT_MONEY_PER_POINT,
        reward_mode: str = REWARD_MODE_MONEY,  # "money" | "unit" | "points"
        unit_name: str = "",                   # e.g. "Sammelkarten"; only for "unit" mode
        unit_per_point: float = 1.0,           # units per point; only for "unit" mode
    ):
        self.enabled = enabled
        self.points_map = points_map if points_map is not None else DEFAULT_POINTS_MAP.copy()
        self.money_per_point = money_per_point
        self.reward_mode = reward_mode
        self.unit_name = unit_name
        self.unit_per_point = unit_per_point

    def points_for_grade(self, value: float) -> int:
        """Return points for a grade value. Rounds to nearest integer key."""
        return self.points_map.get(round(value), 0)

    def money_for_points(self, points: int) -> float:
        """Convert points to monetary value."""
        return points * self.money_per_point
    
    def units_for_points(self, points: int) -> float:
        """Convert points to the configured reward value."""
        if self.reward_mode == REWARD_MODE_MONEY:
            return self.money_for_points(points)
        if self.reward_mode == REWARD_MODE_UNIT:
            return points * self.unit_per_point
        return float(points)  # points-only: 1:1

    def format_value(self, value: float) -> str:
        """Format a reward value with its unit label."""
        if self.reward_mode == REWARD_MODE_MONEY:
            return f"{value:.2f} €"
        if self.reward_mode == REWARD_MODE_UNIT:
            return f"{value:g} {self.unit_name}"
        return f"{int(value)} Pt."

    def mode_label(self) -> str:
        if self.reward_mode == REWARD_MODE_MONEY:
            return "Geld (€)"
        if self.reward_mode == REWARD_MODE_UNIT:
            return f"Eigene Einheit ({self.unit_name}, {self.unit_per_point:g}/Pt.)"
        return "Nur Punkte"

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "points_map": {int(k): v for k, v in self.points_map.items()},
            "money_per_point": self.money_per_point,
            "reward_mode": self.reward_mode,
            "unit_name": self.unit_name,
            "unit_per_point": self.unit_per_point,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "RewardConfig":
        return cls(
            enabled=data.get("enabled", False),
            points_map={int(k): v for k, v in data["points_map"].items()},
            money_per_point=data["money_per_point"],
            reward_mode=data.get("reward_mode", REWARD_MODE_MONEY),  # backwards-compatible
            unit_name=data.get("unit_name", ""),
            unit_per_point=data.get("unit_per_point", 1.0),
        )


class AppConfig:
    def __init__(
        self,
        app_config_path: str = "data/app_config.json",
        data_path: str = "data/grades.json",
        wallet_path: str = "data/wallet.json",
        reward_config_path: str = "data/reward_config.json",
        tasks_path: str = "data/tasks.json",
        verbose_loading: bool = True   # True = "Noten geladen: ...", False = nur Warnungen
    ):
        self.app_config_path = app_config_path
        self.data_path = data_path
        self.wallet_path = wallet_path
        self.reward_config_path = reward_config_path
        self.tasks_path = tasks_path
        self.verbose_loading = verbose_loading

    def to_dict(self) -> dict:
        return {
            "app_config_path": self.app_config_path,
            "data_path": self.data_path,
            "wallet_path": self.wallet_path,
            "reward_config_path": self.reward_config_path,
            "tasks_path": self.tasks_path,
            "verbose_loading": self.verbose_loading
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AppConfig":
        return cls(
            app_config_path=data.get("app_config_path") or "data/app_config.json",
            data_path=data.get("data_path") or "data/grades.json",
            wallet_path=data.get("wallet_path") or "data/wallet.json",
            reward_config_path=data.get("reward_config_path") or "data/reward_config.json",
            tasks_path=data.get("tasks_path") or "data/tasks.json",
            verbose_loading=data.get("verbose_loading", True)
        )


class TaskTemplate:

    EPOCH = date(2000, 1, 3)  # Monday – anchor for week-number arithmetic
    def __init__(self, name: str, reward: float, period: str = "once",
                 active: bool = True, last_completed: str | None = None,
                 task_id: int | None = None,
                 interval: int = 1,
                 weekdays: list[int] | None = None,
                 month_day: int | None = None,
                 created_at: str | None = None):
        self.id = task_id
        self.name = name
        self.reward = reward
        self.period = period      # "once" | "daily" | "weekly" | "monthly"
        self.active = active
        self.last_completed = last_completed  # ISO date string or None
        self.interval = interval if interval else 1
        self.weekdays = weekdays if weekdays is not None else None
        self.month_day = month_day
        self.created_at = created_at or date.today().isoformat()

    @staticmethod
    def _week_number(d: date) -> int:
        return (d - TaskTemplate.EPOCH).days // 7

    def is_available(self) -> bool:
        from datetime import date, datetime, timedelta
        if not self.active:
            return False
        if self.period == "once":
            return self.last_completed is None

        today = date.today()

        # Day-of-week / day-of-month filter applies even for first availability
        if self.period == "weekly" and self.weekdays:
            if today.weekday() not in self.weekdays:
                return False
        if self.period == "monthly" and self.month_day:
            if today.day != self.month_day:
                return False

        if not self.last_completed:
            return True
        try:
            last = datetime.strptime(self.last_completed, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            return True

        interval = self.interval or 1

        if self.period == "daily":
            return last + timedelta(days=interval) <= today

        if self.period == "weekly":
            if self.weekdays:
                if last >= today:
                    return False
                if interval > 1:
                    return (self._week_number(today) - self._week_number(last)) % interval == 0
                return True
            else:
                if interval > 1:
                    return (self._week_number(today) - self._week_number(last)) >= interval
                return last.isocalendar()[1] != today.isocalendar()[1] or last.year != today.year

        if self.period == "monthly":
            if self.month_day:
                if last >= today:
                    return False
                if interval > 1:
                    months = (today.year - last.year) * 12 + (today.month - last.month)
                    return months >= interval
                return True
            else:
                if interval > 1:
                    months = (today.year - last.year) * 12 + (today.month - last.month)
                    return months >= interval
                return last.month != today.month or last.year != today.year

        return True

    def mark_completed(self) -> None:
        from datetime import date
        self.last_completed = date.today().isoformat()
        if self.period == "once":
            self.active = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "reward": self.reward,
            "period": self.period,
            "active": self.active,
            "last_completed": self.last_completed,
            "interval": self.interval,
            "weekdays": self.weekdays,
            "month_day": self.month_day,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TaskTemplate":
        return cls(
            task_id=data.get("id"),
            name=data["name"],
            reward=data["reward"],
            period=data.get("period", "once"),
            active=data.get("active", True),
            last_completed=data.get("last_completed"),
            interval=data.get("interval", 1),
            weekdays=data.get("weekdays"),
            month_day=data.get("month_day"),
            created_at=data.get("created_at"),
        )


class TaskCompletion:
    def __init__(self, task_id: int, task_name: str, reward: float,
                 completed_at: str | None = None, comp_id: int | None = None):
        self.id = comp_id
        self.task_id = task_id
        self.task_name = task_name
        self.reward = reward
        self.completed_at = completed_at or datetime.now().strftime("%d.%m.%Y %H:%M")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "task_name": self.task_name,
            "reward": self.reward,
            "completed_at": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TaskCompletion":
        return cls(
            comp_id=data.get("id"),
            task_id=data["task_id"],
            task_name=data["task_name"],
            reward=data["reward"],
            completed_at=data.get("completed_at"),
        )


class TasksData:
    """Container for task templates + completion history (persisted as one JSON file)."""
    def __init__(self, templates: list[TaskTemplate] | None = None,
                 completions: list[TaskCompletion] | None = None,
                 missed_log: list[dict] | None = None):
        self.templates = templates if templates is not None else []
        self.completions = completions if completions is not None else []
        self.missed_log = missed_log if missed_log is not None else []

    def next_template_id(self) -> int:
        if not self.templates:
            return 1
        return max(t.id or 0 for t in self.templates) + 1

    def next_completion_id(self) -> int:
        if not self.completions:
            return 1
        return max(c.id or 0 for c in self.completions) + 1

    def to_dict(self) -> dict:
        return {
            "templates": [t.to_dict() for t in self.templates],
            "completions": [c.to_dict() for c in self.completions],
            "missed_log": self.missed_log,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TasksData":
        return cls(
            templates=[TaskTemplate.from_dict(t) for t in data.get("templates", [])],
            completions=[TaskCompletion.from_dict(c) for c in data.get("completions", [])],
            missed_log=data.get("missed_log", []),
        )


class LoadStatus(Enum):
    OK = "ok"
    MISSING = "missing"
    CORRUPT = "corrupt"
