const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000") + "/api";

async function req(url, options = {}) {
  const res = await fetch(BASE + url, options);
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

export const api = {
  suggest:           (q)           => req(`/suggest?q=${encodeURIComponent(q)}`),
  search:            (params)      => req(`/search?${new URLSearchParams(params)}`),
  recipes:           (params)      => req(`/recipes?${new URLSearchParams(params)}`),
  recipe:            (id)          => req(`/recipes/${id}`),
  searchIngredients: (body)        => req("/search/ingredients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  ingredientSuggest: (q)           => req(`/ingredients/suggest?q=${encodeURIComponent(q)}`),
  aiSuggest:         (ingredients) => req("/ai/suggest",   { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients }) }),
  aiRecommend:       (recipe_id)   => req("/ai/recommend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe_id }) }),
};
