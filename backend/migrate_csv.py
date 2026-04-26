"""
CookSmart — Railway Production Migration Script
"""

import os
import csv
import sys
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("❌  DATABASE_URL not set in .env")
    sys.exit(1)

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'CookSmart.csv')
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'db', 'schema.sql')

COURSE_TAGS = {
    'beverage': ['drink'], 'breakfast': ['breakfast'],
    'snack': ['snack', 'quick'], 'side': ['side dish'],
    'sauce': ['sauce'], 'seasoning': ['seasoning'], 'soup': ['soup'],
}

INGREDIENT_CATEGORIES = {
    'meat':'protein','beef':'protein','chicken':'protein','fish':'protein',
    'pork':'protein','lamb':'protein','egg':'protein','beans':'protein',
    'groundnut':'protein','peanut':'protein','liver':'protein',
    'tomato':'vegetable','onion':'vegetable','potato':'vegetable','yam':'vegetable',
    'cassava':'vegetable','banana':'vegetable','pumpkin':'vegetable','cabbage':'vegetable',
    'carrot':'vegetable','pepper':'vegetable','garlic':'vegetable','spinach':'vegetable',
    'rice':'grain','flour':'grain','maize':'grain','millet':'grain','sorghum':'grain',
    'wheat':'grain','pasta':'grain','bread':'grain',
    'milk':'dairy','cream':'dairy','butter':'dairy','cheese':'dairy','yogurt':'dairy',
    'salt':'spice','ginger':'spice','cinnamon':'spice','turmeric':'spice',
    'coriander':'spice','thyme':'spice','cumin':'spice',
    'water':'liquid','oil':'liquid','stock':'liquid','broth':'liquid','wine':'liquid',
}

def clean(val):
    if val is None: return None
    s = str(val).strip()
    return s if s and s.lower() not in ('nan','none','') else None

def get_category(name):
    nl = name.lower()
    for k, v in INGREDIENT_CATEGORIES.items():
        if k in nl: return v
    return 'other'

def pipe_list(val):
    if not val: return []
    return [i.strip() for i in str(val).split('|') if i.strip()]

def build_tags(row):
    tags = [row.get('cuisine_type','african')]
    if c := clean(row.get('community')): tags.append(c.lower())
    course = clean(row.get('course')) or 'main'
    tags.extend(COURSE_TAGS.get(course, []))
    desc     = (clean(row.get('description')) or '').lower()
    name_low = (clean(row.get('name'))        or '').lower()
    if any(w in desc for w in ['vegan','plant-based']): tags.append('vegan')
    if any(w in desc for w in ['quick','fast','easy']): tags.append('quick')
    if any(w in desc for w in ['festive','celebration']): tags.append('festive')
    if any(w in desc for w in ['spicy','chilli','chili']): tags.append('spicy')
    _grill = any(w in desc or w in name_low for w in ['grill', 'roast', 'barbecue', 'bbq', 'braai', 'choma'])
    _meat  = any(w in desc or w in name_low for w in ['meat', 'goat', 'beef', 'chicken', 'pork', 'lamb', 'fish'])
    if _grill:
        tags.append('grilled')
    if _grill and _meat:
        tags.append('roasted meat')
    return list(set(tags))


def migrate():
    print("🚀  CookSmart production migration starting...")

    if not os.path.exists(CSV_PATH):
        print(f"❌  CSV not found: {CSV_PATH}")
        sys.exit(1)

    with open(CSV_PATH, newline='', encoding='utf-8', errors='replace') as f:
        rows = list(csv.DictReader(f))
    print(f"📄  Loaded {len(rows)} recipes")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        cur = conn.cursor()
        print("✅  Connected to Railway PostgreSQL")
    except Exception as e:
        print(f"❌  Connection failed: {e}")
        sys.exit(1)

    try:
        # Apply schema
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            cur.execute(f.read())
        print("📋  Schema applied")

        # Fix column types to TEXT so no length issues ever
        cur.execute("ALTER TABLE recipe_ingredients ALTER COLUMN quantity TYPE TEXT;")
        cur.execute("ALTER TABLE recipe_ingredients ALTER COLUMN unit TYPE TEXT;")
        print("🔧  Column types fixed")

        # Clear existing data
        cur.execute("TRUNCATE recipes, ingredients, recipe_ingredients, tags RESTART IDENTITY CASCADE;")
        print("🗑️   Cleared existing data")

        # Ingredients
        all_names = set()
        for row in rows:
            for n in pipe_list(row.get('ingredient_names','')):
                if c := clean(n): all_names.add(c.lower())

        execute_values(cur,
            "INSERT INTO ingredients (name, category) VALUES %s ON CONFLICT (name) DO NOTHING",
            [(n, get_category(n)) for n in sorted(all_names)]
        )
        cur.execute("SELECT id, name FROM ingredients;")
        ing_map = {name: iid for iid, name in cur.fetchall()}
        print(f"🥕  {len(ing_map)} ingredients")

        # Recipes
        recipe_rows = []
        for idx, row in enumerate(rows, start=1):
            name = clean(row.get('name'))
            image_url = f"/images/id_{idx} {name}.jpg" if name else None
            recipe_rows.append((
                name,
                clean(row.get('local_name')),
                clean(row.get('cuisine_type')) or 'african',
                clean(row.get('course')) or 'main',
                clean(row.get('community')),
                clean(row.get('description')),
                clean(row.get('instructions')),
                clean(row.get('serving_suggestion')),
                clean(row.get('alternative_cooking')),
                int(row['prep_time'])  if clean(row.get('prep_time'))  else None,
                int(row['cook_time'])  if clean(row.get('cook_time'))  else None,
                int(row['servings'])   if clean(row.get('servings'))   else None,
                image_url,
                clean(row.get('ingredients')),
            ))

        execute_values(cur, """
            INSERT INTO recipes
              (name, local_name, cuisine_type, course, community, description,
               instructions, serving_suggestion, alternative_cooking,
               prep_time, cook_time, servings, image_url, ingredients_display)
            VALUES %s RETURNING id
        """, recipe_rows)
        inserted_ids = [r[0] for r in cur.fetchall()]
        print(f"🍲  {len(inserted_ids)} recipes")

        # Recipe ingredients — store full ingredient string as quantity
        ri_rows = []
        for db_id, row in zip(inserted_ids, rows):
            names = pipe_list(row.get('ingredient_names',''))
            fulls = pipe_list(row.get('ingredients',''))
            for i, ing_name in enumerate(names):
                key = ing_name.lower()
                if key not in ing_map: continue
                full = fulls[i] if i < len(fulls) else ing_name
                ri_rows.append((db_id, ing_map[key], full, None, False))

        execute_values(cur,
            "INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, is_optional) VALUES %s ON CONFLICT DO NOTHING",
            ri_rows
        )
        print(f"🔗  {len(ri_rows)} ingredient links")

        # Tags
        tag_rows = []
        for db_id, row in zip(inserted_ids, rows):
            for tag in build_tags(row):
                tag_rows.append((db_id, tag))
        execute_values(cur, "INSERT INTO tags (recipe_id, tag) VALUES %s ON CONFLICT DO NOTHING", tag_rows)
        print(f"🏷️   {len(tag_rows)} tags")

        conn.commit()
        print("\n✅  Migration complete! CookSmart is live.")

        cur.execute("SELECT COUNT(*) as total FROM recipes;")
        count = cur.fetchone()[0]
        print(f"\n📊  Recipes in live database: {count}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌  Error: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    migrate()