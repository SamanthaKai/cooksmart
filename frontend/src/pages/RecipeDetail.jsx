import { useState, useEffect } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import { getRecipeImageUrl } from "../utils/imageHelper";

// Split "200g lemon grass" into { qty: "200g", name: "lemon grass" }
function parseIngredient(raw) {
  raw = raw.trim();
  const match = raw.match(/^([\d½¼¾./\s]+\s*(?:g|kg|ml|l|litre|liter|cup|cups|tbsp|tsp|tablespoon|teaspoon|bunch|bunches|pieces?|oz|lb|medium|large|small|handful|pinch|cloves?|slices?)?)\s+(.+)$/i);
  if (match) return { qty: match[1].trim(), name: match[2].trim() };
  return { qty: null, name: raw };
}

// Hero image: eager-loaded (above the fold), with graceful fallback
function RecipeImage({ recipe, fallbackEmoji }) {
  const sources = getRecipeImageUrl(recipe);
  const [idx, setIdx]       = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) return <span style={{ fontSize: "5rem" }}>{fallbackEmoji}</span>;

  return (
    <>
      {!loaded && (
        <div style={{ width: "100%", height: "100%", background: "var(--cream-dark)", borderRadius: "var(--radius)" }} />
      )}
      <img
        key={sources[idx]}
        src={sources[idx]}
        alt={recipe.name}
        loading="eager"
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity .3s" }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (idx + 1 < sources.length) setIdx(i => i + 1);
          else setFailed(true);
        }}
      />
    </>
  );
}
export default function RecipeDetail({ recipeId, onBack, onSelectRecipe }) {
  const [recipe, setRecipe]           = useState(null);
  const [recos,  setRecos]            = useState([]);
  const [loading, setLoading]         = useState(true);
  const [recoLoading, setRecoLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setRecos([]);
    api.recipe(recipeId)
      .then(data => {
        setRecipe(data);
        setLoading(false);
        setRecoLoading(true);
        api.aiRecommend(recipeId)
          .then(r => setRecos(r.recommendations || []))
          .catch(() => {})
          .finally(() => setRecoLoading(false));
      })
      .catch(() => setLoading(false));
    window.scrollTo(0, 0);
  }, [recipeId]);

  const emoji = (r) => {
    const n = (r?.name || "").toLowerCase();
    if (n.includes("chicken")) return "🍗";
    if (n.includes("fish") || n.includes("tilapia")) return "🐟";
    if (n.includes("beef") || n.includes("meat")) return "🥩";
    if (n.includes("rice") || n.includes("jollof")) return "🍚";
    if (n.includes("soup") || n.includes("stew")) return "🍲";
    if (n.includes("banana") || n.includes("matoke")) return "🍌";
    if (n.includes("bean")) return "🫘";
    if (n.includes("tea") || n.includes("beverage")) return "☕";
    if (r?.course === "beverage") return "🥤";
    if (r?.course === "soup") return "🍜";
    if (r?.cuisine_type === "african") return "🌍";
    return "🍽️";
  };

  if (loading) return (
    <div style={{ paddingTop: "4rem" }}>
      <div className="state-center"><div className="spinner" /><p>Loading recipe…</p></div>
    </div>
  );

  if (!recipe) return (
    <div className="state-center" style={{ paddingTop: "4rem" }}>
      <div className="emoji">😕</div>
      <h3>Recipe not found</h3>
      <button className="back-btn" onClick={onBack}>← Back</button>
    </div>
  );

  // Parse ingredients — prefer ingredients_display (full quantities), fall back to ingredient_list
  const rawIngredients = recipe.ingredients_display || recipe.ingredient_list || "";
  const ingredients = rawIngredients
    .split("|")
    .map(i => i.trim())
    .filter(Boolean)
    .map(parseIngredient);

  // Parse steps
// Replace with:
const steps = (recipe.instructions || "")
    .split(/[.]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);
    
  return (
    <div className="app">
      <nav className="navbar">
        <span className="navbar-brand">Cook<span>Smart</span></span>
        <span style={{ fontSize: ".82rem", color: "var(--stone)" }}>
          {recipe.cuisine_type === "african" ? "🌍 African cuisine" : "🍴 Western cuisine"}
        </span>
      </nav>

      <div className="detail-page">
        <button className="back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back to recipes
        </button>

        {/* Hero image */}
        <div style={{ height: 220, background: "var(--cream-dark)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "5rem", marginBottom: "1.75rem", overflow: "hidden" }}>
          <RecipeImage recipe={recipe} emoji={emoji(recipe)} />
        </div>

        {/* Header */}
        <div className="detail-header">
          <h1 className="detail-title">{recipe.name}</h1>
          {recipe.local_name && recipe.local_name !== recipe.name && (
            <p className="detail-local">{recipe.local_name}</p>
          )}
          <div className="detail-meta">
            <span className="meta-chip cuisine">{recipe.cuisine_type}</span>
            <span className="meta-chip green">{recipe.course}</span>
            {recipe.community && <span className="meta-chip">{recipe.community}</span>}
            {recipe.prep_time  && <span className="meta-chip">⏱ Prep: {recipe.prep_time}min</span>}
            {recipe.cook_time  && <span className="meta-chip">🔥 Cook: {recipe.cook_time}min</span>}
            {recipe.servings   && <span className="meta-chip">👥 Serves {recipe.servings}</span>}
          </div>
          {recipe.description && recipe.description !== "MISSING" && (
            <p className="detail-desc">{recipe.description}</p>
          )}
          {recipe.tags && recipe.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {recipe.tags.map(t => (
                <span key={t} style={{ fontSize: ".78rem", padding: "3px 12px", borderRadius: 99, background: "var(--cream-dark)", color: "var(--earth-dark)" }}>{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Two columns */}
        <div className="detail-cols">

          {/* Ingredients */}
          <div>
            <div className="detail-section">
              <h3>Ingredients</h3>
              {ingredients.length > 0 ? (
                <ul className="ing-list">
                  {ingredients.map((ing, i) => (
                    <li key={i} className="ing-list-item">
                      <span className="ing-name">
                        {ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}
                      </span>
                      {ing.qty && (
                        <span className="ing-qty">{ing.qty}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--stone)", fontSize: ".9rem" }}>No ingredients listed.</p>
              )}
            </div>

            {recipe.serving_suggestion && (
              <div className="serving-box">
                <strong>Serving suggestion:</strong><br />{recipe.serving_suggestion}
              </div>
            )}
            {recipe.alternative_cooking && (
              <div className="serving-box" style={{ marginTop: ".75rem" }}>
                <strong>Alternative method:</strong><br />{recipe.alternative_cooking}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="detail-section">
            <h3>Preparation</h3>
            {steps.length > 0 ? (
              <ol className="steps-list">
                {steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            ) : (
              <p style={{ color: "var(--stone)", fontSize: ".9rem" }}>
                {recipe.instructions || "No instructions available."}
              </p>
            )}
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="reco-section">
          <h2 className="section-heading">
            You might also enjoy
            <span className="ai-badge">CookSmart AI</span>
          </h2>
          {recoLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", color: "var(--stone)", fontSize: ".9rem" }}>
              <div className="spinner" style={{ width: 20, height: 20, margin: 0, borderWidth: 2 }} />
              Finding recommendations…
            </div>
          )}
          {!recoLoading && recos.length > 0 && (
            <div className="reco-grid">
              {recos.map(r => (
                <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)} aiReason={r.ai_reason} />
              ))}
            </div>
          )}
          {!recoLoading && recos.length === 0 && (
            <p style={{ color: "var(--stone)", fontSize: ".9rem" }}>No recommendations available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
