"""
CookSmart — Search Routes

GET /api/search?q=matoke&cuisine=african&course=main
GET /api/suggest?q=mat                          (auto-suggest while typing)
GET /api/recipes/<id>                           (single recipe detail)
GET /api/recipes                                (all recipes, paginated)
"""

import re
import os
import json
import httpx
from flask import Blueprint, request, jsonify
from itsdangerous import BadSignature, SignatureExpired
from db import query
from routes.auth import verify_token

search_bp = Blueprint('search', __name__)


# ── Profile-aware flag helpers ────────────────────────────────────────────────

# Keywords that indicate a recipe contains an allergen.
# Matched as whole words (plurals included) against the ingredient_list string.
_ALLERGEN_KEYWORDS = {
    'peanuts':   ['peanut', 'groundnut'],
    'tree-nuts': ['almond', 'cashew', 'walnut', 'pistachio', 'macadamia', 'pecan', 'hazelnut'],
    'dairy':     ['milk', 'butter', 'cream', 'cheese', 'yoghurt', 'yogurt', 'ghee'],
    'eggs':      ['egg'],
    'fish':      ['fish', 'tilapia', 'salmon', 'tuna', 'sardine', 'catfish', 'omena'],
    'shellfish': ['shrimp', 'prawn', 'crab', 'lobster', 'oyster'],
    'wheat':     ['wheat', 'flour', 'chapati', 'mandazi', 'bread'],
    'soy':       ['soy', 'tofu'],
}

# Keywords that indicate a recipe violates a dietary preference.
_DIETARY_VIOLATIONS = {
    'vegetarian': ['chicken', 'beef', 'pork', 'lamb', 'goat', 'fish', 'tilapia', 'salmon',
                   'tuna', 'prawn', 'shrimp', 'meat', 'bacon', 'sausage', 'omena'],
    'vegan':      ['chicken', 'beef', 'pork', 'lamb', 'goat', 'fish', 'tilapia', 'salmon',
                   'tuna', 'prawn', 'shrimp', 'meat', 'bacon', 'sausage', 'omena',
                   'milk', 'butter', 'cream', 'cheese', 'yoghurt', 'yogurt', 'egg', 'honey', 'ghee'],
    'halal':      ['pork', 'bacon', 'ham', 'lard'],
    'gluten-free': ['wheat', 'flour', 'chapati', 'mandazi', 'bread'],
    'dairy-free': ['milk', 'butter', 'cream', 'cheese', 'yoghurt', 'yogurt', 'ghee'],
    'nut-free':   ['peanut', 'groundnut', 'almond', 'cashew', 'walnut', 'pistachio'],
}


def _contains_ingredient(text_lower, keyword):
    """Word-boundary match that also handles common plurals (egg→eggs, peanut→peanuts)."""
    return bool(re.search(r'\b' + re.escape(keyword) + r'(?:s|es)?\b', text_lower))


def _compute_flags(ingredient_list, dietary_prefs, allergies):
    """
    Return {'allergy_flags': [...], 'dietary_flags': [...]} for one recipe.
    ingredient_list is the comma-separated text field from recipe_with_ingredients.
    """
    if not ingredient_list:
        return {'allergy_flags': [], 'dietary_flags': []}
    ing = ingredient_list.lower()
    allergy_flags = [
        a for a in allergies
        if any(_contains_ingredient(ing, kw) for kw in _ALLERGEN_KEYWORDS.get(a, []))
    ]
    dietary_flags = [
        d for d in dietary_prefs
        if any(_contains_ingredient(ing, kw) for kw in _DIETARY_VIOLATIONS.get(d, []))
    ]
    return {'allergy_flags': allergy_flags, 'dietary_flags': dietary_flags}


