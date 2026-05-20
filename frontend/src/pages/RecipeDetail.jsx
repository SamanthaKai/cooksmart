import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import { getRecipeImage } from "../utils/imageHelper";
import { downloadRecipePDF } from "../utils/downloadPDF";
import { useLang } from "../context/LanguageContext";

// Split "200g lemon grass" into { qty: "200g", name: "lemon grass" }
function parseIngredient(raw) {
  raw = raw.trim();
  const match = raw.match(/^([\d½¼¾./\s]+\s*(?:g|kg|ml|l|litre|liter|cup|cups|tbsp|tsp|tablespoon|teaspoon|bunch|bunches|pieces?|oz|lb|medium|large|small|handful|pinch|cloves?|slices?)?)\s+(.+)$/i);
  if (match) return { qty: match[1].trim(), name: match[2].trim() };
  return { qty: null, name: raw };
}

// Scale a quantity string by factor; leaves non-numeric quantities unchanged.
function scaleQty(qtyStr, factor) {
  if (!qtyStr || factor === 1) return qtyStr;
  // Resolve unicode vulgar fractions, including digit-prefixed ones like "1½"
  let s = qtyStr
    .replace(/(\d)½/g, (_, d) => String(parseFloat(d) + 0.5))
    .replace(/(\d)¼/g, (_, d) => String(parseFloat(d) + 0.25))
    .replace(/(\d)¾/g, (_, d) => String(parseFloat(d) + 0.75))
    .replace(/½/g, "0.5")
    .replace(/¼/g, "0.25")
    .replace(/¾/g, "0.75");
  // Extract leading numeric expression (integer, decimal, fraction, or mixed number)
  const m = s.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)(.*)/);
  if (!m) return qtyStr;
  const numStr = m[1].trim();
  const rest = m[2]; // unit including any leading space
  let num;
  const spaceAt = numStr.indexOf(" ");
  if (spaceAt > -1) {
    // Mixed number e.g. "1 1/2"
    const [slash] = numStr.substring(spaceAt + 1).split("/").map(Number);
    const denom = Number(numStr.substring(spaceAt + 1).split("/")[1]);
    num = parseFloat(numStr) + slash / denom;
  } else if (numStr.includes("/")) {
    const [n, d] = numStr.split("/").map(Number);
    num = n / d;
  } else {
    num = parseFloat(numStr);
  }
  if (isNaN(num)) return qtyStr;
  const scaled = Math.round(num * factor * 10) / 10;
  const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  return display + rest;
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
const DAYS_DETAIL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

