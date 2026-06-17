import json
import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

import annotations as ann_store
import billy_db

load_dotenv()

def _cfg(key: str) -> str:
    env = os.getenv("ENV", "staging")
    prefix = "PROD" if env == "production" else "STAGING"
    return os.getenv(f"{prefix}_{key}", "")

# ---------------------------------------------------------------------------
# Queries for GET /api/sessions
# ---------------------------------------------------------------------------

# Phase 3: fetch raw events so Python can classify them (function_call /
# tool_response / text_message) and attach knowledge-base sources to answers.
RAW_EVENTS_QUERY = """
SELECT
  e.id            AS event_id,
  e.session_id,
  e.invocation_id,
  e.user_id,
  e.app_name,
  e.timestamp,
  e.event_data
FROM public.events e
ORDER BY e.session_id, e.timestamp, e.invocation_id;
"""

SESSION_FEEDBACK_QUERY = """
SELECT session_id, category, details, created_at
FROM feedback.session_feedback;
"""

MESSAGE_FEEDBACK_QUERY = """
SELECT session_id, event_id, feedback_type,
       category AS feedback_category,
       details  AS feedback_comment
FROM feedback.message_feedback;
"""

# ---------------------------------------------------------------------------
# Query for GET /api/feedback  (Tab 2 — unchanged from Phase 2)
# ---------------------------------------------------------------------------

FEEDBACK_QUERY = """
WITH processed_events AS (
  SELECT
    e.id AS event_id,
    e.session_id,
    e.app_name,
    CASE
      WHEN e.event_data ->> 'author' = 'user'                 THEN 'User'
      WHEN e.event_data ->> 'author' = 'accounting_assistant' THEN 'Accounting Assistant'
      ELSE e.event_data ->> 'author'
    END AS speaker,
    CASE
      WHEN trim(regexp_replace(
        e.event_data #>> '{content,parts,0,text}',
        '\\[User locale:.*?\\]\\s*|\\[User is currently on page:.*?\\]\\s*',
        '',
        'g'
      )) LIKE '{%%' THEN
        COALESCE(
          (trim(regexp_replace(
            e.event_data #>> '{content,parts,0,text}',
            '\\[User locale:.*?\\]\\s*|\\[User is currently on page:.*?\\]\\s*',
            '',
            'g'
          )))::jsonb ->> 'message',
          trim(regexp_replace(
            e.event_data #>> '{content,parts,0,text}',
            '\\[User locale:.*?\\]\\s*|\\[User is currently on page:.*?\\]\\s*',
            '',
            'g'
          ))
        )
      ELSE
        trim(regexp_replace(
          e.event_data #>> '{content,parts,0,text}',
          '\\[User locale:.*?\\]\\s*|\\[User is currently on page:.*?\\]\\s*',
          '',
          'g'
        ))
    END AS message_text
  FROM public.events e
  WHERE e.event_data #>> '{content,parts,0,text}' IS NOT NULL
)
SELECT
  'message'::text           AS type,
  mf.feedback_type::text    AS feedback_type,
  mf.session_id,
  mf.event_id,
  mf.created_at             AS timestamp,
  pe.speaker,
  pe.app_name,
  mf.category,
  mf.details,
  LEFT(COALESCE(pe.message_text, ''), 80) AS message_preview
FROM feedback.message_feedback mf
LEFT JOIN processed_events pe ON pe.event_id = mf.event_id

UNION ALL

SELECT
  'session'::text           AS type,
  NULL::text                AS feedback_type,
  sf.session_id,
  NULL                      AS event_id,
  sf.created_at             AS timestamp,
  NULL                      AS speaker,
  s.app_name,
  sf.category,
  sf.details,
  NULL                      AS message_preview
FROM feedback.session_feedback sf
LEFT JOIN public.sessions s ON s.id = sf.session_id

ORDER BY timestamp DESC NULLS LAST;
"""

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_connection():
    return psycopg2.connect(
        host=_cfg("DB_HOST"),
        port=_cfg("DB_PORT") or "5432",
        dbname=_cfg("DB_NAME"),
        user=_cfg("DB_USER"),
        password=_cfg("DB_PASSWORD"),
    )


