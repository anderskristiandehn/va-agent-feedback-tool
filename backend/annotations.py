import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ANNOTATIONS_FILE = Path(__file__).parent / "annotations.json"

VALID_STATUSES = {"unreviewed", "noted", "actionable", "dismissed"}


def _read() -> dict:
    if not ANNOTATIONS_FILE.exists():
        return {"sessions": {}, "messages": {}}
    try:
        with open(ANNOTATIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"sessions": {}, "messages": {}}


def _write(data: dict) -> None:
    dir_ = ANNOTATIONS_FILE.parent
    fd, tmp_path = tempfile.mkstemp(dir=str(dir_), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, str(ANNOTATIONS_FILE))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def get_all() -> dict:
    return _read()


def upsert_session(session_id: str, text: str) -> None:
    data = _read()
    existing = data["sessions"].get(session_id, {})
    data["sessions"][session_id] = {
        "text": text,
        "status": existing.get("status", "unreviewed"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write(data)


def upsert_session_status(session_id: str, status: str) -> None:
    data = _read()
    existing = data["sessions"].get(session_id, {})
    data["sessions"][session_id] = {
        "text": existing.get("text", ""),
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write(data)


def delete_session(session_id: str) -> None:
    data = _read()
    data["sessions"].pop(session_id, None)
    _write(data)


def upsert_message(session_id: str, event_id: str, text: str) -> None:
    data = _read()
    key = f"{session_id}:{event_id}"
    existing = data["messages"].get(key, {})
    data["messages"][key] = {
        "text": text,
        "status": existing.get("status", "unreviewed"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write(data)


def upsert_message_status(session_id: str, event_id: str, status: str) -> None:
    data = _read()
    key = f"{session_id}:{event_id}"
    existing = data["messages"].get(key, {})
    data["messages"][key] = {
        "text": existing.get("text", ""),
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write(data)


def delete_message(session_id: str, event_id: str) -> None:
    data = _read()
    key = f"{session_id}:{event_id}"
    data["messages"].pop(key, None)
    _write(data)
