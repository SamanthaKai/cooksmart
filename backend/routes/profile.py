"""
CookSmart — Profile Routes

GET /api/profile     Authorization: Bearer <token> → { user, profile }
PUT /api/profile     Authorization: Bearer <token> + body → { user, profile }

Profile body fields (all optional on PUT):
  name              string
  dietary           string[]   e.g. ["vegetarian", "halal"]
  allergies         string[]   e.g. ["peanuts", "dairy"]
  preferred_cuisine string[]   e.g. ["african", "western"]
"""

from flask import Blueprint, request, jsonify
from itsdangerous import BadSignature, SignatureExpired
from routes.auth import verify_token
from db import query, execute

profile_bp = Blueprint("profile", __name__)

_profile_table_ready = False


def ensure_profile_table():
    global _profile_table_ready
    if _profile_table_ready:
        return
    execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            dietary           TEXT[]   NOT NULL DEFAULT '{}',
            allergies         TEXT[]   NOT NULL DEFAULT '{}',
            preferred_cuisine TEXT[]   NOT NULL DEFAULT '{}',
            updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _profile_table_ready = True


def require_auth():
    """Returns (user_id, None) on success, or (None, error_response_tuple) on failure."""
    raw   = request.headers.get("Authorization", "")
    token = raw.replace("Bearer ", "").strip()
    if not token:
        return None, (jsonify({"error": "No token provided."}), 401)
    try:
        payload = verify_token(token)
        return payload["id"], None
    except (BadSignature, SignatureExpired):
        return None, (jsonify({"error": "Invalid or expired token."}), 401)


def _profile_dict(profile_row):
    if not profile_row:
        return {"dietary": [], "allergies": [], "preferred_cuisine": []}
    return {
        "dietary":           list(profile_row["dietary"]           or []),
        "allergies":         list(profile_row["allergies"]         or []),
        "preferred_cuisine": list(profile_row["preferred_cuisine"] or []),
    }


# ── GET profile ───────────────────────────────────────────────────────────────
@profile_bp.route("/profile", methods=["GET"])
def get_profile():
    user_id, err = require_auth()
    if err:
        return err

    ensure_profile_table()

    user = query(
        "SELECT id, name, email, created_at FROM users WHERE id = %s",
        (user_id,), many=False
    )
    if not user:
        return jsonify({"error": "User not found."}), 404

    profile = query(
        "SELECT dietary, allergies, preferred_cuisine FROM user_profiles WHERE user_id = %s",
        (user_id,), many=False
    )
    if not profile:
        execute(
            "INSERT INTO user_profiles (user_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (user_id,)
        )
        profile = None

    return jsonify({
        "user":    dict(user),
        "profile": _profile_dict(profile),
    })


# ── PUT profile ───────────────────────────────────────────────────────────────
@profile_bp.route("/profile", methods=["PUT"])
def update_profile():
    user_id, err = require_auth()
    if err:
        return err

    ensure_profile_table()

    data = request.get_json(force=True) or {}

    # Update display name if provided
    name = data.get("name", "").strip()
    if name:
        execute("UPDATE users SET name = %s WHERE id = %s", (name, user_id))

    # Upsert profile preferences
    dietary           = data.get("dietary")
    allergies         = data.get("allergies")
    preferred_cuisine = data.get("preferred_cuisine")

    if any(v is not None for v in [dietary, allergies, preferred_cuisine]):
        execute(
            """
            INSERT INTO user_profiles (user_id, dietary, allergies, preferred_cuisine, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                dietary           = EXCLUDED.dietary,
                allergies         = EXCLUDED.allergies,
                preferred_cuisine = EXCLUDED.preferred_cuisine,
                updated_at        = NOW()
            """,
            (
                user_id,
                dietary           if dietary           is not None else [],
                allergies         if allergies         is not None else [],
                preferred_cuisine if preferred_cuisine is not None else [],
            )
        )

    # Return updated data
    user = query(
        "SELECT id, name, email, created_at FROM users WHERE id = %s",
        (user_id,), many=False
    )
    profile = query(
        "SELECT dietary, allergies, preferred_cuisine FROM user_profiles WHERE user_id = %s",
        (user_id,), many=False
    )

    return jsonify({
        "user":    dict(user),
        "profile": _profile_dict(profile),
    })