def _get_request_profile():
    """
    Read the Bearer token from the current request and return the user's saved
    profile preferences, or None if the user is not logged in / token invalid.
    """
    raw   = request.headers.get('Authorization', '')
    token = raw.replace('Bearer ', '').strip()
    if not token:
        return None
    try:
        payload = verify_token(token)
    except (BadSignature, SignatureExpired, Exception):
        return None
    row = query(
        "SELECT dietary, allergies, preferred_cuisine FROM user_profiles WHERE user_id = %s",
        (payload['id'],), many=False
    )
    if not row:
        return None
    return {
        'dietary':           list(row['dietary']           or []),
        'allergies':         list(row['allergies']         or []),
        'preferred_cuisine': list(row['preferred_cuisine'] or []),
    }


# ── Cuisine classification ────────────────────────────────────────────────────

# cuisine_type values stored in the recipes table that are considered African.
# Everything not in this set is treated as non-African and deprioritised by default.
_AFRICAN_CUISINES = {
    'african', 'ugandan', 'east african', 'east-african',
    'west african', 'west-african', 'kenyan', 'tanzanian',
    'rwandan', 'ethiopian', 'ghanaian', 'nigerian',
}

# Profile preferred_cuisine values that signal the user explicitly wants
# non-African content included in results.
_NON_AFRICAN_PREFS = {'western', 'asian', 'american', 'french', 'italian', 'chinese'}


def _is_african(cuisine_type):
    """Return True if cuisine_type is an African/Ugandan cuisine."""
    return (cuisine_type or '').lower().strip() in _AFRICAN_CUISINES


def _user_allows_non_african(profile):
    """Return True if the user's saved preferences include a non-African cuisine."""
    if not profile:
        return False
    return bool(set(profile.get('preferred_cuisine', [])) & _NON_AFRICAN_PREFS)


def _apply_profile_flags(results, profile):
    """Annotate each result dict with allergy_flags and dietary_flags in-place."""
    if not profile:
        return
    dietary   = profile.get('dietary',   [])
    allergies = profile.get('allergies', [])
    if not dietary and not allergies:
        return
    for r in results:
        flags = _compute_flags(r.get('ingredient_list', ''), dietary, allergies)
        r['allergy_flags'] = flags['allergy_flags']
        r['dietary_flags'] = flags['dietary_flags']


