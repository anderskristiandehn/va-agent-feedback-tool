import os
import pymysql
import pymysql.cursors
from dotenv import load_dotenv

load_dotenv()

def _cfg(key: str) -> str:
    env = os.getenv("ENV", "staging")
    prefix = "PROD" if env == "production" else "STAGING"
    return os.getenv(f"{prefix}_{key}", "")

# None = not yet loaded. Dict = loaded (may be empty if Billy unreachable).
# Use a separate flag so we don't confuse "empty result" with "never tried".
_org_cache: dict[str, dict] | None = None
_cache_env: str | None = None  # which env the cache was built for


def _get_connection():
    return pymysql.connect(
        host=_cfg("BILLY_HOST"),
        user=_cfg("BILLY_USER"),
        password=_cfg("BILLY_PASSWORD"),
        port=int(_cfg("BILLY_PORT") or "3306"),
        db="billy",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
    )


def load_org_lookup(org_ids: list[str]) -> dict[str, dict]:
    global _org_cache, _cache_env
    if not org_ids:
        _org_cache = {}
        _cache_env = os.getenv("ENV", "staging")
        return _org_cache

    placeholders = ",".join(["%s"] * len(org_ids))
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, name, url, countryId, subscriptionPlan, isTrial, isTerminated, createdTime
                FROM Organization
                WHERE id IN ({placeholders})
                """,
                org_ids,
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    _org_cache = {
        row["id"]: {
            "org_id": row["id"],
            "org_name": row["name"],
            "org_url": row["url"],
            "org_country": row["countryId"],
            "org_plan": row["subscriptionPlan"],
            "org_is_trial": row["isTrial"] == "1",
            "org_is_terminated": row["isTerminated"] == "1",
            "org_created": row["createdTime"].isoformat() if row["createdTime"] else None,
        }
        for row in rows
    }
    _cache_env = os.getenv("ENV", "staging")
    return _org_cache


def get_org_lookup(org_ids: list[str]) -> dict[str, dict]:
    global _org_cache, _cache_env
    current_env = os.getenv("ENV", "staging")
    # Rebuild if never loaded or env switched
    if _org_cache is None or _cache_env != current_env:
        try:
            load_org_lookup(org_ids)
        except Exception:
            _org_cache = {}
            _cache_env = current_env
    return _org_cache


def get_org(org_id: str) -> dict | None:
    return (_org_cache or {}).get(org_id)


def refresh_cache(org_ids: list[str] | None = None) -> dict[str, dict]:
    global _org_cache
    _org_cache = None  # force reload
    return load_org_lookup(org_ids or [])