export default function RecipeDetail({ recipeId, onBack, onSelectRecipe, savedIds, likedIds, onToggleSave, onToggleLike, onRequestLogin, onAddToMealPlan, isEmbedded = false }) {
  const [recipe, setRecipe]           = useState(null);
  const [recos,  setRecos]            = useState([]);
  const [loading, setLoading]         = useState(true);
  const [recoLoading, setRecoLoading] = useState(false);
  const [servings, setServings]       = useState(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [planAddedDay,   setPlanAddedDay]   = useState(null);
  const planPickerRef = useRef(null);
  const { lang, toggleLang, t } = useLang();

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
    if (!planPickerOpen) return;
    function close(e) { if (planPickerRef.current && !planPickerRef.current.contains(e.target)) setPlanPickerOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [planPickerOpen]);

  async function handleDetailPickDay(day) {
    setPlanPickerOpen(false);
    await onAddToMealPlan?.(recipe?.id, day);
    setPlanAddedDay(day.slice(0, 3));
    setTimeout(() => setPlanAddedDay(null), 2400);
  }

  function shareOnWhatsApp() {
    const title = recipe.name;
    const localPart = recipe.local_name && recipe.local_name !== recipe.name
      ? ` (${recipe.local_name})`
      : "";

    const rawIngredients = recipe.ingredients_display || recipe.ingredient_list || "";
    const ingLines = rawIngredients
      .split("|")
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map(s => `• ${s}`)
      .join("\n");

    const message = [
      "Check out this Ugandan recipe on CookSmart! 🍽️",
      "",
      `*${title}${localPart}*`,
      "",
      ingLines ? `Ingredients:\n${ingLines}` : "",
      "",
      "Full recipe: https://cooksmart-seven.vercel.app",
    ].join("\n");

    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    setLoading(true);
    setRecos([]);
    setServings(null);
    // reset AI panels when recipe changes
    setShowSubs(false); setActiveSubIng(null); setSubResults(null); setSubError("");
    setTips(null); setTipsError("");
    setHealth(null); setHealthError("");
    setEnhanced(null); setEnhanceError("");
    setShowCustomize(false); setCustGoal(""); setCustomized(null); setCustError("");
    api.recipe(recipeId)
      .then(data => {
        setRecipe(data);
        setServings(data.servings || 4);
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

  const currentServings = servings ?? recipe.servings ?? 4;
  const scaleFactor = recipe.servings ? currentServings / recipe.servings : 1;

  // Parse steps
// Replace with:
const steps = (recipe.instructions || "")
    .split(/[.]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 4);
    
  return (
    <div className={isEmbedded ? "" : "app"}>
      {!isEmbedded && (
        <nav className="navbar">
          <span className="navbar-brand">Cook<span>Smart</span></span>
          <span style={{ fontSize: ".82rem", color: "var(--stone)" }}>
            {recipe.cuisine_type === "african" ? "🌍 African cuisine" : "🍴 Western cuisine"}
          </span>
        </nav>
      )}

      <div className={isEmbedded ? "detail-page detail-page--embedded" : "detail-page"}>
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
                  <span>{savedIds?.has(recipe.id) ? t("saved") : t("save")}</span>
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
                  <span>{likedIds?.has(recipe.id) ? t("liked") : t("like")}</span>
                </button>
                <button
                  className="detail-action-btn"
                  onClick={() => downloadRecipePDF(recipe, "db")}
                  title="Download recipe as PDF"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>PDF</span>
                </button>
                {/* Meal plan button with day picker */}
                <div ref={planPickerRef} style={{ position: "relative" }}>
                  <button
                    className={`detail-action-btn${planAddedDay ? " active-save" : ""}`}
                    onClick={() => onAddToMealPlan ? setPlanPickerOpen(o => !o) : onRequestLogin?.()}
                    title="Add to meal plan"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>{planAddedDay ? `✓ ${planAddedDay}` : "Plan"}</span>
                  </button>
                  {planPickerOpen && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0,
                      background: "var(--white)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-lg)",
                      zIndex: 200, overflow: "hidden", minWidth: 130,
                    }}>
                      <div style={{ padding: "6px 12px 4px", fontSize: ".7rem", fontWeight: 700, color: "var(--stone)", borderBottom: "1px solid var(--border)", letterSpacing: ".04em" }}>
                        ADD TO PLAN
                      </div>
                      {DAYS_DETAIL.map(day => (
                        <button
                          key={day}
                          onClick={() => handleDetailPickDay(day)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "7px 12px", background: "none", border: "none",
                            cursor: "pointer", fontSize: ".85rem", color: "var(--charcoal)",
                            transition: "background .1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--cream)"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="detail-hero-bottom">
              <div className="detail-meta">
                <span className="meta-chip cuisine">{recipe.cuisine_type}</span>
                <span className="meta-chip green">{recipe.course}</span>
                {recipe.community && <span className="meta-chip">{recipe.community}</span>}
                {recipe.prep_time  && <span className="meta-chip">⏱ Prep: {recipe.prep_time}min</span>}
                {recipe.cook_time  && <span className="meta-chip">🔥 Cook: {recipe.cook_time}min</span>}
                {recipe.servings   && <span className="meta-chip">👥 Serves {currentServings}</span>}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
                <h3 style={{ margin: 0 }}>{t("ingredients")}</h3>
                {recipe.servings && (
                  <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                    <button
                      aria-label="Decrease servings"
                      onClick={() => setServings(s => Math.max(1, (s ?? recipe.servings) - 1))}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid var(--earth)", background: "transparent", cursor: "pointer", fontSize: "1.15rem", lineHeight: 1, color: "var(--earth-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >−</button>
                    <span style={{ minWidth: 76, textAlign: "center", fontSize: ".83rem", fontWeight: 600, color: "var(--earth-dark)" }}>
                      {currentServings} serving{currentServings !== 1 ? "s" : ""}
                    </span>
                    <button
                      aria-label="Increase servings"
                      onClick={() => setServings(s => (s ?? recipe.servings) + 1)}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid var(--earth)", background: "transparent", cursor: "pointer", fontSize: "1.15rem", lineHeight: 1, color: "var(--earth-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >+</button>
                  </div>
                )}
              </div>
              {ingredients.length > 0 ? (
                <ul className="ing-list">
                  {ingredients.map((ing, i) => (
                    <li key={i} className="ing-list-item">
                      <span className="ing-name">
                        {ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}
                      </span>
                      {ing.qty && (
                        <span className="ing-qty">{scaleQty(ing.qty, scaleFactor)}</span>
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
            <h3>{t("preparation")}</h3>
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

        {/* Share this recipe */}
        <div className="share-section">
          <h3 className="share-section-label">Share this recipe</h3>
          <button
            className="whatsapp-share-btn"
            onClick={shareOnWhatsApp}
            title="Share on WhatsApp"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Share on WhatsApp
          </button>
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
