"""
CookSmart — AI Routes

POST /api/ai/suggest        Ingredient-based AI recipe suggestions (DB pre-filter → LLM rerank)
POST /api/ai/recommend      Related recipes after viewing one  (DB pre-filter → LLM rerank)
POST /api/ai/generate       Generate a brand-new Ugandan recipe from scratch
"""

import os
import json
import time
import httpx
from flask import Blueprint, request, jsonify
from db import query

# ── Simple in-memory rate limiter for /ai/generate ───────────────────────────
_gen_calls = {}          # ip -> [timestamps]
GEN_MAX    = 5           # max requests
GEN_WINDOW = 60          # per 60 seconds

def _rate_limited(ip):
    now = time.time()
    calls = [t for t in _gen_calls.get(ip, []) if now - t < GEN_WINDOW]
    if len(calls) >= GEN_MAX:
        return True
    calls.append(now)
    _gen_calls[ip] = calls
    return False

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
        f"From the candidates below, choose the 3 best matches based on ingredient overlap "
        f"and cuisine relevance. You MUST only pick from this exact list — use the recipe_id "
        f"and name exactly as shown. Do not invent, rename, or suggest any dish not in this list:\n"
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
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    if _rate_limited(ip):
        return jsonify({'error': 'You\'ve generated a few recipes recently. Please wait a minute and try again.'}), 429

    data        = request.get_json(force=True) or {}
    ingredients = [i.strip() for i in data.get('ingredients', []) if i.strip()]
    context     = (data.get('context') or '').strip()

    if not ingredients:
        return jsonify({'error': 'Please provide at least 1 ingredient.'}), 400

    # Build a context block from the full user description if provided.
    # This carries health conditions, serving size, quantity preferences, etc.
    if context:
        context_line = (
            f"FULL USER REQUEST (read carefully — honour every detail):\n"
            f"\"{context}\"\n\n"
            f"From this request extract and respect:\n"
            f"- Any health condition (e.g. diabetes → use low-GI, low-sugar ingredients; "
            f"hypertension → reduce salt; pregnancy → increase iron-rich ingredients; etc.)\n"
            f"- Serving size if mentioned (e.g. '1 serving', 'for 2 people')\n"
            f"- Quantity preferences (e.g. 'very little sugar', 'extra ginger')\n"
            f"- Whether the user explicitly asked for a drink or tea (only then generate a drink)\n\n"
        )
    else:
        context_line = ""

    prompt = (
        f"You are CookSmart, a recipe assistant specialising in African and Ugandan cuisine.\n"
        f"Generate ONE recipe based on the user's request below.\n\n"
        f"{context_line}"
        f"Ingredients mentioned: {', '.join(ingredients)}\n\n"
        f"STRICT RULES — follow every one without exception:\n"
        f"1. NO FOOD WORDS: If the user's input contains no food-related words at all "
        f"(e.g. 'love', 'everything', 'I don't know', 'anything', abstract or emotional words), "
        f"do NOT generate a recipe. Return ONLY this JSON and nothing else:\n"
        f'   {{"clarify": true, "message": "I\'m not sure what you\'d like to cook! Could you tell me what ingredients you have, or describe the kind of meal you want?"}}\n'
        f"2. TOO BROAD: If the user's input is a very broad food category with no specific dish, "
        f"ingredient, health condition, or serving detail "
        f"(e.g. 'ugandan food', 'african food', 'something to eat', 'any food', 'food'), "
        f"do NOT generate a recipe. Return ONLY this JSON and nothing else:\n"
        f'   {{"clarify": true, "message": "What kind of meal are you looking for? A main dish, snack, or drink? And do you have any ingredients in mind?"}}\n'
        f"3. REAL DISHES ONLY: The dish_name MUST be a real, known African or Ugandan dish. "
        f"Do not invent dish names. If you are not confident the dish name exists, use a generic "
        f"accurate name like 'Ugandan Bean Stew' or 'Matooke with Groundnut Sauce'.\n"
        f"4. NO DEFAULT TEA: NEVER default to Lemon Grass Tea or any tea. Only generate a tea or "
        f"drink if the user explicitly asks for tea, a drink, or names a specific tea.\n"
        f"5. HEALTH CONDITIONS → REAL DISH: If the user mentions a health condition (diabetes, "
        f"high blood pressure, pregnancy, weight gain, vegetarian) but does NOT explicitly ask for "
        f"a drink or tea, generate a real food dish — not a tea or beverage. Adjust the dish "
        f"ingredients to suit the condition (e.g. diabetes → low-GI, low-sugar; hypertension → "
        f"reduce salt; pregnancy → iron-rich; weight gain → calorie-dense). Mention the adjustment "
        f"in the health_tip.\n"
        f"6. If the user described a full request (dish, health condition, serving size), honour "
        f"that intent completely — the description above is the primary guide, ingredients are secondary.\n"
        f"7. Respect the requested serving size. Set 'servings' to exactly what was asked.\n"
        f"8. Only set local_name to a verified local name you are 100% certain of. If in doubt, "
        f"set local_name to null.\n"
        f"9. Do NOT add matooke, chapati, posho, or any staple unless explicitly mentioned.\n"
        f"10. Do not over-complicate a simple dish or drink.\n"
        f"11. Always include a health_tip: 2-3 warm, friendly sentences covering who this dish "
        f"is good for (energy, digestion, etc.), one honest caution if relevant (e.g. high in "
        f"carbs, watch the salt), and one practical suggestion to make it healthier. "
        f"No milligrams, no lab numbers. Speak like a knowledgeable friend.\n\n"
        f"Respond ONLY with a valid JSON object — no markdown, no extra text:\n"
        f'{{\n'
        f'  "dish_name": "Name of a real, known dish being made",\n'
        f'  "local_name": "Verified local name or null",\n'
        f'  "cuisine": "e.g. Ugandan, East African, or most accurate label",\n'
        f'  "cooking_time": "e.g. 10 minutes",\n'
        f'  "servings": "e.g. 1 serving",\n'
        f'  "description": "Two honest sentences about this dish, mentioning any health benefit.",\n'
        f'  "ingredients": [{{"item": "name", "quantity": "amount + unit"}}],\n'
        f'  "steps": ["Step 1: ...", "Step 2: ..."],\n'
        f'  "tips": "One practical tip, especially relevant to any health condition mentioned.",\n'
        f'  "health_tip": "2-3 warm friendly sentences: who this is good for, one caution if relevant, one tip to make it healthier."\n'
        f'}}'
    )

    try:
        recipe = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=1024))

        if recipe.get('clarify'):
            return jsonify({'clarify': True, 'message': recipe.get('message', "I'm not sure what you'd like to cook! Could you tell me what ingredients you have, or describe the kind of meal you want?")}), 200

        return jsonify({'recipe': recipe, 'ingredients_used': ingredients})

    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format. Please try again.'}), 500
    except Exception as e:
        print(f"[ai/generate] {e}")
        return jsonify({'error': f'Generate failed: {e}'}), 500


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
        return jsonify({'error': f'Tips failed: {e}'}), 500


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
        f"You are a nutrition-aware cooking assistant for CookSmart, an African cuisine app.\n\n"
        f"The user is viewing this recipe:\n"
        f"- Name: {recipe['name']}\n"
        f"- Ingredients: {(recipe['ingredient_list'] or '')[:250]}\n\n"
        f"Give a brief, friendly nutrition summary in 3-4 sentences. Cover:\n"
        f"- What the dish is generally good for (energy, protein, vitamins, etc.)\n"
        f"- Any ingredients worth noting for health (good fats, vitamins, fibre)\n"
        f"- One honest caution if relevant (e.g. high in salt, heavy on carbs)\n\n"
        f"Speak like a knowledgeable friend, not a medical journal. "
        f"No milligrams, no lab numbers. Keep it practical and readable.\n\n"
        f"Reply ONLY with this JSON — no markdown:\n"
        f'{{\n'
        f'  "summary": "3-4 friendly sentences as described above",\n'
        f'  "benefits": [{{"nutrient": "name", "benefit": "one plain-English line"}}],\n'
        f'  "tip": "one practical, specific tip for this dish"\n'
        f'}}'
    )

    try:
        health = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=400))
        return jsonify({'recipe': recipe['name'], 'health': health})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/health] {e}")
        return jsonify({'error': f'Health failed: {e}'}), 500


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
        return jsonify({'error': f'Enhance failed: {e}'}), 500


