-- CookSmart PostgreSQL Schema (Production)
-- Run this on Railway via pgAdmin or psql

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── RECIPES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    local_name      VARCHAR(255),
    cuisine_type    VARCHAR(20)  NOT NULL DEFAULT 'african'
                        CHECK (cuisine_type IN ('african', 'western', 'fusion')),
    course          VARCHAR(30)  NOT NULL DEFAULT 'main'
                        CHECK (course IN ('main','side','sauce','beverage','breakfast','snack','seasoning','soup')),
    community       VARCHAR(100),
    description     TEXT,
    instructions    TEXT,
    serving_suggestion    TEXT,
    alternative_cooking   TEXT,
    prep_time       INTEGER,
    cook_time       INTEGER,
    servings        INTEGER,
    image_url       TEXT,
    ingredients_display TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── INGREDIENTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
    id       SERIAL PRIMARY KEY,
    name     VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(50)
);

-- ── RECIPE <-> INGREDIENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id            SERIAL PRIMARY KEY,
    recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      VARCHAR(255),
    unit          VARCHAR(100),
    is_optional   BOOLEAN DEFAULT FALSE,
    UNIQUE (recipe_id, ingredient_id)
);

-- ── USERS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── TAGS ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id        SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag       VARCHAR(100) NOT NULL,
    UNIQUE (recipe_id, tag)
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipes_name_trgm
    ON recipes USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_recipes_local_name_trgm
    ON recipes USING gin(lower(local_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ingredients_name_trgm
    ON ingredients USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine   ON recipes(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_recipes_course    ON recipes(course);
CREATE INDEX IF NOT EXISTS idx_recipes_community ON recipes(community);
CREATE INDEX IF NOT EXISTS idx_ri_recipe         ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_ri_ingredient     ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag          ON tags(tag);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── VIEWS ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW recipe_with_ingredients AS
SELECT
    r.id, r.name, r.local_name, r.cuisine_type, r.course, r.community,
    r.description, r.instructions, r.serving_suggestion, r.alternative_cooking,
    r.prep_time, r.cook_time, r.servings, r.image_url, r.ingredients_display,
    STRING_AGG(i.name, ' | ' ORDER BY i.name) AS ingredient_list,
    ARRAY_AGG(i.name ORDER BY i.name)          AS ingredient_array
FROM recipes r
LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
LEFT JOIN ingredients i         ON i.id = ri.ingredient_id
GROUP BY r.id;

CREATE OR REPLACE VIEW recipe_stats AS
SELECT
    COUNT(*)                                          AS total_recipes,
    COUNT(*) FILTER (WHERE cuisine_type = 'african')  AS african,
    COUNT(*) FILTER (WHERE cuisine_type = 'western')  AS western,
    COUNT(*) FILTER (WHERE cuisine_type = 'fusion')   AS fusion,
    COUNT(DISTINCT community)                          AS communities,
    COUNT(DISTINCT i.id)                               AS unique_ingredients
FROM recipes r
LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
LEFT JOIN ingredients i         ON i.id = ri.ingredient_id;
