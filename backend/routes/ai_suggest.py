"""
CookSmart — AI Routes

POST /api/ai/suggest        Ingredient-based AI recipe suggestions (DB pre-filter → LLM rerank)
POST /api/ai/recommend      Related recipes after viewing one  (DB pre-filter → LLM rerank)
POST /api/ai/generate       Generate a brand-new Ugandan recipe from scratch
"""

import os
import json
import httpx
from flask import Blueprint, request, jsonify
from db import query

ai_bp = Blueprint('ai', __name__)


# ── LLM helper ────────────────────────────────────────────────────────────────

def call_llm(messages, max_tokens=600):
    """
    Call Groq (default) or a local Ollama instance.
    LLM_PROVIDER env var controls which one.  Falls back gracefully if unavailable.
    """
    provider = os.getenv('LLM_PROVIDER', 'groq').lower()

    if provider == 'ollama':
        base    = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')
        url     = base + '/v1/chat/completions'
        model   = os.getenv('OLLAMA_MODEL', 'llama3.2')
        headers = {'Content-Type': 'application/json'}
    else:
        api_key = os.getenv('GROQ_API_KEY', '')
        if not api_key:
            raise RuntimeError('GROQ_API_KEY is not set.')
        url     = 'https://api.groq.com/openai/v1/chat/completions'
        model   = os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant')
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }

    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens,
               'temperature': 0.3}
    r = httpx.post(url, json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()['choices'][0]['message']['content']


def _safe_json(raw):
    """Strip markdown fences and parse JSON."""
    raw = raw.replace('```json', '').replace('```', '').strip()
    return json.loads(raw)


# ── /ai/suggest ───────────────────────────────────────────────────────────────

@ai_bp.route('/ai/suggest', methods=['POST'])
def ai_suggest():
    """
    Given user ingredients, suggest 3 matching recipes.
    Step 1 — DB: find up to 20 candidates that share at least one ingredient.
    Step 2 — LLM: rerank and explain top 3 from those candidates.
    This keeps the prompt small (~500 tokens) regardless of DB size.
    """
    data        = request.get_json(force=True) or {}
    ingredients = [i.strip().lower() for i in data.get('ingredients', []) if i.strip()]

    if not ingredients:
        return jsonify({'suggestions': []}), 200

    # ── Step 1: DB pre-filter ─────────────────────────────────────────────────
    like_clauses = ' OR '.join(['i.name ILIKE %s'] * len(ingredients))
    like_params  = [f'%{ing}%' for ing in ingredients]

    candidates = query(
        f"""
        SELECT r.id, r.name, r.cuisine_type, r.course, r.community,
               v.ingredient_list,
               COUNT(DISTINCT i.id) AS match_count
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        JOIN recipe_ingredients ri     ON ri.recipe_id = r.id
        JOIN ingredients i             ON i.id = ri.ingredient_id
        WHERE ({like_clauses})
        GROUP BY r.id, r.name, r.cuisine_type, r.course, r.community, v.ingredient_list
        ORDER BY match_count DESC, r.name
        LIMIT 20
        """,
        like_params
    )

    if not candidates:
        # Nothing matched — return empty (the DB ingredient search already handles this case)
        return jsonify({'suggestions': []}), 200

    # ── Step 2: LLM rerank ────────────────────────────────────────────────────
    shortlist = [
        {
            'id':          r['id'],
            'name':        r['name'],
            'cuisine':     r['cuisine_type'],
            'course':      r['course'],
            'ingredients': (r['ingredient_list'] or '')[:200],  # trim long lists
        }
        for r in candidates
    ]

    prompt = (
        f"You are CookSmart, a recipe assistant for Ugandan and East African cuisine.\n\n"
        f"The user has: {', '.join(ingredients)}\n\n"
        f"From these candidates, choose the 3 best matches based on ingredient overlap and cuisine relevance:\n"
        f"{json.dumps(shortlist)}\n\n"
        f"Reply ONLY with a JSON array — no markdown, no extra text:\n"
        f'[{{"recipe_id": 5, "name": "...", "reason": "one sentence"}}]'
    )

    try:
        recs = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=400))

        enriched = []
        for r in recs[:3]:
            row = query(
                "SELECT id, name, local_name, cuisine_type, course, community, description FROM recipes WHERE id = %s",
                (r['recipe_id'],), many=False
            )
            if row:
                enriched.append({**dict(row), 'ai_reason': r.get('reason', '')})

        return jsonify({'suggestions': enriched})

    except RuntimeError as e:
        return jsonify({'error': str(e), 'suggestions': []}), 503
    except Exception as e:
        print(f"[ai/suggest] {e}")
        return jsonify({'suggestions': []}), 200


