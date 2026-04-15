# CookSmart – Project Status

## What this project is
**CookSmart** is a university graded project: an AI-powered recipe recommendation system focused on Ugandan cuisine. Built by a student group at Mbarara University of Science and Technology (MUST).

**Stack:** Flask 3 (backend) · React 18 + Vite (frontend) · PostgreSQL (Render) · Deployed on Vercel + Render

---

## Professor's requirements — status

| Requirement | Status | Notes |
|---|---|---|
| Login / Sign-up page | ✅ Done | Full auth with JWT-style tokens |
| Visible AI algorithm | ✅ Done | Match score shown as "X of Y matched (Z%)" |
| Generative AI feature | ✅ Done | "Generate with AI" mode, clearly labelled |
| Ingredient search | ✅ Exists | Kept and improved with match scoring |
| Ugandan cuisine focus | ✅ Done | All AI prompts specify Ugandan/East African context |

---

## What was built (current state)

### Authentication
- Sign up with name, email, password · Log in with email + password
- Tokens signed with `itsdangerous` (werkzeug password hashing)
- Token stored in `localStorage`, sent as `Authorization: Bearer <token>` on every API call
- App is fully gated — login page shows before anything else
- `users` table auto-created on first auth request (also in `schema.sql`)
- **Files:** `backend/routes/auth.py`, `frontend/src/pages/LoginPage.jsx`, `frontend/src/App.jsx`

### AI Recipe Generator (generative AI feature)
- Third mode tab in the hero: **"✨ Generate with AI"**
- User adds ingredient pills → clicks "Generate Recipe"
- Backend calls the configured LLM with a Ugandan/East African cuisine prompt
- Returns a brand-new recipe: dish name, local name, description, ingredients with quantities, step-by-step instructions, cooking time, servings, chef's tip
- Result displayed in a styled full-width panel labelled **"AI-Generated Recipe"**
- **Files:** `backend/routes/ai_suggest.py` (`/api/ai/generate`), `frontend/src/pages/Home.jsx`

### Ingredient Match Scoring (visible algorithm)
- Search results now show **"3 of 5 ingredients matched (60%)"** on every recipe card
- Results sorted by match count descending (most matched first)
- Exact matches and partial matches shown in separate sections
- **Files:** `backend/routes/ingredients.py`, `frontend/src/components/RecipeCard.jsx`

### LLM Provider (switchable — no paid API required)
- Controlled by `LLM_PROVIDER` in `.env` — switch between `groq` or `ollama`
- Uses `httpx` (already a project dependency) — no new packages needed
- **Groq** (default): free cloud inference at `console.groq.com`
- **Ollama**: fully local/offline inference
- **File:** `backend/routes/ai_suggest.py` (`call_llm()` helper), `backend/.env`

### Also fixed
- `POST /api/ai/suggest` was declared but never implemented — now works
- Login page uses `background.jpg` with a dark gradient overlay

---

## Environment variables (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Signs auth tokens (change in production) |
| `LLM_PROVIDER` | `groq` or `ollama` |
| `GROQ_API_KEY` | Free API key from console.groq.com |
| `GROQ_MODEL` | Default: `llama-3.1-8b-instant` |
| `OLLAMA_BASE_URL` | Default: `http://localhost:11434` |
| `OLLAMA_MODEL` | Default: `gemma3:1b` |

---

## Pending / not yet done

| Item | Priority | Notes |
|---|---|---|
| Dietary/preference filters | Low | Vegetarian, no nuts, quick meals (<30 min) checkboxes |
| Deploy updated backend to Render | — | Push changes and redeploy; ensure env vars are set on Render |
| Set `SECRET_KEY` to a real secret in production | — | Currently using a dev default |
