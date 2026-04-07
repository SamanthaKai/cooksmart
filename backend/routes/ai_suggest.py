#ai_suggest.p

"""
CookSmart — AI Routes (Claude-powered)

POST /api/ai/suggest        Smart recipe suggestions from ingredients
POST /api/ai/recommend      Related recipes after viewing one
"""

import os
import json
import anthropic
from flask import Blueprint, request, jsonify
from db import query

ai_bp = Blueprint('ai', __name__)
_client = None

def get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    return _client


def get_recipe_index():
    """
    Fetch a lightweight index of all recipes for Claude to reason over.
    We only send id, name, cuisine_type, and top ingredients — not full instructions.
    This keeps the prompt small and fast.
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

    # Get the current recipe
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

    recipe_index = get_recipe_index()
    # Remove the current recipe from the index
    recipe_index = [r for r in recipe_index if r['id'] != recipe_id]

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
        message = get_client().messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = message.content[0].text.strip()
        raw = raw.replace('```json', '').replace('```', '').strip()
        recs = json.loads(raw)

        enriched = []
        for r in recs:
            recipe = query(
                "SELECT id, name, local_name, cuisine_type, course, community, description, image_url FROM recipes WHERE id = %s",
                (r['recipe_id'],), many=False
            )
            if recipe:  # Only add if recipe exists
                enriched.append({**dict(recipe), 'ai_reason': r.get('reason', '')})

        return jsonify({
            'based_on':       current['name'],
            'recommendations': enriched,
        })

    except json.JSONDecodeError:
        return jsonify({'error': 'AI returned an unexpected format. Please try again.'}), 500
    except Exception as e:
        # Log the error but return empty recommendations instead of 500
        print(f"AI recommend error: {e}")
        return jsonify({'recommendations': [], 'based_on': current['name']}), 200