import os
import pymysql
import pymysql.cursors
from dotenv import load_dotenv

load_dotenv()

BILLY_HOST = os.getenv("BILLY_DB_HOST", "mysql-57.db.staging.vpc")
BILLY_USER = os.getenv("BILLY_DB_USER", "master")
BILLY_PASSWORD = os.getenv("BILLY_DB_PASSWORD", "***REMOVED***")
BILLY_PORT = int(os.getenv("BILLY_DB_PORT", "3306"))

# Cache: org_id -> org dict
_org_cache: dict[str, dict] | None = None


def _get_connection():
    return pymysql.connect(
        host=BILLY_HOST,
        user=BILLY_USER,
        password=BILLY_PASSWORD,
        port=BILLY_PORT,
        db="billy",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
    )


def load_org_lookup(org_ids: list[str] | None = None) -> dict[str, dict]:
    """Fetch orgs from Billy for the given org_ids and return a dict keyed by org id."""
    global _org_cache
    if not org_ids:
        _org_cache = {}
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
    return _org_cache


def get_org_lookup(org_ids: list[str] | None = None) -> dict[str, dict]:
    global _org_cache
    if _org_cache is None:
        try:
            load_org_lookup(org_ids)
        except Exception:
            _org_cache = {}
    return _org_cache


def get_org(org_id: str) -> dict | None:
    return get_org_lookup().get(org_id)


def refresh_cache(org_ids: list[str] | None = None) -> dict[str, dict]:
    return load_org_lookup(org_ids)