def _groq_semantic_filter(q, results):
    """
    Post-filter search results with Groq to remove semantic false positives.
    Groq understands that 'Muchomo' counts for 'roasted meat' even though the
    name doesn't say it, and that 'Steamed Yams' does NOT count for 'tea'.
    Only called when GROQ_API_KEY is set. Always falls back to unfiltered list.
    """
    api_key = os.getenv('GROQ_API_KEY', '')
    if not api_key or not results:
        return results

    names = [r['name'] for r in results]
    prompt = (
        f'A user searched for: "{q}"\n'
        f"From these recipe names, keep ONLY the ones that genuinely match "
        f"the search intent. Use semantic knowledge of African and Ugandan cuisine:\n"
        f"- 'tea' → keep only tea or herbal drink recipes; remove dishes like "
        f"'Steamed Yams' even though 'steamed' contains the letters t-e-a\n"
        f"- 'roasted meat' → keep grilled or roasted meat dishes like Muchomo "
        f"or Nyama Choma even if their name doesn't say 'roasted meat'\n"
        f"- When in doubt, keep the result\n"
        f"Names to filter: {json.dumps(names)}\n"
        f"Return ONLY a JSON array of the names to keep. No explanation, no markdown."
    )
    try:
        r = httpx.post(
            'https://api.groq.com/openai/v1/chat/completions',
            json={
                'model':       os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant'),
                'messages':    [{'role': 'user', 'content': prompt}],
                'max_tokens':  300,
                'temperature': 0,
            },
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type':  'application/json',
            },
            timeout=5,
        )
        raw = r.json()['choices'][0]['message']['content']
        raw = raw.replace('```json', '').replace('```', '').strip()
        keep = set(json.loads(raw))
        filtered = [res for res in results if res['name'] in keep]
        return filtered if filtered else results   # never return empty if Groq over-filters
    except Exception:
        return results                              # always fall back gracefully


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

    # Regex for word-start prefix match on local_name:
    # '\mmuc' matches 'Muchomo' (M at word boundary) but NOT 'steamed' for query 'tea'
    # (because 't' in 'steamed' is NOT at a word boundary — it follows 's').
    q_prefix_re = r'\m' + re.escape(q)

    rows = query(
        """
        SELECT id, name, local_name, cuisine_type, course
        FROM recipes
        WHERE name ILIKE %s OR name ILIKE %s OR name ILIKE %s OR name ILIKE %s
           OR local_name ~* %s
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
        (q, f'{q} %', f'% {q}', f'% {q} %',   # word-boundary name (ILIKE, uses index)
         q_prefix_re,                             # local_name: word-start prefix (regex)
         q,                                       # similarity
         q, f'{q}%',                              # ORDER BY priority
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
        # name   → word-boundary ILIKE (uses trigram index, fast)
        # local_name / description → PostgreSQL word-boundary regex ~*
        #   \m = start-of-word, \M = end-of-word
        #   '\mtea\M' matches standalone "Tea" but NOT "steamed" (t-e-a-m has no
        #   word boundary before the 't' — it follows 's')
        # tags   → plain substring ILIKE (tags are curated short phrases, safe)
        q_word_re = r'\m' + re.escape(q) + r'\M'

        conditions.append(
            """(
                r.name ILIKE %s OR r.name ILIKE %s OR r.name ILIKE %s OR r.name ILIKE %s
                OR r.local_name ~* %s
                OR r.description ~* %s
                OR EXISTS (SELECT 1 FROM tags t WHERE t.recipe_id = r.id AND t.tag ILIKE %s)
                OR similarity(r.name, %s) > 0.3
            )"""
        )
        params.extend([
            q, f'{q} %', f'% {q}', f'% {q} %',   # word-boundary name (ILIKE)
            q_word_re,                              # local_name: exact word (regex)
            q_word_re,                              # description: exact word (regex)
            f'%{q}%',                               # tags: substring (curated, safe)
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

    results = [recipe_row_to_dict(r) for r in rows]

    # Groq semantic post-filter: catches any false positives the SQL still lets through
    # (e.g. a description coincidentally matching a substring). Only runs for short
    # queries where ambiguity is likely; always falls back silently if Groq is down.
    if q and len(q.split()) <= 3:
        results = _groq_semantic_filter(q, results)

    # Annotate each result with allergy/dietary flags for logged-in users
    _apply_profile_flags(results, _get_request_profile())

    return jsonify({
        'total':    total,
        'page':     page,
        'per_page': per_page,
        'pages':    (total + per_page - 1) // per_page,
        'results':  results,
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

    profile   = _get_request_profile()
    preferred = profile['preferred_cuisine'] if profile else []

    # Build ORDER BY:
    # 1. African cuisines always come before non-African by default
    # 2. If the user has explicit preferred cuisines, those float above other African ones
    # This means a user preferring "west-african" sees West African recipes first,
    # then other African, then Western — without hiding anything.
    if preferred:
        order_clause = (
            "ORDER BY "
            "CASE WHEN r.cuisine_type = ANY(%s) THEN 0 "   # user's preferred → tier 0
            "     WHEN r.cuisine_type = ANY(%s) THEN 1 "   # other African     → tier 1
            "     ELSE 2 END, "                             # non-African       → tier 2
            "r.name"
        )
        order_params = [preferred, list(_AFRICAN_CUISINES)]
    else:
        order_clause = (
            "ORDER BY "
            "CASE WHEN r.cuisine_type = ANY(%s) THEN 0 ELSE 1 END, "  # African → tier 0
            "r.name"
        )
        order_params = [list(_AFRICAN_CUISINES)]

    rows = query(
        f"""
        SELECT r.*, v.ingredient_list, v.ingredient_array
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        {where}
        {order_clause}
        LIMIT %s OFFSET %s
        """,
        params + order_params + [per_page, offset]
    )

    results = [recipe_row_to_dict(r) for r in rows]
    _apply_profile_flags(results, profile)

    return jsonify({
        'total':    total,
        'page':     page,
        'per_page': per_page,
        'pages':    (total + per_page - 1) // per_page,
        'results':  results,
    })