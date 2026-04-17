"""
CookSmart — Interactions Routes

POST /api/interactions/toggle    { recipe_id, type }  → { active, recipe_id, type }
POST /api/interactions/view      { recipe_id }         → { ok }
GET  /api/interactions           → { saved: [id…], liked: [id…] }
GET  /api/interactions/saved     → { recipes: […] }
GET  /api/interactions/liked     → { recipes: […] }
GET  /api/interactions/history   → { recipes: […] }

All write/read routes require a Bearer token.
POST /view silently ignores unauthenticated requests (guests don't have history).
"""

from flask import Blueprint, request, jsonify
from routes.profile import require_auth
from db import query, execute

interactions_bp = Blueprint('interactions', __name__)
_table_ready = False


def ensure_table():
    global _table_ready
    if _table_ready:
        return
    execute("""
        CREATE TABLE IF NOT EXISTS user_interactions (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER REFERENCES users(id)   ON DELETE CASCADE,
            recipe_id  INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
            type       VARCHAR(20) NOT NULL CHECK (type IN ('saved', 'liked', 'viewed')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(user_id, recipe_id, type)
        )
    """)
    _table_ready = True


# ── Toggle save / like ────────────────────────────────────────────────────────

@interactions_bp.route('/interactions/toggle', methods=['POST'])
def toggle():
    user_id, err = require_auth()
    if err:
        return err

    ensure_table()

    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')
    itype     = data.get('type', '')

    if not recipe_id or itype not in ('saved', 'liked'):
        return jsonify({'error': 'recipe_id and type (saved|liked) are required'}), 400

    existing = query(
        "SELECT id FROM user_interactions WHERE user_id=%s AND recipe_id=%s AND type=%s",
        (user_id, recipe_id, itype), many=False
    )

    if existing:
        execute(
            "DELETE FROM user_interactions WHERE user_id=%s AND recipe_id=%s AND type=%s",
            (user_id, recipe_id, itype)
        )
        return jsonify({'active': False, 'recipe_id': recipe_id, 'type': itype})
    else:
        execute(
            "INSERT INTO user_interactions (user_id, recipe_id, type) VALUES (%s,%s,%s)",
            (user_id, recipe_id, itype)
        )
        return jsonify({'active': True, 'recipe_id': recipe_id, 'type': itype})


# ── Record a recipe view (silent — no error for guests) ───────────────────────

@interactions_bp.route('/interactions/view', methods=['POST'])
def record_view():
    user_id, err = require_auth()
    if err:
        return jsonify({'ok': False}), 200   # silently ignore unauthenticated views

    ensure_table()

    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')
    if not recipe_id:
        return jsonify({'ok': False}), 200

    execute(
        """
        INSERT INTO user_interactions (user_id, recipe_id, type, created_at)
        VALUES (%s, %s, 'viewed', NOW())
        ON CONFLICT (user_id, recipe_id, type) DO UPDATE SET created_at = NOW()
        """,
        (user_id, recipe_id)
    )
    return jsonify({'ok': True})


# ── Get saved/liked IDs (lightweight — used for icon state across all cards) ──

@interactions_bp.route('/interactions', methods=['GET'])
def get_interactions():
    user_id, err = require_auth()
    if err:
        return err

    ensure_table()

    rows = query(
        "SELECT recipe_id, type FROM user_interactions WHERE user_id=%s AND type IN ('saved','liked')",
        (user_id,)
    )
    saved = [r['recipe_id'] for r in rows if r['type'] == 'saved']
    liked = [r['recipe_id'] for r in rows if r['type'] == 'liked']
    return jsonify({'saved': saved, 'liked': liked})


# ── Full recipe lists (for Profile page) ─────────────────────────────────────

def _recipes_for_type(user_id, itype, limit=50):
    rows = query(
        """
        SELECT r.id, r.name, r.local_name, r.cuisine_type, r.course,
               r.community, r.description, ui.created_at
        FROM user_interactions ui
        JOIN recipes r ON r.id = ui.recipe_id
        WHERE ui.user_id = %s AND ui.type = %s
        ORDER BY ui.created_at DESC
        LIMIT %s
        """,
        (user_id, itype, limit)
    )
    return [dict(r) for r in rows]


@interactions_bp.route('/interactions/saved', methods=['GET'])
def get_saved():
    user_id, err = require_auth()
    if err:
        return err
    ensure_table()
    return jsonify({'recipes': _recipes_for_type(user_id, 'saved')})


@interactions_bp.route('/interactions/liked', methods=['GET'])
def get_liked():
    user_id, err = require_auth()
    if err:
        return err
    ensure_table()
    return jsonify({'recipes': _recipes_for_type(user_id, 'liked')})


@interactions_bp.route('/interactions/history', methods=['GET'])
def get_history():
    user_id, err = require_auth()
    if err:
        return err
    ensure_table()
    return jsonify({'recipes': _recipes_for_type(user_id, 'viewed', limit=20)})