# ── /ai/recommend ─────────────────────────────────────────────────────────────

@ai_bp.route('/ai/recommend', methods=['POST'])
def ai_recommend():
    """
    After a user views a recipe, suggest 3 related ones.
    Step 1 — DB: pull 20 recipes sharing cuisine/course.
    Step 2 — LLM: pick 3 with explanations.
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400

    current = query(
        """
        SELECT r.id, r.name, r.cuisine_type, r.course, r.community, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not current:
        return jsonify({'error': 'Recipe not found'}), 404

    # ── Step 1: DB pre-filter — same cuisine OR course, excluding current ─────
    candidates = query(
        """
        SELECT r.id, r.name, r.cuisine_type, r.course, r.community, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id != %s
          AND (r.cuisine_type = %s OR r.course = %s)
        ORDER BY RANDOM()
        LIMIT 20
        """,
        (recipe_id, current['cuisine_type'], current['course'])
    )

    if not candidates:
        return jsonify({'recommendations': [], 'based_on': current['name']}), 200

    # ── Step 2: LLM rerank ────────────────────────────────────────────────────
    shortlist = [
        {
            'id':          r['id'],
            'name':        r['name'],
            'cuisine':     r['cuisine_type'],
            'course':      r['course'],
            'ingredients': (r['ingredient_list'] or '')[:150],
        }
        for r in candidates
    ]

    prompt = (
        f"You are CookSmart, a recipe assistant.\n\n"
        f"A user just viewed: {current['name']} ({current['cuisine_type']}, {current['course']})\n"
        f"Ingredients: {(current['ingredient_list'] or '')[:200]}\n\n"
        f"From these candidates, pick 3 recipes the user would enjoy next (complementary dish, "
        f"shared ingredients, or same cultural context):\n"
        f"{json.dumps(shortlist)}\n\n"
        f"Reply ONLY with a JSON array — no markdown:\n"
        f'[{{"recipe_id": 5, "name": "...", "reason": "one sentence"}}]'
    )

    try:
        recs = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=400))

        enriched = []
        for r in recs[:3]:
            row = query(
                "SELECT id, name, local_name, cuisine_type, course, community, description FROM recipes WHERE id = %s",
                (r['recipe_id'],), many=False
            )
            if row:
                enriched.append({**dict(row), 'ai_reason': r.get('reason', '')})

        return jsonify({'based_on': current['name'], 'recommendations': enriched})

    except RuntimeError as e:
        return jsonify({'error': str(e), 'recommendations': []}), 503
    except Exception as e:
        print(f"[ai/recommend] {e}")
        return jsonify({'recommendations': [], 'based_on': current['name']}), 200


# ── /ai/generate ──────────────────────────────────────────────────────────────

@ai_bp.route('/ai/generate', methods=['POST'])
def ai_generate():
    """
    Generate a brand-new Ugandan/East African recipe from the user's ingredients.
    """
    data        = request.get_json(force=True) or {}
    ingredients = [i.strip() for i in data.get('ingredients', []) if i.strip()]

    if not ingredients:
        return jsonify({'error': 'Please provide at least 1 ingredient.'}), 400

    prompt = (
        f"You are a master chef specialising in authentic Ugandan and East African cuisine.\n\n"
        f"Available ingredients: {', '.join(ingredients)}\n\n"
        f"Create one complete, authentic Ugandan or East African recipe using some or all of these.\n"
        f"Be specific with quantities and traditional techniques.\n\n"
        f"Respond ONLY with a valid JSON object — no markdown, no extra text:\n"
        f'{{\n'
        f'  "dish_name": "English name",\n'
        f'  "local_name": "Local/traditional name or null",\n'
        f'  "cuisine": "Ugandan or East African",\n'
        f'  "cooking_time": "e.g. 45 minutes",\n'
        f'  "servings": "e.g. 4 people",\n'
        f'  "description": "Two sentences on the dish and its cultural significance.",\n'
        f'  "ingredients": [{{"item": "name", "quantity": "amount + unit"}}],\n'
        f'  "steps": ["Step 1: ...", "Step 2: ..."],\n'
        f'  "tips": "A cooking tip or serving suggestion."\n'
        f'}}'
    )

    try:
        recipe = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=1024))
        return jsonify({'recipe': recipe, 'ingredients_used': ingredients})

    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format. Please try again.'}), 500
    except Exception as e:
        print(f"[ai/generate] {e}")
        return jsonify({'error': 'Failed to generate recipe. Please try again.'}), 500


