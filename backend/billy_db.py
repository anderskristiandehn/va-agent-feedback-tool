import os
import re
import uuid as uuid_mod
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
_last_org_ids: list[str] = []  # remembered so refresh_cache() can reuse it
_unresolved_ids: set[str] = set()  # ids already looked up with no matching org

# public.events.user_id sometimes holds Billy's Organization.globalId (a UUID)
# instead of Organization.id (a short base64-like string) — e.g. for
# authenticated sessions vs. the anonymous/app-generated id scheme.
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I
)

# Billy's own isTest flag misses some obviously-internal orgs (e.g. accounts
# created by staff for testing that were never flagged). Treat any org with
# a member whose email is on one of these domains as a test org too.
_STAFF_EMAIL_DOMAINS = ("ageras.com", "billy.dk", "shine.com")


def _fetch_staff_org_ids(conn, internal_org_ids: list[str]) -> set[str]:
    """Internal Organization.id values that have a staff-domain user attached."""
    if not internal_org_ids:
        return set()

    id_placeholders = ",".join(["%s"] * len(internal_org_ids))
    domain_conditions = " OR ".join(["u.email LIKE %s"] * len(_STAFF_EMAIL_DOMAINS))
    params = list(internal_org_ids) + [f"%@{d}" for d in _STAFF_EMAIL_DOMAINS]

    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT DISTINCT oua.organizationId
            FROM OrganizationUserAccess oua
            JOIN User u ON u.id = oua.userId
            WHERE oua.organizationId IN ({id_placeholders})
              AND ({domain_conditions})
            """,
            params,
        )
        return {row["organizationId"] for row in cur.fetchall()}


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


def _row_to_org(row: dict) -> dict:
    return {
        "org_id": row["id"],
        "org_name": row["name"],
        "org_url": row["url"],
        "org_country": row["countryId"],
        "org_plan": row["subscriptionPlan"],
        "org_is_trial": row["isTrial"] == "1",
        "org_is_terminated": row["isTerminated"] == "1",
        "org_is_test": row["isTest"] == "1",
        "org_created": row["createdTime"].isoformat() if row["createdTime"] else None,
    }


def _fetch_orgs(org_ids: list[str]) -> dict[str, dict]:
    """Look up a batch of org ids/globalIds against Billy. No cache side effects."""
    if not org_ids:
        return {}

    plain_ids = [i for i in org_ids if not _UUID_RE.match(i)]
    global_ids = [i for i in org_ids if _UUID_RE.match(i)]

    result: dict[str, dict] = {}
    internal_ids_by_key: dict[str, str] = {}  # result key -> Organization.id
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            if plain_ids:
                placeholders = ",".join(["%s"] * len(plain_ids))
                cur.execute(
                    f"""
                    SELECT id, name, url, countryId, subscriptionPlan, isTrial, isTerminated, isTest, createdTime
                    FROM Organization
                    WHERE id IN ({placeholders})
                    """,
                    plain_ids,
                )
                for row in cur.fetchall():
                    result[row["id"]] = _row_to_org(row)
                    internal_ids_by_key[row["id"]] = row["id"]

            if global_ids:
                placeholders = ",".join(["UUID_TO_BIN(%s)"] * len(global_ids))
                cur.execute(
                    f"""
                    SELECT id, globalId, name, url, countryId, subscriptionPlan, isTrial, isTerminated, isTest, createdTime
                    FROM Organization
                    WHERE globalId IN ({placeholders})
                    """,
                    global_ids,
                )
                for row in cur.fetchall():
                    key = str(uuid_mod.UUID(bytes=row["globalId"]))
                    result[key] = _row_to_org(row)
                    internal_ids_by_key[key] = row["id"]

        staff_org_ids = _fetch_staff_org_ids(conn, list(internal_ids_by_key.values()))
        for key, internal_id in internal_ids_by_key.items():
            if internal_id in staff_org_ids:
                result[key]["org_is_test"] = True
    finally:
        conn.close()

    return result


def load_org_lookup(org_ids: list[str]) -> dict[str, dict]:
    global _org_cache, _cache_env, _unresolved_ids
    _org_cache = _fetch_orgs(org_ids)
    _cache_env = os.getenv("ENV", "staging")
    _unresolved_ids = set(org_ids) - set(_org_cache)
    return _org_cache


def get_org_lookup(org_ids: list[str]) -> dict[str, dict]:
    global _org_cache, _cache_env, _last_org_ids, _unresolved_ids
    _last_org_ids = org_ids
    current_env = os.getenv("ENV", "staging")

    # Rebuild from scratch if never loaded or env switched
    if _org_cache is None or _cache_env != current_env:
        try:
            load_org_lookup(org_ids)
        except Exception:
            _org_cache = {}
            _cache_env = current_env
            _unresolved_ids = set()
        return _org_cache

    # Cache exists for this env — resolve any ids we haven't seen before yet
    # (newly-created orgs, or orgs whose first session just arrived) instead
    # of forcing a full manual refresh to pick them up.
    missing = [i for i in org_ids if i not in _org_cache and i not in _unresolved_ids]
    if missing:
        try:
            fetched = _fetch_orgs(missing)
            _org_cache.update(fetched)
            _unresolved_ids |= set(missing) - set(fetched)
        except Exception:
            pass  # Billy unreachable — keep serving the existing cache

    return _org_cache


def get_org(org_id: str) -> dict | None:
    return (_org_cache or {}).get(org_id)


def refresh_cache(org_ids: list[str] | None = None) -> dict[str, dict]:
    global _org_cache
    _org_cache = None  # force reload
    # Reuse the id set from the last real lookup (built from the actual
    # session/event data) instead of forcing the caller to re-derive it —
    # that set rarely changes between requests, so re-scanning Postgres on
    # every refresh click is wasted work.
    return load_org_lookup(org_ids if org_ids is not None else _last_org_ids)
