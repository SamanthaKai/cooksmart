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

    # Build a query that:
    #  1. Finds recipes containing ANY of the supplied ingredients
    #  2. Ranks by how many they contain (most matches first)
    #  3. Filters to only recipes that have ALL of them (strict mode)
    #     — we also return partial matches ranked lower for the AI to use

    placeholders = ', '.join(['%s'] * len(ingredients))
    like_clauses = ' OR '.join([f"i.name ILIKE %s" for _ in ingredients])
    like_params  = [f'%{ing}%' for ing in ingredients]

    cuisine_filter = "AND r.cuisine_type = %s" if cuisine else ""
    cuisine_param  = [cuisine] if cuisine else []

    rows = query(
        f"""
        SELECT
            r.id, r.name, r.local_name, r.cuisine_type, r.course,
            r.community, r.description, r.prep_time, r.cook_time, r.servings,
            v.ingredient_list, v.ingredient_array,
            COUNT(DISTINCT i.id) AS match_count,
            {len(ingredients)} AS requested_count
        FROM recipes r
        JOIN recipe_with_ingredients v  ON v.id = r.id
        JOIN recipe_ingredients ri      ON ri.recipe_id = r.id
        JOIN ingredients i              ON i.id = ri.ingredient_id
        WHERE ({like_clauses})
        {cuisine_filter}
        GROUP BY r.id, r.name, r.local_name, r.cuisine_type, r.course,
                 r.community, r.description, r.prep_time, r.cook_time, r.servings,
                 v.ingredient_list, v.ingredient_array
        ORDER BY match_count DESC, r.name
        LIMIT %s OFFSET %s
        """,
        like_params + cuisine_param + [per_page, offset]
    )

    results = []
    for r in rows:
        results.append({
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
            'requested_count': int(r['requested_count']),
            'is_exact_match':  r['match_count'] >= r['requested_count'],
        })

    # Split into exact matches and partial matches
    exact   = [r for r in results if r['is_exact_match']]
    partial = [r for r in results if not r['is_exact_match']]

    return jsonify({
        'ingredients_searched': ingredients,
        'exact_matches':        exact,
        'partial_matches':      partial[:6],   # top 6 partials for "you might also like"
        'total_exact':          len(exact),
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