def _ts(val: Any) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


# ---------------------------------------------------------------------------
# Event classification helpers (Phase 3)
# ---------------------------------------------------------------------------

_SPEAKER_MAP = {
    "user": "User",
    "accounting_assistant": "Accounting Assistant",
}


def _classify_event(event_data: dict) -> str:
    """Returns 'text_message', 'function_call', 'tool_response', or 'unknown'."""
    parts = (event_data.get("content") or {}).get("parts") or []
    if not parts:
        return "unknown"
    part = parts[0]
    if part.get("function_call"):
        return "function_call"
    if part.get("function_response"):
        return "tool_response"
    if part.get("text") is not None:
        return "text_message"
    return "unknown"


def _extract_passages(event_data: dict) -> list[dict]:
    """Pull deduplicated source passages from a tool_response event."""
    try:
        parts = event_data["content"]["parts"]
        response = parts[0]["function_response"]["response"]
        passages = response.get("passages") or []
        seen_urls: set[str] = set()
        result = []
        for p in passages:
            url = p.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                result.append(
                    {
                        "id": p.get("id"),
                        "title": p.get("title"),
                        "url": url,
                        "score": p.get("score"),
                    }
                )
        return result
    except (KeyError, TypeError, IndexError):
        return []


# Regex patterns mirror the SQL logic exactly.
_LOCALE_RE = re.compile(r'\[User locale: ([^.]+)')
_PAGE_RE = re.compile(r'\[User is currently on page: ([^\]]+)\]')
_STRIP_RE = re.compile(
    r'\[User locale:.*?\]\s*|\[User is currently on page:.*?\]\s*'
)


def _extract_message_fields(event_data: dict) -> dict | None:
    """
    Replicates the SQL text-extraction logic:
      - locale via regexp
      - current_page via regexp
      - strip metadata tags
      - unwrap JSON-envelope messages (starts with '{')
    Returns None if the event yields no usable text.
    """
    author = event_data.get("author")

    try:
        raw_text = event_data["content"]["parts"][0]["text"]
    except (KeyError, TypeError, IndexError):
        return None

    if raw_text is None:
        return None

    locale_m = _LOCALE_RE.search(raw_text)
    locale = locale_m.group(1) if locale_m else None

    page_m = _PAGE_RE.search(raw_text)
    current_page = page_m.group(1) if page_m else None

    message_text = _STRIP_RE.sub("", raw_text).strip()

    if not message_text:
        return None

    # Handle JSON-envelope format: {"message": "...", "contactSupport": true, ...}
    contact_support = False
    if message_text.startswith("{"):
        try:
            parsed = json.loads(message_text)
            message_text = parsed.get("message", message_text)
            contact_support = bool(parsed.get("contactSupport", False))
        except (json.JSONDecodeError, AttributeError):
            pass

    if not message_text or not message_text.strip():
        return None

    return {
        "author": author,
        "locale": locale,
        "current_page": current_page,
        "message_text": message_text,
        "contact_support": contact_support,
    }


# ---------------------------------------------------------------------------
# Main data fetch for GET /api/sessions
# ---------------------------------------------------------------------------

def fetch_all_data() -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(RAW_EVENTS_QUERY)
            raw_events = [dict(r) for r in cur.fetchall()]

            cur.execute(SESSION_FEEDBACK_QUERY)
            session_feedbacks = [dict(r) for r in cur.fetchall()]

            cur.execute(MESSAGE_FEEDBACK_QUERY)
            message_feedbacks = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    org_ids = list({r["user_id"] for r in raw_events if r.get("user_id")})
    try:
        org_lookup = billy_db.get_org_lookup(org_ids)
    except Exception:
        org_lookup = {}
    sessions = _build_sessions(raw_events, session_feedbacks, message_feedbacks, org_lookup)

    ann_data = ann_store.get_all()
    for session in sessions:
        sid = session["session_id"]
        sf = session.get("session_feedback")
        if sf is not None:
            sf["status"] = ann_data["sessions"].get(sid, {}).get("status", "unreviewed")
        for msg in session["messages"]:
            if msg["has_feedback"]:
                key = f"{sid}:{msg['event_id']}"
                msg["feedback_status"] = ann_data["messages"].get(key, {}).get("status", "unreviewed")
            else:
                msg["feedback_status"] = "unreviewed"

    return sessions


