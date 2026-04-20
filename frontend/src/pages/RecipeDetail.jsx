import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import { getRecipeImage } from "../utils/imageHelper";

// Split "200g lemon grass" into { qty: "200g", name: "lemon grass" }
function parseIngredient(raw) {
  raw = raw.trim();
  const match = raw.match(/^([\d½¼¾./\s]+\s*(?:g|kg|ml|l|litre|liter|cup|cups|tbsp|tsp|tablespoon|teaspoon|bunch|bunches|pieces?|oz|lb|medium|large|small|handful|pinch|cloves?|slices?)?)\s+(.+)$/i);
  if (match) return { qty: match[1].trim(), name: match[2].trim() };
  return { qty: null, name: raw };
}

// Hero image fills parent via absolute positioning
function RecipeImage({ recipe, fallbackEmoji }) {
  const [src, setSrc]       = useState(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getRecipeImage(recipe).then(url => {
      if (!active) return;
      if (url) setSrc(url);
      else setFailed(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [recipe.id]);

  if (failed) return (
    <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: "5rem" }}>
      {fallbackEmoji}
    </span>
  );
  if (!src) return null;

  return (
    <img
      src={src}
      alt={recipe.name}
      loading="eager"
      decoding="async"
      fetchpriority="high"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity .3s" }}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
export default function RecipeDetail({ recipeId, onBack, onSelectRecipe, savedIds, likedIds, onToggleSave, onToggleLike, onRequestLogin }) {
  const [recipe, setRecipe]           = useState(null);
  const [recos,  setRecos]            = useState([]);
  const [loading, setLoading]         = useState(true);
  const [recoLoading, setRecoLoading] = useState(false);

  // ── AI features ──────────────────────────────────────────────────────────
  const [showSubs, setShowSubs]         = useState(false);
  const [activeSubIng, setActiveSubIng] = useState(null);
  const [subResults, setSubResults]     = useState(null);
  const [subLoading, setSubLoading]     = useState(false);
  const [subError, setSubError]         = useState("");

  const [tips, setTips]             = useState(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError]   = useState("");

  const [health, setHealth]             = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError]   = useState("");

  // ── Enhancement ──────────────────────────────────────────────────────────
  const [enhanced, setEnhanced]           = useState(null);
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [enhanceError, setEnhanceError]   = useState("");

  // ── Customisation ─────────────────────────────────────────────────────────
  const [showCustomize, setShowCustomize] = useState(false);
  const [custGoal, setCustGoal]           = useState("");
  const [customized, setCustomized]       = useState(null);
  const [custLoading, setCustLoading]     = useState(false);
  const [custError, setCustError]         = useState("");

  async function loadSubstitutes(ingName) {
    setActiveSubIng(ingName);
    setSubResults(null);
    setSubError("");
    setSubLoading(true);
    try {
      const data = await api.aiSubstitutes(recipeId, ingName);
      setSubResults(data.substitutes || []);
    } catch (e) {
      setSubError(e.message);
    } finally {
      setSubLoading(false);
    }
  }

  async function loadTips() {
    setTipsLoading(true); setTipsError("");
    try {
      const data = await api.aiTips(recipeId);
      setTips(data.tips || []);
    } catch (e) {
      setTipsError(e.message);
    } finally {
      setTipsLoading(false);
    }
  }

  async function loadEnhancement() {
    setEnhanceLoading(true); setEnhanceError("");
    try {
      const data = await api.aiEnhance(recipeId);
      setEnhanced(data.enhanced || null);
    } catch (e) {
      setEnhanceError(e.message);
    } finally {
      setEnhanceLoading(false);
    }
  }

  async function loadCustomization() {
    if (!custGoal.trim()) {
      setCustError("Please describe your health goal or condition."); return;
    }
    setCustLoading(true); setCustError(""); setCustomized(null);
    try {
      const data = await api.aiCustomize(recipeId, custGoal);
      setCustomized(data.customized || null);
    } catch (e) {
      setCustError(e.message);
    } finally {
      setCustLoading(false);
    }
  }

  async function loadHealth() {
    setHealthLoading(true); setHealthError("");
    try {
      const data = await api.aiHealth(recipeId);
      setHealth(data.health || null);
    } catch (e) {
      setHealthError(e.message);
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setRecos([]);
    // reset AI panels when recipe changes
    setShowSubs(false); setActiveSubIng(null); setSubResults(null); setSubError("");
    setTips(null); setTipsError("");
    setHealth(null); setHealthError("");
    setEnhanced(null); setEnhanceError("");
    setShowCustomize(false); setCustGoal(""); setCustomized(null); setCustError("");
    api.recipe(recipeId)
      .then(data => {
        setRecipe(data);
        setLoading(false);
        // Record view silently (no-op for guests on the server)
        api.interactionView(recipeId).catch(() => {});
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

        {/* Hero — image fills background, text overlaid */}
        <div className="detail-hero">
          <RecipeImage recipe={recipe} fallbackEmoji={emoji(recipe)} />
          <div className="detail-hero-overlay">
            <div className="detail-hero-top">
              <div className="detail-actions">
                <button
                  className={`detail-action-btn${savedIds?.has(recipe.id) ? " active-save" : ""}`}
                  onClick={() => onToggleSave ? onToggleSave(recipe.id) : onRequestLogin?.()}
                  title={savedIds?.has(recipe.id) ? "Saved" : "Save recipe"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24"
                    fill={savedIds?.has(recipe.id) ? "currentColor" : "none"}
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>{savedIds?.has(recipe.id) ? "Saved" : "Save"}</span>
                </button>
                <button
                  className={`detail-action-btn${likedIds?.has(recipe.id) ? " active-like" : ""}`}
                  onClick={() => onToggleLike ? onToggleLike(recipe.id) : onRequestLogin?.()}
                  title={likedIds?.has(recipe.id) ? "Liked" : "Like recipe"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24"
                    fill={likedIds?.has(recipe.id) ? "currentColor" : "none"}
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  <span>{likedIds?.has(recipe.id) ? "Liked" : "Like"}</span>
                </button>
              </div>
            </div>
            <div className="detail-hero-bottom">
              <div className="detail-meta">
                <span className="meta-chip cuisine">{recipe.cuisine_type}</span>
                <span className="meta-chip green">{recipe.course}</span>
                {recipe.community && <span className="meta-chip">{recipe.community}</span>}
                {recipe.prep_time  && <span className="meta-chip">⏱ Prep: {recipe.prep_time}min</span>}
                {recipe.cook_time  && <span className="meta-chip">🔥 Cook: {recipe.cook_time}min</span>}
                {recipe.servings   && <span className="meta-chip">👥 Serves {recipe.servings}</span>}
              </div>
              <h1 className="detail-title">{recipe.name}</h1>
              {recipe.local_name && recipe.local_name !== recipe.name && (
                <p className="detail-local">{recipe.local_name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Description & tags below hero */}
        {recipe.description && recipe.description !== "MISSING" && (
          <p className="detail-desc" style={{ marginBottom: "1.25rem" }}>{recipe.description}</p>
        )}
        {recipe.tags && recipe.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {recipe.tags.map(t => (
              <span key={t} style={{ fontSize: ".78rem", padding: "3px 12px", borderRadius: 99, background: "var(--cream-dark)", color: "var(--earth-dark)" }}>{t}</span>
            ))}
          </div>
        )}

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

            {/* ── Ingredient substitutions ── */}
            {ingredients.length > 0 && (
              <div className="ai-panel">
                {!showSubs ? (
                  <button className="ai-feature-btn" onClick={() => setShowSubs(true)}>
                    🔄 Can't find an ingredient?
                  </button>
                ) : (
                  <>
                    <p className="ai-panel-label">Tap an ingredient to get substitutes:</p>
                    <div className="sub-chips">
                      {ingredients.map((ing, i) => (
                        <button
                          key={i}
                          className={`sub-chip${activeSubIng === ing.name ? " active" : ""}`}
                          onClick={() => loadSubstitutes(ing.name)}
                        >
                          {ing.name}
                        </button>
                      ))}
                    </div>
                    {subLoading && (
                      <div className="ai-inline-loading">
                        <div className="spinner" style={{ width: 18, height: 18, margin: 0, borderWidth: 2 }} />
                        Finding substitutes…
                      </div>
                    )}
                    {subError && <p className="ai-error">{subError}</p>}
                    {subResults && (
                      <div className="sub-results">
                        <p className="sub-results-title">
                          Substitutes for <strong>{activeSubIng}</strong>:
                        </p>
                        {subResults.map((s, i) => (
                          <div key={i} className="sub-item">
                            <span className="sub-name">{s.name}</span>
                            <span className="sub-reason">{s.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="ai-dismiss" onClick={() => { setShowSubs(false); setSubResults(null); setActiveSubIng(null); }}>
                      Hide
                    </button>
                  </>
                )}
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

        {/* ── AI Features Bar ── */}
        <div className="ai-features-section">
          <div className="ai-features-row">
            <button className="ai-feature-btn" onClick={loadHealth}>
              🥗 Health &amp; Nutrition
            </button>
            <button className="ai-feature-btn" onClick={() => setShowCustomize(true)}>
              🥦 Customise my diet
            </button>
            <button className="ai-feature-btn" onClick={loadTips}>
              💡 Cooking tips
            </button>
            <button className="ai-feature-btn" onClick={loadEnhancement}>
              ✨ Enhance recipe
            </button>
          </div>

          {/* Health panel */}
          {(health || healthLoading || healthError) && (
            <div className="ai-panel" style={{ marginBottom: "1rem" }}>
              {healthLoading && (
                <div className="ai-inline-loading">
                  <div className="spinner" style={{ width: 20, height: 20, margin: 0, borderWidth: 2 }} />
                  Analysing nutrition…
                </div>
              )}
              {healthError && <p className="ai-error">{healthError}</p>}
              {health && (
                <div className="health-card" style={{ margin: 0, border: "none", padding: 0, background: "transparent" }}>
                  <div className="health-card-header">
                    <span className="ai-badge">CookSmart AI</span>
                    <h3>Health &amp; Nutrition</h3>
                  </div>
                  {health.summary && <p className="health-summary">{health.summary}</p>}
                  {health.benefits?.length > 0 && (
                    <ul className="health-benefits">
                      {health.benefits.map((b, i) => (
                        <li key={i}>
                          <span className="health-nutrient">{b.nutrient}</span>
                          <span className="health-benefit-text">{b.benefit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {health.tip && (
                    <div className="health-tip">
                      <strong>Tip:</strong> {health.tip}
                    </div>
                  )}
                  <button className="ai-dismiss" onClick={() => setHealth(null)}>Hide</button>
                </div>
              )}
            </div>
          )}

          {/* Tips panel */}
          {(tips || tipsLoading || tipsError) && (
            <div className="ai-panel" style={{ marginBottom: "1rem" }}>
              {tipsLoading && (
                <div className="ai-inline-loading">
                  <div className="spinner" style={{ width: 18, height: 18, margin: 0, borderWidth: 2 }} />
                  Generating tips…
                </div>
              )}
              {tipsError && <p className="ai-error">{tipsError}</p>}
              {tips && (
                <>
                  <div className="tips-header">
                    <span className="ai-badge">CookSmart AI</span>
                    <strong>Cooking tips</strong>
                  </div>
                  <ul className="tips-list">
                    {tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                  <button className="ai-dismiss" onClick={() => setTips(null)}>Hide tips</button>
                </>
              )}
            </div>
          )}

          {/* Enhance panel */}
          {(enhanced || enhanceLoading || enhanceError) && (
            <div className="ai-panel" style={{ marginBottom: "1rem" }}>
              {enhanceLoading && (
                <div className="ai-inline-loading">
                  <div className="spinner" style={{ width: 18, height: 18, margin: 0, borderWidth: 2 }} />
                  Rewriting for clarity…
                </div>
              )}
              {enhanceError && <p className="ai-error">{enhanceError}</p>}
              {enhanced && (
                <>
                  <div className="tips-header">
                    <span className="ai-badge">CookSmart AI</span>
                    <strong>Enhanced Instructions</strong>
                  </div>
                  <ol className="steps-list" style={{ marginTop: ".5rem" }}>
                    {(enhanced.steps || []).map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  {enhanced.prep_tip && (
                    <div className="health-tip" style={{ marginTop: ".75rem" }}>
                      <strong>Prep tip:</strong> {enhanced.prep_tip}
                    </div>
                  )}
                  {enhanced.serving && (
                    <div className="health-tip" style={{ marginTop: ".5rem", background: "#e8f4fd", borderColor: "#bee3f8" }}>
                      <strong>Serving:</strong> {enhanced.serving}
                    </div>
                  )}
                  <button className="ai-dismiss" onClick={() => setEnhanced(null)}>Hide</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Recipe Customisation ── */}
        <div className="customize-section">
          {!showCustomize && !customized && null}

          {(showCustomize || customized) && (
            <div className="customize-card">
              <div className="health-card-header">
                <span className="ai-badge">CookSmart AI</span>
                <h3>Customise this Recipe</h3>
              </div>

              {!customized && (
                <>
                  <p className="customize-desc">
                    Tell us your health goal or condition and we'll advise how this dish works for you.
                  </p>
                  <input
                    className="cust-goal-input"
                    type="text"
                    placeholder='e.g. "I have diabetes", "I want to lose weight", "I am pregnant"'
                    value={custGoal}
                    onChange={e => setCustGoal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") loadCustomization(); }}
                  />
                  {custError && <p className="ai-error">{custError}</p>}
                  <div className="cust-actions">
                    <button
                      className="nlp-extract-btn"
                      onClick={loadCustomization}
                      disabled={custLoading || !custGoal.trim()}
                    >
                      {custLoading ? "Analysing…" : "Get advice"}
                    </button>
                    <button className="nlp-cancel-btn cust-cancel" onClick={() => { setShowCustomize(false); setCustGoal(""); setCustError(""); }}>
                      Cancel
                    </button>
                  </div>
                  {custLoading && (
                    <div className="ai-inline-loading" style={{ marginTop: ".75rem" }}>
                      <div className="spinner" style={{ width: 20, height: 20, margin: 0, borderWidth: 2 }} />
                      Personalising advice for you…
                    </div>
                  )}
                </>
              )}

              {customized && (
                <>
                  {custGoal && (
                    <p style={{ fontSize: ".82rem", color: "var(--stone)", marginBottom: ".75rem" }}>
                      Advice for: <em>{custGoal}</em>
                    </p>
                  )}

                  {customized.suitability && (
                    <div className={`cust-suitability cust-suit-${customized.suitability.replace(/\s+/g, '-')}`}>
                      {customized.suitability === "yes" && "✅ Suitable for you"}
                      {customized.suitability === "with modifications" && "⚠️ Suitable with modifications"}
                      {customized.suitability === "avoid" && "⛔ Best to avoid"}
                    </div>
                  )}

                  {customized.adjustments?.length > 0 && (
                    <div className="cust-swaps" style={{ marginTop: ".85rem" }}>
                      <h4 className="cust-subhead">What to adjust</h4>
                      {customized.adjustments.map((a, i) => (
                        <div key={i} className="swap-row">
                          <p className="swap-reason"><strong>{a.change}</strong> — {a.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {customized.pairings?.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <h4 className="cust-subhead">What to add or pair with</h4>
                      <ul className="tips-list">
                        {customized.pairings.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}

                  {customized.encouragement && (
                    <div className="health-tip" style={{ marginTop: "1rem", background: "#f0faf4", borderColor: "#b7e4c7" }}>
                      💚 {customized.encouragement}
                    </div>
                  )}

                  {customized.health_note && (
                    <div className="health-tip" style={{ marginTop: ".75rem" }}>
                      <strong>Summary:</strong> {customized.health_note}
                    </div>
                  )}

                  <button className="ai-dismiss" style={{ marginTop: "1rem" }}
                    onClick={() => { setCustomized(null); setShowCustomize(true); }}>
                    ← Try a different goal
                  </button>
                </>
              )}
            </div>
          )}
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
                <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)} aiReason={r.ai_reason}
                  isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin} />
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