# ── /ai/substitutes ───────────────────────────────────────────────────────────

@ai_bp.route('/ai/substitutes', methods=['POST'])
def ai_substitutes():
    """
    Suggest 3 locally-available substitutes for a given ingredient in a recipe.
    Body: { recipe_id, ingredient }
    """
    data       = request.get_json(force=True) or {}
    recipe_id  = data.get('recipe_id')
    ingredient = (data.get('ingredient') or '').strip()

    if not recipe_id or not ingredient:
        return jsonify({'error': 'recipe_id and ingredient are required'}), 400

    recipe = query(
        "SELECT name, cuisine_type FROM recipes WHERE id = %s",
        (recipe_id,), many=False
    )
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404

    prompt = (
        f"You are a culinary expert in Ugandan and East African cuisine.\n\n"
        f"Recipe: {recipe['name']} ({recipe['cuisine_type']})\n"
        f"Ingredient to substitute: {ingredient}\n\n"
        f"Suggest 3 realistic substitutes available in Uganda or East Africa.\n"
        f"For each, give a short reason why it works in this dish.\n\n"
        f"Reply ONLY with a JSON array — no markdown:\n"
        f'[{{"name": "substitute name", "reason": "why it works"}}]'
    )

    try:
        subs = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=300))
        return jsonify({'ingredient': ingredient, 'substitutes': subs[:3]})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/substitutes] {e}")
        return jsonify({'error': 'Failed to get substitutes. Please try again.'}), 500


# ── /ai/tips ──────────────────────────────────────────────────────────────────

@ai_bp.route('/ai/tips', methods=['POST'])
def ai_tips():
    """
    Generate 4 practical cooking tips for a specific recipe.
    Body: { recipe_id }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400

    recipe = query(
        """
        SELECT r.name, r.cuisine_type, r.course, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404

    prompt = (
        f"You are a master chef specialising in Ugandan and East African cuisine.\n\n"
        f"Recipe: {recipe['name']} ({recipe['cuisine_type']}, {recipe['course']})\n"
        f"Key ingredients: {(recipe['ingredient_list'] or '')[:200]}\n\n"
        f"Give exactly 4 practical, specific cooking tips for making this dish well.\n"
        f"Tips should be actionable and relevant to the African cooking context.\n\n"
        f"Reply ONLY with a JSON array of strings — no markdown:\n"
        f'["Tip one...", "Tip two...", "Tip three...", "Tip four..."]'
    )

    try:
        tips = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=400))
        return jsonify({'recipe': recipe['name'], 'tips': tips[:5]})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/tips] {e}")
        return jsonify({'error': 'Failed to get cooking tips. Please try again.'}), 500


# ── /ai/health ────────────────────────────────────────────────────────────────

@ai_bp.route('/ai/health', methods=['POST'])
def ai_health():
    """
    Generate a health & nutrition summary for a recipe.
    Body: { recipe_id }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400

    recipe = query(
        """
        SELECT r.name, r.cuisine_type, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404

    prompt = (
        f"You are a nutrition expert.\n\n"
        f"Recipe: {recipe['name']}\n"
        f"Ingredients: {(recipe['ingredient_list'] or '')[:200]}\n\n"
        f"Provide a brief health analysis of this dish.\n\n"
        f"Reply ONLY with this JSON structure — no markdown:\n"
        f'{{\n'
        f'  "summary": "2-3 sentences on overall healthiness of this dish",\n'
        f'  "benefits": [{{"nutrient": "name", "benefit": "one-line benefit"}}],\n'
        f'  "tip": "one practical dietary tip for this dish"\n'
        f'}}'
    )

    try:
        health = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=400))
        return jsonify({'recipe': recipe['name'], 'health': health})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/health] {e}")
        return jsonify({'error': 'Failed to get health insights. Please try again.'}), 500


