import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import LeftSidebar from "../components/LeftSidebar";
import RightSidebar from "../components/RightSidebar";
import { useLang } from "../context/LanguageContext";
import {
  LayoutGrid, Globe, Soup, Utensils, Cookie, Sunrise, GlassWater, Cake,
  Bell, ChevronDown, SlidersHorizontal, X as XIcon,
} from "lucide-react";

// ── Category filters — 8 items matching mockup ────────────────────────────────
const CATEGORY_FILTERS = [
  { label: "All Recipes", Icon: LayoutGrid,  type: "all" },
  { label: "African",     Icon: Globe,       type: "cuisine", value: "african" },
  { label: "Soups",       Icon: Soup,        type: "course",  value: "soup" },
  { label: "Main Dishes", Icon: Utensils,    type: "course",  value: "main" },
  { label: "Snacks",      Icon: Cookie,      type: "course",  value: "snack" },
  { label: "Breakfast",   Icon: Sunrise,     type: "course",  value: "breakfast" },
  { label: "Drinks",      Icon: GlassWater,  type: "course",  value: "beverage" },
  { label: "Desserts",    Icon: Cake,        type: "course",  value: "dessert" },
];

// PillInput at module level — avoids remount on every parent render
function PillInput({ pills, ingInput, ingRef, ingSuggest, showIngSug, hint,
                     onIngChange, onKeyDown, onFocus, onSuggestPick, onRemovePill }) {
  return (
    <div className="ing-wrap" ref={ingRef}>
      <div className="ing-pills">
        {pills.map(p => (
          <span key={p} className="pill">
            {p}
            <button type="button" className="pill-remove" onClick={() => onRemovePill(p)}>×</button>
          </span>
        ))}
        <input
          className="ing-input"
          placeholder={pills.length === 0 ? "Add at least 2 ingredients…" : "Add another…"}
          value={ingInput}
          onChange={onIngChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          autoComplete="off"
        />
        {showIngSug && ingSuggest.length > 0 && (
          <div className="ing-suggest">
            {ingSuggest.map(s => (
              <div key={s.id} className="ing-suggest-item" onMouseDown={() => onSuggestPick(s.name)}>
                <span>{s.name}</span>
                <span className="ing-cat">{s.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {pills.length > 0 && <p className="ing-hint">{hint}</p>}
    </div>
  );
}

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="recipe-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-skeleton">
          <div className="skeleton-img" />
          <div className="skeleton-body">
            <div className="skeleton-line" style={{ width: "72%" }} />
            <div className="skeleton-line" style={{ width: "48%", animationDelay: ".15s" }} />
            <div className="skeleton-line" style={{ width: "32%", height: 11, marginTop: ".6rem", animationDelay: ".3s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home({ onSelectRecipe, user, onLogout, onProfile, onMealPlan, onLogin, savedIds, onToggleSave, onRequestLogin, onAddToMealPlan }) {
  const { lang, toggleLang, t } = useLang();
  const [menuOpen, setMenuOpen]        = useState(false);
  const [mode, setMode]               = useState("name");
  const [query, setQuery]             = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

  const [pills, setPills]           = useState([]);
  const [ingInput, setIngInput]     = useState("");
  const [ingSuggest, setIngSuggest] = useState([]);
  const [showIngSug, setShowIngSug] = useState(false);

  const [results, setResults]       = useState([]);
  const [aiResults, setAiResults]   = useState([]);
  const [partials, setPartials]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [searched, setSearched]     = useState(false);
  const [error, setError]           = useState("");

  const [genRecipe, setGenRecipe]   = useState(null);
  const [generating, setGenerating] = useState(false);

  const [genOpen, setGenOpen]         = useState(false);
  const [genText, setGenText]         = useState("");
  const [genPills, setGenPills]       = useState([]);
  const [genLoading, setGenLoading]   = useState(false);

  const [genCount, setGenCount]       = useState(() => parseInt(localStorage.getItem('cs_gen_count') || '0', 10));
  const [genLimitHit, setGenLimitHit] = useState(false);
  const [genClarifyMsg, setGenClarifyMsg] = useState("");

  const [genSaved, setGenSaved]   = useState(false);
  const [genSaving, setGenSaving] = useState(false);
  const [genSectionSaved, setGenSectionSaved]   = useState([]);
  const [genSectionSaving, setGenSectionSaving] = useState([]);

  const [cuisine, setCuisine]       = useState("");
  const [course, setCourse]         = useState("");
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const suggestRef = useRef(null);
  const ingRef     = useRef(null);

  // ── Browse load ───────────────────────────────────────────────────────────
  const loadBrowse = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 12 };
      if (cuisine) params.cuisine = cuisine;
      if (course)  params.course  = course;
      const data = await api.recipes(params);
      setResults(data.results ?? []);
      setTotalPages(data.pages ?? 1);
      setTotalCount(data.total ?? 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cuisine, course, page]);

  useEffect(() => { loadBrowse(); }, [loadBrowse]);

  // ── Name auto-suggest ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "name" || query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const raw = await api.suggest(query);
        const q = query.toLowerCase();
        setSuggestions(raw.filter(s => {
          const name = s.name.toLowerCase();
          return name.startsWith(q) || name.includes(' ' + q);
        }));
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [query, mode]);

  // ── Ingredient auto-suggest ───────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "ingredients" || ingInput.length < 2) { setIngSuggest([]); return; }
    const timer = setTimeout(async () => {
      try { setIngSuggest(await api.ingredientSuggest(ingInput)); } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [ingInput, mode]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    function handle(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggest(false);
      if (ingRef.current     && !ingRef.current.contains(e.target))     setShowIngSug(false);
      if (menuOpen && !e.target.closest('.home-topbar') && !e.target.closest('.mobile-menu')) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function searchByName(searchQuery) {
    if (!searchQuery.trim()) return;
    setShowSuggest(false);
    setLoading(true); setSearched(true); setError("");
    try {
      const data = await api.search({ q: searchQuery, cuisine, course, page: 1, per_page: 12 });
      setResults(data.results ?? []);
      setTotalPages(data.pages ?? 1);
      setTotalCount(data.total ?? 0);
      setPage(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSearch(e) {
    e?.preventDefault();
    await searchByName(query);
  }

  async function handleIngSearch() {
    if (pills.length < 2) { setError("Add at least 2 ingredients."); return; }
    setLoading(true); setAiLoading(true); setSearched(true); setError("");
    try {
      const [dbData, aiData] = await Promise.allSettled([
        api.searchIngredients({ ingredients: pills, cuisine }),
        api.aiSuggest(pills),
      ]);
      if (dbData.status === "fulfilled") {
        setResults(dbData.value.exact_matches   || []);
        setPartials(dbData.value.partial_matches || []);
      }
      if (aiData.status === "fulfilled") setAiResults(aiData.value.suggestions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setAiLoading(false);
    }
  }

  async function handleGenerate() {
    if (!user && genCount >= 2) { setGenLimitHit(true); return; }
    let ingredients = [...genPills];
    const context = genText.trim();
    if (!ingredients.length && !context) { setError("Describe what you have or add some ingredients."); return; }
    setGenRecipe(null); setGenSaved(false); setGenSectionSaved([]); setGenSectionSaving([]);
    setGenLoading(true); setError(""); setGenClarifyMsg("");
    if (context && !ingredients.length) {
      try {
        const data = await api.nlpExtract(context);
        ingredients = data.ingredients || [];
        if (ingredients.length) setGenPills(ingredients);
      } catch {}
    }
    if (!ingredients.length) { setError("Could you describe a bit more what you'd like to cook?"); setGenLoading(false); return; }
    setGenerating(true);
    try {
      const data = await api.aiGenerate(ingredients, context);
      if (data.clarify) { setGenClarifyMsg(data.message); return; }
      setGenRecipe(data.recipe);
      setGenOpen(false);
      if (!user) {
        const next = genCount + 1;
        setGenCount(next);
        localStorage.setItem('cs_gen_count', String(next));
      }
    } catch (e) {
      setError(e.message || "Failed to generate recipe.");
    } finally {
      setGenerating(false); setGenLoading(false);
    }
  }

  async function handleSaveRecipe() {
    if (!user || !genRecipe) return;
    setGenSaving(true);
    try { await api.saveGeneratedRecipe(genRecipe); setGenSaved(true); }
    catch (e) { setError(e.message || "Failed to save recipe."); }
    finally { setGenSaving(false); }
  }

  async function handleSaveSectionRecipe(sectionRecipe, idx) {
    if (!user || !sectionRecipe) return;
    setGenSectionSaving(prev => { const a = [...prev]; a[idx] = true; return a; });
    try {
      await api.saveGeneratedRecipe(sectionRecipe);
      setGenSectionSaved(prev => { const a = [...prev]; a[idx] = true; return a; });
    } catch (e) {
      setError(e.message || "Failed to save recipe.");
    } finally {
      setGenSectionSaving(prev => { const a = [...prev]; a[idx] = false; return a; });
    }
  }

  const addPill = useCallback((name) => {
    const n = name.trim().toLowerCase();
    if (!n) return;
    setPills(p => p.includes(n) ? p : [...p, n]);
    setIngInput(""); setIngSuggest([]); setShowIngSug(false);
  }, []);

  const handleIngKeyDown = useCallback((e) => {
    if ((e.key === "Enter" || e.key === ",") && ingInput.trim()) { e.preventDefault(); addPill(ingInput); }
    if (e.key === "Backspace" && !ingInput) setPills(p => p.slice(0, -1));
  }, [ingInput, addPill]);

  const handleIngChange  = useCallback((e) => { setIngInput(e.target.value); setShowIngSug(true); }, []);
  const handleIngFocus   = useCallback(() => setShowIngSug(true), []);
  const handleRemovePill = useCallback((p) => setPills(pills => pills.filter(x => x !== p)), []);

  function switchMode(m) {
    setMode(m); setSearched(false);
    setResults([]); setAiResults([]); setPartials([]);
    setError(""); setQuery(""); setPills([]); setIngInput("");
  }

  function isCatActive(cat) {
    if (cat.type === "all")     return !cuisine && !course;
    if (cat.type === "cuisine") return cuisine === cat.value;
    return course === cat.value;
  }

  function handleCatClick(cat) {
    if (cat.type === "all")          { setCuisine(""); setCourse(""); }
    else if (cat.type === "cuisine") { setCuisine(cat.value); setCourse(""); }
    else                             { setCourse(cat.value); setCuisine(""); }
    setPage(1);
    setSearched(false);
  }

  const emoji = (r) => {
    const n = (r.name || "").toLowerCase();
    if (n.includes("chicken")) return "🍗";
    if (n.includes("fish") || n.includes("tilapia")) return "🐟";
    if (n.includes("beef") || n.includes("meat")) return "🥩";
    if (n.includes("rice") || n.includes("jollof")) return "🍚";
    if (n.includes("soup") || n.includes("stew")) return "🍲";
    if (n.includes("banana") || n.includes("matoke")) return "🍌";
    if (n.includes("bean") || n.includes("lentil")) return "🫘";
    if (n.includes("egg")) return "🥚";
    if (n.includes("salad")) return "🥗";
    if (n.includes("bread") || n.includes("chapati")) return "🫓";
    if (r.course === "beverage") return "🥤";
    if (r.cuisine_type === "african") return "🌍";
    return "🍽️";
  };

  const pillHint = pills.length === 0 ? "Add at least 2 ingredients"
    : pills.length === 1 ? "Add 1 more ingredient"
    : `${pills.length} ingredients added — ready to search!`;

  const activePage = searched ? "explore" : (cuisine || course) ? "categories" : "home";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="home-layout">

      {/* ── Top bar ── */}
      <header className="home-topbar">
        <button
          className={`hamburger${menuOpen ? " open" : ""}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <span /><span /><span />
        </button>

        <div className="topbar-right">
          {/* Language toggle */}
          <div style={{ display: "inline-flex", border: "1.5px solid var(--border)", borderRadius: 99, overflow: "hidden", flexShrink: 0 }}>
            {["en", "lg"].map(code => (
              <button key={code} onClick={() => lang !== code && toggleLang()} style={{
                padding: "3px 9px", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: ".72rem", fontWeight: 700,
                letterSpacing: ".04em", transition: "all .15s",
                background: lang === code ? "var(--earth)" : "transparent",
                color:      lang === code ? "var(--white)" : "var(--stone)",
              }}>{code.toUpperCase()}</button>
            ))}
          </div>

          {/* Bell */}
          <button className="topbar-icon-btn" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
          </button>

          {/* User */}
          {user ? (
            <div className="topbar-user">
              <div className="topbar-avatar">{user.name[0].toUpperCase()}</div>
              <span className="topbar-user-label">Hi, {user.name.split(" ")[0]}! 👋</span>
              <ChevronDown size={14} strokeWidth={2} style={{ color: "var(--stone)" }} />
              {/* Simple inline dropdown on hover handled by CSS */}
              <div className="topbar-dropdown">
                <button className="topbar-dd-item" onClick={onProfile}>{t("nav_profile")}</button>
                <button className="topbar-dd-item" onClick={onMealPlan}>{t("nav_mealplan")}</button>
                <button className="topbar-dd-item topbar-dd-item--danger" onClick={onLogout}>{t("nav_signout")}</button>
              </div>
            </div>
          ) : (
            <button className="navbar-signin-btn" onClick={onLogin}>{t("nav_signin")}</button>
          )}
        </div>
      </header>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div className="mobile-menu">
          {user ? (
            <>
              <p className="mobile-menu-greeting">Hi, {user.name.split(" ")[0]}</p>
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { onMealPlan(); setMenuOpen(false); }}>{t("nav_mealplan")}</button>
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { onProfile(); setMenuOpen(false); }}>{t("nav_profile")}</button>
              <button className="mobile-menu-btn mobile-menu-btn--ghost"     onClick={() => { onLogout(); setMenuOpen(false); }}>{t("nav_signout")}</button>
            </>
          ) : (
            <button className="mobile-menu-btn" onClick={() => { onLogin(); setMenuOpen(false); }}>{t("nav_signin")}</button>
          )}
        </div>
      )}

      {/* ── Three-column body ── */}
      <div className="home-body">

        {/* Left sidebar */}
        <LeftSidebar
          user={user}
          onLogin={onLogin}
          onMealPlan={onMealPlan}
          onProfile={onProfile}
          activePage={activePage}
          onNavigate={(id) => {
            if (id === "home")       { setSearched(false); setCuisine(""); setCourse(""); setMode("name"); setQuery(""); loadBrowse(); }
            else if (id === "explore")    { setMode("name"); setSearched(false); setQuery(""); }
            else if (id === "categories") { setSearched(false); setCuisine(""); setCourse(""); }
          }}
        />

        {/* Main content */}
        <main className="home-main">

          {/* ── Hero ── */}
          <div className="hero">
            <h1>Good food. Made easy.<br />Made for you.</h1>
            <p>Discover African recipes, get smart suggestions and cook with confidence.</p>

            {/* Search bar — name mode by default, sliders toggles ingredient mode */}
            <div ref={suggestRef} style={{ position: "relative", zIndex: 10 }}>
              {mode === "name" ? (
                <form className="search-wrap" onSubmit={handleNameSearch}>
                  <span className="search-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  </span>
                  <input
                    className="search-input"
                    placeholder={t("search_placeholder")}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                    onFocus={() => setShowSuggest(true)}
                    autoComplete="off"
                  />
                  <button type="button" className="search-mode-btn" onClick={() => switchMode("ingredients")} title="Search by ingredients">
                    <SlidersHorizontal size={15} strokeWidth={1.8} />
                  </button>
                  {showSuggest && suggestions.length > 0 && (
                    <div className="suggest-dropdown">
                      {suggestions.map(s => (
                        <div key={s.id} className="suggest-item"
                          onMouseDown={() => { setQuery(s.name); setShowSuggest(false); onSelectRecipe(s.id); }}>
                          <span className="suggest-item-name">{s.name}</span>
                          <span className="suggest-item-meta">{s.cuisine_type} · {s.course}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </form>
              ) : (
                <div className="search-wrap ing-mode-wrap">
                  <PillInput
                    pills={pills} ingInput={ingInput} ingRef={ingRef}
                    ingSuggest={ingSuggest} showIngSug={showIngSug} hint={pillHint}
                    onIngChange={handleIngChange} onKeyDown={handleIngKeyDown}
                    onFocus={handleIngFocus} onSuggestPick={addPill} onRemovePill={handleRemovePill}
                  />
                  <button type="button" className="search-mode-btn search-mode-btn--close" onClick={() => switchMode("name")} title="Back to recipe search">
                    <XIcon size={15} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            {/* Popular chips — name mode only */}
            {mode === "name" && (
              <div className="popular-chips">
                <span className="popular-label">Popular searches:</span>
                {["Jollof Rice", "Pepper Soup", "Plantain", "Beef Stew", "Moi Moi"].map(q => (
                  <button key={q} className="popular-chip" onClick={() => { setQuery(q); searchByName(q); }}>{q}</button>
                ))}
              </div>
            )}

            {/* Ingredient search button */}
            {mode === "ingredients" && (
              <div style={{ marginTop: ".75rem" }}>
                <button className="search-btn" onClick={handleIngSearch} disabled={pills.length < 2 || loading}>
                  {loading ? "…" : t("search_ing_btn")}
                </button>
              </div>
            )}

            {/* AI Generate CTA */}
            <div className="ai-gen-cta">
              {!genOpen ? (
                <button className="ai-gen-toggle" onClick={() => setGenOpen(true)}>
                  ✨ Not sure what to cook? Use CookSmart AI
                </button>
              ) : genLimitHit ? (
                <div className="gen-limit-box">
                  <p>You've used your 2 free generations. Sign in to keep building your plate.</p>
                  <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                    <button className="gen-limit-signin-btn" onClick={onLogin}>Sign In</button>
                    <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenLimitHit(false); setGenRecipe(null); setError(""); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="ai-gen-box">
                  <textarea
                    className="nlp-textarea"
                    placeholder='Describe what you have in plain English, e.g. "I have chicken, tomatoes and some garlic at home"'
                    value={genText}
                    onChange={e => setGenText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                    rows={3} autoFocus
                  />
                  {!user && (
                    <p className="gen-guest-note">
                      {genCount === 0 ? "2 free generations available — sign in for unlimited." :
                       genCount === 1 ? "1 free generation left — sign in for unlimited." : null}
                    </p>
                  )}
                  <div className="ai-gen-actions">
                    <button className="search-btn" onClick={handleGenerate}
                      disabled={genLoading || generating || (!genText.trim() && !genPills.length)}>
                      {generating ? t("generating") : genLoading ? t("reading_ings") : t("generate_btn")}
                    </button>
                    <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenText(""); setGenPills([]); setGenRecipe(null); setError(""); setGenLimitHit(false); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Content area ── */}
          <div className="home-content">
            {error && <div className="error-banner">{error}</div>}

            {/* Generating */}
            {generating && (
              <div className="gen-loading">
                <div className="spinner" style={{ margin: "0 auto 1rem" }} />
                <p>CookSmart AI is creating your recipe…</p>
                <p style={{ fontSize: ".85rem", marginTop: ".35rem" }}>This may take a few seconds.</p>
              </div>
            )}

            {genClarifyMsg && (
              <div className="gen-clarify-box">
                <span className="gen-clarify-icon">🍽️</span>
                <p>{genClarifyMsg}</p>
              </div>
            )}

            {/* AI-generated recipe panel */}
            {genRecipe && (
              <div className="gen-panel">
                {genRecipe.sections ? (
                  <>
                    <div className="gen-header">
                      <span className="ai-badge gen-badge">AI-Generated Meal</span>
                      <h2 className="gen-title">Combination Meal</h2>
                      <p className="gen-desc">{genRecipe.sections.length} dishes generated based on your request.</p>
                    </div>
                    {genRecipe.sections.map((section, idx) => (
                      <div key={idx} className="combo-section">
                        <div className={`combo-label combo-label--${(section.label || "").toLowerCase()}`}>{section.label}</div>
                        <div className="combo-recipe-header">
                          <h3 className="combo-dish-name">{section.dish_name}</h3>
                          {section.local_name && <p className="gen-local">{section.local_name}</p>}
                          <p className="gen-desc combo-desc">{section.description}</p>
                          <div className="gen-meta">
                            {section.cuisine      && <span className="meta-chip cuisine">{section.cuisine}</span>}
                            {section.cooking_time && <span className="meta-chip">⏱ {section.cooking_time}</span>}
                            {section.servings     && <span className="meta-chip">👥 {section.servings}</span>}
                          </div>
                        </div>
                        <div className="gen-body">
                          <div className="gen-section">
                            <h3>{t("ingredients")}</h3>
                            <ul className="gen-ing-list">
                              {(section.ingredients || []).map((ing, i) => (
                                <li key={i} className="gen-ing-item">
                                  <span className="gen-ing-name">{ing.item}</span>
                                  <span className="gen-ing-qty">{ing.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="gen-section">
                            <h3>{t("instructions")}</h3>
                            <ol className="gen-steps">
                              {(section.steps || []).map((step, i) => (
                                <li key={i}>{step.replace(/^Step\s*\d+:\s*/i, "")}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                        {section.tips && <div className="gen-tips"><strong>Chef's tip:</strong> {section.tips}</div>}
                        {section.health_tip && (
                          <div className="gen-health-tip">
                            <span className="gen-health-icon">🌿</span>
                            <div><strong>Health Tip</strong><p>{section.health_tip}</p></div>
                          </div>
                        )}
                        <div className="gen-save-bar">
                          <button
                            className={`gen-save-btn${genSectionSaved[idx] ? " saved" : ""}`}
                            onClick={user ? () => handleSaveSectionRecipe(section, idx) : undefined}
                            disabled={!user || genSectionSaving[idx] || genSectionSaved[idx]}
                            title={!user ? "Sign in to save this recipe" : undefined}
                          >
                            {genSectionSaved[idx] ? "✓ Saved!" : genSectionSaving[idx] ? "Saving…" : "Save to my profile"}
                          </button>
                          {!user && <span className="gen-save-hint">Sign in to save</span>}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="gen-header">
                      <span className="ai-badge gen-badge">AI-Generated Recipe</span>
                      <h2 className="gen-title">{genRecipe.dish_name}</h2>
                      {genRecipe.local_name && <p className="gen-local">{genRecipe.local_name}</p>}
                      <p className="gen-desc">{genRecipe.description}</p>
                      <div className="gen-meta">
                        {genRecipe.cuisine      && <span className="meta-chip cuisine">{genRecipe.cuisine}</span>}
                        {genRecipe.cooking_time && <span className="meta-chip">⏱ {genRecipe.cooking_time}</span>}
                        {genRecipe.servings     && <span className="meta-chip">👥 {genRecipe.servings}</span>}
                      </div>
                    </div>
                    <div className="gen-body">
                      <div className="gen-section">
                        <h3>{t("ingredients")}</h3>
                        <ul className="gen-ing-list">
                          {(genRecipe.ingredients || []).map((ing, i) => (
                            <li key={i} className="gen-ing-item">
                              <span className="gen-ing-name">{ing.item}</span>
                              <span className="gen-ing-qty">{ing.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="gen-section">
                        <h3>{t("instructions")}</h3>
                        <ol className="gen-steps">
                          {(genRecipe.steps || []).map((step, i) => (
                            <li key={i}>{step.replace(/^Step\s*\d+:\s*/i, "")}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    {genRecipe.tips && <div className="gen-tips"><strong>Chef's tip:</strong> {genRecipe.tips}</div>}
                    {genRecipe.health_tip && (
                      <div className="gen-health-tip">
                        <span className="gen-health-icon">🌿</span>
                        <div><strong>Health Tip</strong><p>{genRecipe.health_tip}</p></div>
                      </div>
                    )}
                    <div className="gen-save-bar">
                      <button
                        className={`gen-save-btn${genSaved ? " saved" : ""}`}
                        onClick={user ? handleSaveRecipe : undefined}
                        disabled={!user || genSaving || genSaved}
                        title={!user ? "Sign in to save this recipe" : undefined}
                      >
                        {genSaved ? "✓ Saved to profile!" : genSaving ? "Saving…" : "Save to my profile"}
                      </button>
                      {!user && <span className="gen-save-hint">Sign in to save this recipe</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Category pills ── */}
            {!searched && (
              <div className="category-section">
                <div className="section-head-row" style={{ marginBottom: ".85rem" }}>
                  <h2 className="category-section-title" style={{ marginBottom: 0 }}>Browse by category</h2>
                  <button className="section-view-all" onClick={() => { setCuisine(""); setCourse(""); }}>View all</button>
                </div>
                <div className="category-pills">
                  {CATEGORY_FILTERS.map(cat => (
                    <button
                      key={cat.label}
                      className={`category-pill${isCatActive(cat) ? " active" : ""}`}
                      onClick={() => handleCatClick(cat)}
                    >
                      <div className="category-pill-icon-wrap">
                        <cat.Icon size={22} strokeWidth={1.8} />
                      </div>
                      <span className="category-pill-label">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AI ingredient results */}
            {mode === "ingredients" && searched && aiResults.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 className="section-heading">
                  AI suggestions <span className="ai-badge">CookSmart AI</span>
                  <span className="count">{aiResults.length} picks</span>
                </h2>
                <div className="recipe-grid">
                  {aiResults.map(r => (
                    <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                      aiReason={r.ai_reason} isSaved={savedIds?.has(r.id)}
                      onToggleSave={onToggleSave || onRequestLogin} onAddToMealPlan={onAddToMealPlan} />
                  ))}
                </div>
              </div>
            )}

            {mode === "ingredients" && searched && aiLoading && (
              <div style={{ marginBottom: "2rem", padding: "1.5rem", background: "var(--white)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="spinner" style={{ margin: 0, width: 24, height: 24, borderWidth: 2 }} />
                <span style={{ fontSize: ".9rem", color: "var(--stone)" }}>CookSmart AI is finding the best matches…</span>
              </div>
            )}

            {/* Skeleton */}
            {loading && !aiLoading && <SkeletonGrid />}

            {/* ── Recipe sections ── */}
            {!loading && results.length > 0 && (
              !searched && !cuisine && !course && results.length >= 8 ? (
                <>
                  {/* Recommended for you */}
                  <div className="recipe-section">
                    <div className="section-head-row">
                      <h2 className="section-heading">
                        Recommended for you
                        <span className="section-tag">Based on your preferences</span>
                      </h2>
                      <button className="section-view-all" onClick={() => setCourse("main")}>View all</button>
                    </div>
                    <div className="recipe-scroll-row">
                      {results.slice(0, 4).map(r => (
                        <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                          isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                          onAddToMealPlan={onAddToMealPlan} />
                      ))}
                    </div>
                  </div>

                  {/* Trending this week */}
                  {results.length > 4 && (
                    <div className="recipe-section">
                      <div className="section-head-row">
                        <h2 className="section-heading">
                          Trending this week
                          <span className="section-tag">Popular with our community</span>
                        </h2>
                        <button className="section-view-all">View all</button>
                      </div>
                      <div className="recipe-scroll-row">
                        {results.slice(4, 8).map(r => (
                          <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                            isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                            onAddToMealPlan={onAddToMealPlan} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="section-heading">
                    {searched
                      ? mode === "ingredients" ? "Exact matches" : "Search results"
                      : cuisine || course ? "Filtered recipes" : "All recipes"}
                    <span className="count">{totalCount} recipes</span>
                  </h2>
                  <div className="recipe-grid">
                    {results.map(r => (
                      <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                        matchCount={mode === "ingredients" ? r.match_count : null}
                        requestedCount={mode === "ingredients" ? r.requested_count : null}
                        isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                        onAddToMealPlan={onAddToMealPlan} />
                    ))}
                  </div>
                </>
              )
            )}

            {/* Partial matches */}
            {mode === "ingredients" && searched && partials.length > 0 && (
              <div style={{ marginTop: "2.5rem" }}>
                <h2 className="section-heading">You might also like <span className="count">partial matches</span></h2>
                <div className="recipe-grid">
                  {partials.map(r => (
                    <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                      matchCount={r.match_count} requestedCount={r.requested_count}
                      isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                      onAddToMealPlan={onAddToMealPlan} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && searched && results.length === 0 && aiResults.length === 0 && (
              <div className="state-center">
                <div className="emoji">🍽️</div>
                <h3>No recipes found</h3>
                <p>{mode === "ingredients"
                  ? "Try adding different ingredients, or use fewer to broaden your search."
                  : "Try a different dish name, or browse all recipes by clearing your search."}</p>
                <button className="search-btn"
                  style={{ marginTop: "1.5rem", display: "inline-block", width: "auto", padding: ".65rem 1.75rem" }}
                  onClick={() => { setSearched(false); setResults([]); setQuery(""); setPills([]); loadBrowse(); }}>
                  Browse all recipes
                </button>
              </div>
            )}

            {/* Pagination */}
            {!searched && totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span className="page-info">Page {page} of {totalPages}</span>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        </main>

        {/* Right sidebar */}
        <RightSidebar
          user={user}
          onMealPlan={onMealPlan}
          onSelectRecipe={onSelectRecipe}
          onLogin={onLogin}
        />

      </div>
    </div>
  );
}
