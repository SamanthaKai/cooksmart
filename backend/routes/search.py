"""
CookSmart — Search Routes

GET /api/search?q=matoke&cuisine=african&course=main
GET /api/suggest?q=mat                          (auto-suggest while typing)
GET /api/recipes/<id>                           (single recipe detail)
GET /api/recipes                                (all recipes, paginated)
"""

from flask import Blueprint, request, jsonify
from db import query

search_bp = Blueprint('search', __name__)


def recipe_row_to_dict(row):
    """Convert a DB row to a clean API response dict."""
    return {
        'id':                   row['id'],
        'name':                 row['name'],
        'local_name':           row['local_name'],
        'cuisine_type':         row['cuisine_type'],
        'course':               row['course'],
        'community':            row['community'],
        'description':          row['description'],
        'instructions':         row['instructions'],
        'serving_suggestion':   row['serving_suggestion'],
        'alternative_cooking':  row['alternative_cooking'],
        'prep_time':            row['prep_time'],
        'cook_time':            row['cook_time'],
        'servings':             row['servings'],
        'image_url':            row['image_url'],
        'ingredient_list':      row.get('ingredient_list', ''),
        'ingredient_array':     row.get('ingredient_array', []),
        'ingredients_display':  row.get('ingredients_display', ''),
    }


# ── Auto-suggest (fast, called on every keystroke) ────────────────────────────
@search_bp.route('/suggest')
def suggest():
    """
    Returns up to 8 recipe name suggestions as the user types.
    Uses pg_trgm similarity — very fast (~5ms).
    Minimum 2 characters required.

    Word-boundary ILIKE patterns prevent 'tea' from matching 'Steak':
      exact word | starts word | ends word | mid-word
    """
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])

    rows = query(
        """
        SELECT id, name, local_name, cuisine_type, course
        FROM recipes
        WHERE name ILIKE %s OR name ILIKE %s OR name ILIKE %s OR name ILIKE %s
           OR local_name ILIKE %s
           OR similarity(name, %s) > 0.3
        ORDER BY
            CASE
                WHEN name ILIKE %s THEN 0
                WHEN name ILIKE %s THEN 1
                ELSE 2
            END,
            similarity(name, %s) DESC
        LIMIT 8
        """,
        (q, f'{q} %', f'% {q}', f'% {q} %',   # word-boundary name match
         f'%{q}%',                               # local_name substring (short names)
         q,                                      # similarity
         q, f'{q}%',                             # ORDER BY priority
         q)
    )
    return jsonify([
        {'id': r['id'], 'name': r['name'], 'local_name': r['local_name'],
         'cuisine_type': r['cuisine_type'], 'course': r['course']}
        for r in rows
    ])


# ── Full search ───────────────────────────────────────────────────────────────
@search_bp.route('/search')
def search():
    """
    Search recipes by name with optional filters.

    Query params:
      q        — search term (recipe name)
      cuisine  — african | western | fusion
      course   — main | side | sauce | beverage | breakfast | snack | seasoning
      community — Baganda | Bakiga | etc.
      page     — page number (default 1)
      per_page — results per page (default 12, max 50)
    """
    q         = request.args.get('q', '').strip()
    cuisine   = request.args.get('cuisine', '').strip()
    course    = request.args.get('course', '').strip()
    community = request.args.get('community', '').strip()
    page      = max(1, int(request.args.get('page', 1)))
    per_page  = min(50, max(1, int(request.args.get('per_page', 12))))
    offset    = (page - 1) * per_page

    conditions = []
    params     = []

    if q:
        # Word-boundary patterns stop 'tea' matching 'Steak'.
        # Tags join lets 'roasted meat' surface recipes tagged with those words (e.g. Muchomo).
        conditions.append(
            """(
                r.name ILIKE %s OR r.name ILIKE %s OR r.name ILIKE %s OR r.name ILIKE %s
                OR r.local_name ILIKE %s
                OR r.description ILIKE %s
                OR EXISTS (SELECT 1 FROM tags t WHERE t.recipe_id = r.id AND t.tag ILIKE %s)
                OR similarity(r.name, %s) > 0.3
            )"""
        )
        params.extend([
            q, f'{q} %', f'% {q}', f'% {q} %',   # word-boundary name
            f'%{q}%',                               # local_name
            f'%{q}%',                               # description
            f'%{q}%',                               # tags
            q,                                      # similarity
        ])

    if cuisine:
        conditions.append("r.cuisine_type = %s")
        params.append(cuisine)

    if course:
        conditions.append("r.course = %s")
        params.append(course)

    if community:
        conditions.append("r.community ILIKE %s")
        params.append(f'%{community}%')

    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''

    # Total count for pagination
    count_row = query(
        f"SELECT COUNT(*) AS total FROM recipes r {where}",
        params, many=False
    )
    total = count_row['total'] if count_row else 0

    # Fetch page of results
    order = f"ORDER BY similarity(r.name, %s) DESC" if q else "ORDER BY r.id"
    order_params = [q] if q else []

    rows = query(
        f"""
        SELECT r.*, v.ingredient_list, v.ingredient_array
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        {where}
        {order}
        LIMIT %s OFFSET %s
        """,
        params + order_params + [per_page, offset]
    )

    return jsonify({
        'total':    total,
        'page':     page,
        'per_page': per_page,
        'pages':    (total + per_page - 1) // per_page,
        'results':  [recipe_row_to_dict(r) for r in rows],
    })


# ── Single recipe detail ──────────────────────────────────────────────────────
@search_bp.route('/recipes/<int:recipe_id>')
def get_recipe(recipe_id):
    row = query(
        """
        SELECT r.*, v.ingredient_list, v.ingredient_array
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not row:
        return jsonify({'error': 'Recipe not found'}), 404

    # Also fetch tags
    tags = query(
        "SELECT tag FROM tags WHERE recipe_id = %s ORDER BY tag",
        (recipe_id,)
    )
    result = recipe_row_to_dict(row)
    result['tags'] = [t['tag'] for t in tags]
    return jsonify(result)


# ── All recipes (paginated, for browse page) ──────────────────────────────────
@search_bp.route('/recipes')
def get_all_recipes():
    cuisine  = request.args.get('cuisine', '').strip()
    course   = request.args.get('course', '').strip()
    page     = max(1, int(request.args.get('page', 1)))
    per_page = min(50, max(1, int(request.args.get('per_page', 12))))
    offset   = (page - 1) * per_page

    conditions, params = [], []
    if cuisine:
        conditions.append("r.cuisine_type = %s"); params.append(cuisine)
    if course:
        conditions.append("r.course = %s");       params.append(course)

    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''

    count_row = query(
        f"SELECT COUNT(*) AS total FROM recipes r {where}", params, many=False
    )
    total = count_row['total'] if count_row else 0

    rows = query(
        f"""
        SELECT r.*, v.ingredient_list, v.ingredient_array
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        {where}
        ORDER BY r.cuisine_type, r.name
        LIMIT %s OFFSET %s
        """,
        params + [per_page, offset]
    )

    return jsonify({
        'total':   total,
        'page':    page,
        'per_page': per_page,
        'pages':   (total + per_page - 1) // per_page,
        'results': [recipe_row_to_dict(r) for r in rows],
    })