def _build_sessions(
    raw_events: list[dict],
    session_feedbacks: list[dict],
    message_feedbacks: list[dict],
    org_lookup: dict[str, dict],
) -> list[dict]:
    # Build lookup: (session_id, event_id) -> feedback row
    mf_lookup: dict[tuple[str, str], dict] = {}
    for mf in message_feedbacks:
        key = (mf["session_id"], mf["event_id"])
        if key not in mf_lookup:
            mf_lookup[key] = mf

    # Build lookup: session_id -> session-level feedback
    sf_lookup = {sf["session_id"]: sf for sf in session_feedbacks}

    # Group events by session_id, preserving ORDER BY (session_id, invocation_id, timestamp)
    sessions_events: dict[str, list[dict]] = defaultdict(list)
    session_meta: dict[str, dict] = {}  # first-seen user_id / app_name per session

    for row in raw_events:
        sid = row["session_id"]
        sessions_events[sid].append(row)
        if sid not in session_meta:
            session_meta[sid] = {
                "user_id": row["user_id"],
                "app_name": row["app_name"],
            }

    # DENSE_RANK equivalent: alphabetical sort of session_ids
    thread_number_map = {
        sid: i + 1 for i, sid in enumerate(sorted(sessions_events))
    }

    result = []

    for sid, events in sessions_events.items():
        messages: list[dict] = []
        pending_sources: list[dict] = []
        pending_seen_urls: set[str] = set()

        first_ts = None
        last_ts = None
        speakers: set[str] = set()
        categories: set[str] = set()
        thumbs_down_count = 0
        thumbs_up_count = 0
        escalation_count = 0
        seen_fb_eids: set[str] = set()

        for row in events:
            event_data: dict = row["event_data"] or {}
            ts = row["timestamp"]
            eid: str = row["event_id"]

            if ts is not None:
                if first_ts is None or ts < first_ts:
                    first_ts = ts
                if last_ts is None or ts > last_ts:
                    last_ts = ts

            event_type = _classify_event(event_data)

            if event_type == "tool_response":
                for p in _extract_passages(event_data):
                    if p["url"] not in pending_seen_urls:
                        pending_seen_urls.add(p["url"])
                        pending_sources.append(p)

            elif event_type == "text_message":
                fields = _extract_message_fields(event_data)
                if fields is None:
                    continue  # no usable text — skip silently

                author: str | None = fields["author"]
                speaker = _SPEAKER_MAP.get(author or "", author or "")

                if speaker:
                    speakers.add(speaker)

                # Feedback lookup
                fb = mf_lookup.get((sid, eid))
                fb_type = fb["feedback_type"] if fb else None
                fb_category = fb["feedback_category"] if fb else None
                fb_comment = fb["feedback_comment"] if fb else None

                if fb_type and eid not in seen_fb_eids:
                    seen_fb_eids.add(eid)
                    if fb_type == "thumbs_down":
                        thumbs_down_count += 1
                    elif fb_type == "thumbs_up":
                        thumbs_up_count += 1

                if fb_category:
                    categories.add(fb_category)

                # Attach accumulated sources to the next non-user assistant message.
                # Sort by score desc and cap at 5 — the agent often makes multiple
                # tool calls per response; without a cap the list grows far beyond
                # what the actual chat surfaces to the user.
                if pending_sources and author != "user":
                    sources = sorted(
                        pending_sources,
                        key=lambda p: p["score"] if p["score"] is not None else 0,
                        reverse=True,
                    )[:5]
                    pending_sources = []
                    pending_seen_urls = set()
                else:
                    sources = []

                if fields["contact_support"]:
                    escalation_count += 1

                messages.append(
                    {
                        "event_id": eid,
                        "timestamp": _ts(ts),
                        "speaker": speaker,
                        "locale": fields["locale"],
                        "current_page": fields["current_page"],
                        "message_text": fields["message_text"],
                        "contact_support": fields["contact_support"],
                        "feedback_type": fb_type,
                        "feedback_comment": fb_comment,
                        "feedback_category": fb_category,
                        "has_feedback": fb_type is not None,
                        "sources": sources,
                    }
                )

            # function_call / unknown: skip silently, do NOT clear pending_sources

        # Discard any sources that never got attached (session ended mid-invocation)

        sf = sf_lookup.get(sid)
        meta = session_meta[sid]
        org = org_lookup.get(meta["user_id"] or "")

        result.append(
            {
                "session_id": sid,
                "thread_number": thread_number_map[sid],
                "user_id": meta["user_id"],
                "app_name": meta["app_name"],
                "org_id": org["org_id"] if org else meta["user_id"],
                "org_name": org["org_name"] if org else None,
                "org_url": org["org_url"] if org else None,
                "org_country": org["org_country"] if org else None,
                "org_plan": org["org_plan"] if org else None,
                "org_is_trial": org["org_is_trial"] if org else None,
                "org_created": org["org_created"] if org else None,
                "first_timestamp": _ts(first_ts),
                "last_timestamp": _ts(last_ts),
                "message_count": len(messages),
                "speakers": sorted(speakers),
                "thumbs_down_count": thumbs_down_count,
                "thumbs_up_count": thumbs_up_count,
                "escalation_count": escalation_count,
                "has_session_feedback": sf is not None,
                "categories": sorted(categories),
                "messages": messages,
                "session_feedback": (
                    {
                        "category": sf["category"],
                        "details": sf["details"],
                        "created_at": _ts(sf["created_at"]),
                    }
                    if sf
                    else None
                ),
            }
        )

    result.sort(key=lambda x: x["last_timestamp"] or "", reverse=True)
    return result


