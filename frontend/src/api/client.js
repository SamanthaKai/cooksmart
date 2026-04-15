// In dev (no VITE_API_URL): use relative "/api" so Vite's proxy handles it — no CORS.
// In production: VITE_API_URL is set to the deployed backend URL.
const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

function getToken() {
  return localStorage.getItem("cooksmart_token") || "";
}

async function req(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + url, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the server. Please check your connection.");
  }

  if (!res.ok) {
    let msg = "Request failed";
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const JSON_POST = (url, body) =>
  req(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  register: (body) => JSON_POST("/auth/register", body),
  login:    (body) => JSON_POST("/auth/login", body),
  me:       ()     => req("/auth/me"),

  // ── Profile ───────────────────────────────────────────────────────────────
  getProfile:    ()     => req("/profile"),
  updateProfile: (body) => req("/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),

  // ── Recipes ───────────────────────────────────────────────────────────────
  suggest:           (q)      => req(`/suggest?q=${encodeURIComponent(q)}`),
  search:            (params) => req(`/search?${new URLSearchParams(params)}`),
  recipes:           (params) => req(`/recipes?${new URLSearchParams(params)}`),
  recipe:            (id)     => req(`/recipes/${id}`),
  searchIngredients: (body)   => JSON_POST("/search/ingredients", body),
  ingredientSuggest: (q)      => req(`/ingredients/suggest?q=${encodeURIComponent(q)}`),

  // ── AI ────────────────────────────────────────────────────────────────────
  aiSuggest:   (ingredients) => JSON_POST("/ai/suggest",   { ingredients }),
  aiRecommend: (recipe_id)   => JSON_POST("/ai/recommend", { recipe_id }),
  aiGenerate:  (ingredients) => JSON_POST("/ai/generate",  { ingredients }),
};
