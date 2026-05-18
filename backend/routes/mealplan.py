"""CookSmart — Meal Plan Routes

POST   /api/mealplan          { recipe_id, day_of_week }  → { id, recipe_id, day_of_week }
GET    /api/mealplan                                       → { plan: [...] }
DELETE /api/mealplan/<id>                                  → { ok }

All routes require a Bearer token.
"""

from flask import Blueprint, request, jsonify
from routes.profile import require_auth
from db import query, execute

mealplan_bp = Blueprint('mealplan', __name__)
_table_ready = False

DAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')


def ensure_table():
    global _table_ready
    if _table_ready:
        return
    execute("""
        CREATE TABLE IF NOT EXISTS meal_plan (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
            day_of_week VARCHAR(10) NOT NULL CHECK (day_of_week IN (
                'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'
            )),
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, recipe_id, day_of_week)
        )
    """)
    _table_ready = True


@mealplan_bp.route('/mealplan', methods=['POST'])
def add_to_plan():
    user_id, err = require_auth()
    if err:
        return err

    ensure_table()

    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')
    day       = data.get('day_of_week', '')

    if not recipe_id or day not in DAYS:
        return jsonify({'error': 'recipe_id and a valid day_of_week are required'}), 400

    existing = query(
        "SELECT id FROM meal_plan WHERE user_id=%s AND recipe_id=%s AND day_of_week=%s",
        (user_id, recipe_id, day), many=False
    )
    if existing:
        return jsonify({'id': existing['id'], 'recipe_id': recipe_id,
                        'day_of_week': day, 'already_added': True})

    result = execute(
        "INSERT INTO meal_plan (user_id, recipe_id, day_of_week) VALUES (%s,%s,%s) RETURNING id",
        (user_id, recipe_id, day)
    )
    return jsonify({'id': result['id'], 'recipe_id': recipe_id, 'day_of_week': day}), 201


@mealplan_bp.route('/mealplan', methods=['GET'])
def get_plan():
    user_id, err = require_auth()
    if err:
        return err

    ensure_table()

    rows = query(
        """
        SELECT mp.id, mp.day_of_week,
               r.id               AS recipe_id,
               r.name, r.local_name, r.cuisine_type, r.course,
               r.ingredients_display, r.servings
        FROM   meal_plan mp
        JOIN   recipes   r ON r.id = mp.recipe_id
        WHERE  mp.user_id = %s
        ORDER BY
            CASE mp.day_of_week
                WHEN 'Monday'    THEN 1
                WHEN 'Tuesday'   THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday'  THEN 4
                WHEN 'Friday'    THEN 5
                WHEN 'Saturday'  THEN 6
                WHEN 'Sunday'    THEN 7
            END,
            mp.created_at
        """,
        (user_id,)
    )

    plan = [
        {
            'id':          r['id'],
            'day_of_week': r['day_of_week'],
            'recipe': {
                'id':                  r['recipe_id'],
                'name':                r['name'],
                'local_name':          r['local_name'],
                'cuisine_type':        r['cuisine_type'],
                'course':              r['course'],
                'ingredients_display': r['ingredients_display'],
                'servings':            r['servings'],
            }
        }
        for r in rows
    ]

    return jsonify({'plan': plan})


@mealplan_bp.route('/mealplan/<int:item_id>', methods=['DELETE'])
def remove_from_plan(item_id):
    user_id, err = require_auth()
    if err:
        return err

    ensure_table()

    existing = query(
        "SELECT id FROM meal_plan WHERE id=%s AND user_id=%s",
        (item_id, user_id), many=False
    )
    if not existing:
        return jsonify({'error': 'Not found'}), 404

    execute("DELETE FROM meal_plan WHERE id=%s AND user_id=%s", (item_id, user_id))
    return jsonify({'ok': True})
