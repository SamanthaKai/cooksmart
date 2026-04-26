#!/usr/bin/env python3
"""
CookSmart Seed Script — Fixed
Reads cooksmart_recipes_clean.csv and loads all recipes into PostgreSQL.
"""

import os
import csv
import sys
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'CookSmart.csv')

DB_CONFIG = {
    'host':     os.getenv('DB_HOST',     'localhost'),
    'port':     int(os.getenv('DB_PORT', 5432)),
    'dbname':   os.getenv('DB_NAME',     'cooksmart'),
    'user':     os.getenv('DB_USER',     'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
}

AFRICAN_COMMUNITIES = {'Baganda','Bakiga','Bagisu','Banyoro','Basoga','Acholi','Iteso','Ugandan'}

COURSE_TAGS = {
    'beverage':  ['drink'],
    'breakfast': ['breakfast'],
    'snack':     ['snack', 'quick'],
    'side':      ['side dish'],
    'sauce':     ['sauce'],
    'seasoning': ['seasoning', 'condiment'],
    'soup':      ['soup'],
}

INGREDIENT_CATEGORIES = {
    'meat':'protein','beef':'protein','chicken':'protein','fish':'protein',
    'pork':'protein','lamb':'protein','egg':'protein','eggs':'protein',
    'liver':'protein','groundnut':'protein','peanut':'protein','beans':'protein',
    'tomato':'vegetable','onion':'vegetable','spinach':'vegetable','potato':'vegetable',
    'yam':'vegetable','cassava':'vegetable','banana':'vegetable','pumpkin':'vegetable',
    'cabbage':'vegetable','mushroom':'vegetable','carrot':'vegetable','pepper':'vegetable',
    'eggplant':'vegetable','garlic':'vegetable',
    'rice':'grain','flour':'grain','maize':'grain','millet':'grain',
    'sorghum':'grain','wheat':'grain','pasta':'grain','bread':'grain',
    'milk':'dairy','cream':'dairy','butter':'dairy','cheese':'dairy','yogurt':'dairy',
    'salt':'spice','cumin':'spice','ginger':'spice','cinnamon':'spice',
    'turmeric':'spice','coriander':'spice','thyme':'spice','rosemary':'spice',
    'lemongrass':'herb','basil':'herb','parsley':'herb',
    'water':'liquid','oil':'liquid','stock':'liquid','broth':'liquid',
    'wine':'liquid','vinegar':'liquid',
}


def clean(val):
    if val is None: return None
    s = str(val).strip()
    return s if s and s.lower() not in ('nan', 'none', '') else None


def get_ingredient_category(name):
    name_lower = name.lower()
    for keyword, category in INGREDIENT_CATEGORIES.items():
        if keyword in name_lower:
            return category
    return 'other'


def parse_pipe_list(val):
    if not val: return []
    return [item.strip() for item in str(val).split('|') if item.strip()]


def build_tags(row):
    tags = []
    tags.append(row.get('cuisine_type', 'african'))
    if community := clean(row.get('community')):
        tags.append(community.lower())
    course = clean(row.get('course')) or 'main'
    tags.extend(COURSE_TAGS.get(course, []))
    desc      = (clean(row.get('description'))   or '').lower()
    name_low  = (clean(row.get('name'))          or '').lower()
    if any(w in desc for w in ['vegan', 'plant-based', 'no meat']):
        tags.append('vegan')
    if any(w in desc for w in ['quick', 'fast', 'easy']):
        tags.append('quick')
    if any(w in desc for w in ['festive', 'celebration', 'wedding']):
        tags.append('festive')
    if any(w in desc for w in ['spicy', 'hot pepper', 'chilli', 'chili']):
        tags.append('spicy')
    # Cooking-method tags so 'roasted meat' / 'grilled' searches surface these dishes
    _grill = any(w in desc or w in name_low for w in ['grill', 'roast', 'barbecue', 'bbq', 'braai', 'choma'])
    _meat  = any(w in desc or w in name_low for w in ['meat', 'goat', 'beef', 'chicken', 'pork', 'lamb', 'fish'])
    if _grill:
        tags.append('grilled')
    if _grill and _meat:
        tags.append('roasted meat')
    return list(set(tags))


def seed():
    print("🌱  CookSmart seed starting...")

    if not os.path.exists(CSV_PATH):
        print(f"❌  CSV not found at: {CSV_PATH}")
        sys.exit(1)

    with open(CSV_PATH, newline='', encoding='utf-8', errors='replace') as f:
        rows = list(csv.DictReader(f))
    print(f"📄  Loaded {len(rows)} recipes from CSV")

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        print(f"✅  Connected to PostgreSQL ({DB_CONFIG['dbname']}@{DB_CONFIG['host']})")
    except psycopg2.OperationalError as e:
        print(f"❌  DB connection failed: {e}")
        sys.exit(1)

    try:
        cur.execute("TRUNCATE recipes, ingredients, recipe_ingredients, tags RESTART IDENTITY CASCADE;")
        print("🗑️   Cleared existing data")

        # ── Ingredients ───────────────────────────────────────────────────────
        all_ingredient_names = set()
        for row in rows:
            for name in parse_pipe_list(row.get('ingredient_names', '')):
                n = clean(name)
                if n: all_ingredient_names.add(n.lower())

        ingredient_data = [(name, get_ingredient_category(name)) for name in sorted(all_ingredient_names)]
        execute_values(cur, "INSERT INTO ingredients (name, category) VALUES %s ON CONFLICT (name) DO NOTHING", ingredient_data)
        cur.execute("SELECT id, name FROM ingredients;")
        ingredient_map = {name: iid for iid, name in cur.fetchall()}
        print(f"🥕  Inserted {len(ingredient_map)} unique ingredients")

        # ── Recipes (now includes ingredients_display) ────────────────────────
        recipe_rows = []
        for idx, row in enumerate(rows, start=1):  # ← ADDED: idx is the recipe ID
            recipe_name = clean(row.get('name'))
            # Generate local image path (without extension - frontend will try .jpg, .png, etc.)
            local_image_path = f"/images/id_{idx} {recipe_name}"
            
            recipe_rows.append((
                clean(row.get('name')),
                clean(row.get('local_name')),
                clean(row.get('cuisine_type')) or 'african',
                clean(row.get('course'))        or 'main',
                clean(row.get('community')),
                clean(row.get('description')),
                clean(row.get('instructions')),
                clean(row.get('serving_suggestion')),
                clean(row.get('alternative_cooking')),
                int(row['prep_time'])  if clean(row.get('prep_time'))  else None,
                int(row['cook_time'])  if clean(row.get('cook_time'))  else None,
                int(row['servings'])   if clean(row.get('servings'))   else None,
                local_image_path,  # ← CHANGED: use local path instead of CSV
                clean(row.get('ingredients')),   # ← full display with quantities
            ))

        execute_values(
            cur,
            """
            INSERT INTO recipes
              (name, local_name, cuisine_type, course, community, description,
               instructions, serving_suggestion, alternative_cooking,
               prep_time, cook_time, servings, image_url, ingredients_display)
            VALUES %s
            RETURNING id
            """,
            recipe_rows
        )
        inserted_ids = [r[0] for r in cur.fetchall()]
        print(f"🍲  Inserted {len(inserted_ids)} recipes")

        # ── Recipe ingredients ────────────────────────────────────────────────
        ri_rows = []
        for db_id, row in zip(inserted_ids, rows):
            ingredient_names = parse_pipe_list(row.get('ingredient_names', ''))
            ingredients_full = parse_pipe_list(row.get('ingredients', ''))
            for idx, ing_name in enumerate(ingredient_names):
                ing_key = ing_name.lower()
                if ing_key not in ingredient_map: continue
                ing_id = ingredient_map[ing_key]
                full = ingredients_full[idx] if idx < len(ingredients_full) else ing_name

                # Parse quantity and unit from the full ingredient string
                quantity = None
                unit = None

                # Try to extract quantity (number + optional unit)
                import re
                match = re.match(r'^([\d\s\.\-/]+)\s*(.+)$', full.strip())
                if match:
                    qty_part = match.group(1).strip()
                    name_part = match.group(2).strip()

                    # Check if qty_part contains actual quantity info
                    if re.search(r'\d', qty_part):  # Contains numbers
                        quantity = qty_part[:50]  # Limit to 50 chars
                        unit = name_part[:50] if name_part else None
                    else:
                        # No quantity, just the ingredient name
                        unit = full[:50]
                else:
                    # Fallback: put everything in unit field
                    unit = full[:50]

                ri_rows.append((db_id, ing_id, quantity, unit, False))

        execute_values(
            cur,
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, is_optional) VALUES %s ON CONFLICT (recipe_id, ingredient_id) DO NOTHING",
            ri_rows
        )
        print(f"🔗  Inserted {len(ri_rows)} recipe-ingredient links")

        # ── Tags ──────────────────────────────────────────────────────────────
        tag_rows = []
        for db_id, row in zip(inserted_ids, rows):
            for tag in build_tags(row):
                tag_rows.append((db_id, tag))
        execute_values(cur, "INSERT INTO tags (recipe_id, tag) VALUES %s ON CONFLICT DO NOTHING", tag_rows)
        print(f"🏷️   Inserted {len(tag_rows)} tags")

        conn.commit()
        print("\n✅  Seed complete!")

        cur.execute("SELECT * FROM recipe_stats;")
        cols = [desc[0] for desc in cur.description]
        stats = dict(zip(cols, cur.fetchone()))
        print("\n📊  Database stats:")
        for k, v in stats.items():
            print(f"     {k:<25} {v}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  Error: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    seed()