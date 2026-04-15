"""
CookSmart — AI Routes

POST /api/ai/suggest        Smart recipe suggestions from ingredients (picks from DB)
POST /api/ai/recommend      Related recipes after viewing one
POST /api/ai/generate       Generate a brand-new Ugandan recipe (generative AI feature)

LLM provider is controlled by LLM_PROVIDER in .env:
  - "groq"   → Groq cloud (free tier, fast) — default
  - "ollama" → Ollama local inference (fully offline)
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
    Call the configured LLM provider using their OpenAI-compatible endpoint.
    Uses httpx (already a project dependency — no new packages needed).

    LLM_PROVIDER=groq   → Groq cloud API (GROQ_API_KEY required)
    LLM_PROVIDER=ollama → Local Ollama (OLLAMA_BASE_URL, OLLAMA_MODEL)
    """
    provider = os.getenv('LLM_PROVIDER', 'groq').lower()

    if provider == 'ollama':
        base   = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')
        url    = base + '/v1/chat/completions'
        model  = os.getenv('OLLAMA_MODEL', 'llama3.2')
        headers = {'Content-Type': 'application/json'}
    else:
        # Groq (default)
        url    = 'https://api.groq.com/openai/v1/chat/completions'
        model  = os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant')
        headers = {
            'Authorization': f"Bearer {os.getenv('GROQ_API_KEY', '')}",
            'Content-Type': 'application/json',
        }

    payload = {'model': model, 'messages': messages, 'max_tokens': max_tokens}
    r = httpx.post(url, json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()['choices'][0]['message']['content']


def get_recipe_index():
    """
    Fetch a lightweight index of all recipes for the LLM to reason over.
    Only sends id, name, cuisine_type, course, community, and top ingredients
    to keep the prompt small and fast.
    """
    rows = query(
        """
        SELECT r.id, r.name, r.cuisine_type, r.course, r.community,
               v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        ORDER BY r.id
        """
    )
    return [
        {
            'id':           r['id'],
            'name':         r['name'],
            'cuisine_type': r['cuisine_type'],
            'course':       r['course'],
            'community':    r['community'],
            'ingredients':  r['ingredient_list'] or '',
        }
        for r in rows
    ]


# ── /ai/recommend ─────────────────────────────────────────────────────────────

@ai_bp.route('/ai/recommend', methods=['POST'])
def ai_recommend():
    """
    After a user views a recipe, suggest 3 related ones.
    Body: { "recipe_id": 12 }
    """
    data      = request.get_json(force=True) or {}
    recipe_id = data.get('recipe_id')

    if not recipe_id:
        return jsonify({'error': 'recipe_id is required'}), 400

    current = query(
        """
        SELECT r.id, r.name, r.cuisine_type, r.course, r.community,
               v.ingredient_list
        FROM recipes r
        JOIN recipe_with_ingredients v ON v.id = r.id
        WHERE r.id = %s
        """,
        (recipe_id,), many=False
    )
    if not current:
        return jsonify({'error': 'Recipe not found'}), 404

    recipe_index = [r for r in get_recipe_index() if r['id'] != recipe_id]

    prompt = f"""You are CookSmart, an AI recipe assistant specialising in African cuisine.

A user just viewed this recipe:
- Name: {current['name']}
- Cuisine: {current['cuisine_type']}
- Course: {current['course']}
- Community: {current['community']}
- Ingredients: {current['ingredient_list']}

From the database below, pick 3 recipes the user would enjoy next.
Consider: shared ingredients, same cuisine, same course, or complementary dishes.

Database:
{json.dumps(recipe_index, indent=2)}

Respond ONLY with a valid JSON array. No markdown, no extra text.
Format:
[
  {{
    "recipe_id": 5,
    "name": "Recipe Name",
    "reason": "One sentence why this pairs well."
  }}
]"""

    try:
        raw = call_llm([{"role": "user", "content": prompt}], max_tokens=600)
        raw = raw.replace('```json', '').replace('```', '').strip()
        recs = json.loads(raw)

        enriched = []
        for r in recs:
            recipe = query(
                "SELECT id, name, local_name, cuisine_type, course, community, description, image_url FROM recipes WHERE id = %s",
                (r['recipe_id'],), many=False
            )
            if recipe:
                enriched.append({**dict(recipe), 'ai_reason': r.get('reason', '')})

        return jsonify({'based_on': current['name'], 'recommendations': enriched})

    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format. Please try again.'}), 500
    except Exception as e:
        print(f"AI recommend error: {e}")
        return jsonify({'recommendations': [], 'based_on': current['name']}), 200


# ── /ai/suggest ───────────────────────────────────────────────────────────────

@ai_bp.route('/ai/suggest', methods=['POST'])
def ai_suggest():
    """
    Given user's ingredients, use the LLM to suggest matching recipes from the DB.
    Body: { "ingredients": ["tomato", "onion", "chicken"] }
    Returns: { "suggestions": [...recipes with ai_reason...] }
    """
    data        = request.get_json(force=True) or {}
    ingredients = [i.strip().lower() for i in data.get('ingredients', []) if i.strip()]

    if not ingredients:
        return jsonify({'suggestions': []}), 200

    recipe_index = get_recipe_index()

    prompt = f"""You are CookSmart, an AI recipe assistant specialising in Ugandan and East African cuisine.

A user has these ingredients available: {', '.join(ingredients)}

From the recipe database below, pick 3 recipes the user could make.
Prioritise recipes that use the most of these ingredients. Focus on traditional Ugandan and East African dishes where possible.

Database:
{json.dumps(recipe_index, indent=2)}

Respond ONLY with a valid JSON array. No markdown, no extra text.
Format:
[
  {{
    "recipe_id": 5,
    "name": "Recipe Name",
    "reason": "One sentence explaining why this matches the available ingredients."
  }}
]"""

    try:
        raw = call_llm([{"role": "user", "content": prompt}], max_tokens=600)
        raw = raw.replace('```json', '').replace('```', '').strip()
        recs = json.loads(raw)

        enriched = []
        for r in recs:
            recipe = query(
                "SELECT id, name, local_name, cuisine_type, course, community, description, image_url FROM recipes WHERE id = %s",
                (r['recipe_id'],), many=False
            )
            if recipe:
                enriched.append({**dict(recipe), 'ai_reason': r.get('reason', '')})

        return jsonify({'suggestions': enriched})

    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format.'}), 500
    except Exception as e:
        print(f"AI suggest error: {e}")
        return jsonify({'suggestions': []}), 200


# ── /ai/generate ──────────────────────────────────────────────────────────────

@ai_bp.route('/ai/generate', methods=['POST'])
def ai_generate():
    """
    Generate a brand-new Ugandan/East African recipe from scratch — the core generative AI feature.
    Body: { "ingredients": ["tomato", "onion", "chicken"] }
    Returns: { "recipe": { dish_name, local_name, cuisine, cooking_time, servings,
                           description, ingredients, steps, tips } }
    """
    data        = request.get_json(force=True) or {}
    ingredients = [i.strip() for i in data.get('ingredients', []) if i.strip()]

    if not ingredients:
        return jsonify({'error': 'Please provide at least 1 ingredient.'}), 400

    prompt = f"""You are a master chef specialising in authentic Ugandan and East African cuisine.

The user has these ingredients available: {', '.join(ingredients)}

Create a complete, authentic Ugandan or East African recipe using some or all of these ingredients.
Be specific with quantities, cooking methods, and traditional techniques.

Respond ONLY with a valid JSON object. No markdown, no extra text. No trailing commas.
Format:
{{
  "dish_name": "Name of the dish in English",
  "local_name": "Local or traditional name if applicable, otherwise null",
  "cuisine": "Ugandan or East African",
  "cooking_time": "Total time e.g. 45 minutes",
  "servings": "e.g. 4 people",
  "description": "Two sentences describing the dish and its cultural significance.",
  "ingredients": [
    {{ "item": "ingredient name", "quantity": "amount and unit e.g. 2 cups" }}
  ],
  "steps": [
    "Step 1: Detailed instruction.",
    "Step 2: Next instruction."
  ],
  "tips": "A useful cooking tip or serving suggestion."
}}"""

    try:
        raw = call_llm([{"role": "user", "content": prompt}], max_tokens=1024)
        raw = raw.replace('```json', '').replace('```', '').strip()
        recipe = json.loads(raw)
        return jsonify({'recipe': recipe, 'ingredients_used': ingredients})

    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format. Please try again.'}), 500
    except Exception as e:
        print(f"AI generate error: {e}")
        return jsonify({'error': 'Failed to generate recipe. Please try again.'}), 500
