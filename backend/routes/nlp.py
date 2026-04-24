"""
CookSmart — NLP Routes

POST /api/nlp/extract
    Body:    { "text": "I have chicken, some tomatoes and a bit of garlic" }
    Returns: { "ingredients": ["chicken", "tomatoes", "garlic"], "unmatched": [] }

Two-stage pipeline:
  1. LLM (Groq) extracts ingredient names from natural language  →  fast, handles
     messy input like "a handful of fresh coriander leaves" → "coriander"
  2. Rule-based fallback when Groq is unavailable or the key isn't set yet
  3. DB fuzzy-match to normalise each candidate against the ingredients table
"""

import os
import re
import json
import httpx
from flask import Blueprint, request, jsonify
from db import query

nlp_bp = Blueprint('nlp', __name__)

# Common filler words/phrases to strip before rule-based splitting
_FILLERS = [
    "i have", "i've got", "i got", "i've", "we have", "we've got",
    "there is", "there are", "there's",
    "in my kitchen", "in my fridge", "in my pantry", "at home",
    "available", "on hand", "leftover", "left over",
    "a little bit of", "a bit of", "a couple of", "a handful of",
    "a few", "some", "fresh", "dried", "cooked", "raw", "chopped",
    "sliced", "diced", "minced", "grated", "whole", "large", "small",
    "medium", "ripe", "ripe", "half", "a", "an", "the",
]


def _rule_extract(text):
    """
    Lightweight rule-based extraction — used when Groq is unavailable.
    Strips filler words then splits on commas / 'and' / 'or' etc.
    """
    t = text.lower()
    for phrase in sorted(_FILLERS, key=len, reverse=True):   # longest first
        t = re.sub(r'\b' + re.escape(phrase) + r'\b', ',', t)
    parts = re.split(r'[,;/]|\band\b|\bor\b|\bwith\b|\bplus\b|\balso\b', t)
    return [p.strip(' .,!?') for p in parts if p.strip(' .,!?') and len(p.strip()) > 1]


def _llm_extract(text):
    """
    Use Groq to extract food-related terms from natural language.
    Returns a list of ingredient/food names. Works on both simple lists
    and full-sentence descriptions (including health context).
    """
    api_key = os.getenv('GROQ_API_KEY', '')
    if not api_key:
        return None            # signal: fall back to rule-based

    model = os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant')
    prompt = (
        "Extract food ingredients, herbs, drinks, or food items mentioned in the text below.\n"
        "Rules:\n"
        "- Include all food items: ingredients, beverages, herbs, spices, teas\n"
        "- Use short names (e.g. 'lemon grass', 'ginger', 'green tea')\n"
        "- Skip non-food words (e.g. 'diabetes', 'serving', 'quantities')\n"
        "- Remove quantities and adjectives but keep the food name\n"
        "- Return ONLY a JSON array of strings. No markdown, no explanation.\n\n"
        f"Text: \"{text}\"\n\n"
        "Examples:\n"
        "  Input: \"I have chicken, tomatoes and garlic\"\n"
        "  Output: [\"chicken\", \"tomatoes\", \"garlic\"]\n\n"
        "  Input: \"I have diabetes and I want lemon grass tea with very little sugar\"\n"
        "  Output: [\"lemon grass\", \"sugar\"]\n\n"
        "  Input: \"Make me ginger and mint tea for 2 people\"\n"
        "  Output: [\"ginger\", \"mint\"]"
    )
    payload = {
        'model': model,
        'messages': [{"role": "user", "content": prompt}],
        'max_tokens': 150,
        'temperature': 0.1,
    }
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    r = httpx.post('https://api.groq.com/openai/v1/chat/completions',
                   json=payload, headers=headers, timeout=15)
    r.raise_for_status()
    raw = r.json()['choices'][0]['message']['content']
    raw = raw.replace('```json', '').replace('```', '').strip()
    return json.loads(raw)


def _db_match(candidates):
    """
    For each candidate, find the closest match in the ingredients table.
    Returns (matched_list, unmatched_list).
    """
    matched   = []
    unmatched = []

    for c in candidates:
        c = c.strip().lower()
        if not c or len(c) < 2:
            continue

        row = query(
            """
            SELECT name
            FROM ingredients
            WHERE LOWER(name) = %s
               OR LOWER(name) ILIKE %s
               OR similarity(LOWER(name), %s) > 0.35
            ORDER BY
                CASE WHEN LOWER(name) = %s THEN 0
                     WHEN LOWER(name) ILIKE %s THEN 1
                     ELSE 2 END,
                similarity(LOWER(name), %s) DESC
            LIMIT 1
            """,
            (c, f'%{c}%', c, c, f'%{c}%', c),
            many=False
        )

        if row:
            name = row['name'].lower()
            if name not in matched:
                matched.append(name)
        else:
            if c not in unmatched:
                unmatched.append(c)

    return matched, unmatched


@nlp_bp.route('/nlp/extract', methods=['POST'])
def extract_ingredients():
    """
    Parse natural language into a list of ingredient names ready for the
    ingredient search. Uses Groq LLM when available, falls back to rules.
    """
    data = request.get_json(force=True) or {}
    text = data.get('text', '').strip()

    if not text or len(text) < 3:
        return jsonify({'ingredients': [], 'unmatched': [], 'method': 'none'}), 200

    # ── Stage 1: extract raw candidates ──────────────────────────────────────
    method = 'llm'
    try:
        candidates = _llm_extract(text)
        if candidates is None:
            raise ValueError('no key')
    except Exception:
        method     = 'rules'
        candidates = _rule_extract(text)

    if not candidates:
        return jsonify({'ingredients': [], 'unmatched': [], 'method': method}), 200

    # ── Stage 2: normalise against DB ────────────────────────────────────────
    matched, unmatched = _db_match(candidates)

    # When nothing matched the DB (e.g. "lemon grass tea"), return the raw
    # candidates so the frontend can still proceed to /ai/generate with the
    # full context. The AI handles novel/unlisted ingredients fine.
    ingredients_out = matched if matched else unmatched

    return jsonify({
        'ingredients': ingredients_out,
        'unmatched':   unmatched,
        'method':      method,
    })
