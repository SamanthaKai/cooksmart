"""
CookSmart — Generated Recipes Routes

POST /api/generated-recipes    Save a generated recipe to user's profile (auth required)
GET  /api/generated-recipes    List user's saved generated recipes (auth required)
"""

import json
from flask import Blueprint, request, jsonify
from db import query, execute
from routes.auth import verify_token
from itsdangerous import BadSignature, SignatureExpired

gen_recipes_bp = Blueprint('generated_recipes', __name__)

_table_ready = False


def _ensure_table():
    global _table_ready
    if _table_ready:
        return
    execute("""
        CREATE TABLE IF NOT EXISTS generated_recipes (
            id           SERIAL PRIMARY KEY,
            user_id      INTEGER NOT NULL,
            dish_name    TEXT NOT NULL,
            local_name   TEXT,
            cuisine      TEXT,
            cooking_time TEXT,
            servings     TEXT,
            description  TEXT,
            ingredients  JSONB DEFAULT '[]',
            steps        JSONB DEFAULT '[]',
            tips         TEXT,
            health_tip   TEXT,
            created_at   TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    _table_ready = True


def _get_user_id():
    raw = request.headers.get('Authorization', '')
    token = raw.replace('Bearer ', '').strip()
    if not token:
        return None
    try:
        payload = verify_token(token)
        return payload['id']
    except (BadSignature, SignatureExpired, Exception):
        return None


@gen_recipes_bp.route('/generated-recipes', methods=['POST'])
def save_generated_recipe():
    _ensure_table()
    user_id = _get_user_id()
    if not user_id:
        return jsonify({'error': 'Authentication required.'}), 401

    data = request.get_json(force=True) or {}
    dish_name = (data.get('dish_name') or '').strip()
    if not dish_name:
        return jsonify({'error': 'dish_name is required.'}), 400

    row = execute(
        """
        INSERT INTO generated_recipes
            (user_id, dish_name, local_name, cuisine, cooking_time,
             servings, description, ingredients, steps, tips, health_tip)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
        RETURNING id, created_at
        """,
        (
            user_id,
            dish_name,
            data.get('local_name'),
            data.get('cuisine'),
            data.get('cooking_time'),
            data.get('servings'),
            data.get('description'),
            json.dumps(data.get('ingredients') or []),
            json.dumps(data.get('steps') or []),
            data.get('tips'),
            data.get('health_tip'),
        )
    )
    return jsonify({'id': row['id'], 'message': 'Recipe saved to your profile.'}), 201


@gen_recipes_bp.route('/generated-recipes', methods=['GET'])
def list_generated_recipes():
    _ensure_table()
    user_id = _get_user_id()
    if not user_id:
        return jsonify({'error': 'Authentication required.'}), 401

    rows = query(
        """
        SELECT id, dish_name, local_name, cuisine, cooking_time,
               servings, description, ingredients, steps, tips, health_tip, created_at
        FROM generated_recipes
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (user_id,)
    )
    recipes = []
    for r in (rows or []):
        row = dict(r)
        # psycopg2 returns JSONB as already-parsed Python objects; guard anyway
        if isinstance(row.get('ingredients'), str):
            try:
                row['ingredients'] = json.loads(row['ingredients'])
            except Exception:
                row['ingredients'] = []
        if isinstance(row.get('steps'), str):
            try:
                row['steps'] = json.loads(row['steps'])
            except Exception:
                row['steps'] = []
        if row.get('created_at'):
            row['created_at'] = row['created_at'].isoformat()
        recipes.append(row)

    return jsonify({'recipes': recipes})
