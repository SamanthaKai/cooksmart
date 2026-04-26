#!/usr/bin/env python3
"""
One-time migration: add 'grilled' and 'roasted meat' tags to existing recipes
whose names or descriptions indicate a grilled or roasted meat dish.

Run once against the live database:
    python backend/add_missing_tags.py

Safe to re-run — uses ON CONFLICT DO NOTHING.
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
DB_CONFIG = {
    'host':     os.getenv('DB_HOST',     'localhost'),
    'port':     int(os.getenv('DB_PORT', 5432)),
    'dbname':   os.getenv('DB_NAME',     'cooksmart'),
    'user':     os.getenv('DB_USER',     'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
}

GRILL_WORDS = ['grill', 'roast', 'barbecue', 'bbq', 'braai', 'choma']
MEAT_WORDS  = ['meat', 'goat', 'beef', 'chicken', 'pork', 'lamb', 'fish']


def main():
    try:
        conn = psycopg2.connect(DATABASE_URL) if DATABASE_URL else psycopg2.connect(**DB_CONFIG)
        cur  = conn.cursor()
        print(f"Connected to {'Railway' if DATABASE_URL else DB_CONFIG['dbname']}.")
    except Exception as e:
        print(f"DB connection failed: {e}")
        sys.exit(1)

    try:
        cur.execute("SELECT id, name, description FROM recipes;")
        recipes = cur.fetchall()
        print(f"Scanning {len(recipes)} recipes...")

        added = 0
        for rid, name, desc in recipes:
            name_l = (name or '').lower()
            desc_l = (desc or '').lower()

            has_grill = any(w in name_l or w in desc_l for w in GRILL_WORDS)
            has_meat  = any(w in name_l or w in desc_l for w in MEAT_WORDS)

            tags_to_add = []
            if has_grill:
                tags_to_add.append('grilled')
            if has_grill and has_meat:
                tags_to_add.append('roasted meat')

            for tag in tags_to_add:
                cur.execute(
                    "INSERT INTO tags (recipe_id, tag) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (rid, tag)
                )
                if cur.rowcount > 0:
                    print(f"  + [{name}] → '{tag}'")
                    added += 1

        conn.commit()
        print(f"\nDone. {added} new tag(s) added.")

    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