# ── /ai/enhance ───────────────────────────────────────────────────────────────

@ai_bp.route('/ai/enhance', methods=['POST'])
def ai_enhance():
    """
    Rewrite an existing recipe's instructions for clarity, exact measurements,
    and consistent step-by-step format. Original DB record is unchanged.
    Body: { recipe_id }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400

    recipe = query(
        """
        SELECT r.name, r.local_name, r.cuisine_type, r.course,
               r.instructions, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404

    prompt = (
        f"You are a professional recipe editor specialising in Ugandan and East African cuisine.\n\n"
        f"Recipe: {recipe['name']} ({recipe['cuisine_type']}, {recipe['course']})\n"
        f"Ingredients: {(recipe['ingredient_list'] or 'Not listed')[:300]}\n"
        f"Original instructions:\n{(recipe['instructions'] or 'Not available')[:600]}\n\n"
        f"Rewrite this recipe with:\n"
        f"- Clear, numbered steps (one action per step)\n"
        f"- Exact measurements where possible (grams, ml, minutes, temperature)\n"
        f"- Consistent, simple language any home cook can follow\n"
        f"- Helpful technique notes where they genuinely help\n\n"
        f"Reply ONLY with this JSON — no markdown:\n"
        f'{{\n'
        f'  "steps": ["Step one text...", "Step two text..."],\n'
        f'  "prep_tip": "One key preparation tip",\n'
        f'  "serving": "How to plate and serve"\n'
        f'}}'
    )

    try:
        result = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=900))
        return jsonify({'recipe': recipe['name'], 'enhanced': result})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/enhance] {e}")
        return jsonify({'error': 'Failed to enhance recipe. Please try again.'}), 500


# ── /ai/customize ─────────────────────────────────────────────────────────────

@ai_bp.route('/ai/customize', methods=['POST'])
def ai_customize():
    """
    Customise a recipe for specific dietary goals or health needs.
    Returns ingredient swaps with health reasoning + calorie estimate.
    Body: { recipe_id, goals: ['low-carb', ...], notes: "any extra requirements" }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')
    goals     = data.get('goals', [])
    notes     = (data.get('notes') or '').strip()

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400
    if not goals and not notes:
        return jsonify({'error': 'Please select at least one health goal.'}), 400

    recipe = query(
        """
        SELECT r.name, r.cuisine_type, r.course,
               r.instructions, v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not recipe:
        return jsonify({'error': 'Recipe not found'}), 404

    goals_text = ', '.join(goals) if goals else 'healthier overall'
    extra      = f"\nAdditional requirements: {notes}" if notes else ""

    prompt = (
        f"You are a nutritionist and chef specialising in Ugandan and East African cuisine.\n\n"
        f"Recipe: {recipe['name']} ({recipe['cuisine_type']}, {recipe['course']})\n"
        f"Ingredients: {(recipe['ingredient_list'] or 'Not listed')[:300]}\n"
        f"Instructions (summary): {(recipe['instructions'] or '')[:400]}\n\n"
        f"Health goals: {goals_text}{extra}\n\n"
        f"Make smart ingredient swaps and adjustments to meet these goals.\n"
        f"Keep the dish as authentic as possible while improving its nutritional profile.\n"
        f"Only include swaps that actually matter for the stated goals.\n\n"
        f"Reply ONLY with this JSON — no markdown:\n"
        f'{{\n'
        f'  "swaps": [{{\n'
        f'    "original": "original ingredient",\n'
        f'    "replacement": "healthier alternative",\n'
        f'    "reason": "specific health benefit (one sentence)"\n'
        f'  }}],\n'
        f'  "adjusted_steps": ["Any steps that change because of the swaps — empty array if unchanged"],\n'
        f'  "health_note": "2-sentence summary of overall improvement",\n'
        f'  "calories_estimate": "rough estimate e.g. ~320 kcal per serving"\n'
        f'}}'
    )

    try:
        result = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=800))
        return jsonify({'recipe': recipe['name'], 'goals': goals, 'customized': result})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/customize] {e}")
        return jsonify({'error': 'Failed to customise recipe. Please try again.'}), 500
