"""
config.py – Central config. All paths are resolved absolute so the app works
regardless of which directory you launch it from.

Override any value via .env or real environment variables:
    DATA_DIR=./path/to/existing/data  python app.py
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Directory where app.py lives
_BASE = os.path.dirname(os.path.abspath(__file__))


def _abs(env_key: str, *default_parts: str) -> str:
    """
    Return the value of env_key if set, otherwise join default_parts
    relative to _BASE and return the absolute path.
    """
    raw = os.getenv(env_key)
    if raw:
        # User-supplied path: resolve relative to CWD, not _BASE
        return os.path.abspath(os.path.expanduser(raw))  # expand ~ before resolving
    return os.path.join(_BASE, *default_parts)


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-prod")
    DEBUG      = os.getenv("FLASK_DEBUG", "1") == "1"
    PORT       = int(os.getenv("PORT", "5000"))
    HOST       = os.getenv("HOST", "127.0.0.1")
    DATA_DIR   = _abs("DATA_DIR", "data")