# ── /ai/customize ─────────────────────────────────────────────────────────────

@ai_bp.route('/ai/customize', methods=['POST'])
def ai_customize():
    """
    Advise on a recipe for a user's specific health goal or condition.
    Body: { recipe_id, user_goal: "I have diabetes" }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')
    user_goal = (data.get('user_goal') or '').strip()

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400
    if not user_goal:
        return jsonify({'error': 'Please describe your health goal or condition.'}), 400

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

    prompt = (
        f"You are a nutrition-aware cooking assistant for CookSmart, an African cuisine app.\n\n"
        f"The user is viewing this recipe:\n"
        f"- Name: {recipe['name']}\n"
        f"- Ingredients: {(recipe['ingredient_list'] or 'Not listed')[:300]}\n"
        f"- Preparation: {(recipe['instructions'] or 'Not available')[:400]}\n\n"
        f"The user's dietary goal or condition is: {user_goal}\n\n"
        f"Based on their goal, respond with all four of these:\n"
        f"1. Is this dish suitable for them? Answer with exactly one of: yes / with modifications / avoid\n"
        f"2. Specific, practical changes to ingredients or preparation — no vague advice\n"
        f"3. What to add or pair this dish with to better meet their goal\n"
        f"4. One short, warm encouragement — not dramatic\n\n"
        f"Rules:\n"
        f"- No milligrams or lab measurements\n"
        f"- Speak plainly and warmly, like a knowledgeable friend\n"
        f"- Keep African cuisine context — suggest African ingredient alternatives, not Western substitutes\n"
        f"- If the goal is weight gain, focus on calorie-dense additions that are realistic and locally available\n\n"
        f"Reply ONLY with this JSON — no markdown:\n"
        f'{{\n'
        f'  "suitability": "yes | with modifications | avoid",\n'
        f'  "adjustments": [{{"change": "specific change", "reason": "why it helps"}}],\n'
        f'  "pairings": ["suggestion 1", "suggestion 2"],\n'
        f'  "encouragement": "short warm sentence",\n'
        f'  "health_note": "2-sentence overall summary"\n'
        f'}}'
    )

    try:
        result = _safe_json(call_llm([{"role": "user", "content": prompt}], max_tokens=800))
        return jsonify({'recipe': recipe['name'], 'user_goal': user_goal, 'customized': result})
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"[ai/customize] {e}")
        return jsonify({'error': f'Customize failed: {e}'}), 500