# ---------------------------------------------------------------------------
# GET /api/feedback  (Tab 2 — unchanged)
# ---------------------------------------------------------------------------

def fetch_feedback() -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(FEEDBACK_QUERY)
            rows = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    return [
        {
            "type": row["type"],
            "feedback_type": row["feedback_type"],
            "session_id": row["session_id"],
            "event_id": row["event_id"],
            "timestamp": _ts(row["timestamp"]),
            "speaker": row["speaker"],
            "app_name": row["app_name"],
            "category": row["category"],
            "details": row["details"],
            "message_preview": row["message_preview"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# GET /api/meta  (unchanged)
# ---------------------------------------------------------------------------

def fetch_meta() -> dict:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT app_name FROM public.events "
                "WHERE app_name IS NOT NULL ORDER BY app_name"
            )
            app_names = [r[0] for r in cur.fetchall()]

            cur.execute(
                """
                SELECT DISTINCT
                  (regexp_match(
                    e.event_data #>> '{content,parts,0,text}',
                    '\\[User locale: ([^\\.]+)'
                  ))[1] AS locale
                FROM public.events e
                WHERE (regexp_match(
                    e.event_data #>> '{content,parts,0,text}',
                    '\\[User locale: ([^\\.]+)'
                ))[1] IS NOT NULL
                ORDER BY 1
                """
            )
            locales = [r[0] for r in cur.fetchall() if r[0]]

            cur.execute(
                "SELECT DISTINCT category FROM feedback.message_feedback "
                "WHERE category IS NOT NULL ORDER BY category"
            )
            categories = [r[0] for r in cur.fetchall()]
    finally:
        conn.close()

    conn2 = get_connection()
    try:
        with conn2.cursor() as cur:
            cur.execute("SELECT DISTINCT user_id FROM public.events WHERE user_id IS NOT NULL")
            user_ids = [r[0] for r in cur.fetchall()]
    finally:
        conn2.close()

    try:
        org_lookup = billy_db.get_org_lookup(user_ids)
    except Exception:
        org_lookup = {}
    org_names = sorted(
        {org_lookup[uid]["org_name"] for uid in user_ids if uid in org_lookup},
        key=str.lower,
    )

    return {"app_names": app_names, "locales": locales, "categories": categories, "org_names": org_names}
