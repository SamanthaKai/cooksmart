"""
CookSmart — Ingredient Search Routes

POST /api/search/ingredients     { "ingredients": ["tomato", "onion", "chicken"] }
GET  /api/ingredients            (all ingredient names, for the ingredient picker UI)
GET  /api/ingredients/suggest?q= (ingredient auto-suggest)
"""

from flask import Blueprint, request, jsonify
from db import query

ingredients_bp = Blueprint('ingredients', __name__)


# ── Search recipes by ingredients ─────────────────────────────────────────────
@ingredients_bp.route('/search/ingredients', methods=['POST'])
def search_by_ingredients():
    """
    Finds recipes that contain ALL of the supplied ingredients.
    Minimum 2 ingredients required (as per CookSmart spec).

    Body: { "ingredients": ["tomato", "onion"], "cuisine": "african" }

    Returns recipes ranked by how many of the supplied ingredients they contain,
    so partial matches (recipes with 3 out of 4 ingredients) also appear lower
    in the list — useful for the AI layer to pick up.
    """
    data        = request.get_json(force=True) or {}
    ingredients = [i.strip().lower() for i in data.get('ingredients', []) if i.strip()]
    cuisine     = data.get('cuisine', '').strip()
    page        = max(1, int(data.get('page', 1)))
    per_page    = min(50, max(1, int(data.get('per_page', 12))))
    offset      = (page - 1) * per_page

    if len(ingredients) < 2:
        return jsonify({'error': 'Please provide at least 2 ingredients.'}), 400

    n            = len(ingredients)
    like_clauses = ' OR '.join([f"i.name ILIKE %s" for _ in ingredients])
    like_params  = [f'%{ing}%' for ing in ingredients]

    # CASE WHEN maps each ingredient row to the index of the search term it satisfies.
    # COUNT(DISTINCT CASE ... END) therefore counts how many distinct SEARCH TERMS were
    # matched — not how many ingredient rows matched. This prevents a recipe with two rows
    # that both match the same search term (e.g. 'tomato paste' + 'cherry tomato' for the
    # search term 'tomato') from being falsely counted as two different term matches.
    case_parts  = ' '.join([f"WHEN i.name ILIKE %s THEN {idx}" for idx, _ in enumerate(ingredients)])
    case_params = [f'%{ing}%' for ing in ingredients]

    cuisine_filter = "AND r.cuisine_type = %s" if cuisine else ""
    cuisine_param  = [cuisine] if cuisine else []

    # Shared CTE that computes match_count correctly for both exact and partial queries.
    base_cte = f"""
        WITH matched AS (
            SELECT
                r.id, r.name, r.local_name, r.cuisine_type, r.course,
                r.community, r.description, r.prep_time, r.cook_time, r.servings,
                v.ingredient_list, v.ingredient_array,
                COUNT(DISTINCT CASE {case_parts} END) AS match_count
            FROM recipes r
            JOIN recipe_with_ingredients v  ON v.id = r.id
            JOIN recipe_ingredients ri      ON ri.recipe_id = r.id
            JOIN ingredients i              ON i.id = ri.ingredient_id
            WHERE ({like_clauses})
            {cuisine_filter}
            GROUP BY r.id, r.name, r.local_name, r.cuisine_type, r.course,
                     r.community, r.description, r.prep_time, r.cook_time, r.servings,
                     v.ingredient_list, v.ingredient_array
        )
    """
    # Params: case_params (CASE WHEN) + like_params (WHERE) + cuisine
    cte_params = case_params + like_params + cuisine_param

    # Exact matches: every supplied ingredient is present in the recipe.
    exact_rows = query(
        base_cte + " SELECT * FROM matched WHERE match_count >= %s ORDER BY name LIMIT %s OFFSET %s",
        cte_params + [n, per_page, offset]
    )

    # Partial matches: at least one ingredient present but not all (capped at 6).
    partial_rows = query(
        base_cte + " SELECT * FROM matched WHERE match_count > 0 AND match_count < %s ORDER BY match_count DESC, name LIMIT 6",
        cte_params + [n]
    )

    # Total exact count (for pagination metadata).
    count_row = query(
        base_cte + " SELECT COUNT(*) AS total FROM matched WHERE match_count >= %s",
        cte_params + [n], many=False
    )
    total_exact = count_row['total'] if count_row else 0

    def _to_dict(r, is_exact):
        return {
            'id':              r['id'],
            'name':            r['name'],
            'local_name':      r['local_name'],
            'cuisine_type':    r['cuisine_type'],
            'course':          r['course'],
            'community':       r['community'],
            'description':     r['description'],
            'prep_time':       r['prep_time'],
            'cook_time':       r['cook_time'],
            'servings':        r['servings'],
            'ingredient_list': r['ingredient_list'],
            'match_count':     int(r['match_count']),
            'requested_count': n,
            'is_exact_match':  is_exact,
        }

    return jsonify({
        'ingredients_searched': ingredients,
        'exact_matches':        [_to_dict(r, True)  for r in exact_rows],
        'partial_matches':      [_to_dict(r, False) for r in partial_rows],
        'total_exact':          total_exact,
    })


# ── All ingredients (for the ingredient picker dropdown) ──────────────────────
@ingredients_bp.route('/ingredients')
def get_all_ingredients():
    category = request.args.get('category', '').strip()

    if category:
        rows = query(
            "SELECT id, name, category FROM ingredients WHERE category = %s ORDER BY name",
            (category,)
        )
    else:
        rows = query("SELECT id, name, category FROM ingredients ORDER BY name")

    return jsonify([dict(r) for r in rows])


# ── Ingredient auto-suggest ───────────────────────────────────────────────────
@ingredients_bp.route('/ingredients/suggest')
def suggest_ingredient():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])

    rows = query(
        """
        SELECT id, name, category
        FROM ingredients
        WHERE name ILIKE %s OR similarity(name, %s) > 0.2
        ORDER BY
            CASE WHEN name ILIKE %s THEN 0 ELSE 1 END,
            similarity(name, %s) DESC
        LIMIT 10
        """,
        (f'%{q}%', q, f'{q}%', q)
    )
    return jsonify([dict(r) for r in rows])
