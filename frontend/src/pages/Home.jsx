import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import { useLang } from "../context/LanguageContext";
import {
  LayoutGrid, Globe, Soup, Utensils, Coffee, GlassWater, Cookie,
  Home as HomeIcon, Search, CalendarDays, ChefHat, Heart,
} from "lucide-react";

const COURSES = ["main","soup","side","sauce","beverage","breakfast","snack","seasoning"];

const CATEGORY_FILTERS = [
  { label: "All Recipes", Icon: LayoutGrid, cuisine: "",       course: "" },
  { label: "African",     Icon: Globe,      cuisine: "african", course: "" },
  { label: "Soups",       Icon: Soup,       cuisine: "",       course: "soup" },
  { label: "Main Dishes", Icon: Utensils,   cuisine: "",       course: "main" },
  { label: "Breakfast",   Icon: Coffee,     cuisine: "",       course: "breakfast" },
  { label: "Drinks",      Icon: GlassWater, cuisine: "",       course: "beverage" },
  { label: "Snacks",      Icon: Cookie,     cuisine: "",       course: "snack" },
];

// ── PillInput must be defined at MODULE level ─────────────────────────────────
// If defined inside Home, React treats it as a new component type on every
// render, unmounting the input and killing keyboard focus on every keystroke.
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

  // ── AI Generate CTA (bottom section) ─────────────────────────────────────
  const [genOpen, setGenOpen]   = useState(false);
  const [genText, setGenText]   = useState("");
  const [genPills, setGenPills] = useState([]);
  const [genLoading, setGenLoading] = useState(false);

  // Guest generation limit — 2 free per session, tracked in localStorage
  const [genCount, setGenCount]       = useState(() => parseInt(localStorage.getItem('cs_gen_count') || '0', 10));
  const [genLimitHit, setGenLimitHit] = useState(false);

  const [genClarifyMsg, setGenClarifyMsg] = useState("");

  // Save-to-profile state — single recipe
  const [genSaved, setGenSaved]   = useState(false);
  const [genSaving, setGenSaving] = useState(false);

  // Save-to-profile state — combo meal (indexed by section position)
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
      setResults(data.results);
      setTotalPages(data.pages);
      setTotalCount(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cuisine, course, page]);

  useEffect(() => { loadBrowse(); }, [loadBrowse]);

  // ── Name auto-suggest (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (mode !== "name" || query.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const raw = await api.suggest(query);
        const q = query.toLowerCase();
        // Client-side word-boundary filter: 'tea' must start or follow a space
        // in the name — prevents 'Steamed Yams' matching because 's-t-e-a-med'
        // contains the substring 'tea' in the middle of a word.
        setSuggestions(
          raw.filter(s => {
            const name = s.name.toLowerCase();
            return name.startsWith(q) || name.includes(' ' + q);
          })
        );
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode]);

  // ── Ingredient auto-suggest (debounced) ───────────────────────────────────
  useEffect(() => {
    if (mode !== "ingredients" || ingInput.length < 2) { setIngSuggest([]); return; }
    const t = setTimeout(async () => {
      try { setIngSuggest(await api.ingredientSuggest(ingInput)); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [ingInput, mode]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    function handle(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggest(false);
      if (ingRef.current     && !ingRef.current.contains(e.target))     setShowIngSug(false);
      if (menuOpen && !e.target.closest('.navbar') && !e.target.closest('.mobile-menu')) setMenuOpen(false);
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
      setResults(data.results);
      setTotalPages(data.pages);
      setTotalCount(data.total);
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
      if (aiData.status === "fulfilled") {
        setAiResults(aiData.value.suggestions || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false); setAiLoading(false);
    }
  }

  async function handleGenerate() {
    // Enforce guest generation limit
    if (!user && genCount >= 2) {
      setGenLimitHit(true);
      return;
    }

    let ingredients = [...genPills];
    const context = genText.trim();
    if (!ingredients.length && !context) {
      setError("Describe what you have or add some ingredients."); return;
    }
    setGenRecipe(null); setGenSaved(false); setGenSectionSaved([]); setGenSectionSaving([]); setGenLoading(true); setError(""); setGenClarifyMsg("");
    // NLP extraction if user typed plain text and no pills yet
    if (context && !ingredients.length) {
      try {
        const data = await api.nlpExtract(context);
        ingredients = data.ingredients || [];
        if (ingredients.length) setGenPills(ingredients);
      } catch {}
    }
    if (!ingredients.length) {
      setError("Could you describe a bit more what you'd like to cook?");
      setGenLoading(false); return;
    }
    setGenerating(true);
    try {
      const data = await api.aiGenerate(ingredients, context);
      if (data.clarify) {
        setGenClarifyMsg(data.message);
        return;
      }
      setGenRecipe(data.recipe);
      setGenOpen(false);
      // Increment guest counter only on a real recipe
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
    try {
      await api.saveGeneratedRecipe(genRecipe);
      setGenSaved(true);
    } catch (e) {
      setError(e.message || "Failed to save recipe.");
    } finally {
      setGenSaving(false);
    }
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
    setIngInput("");
    setIngSuggest([]);
    setShowIngSug(false);
  }, []);

  const handleIngKeyDown = useCallback((e) => {
    if ((e.key === "Enter" || e.key === ",") && ingInput.trim()) {
      e.preventDefault();
      addPill(ingInput);
    }
    if (e.key === "Backspace" && !ingInput) {
      setPills(p => p.slice(0, -1));
    }
  }, [ingInput, addPill]);

  const handleIngChange = useCallback((e) => {
    setIngInput(e.target.value);
    setShowIngSug(true);
  }, []);

  const handleIngFocus = useCallback(() => setShowIngSug(true), []);
  const handleRemovePill = useCallback((p) => setPills(pills => pills.filter(x => x !== p)), []);

  function switchMode(m) {
    setMode(m); setSearched(false);
    setResults([]); setAiResults([]); setPartials([]);
    setError(""); setQuery(""); setPills([]);
    setIngInput("");
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
    if (n.includes("tea") || n.includes("beverage") || n.includes("juice")) return "☕";
    if (r.course === "beverage") return "🥤";
    if (r.cuisine_type === "african") return "🌍";
    return "🍽️";
  };

  const pillHint = pills.length === 0 ? "Add at least 2 ingredients"
    : pills.length === 1 ? "Add 1 more ingredient"
    : `${pills.length} ingredients added — ready to search!`;

  return (
    <div className="app">

      {/* ── Navbar ── */}
      <nav className="navbar">
        <span className="navbar-brand">Cook<span>Smart</span></span>
        <div className="navbar-right">
          {totalCount > 0 && mode !== "generate" && (
            <span className="navbar-count">{totalCount} recipes</span>
          )}
          {/* Language toggle */}
          <div style={{ display: "inline-flex", border: "1.5px solid var(--border)", borderRadius: 99, overflow: "hidden", flexShrink: 0 }}>
            {["en", "lg"].map(code => (
              <button
                key={code}
                onClick={() => lang !== code && toggleLang()}
                style={{
                  padding: "3px 9px", border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: ".72rem", fontWeight: 700,
                  letterSpacing: ".04em", transition: "all .15s",
                  background: lang === code ? "var(--earth)" : "transparent",
                  color:      lang === code ? "var(--white)" : "var(--stone)",
                }}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          {user ? (
            <div className="navbar-user">
              <span className="navbar-user-name">Hi, {user.name.split(" ")[0]}</span>
              <button className="navbar-profile-btn" onClick={onMealPlan}>{t("nav_mealplan")}</button>
              <button className="navbar-profile-btn" onClick={onProfile}>{t("nav_profile")}</button>
              <button className="navbar-logout" onClick={onLogout}>{t("nav_signout")}</button>
            </div>
          ) : (
            <div className="navbar-guest">
              <button className="navbar-signin-btn" onClick={onLogin}>{t("nav_signin")}</button>
            </div>
          )}
          {/* Hamburger — mobile only, shown via CSS */}
          <button
            className={`hamburger${menuOpen ? " open" : ""}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div className="mobile-menu">
          {user ? (
            <>
              <p className="mobile-menu-greeting">Hi, {user.name.split(" ")[0]}</p>
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { onMealPlan(); setMenuOpen(false); }}>
                {t("nav_mealplan")}
              </button>
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { onProfile(); setMenuOpen(false); }}>
                {t("nav_profile")}
              </button>
              <button className="mobile-menu-btn mobile-menu-btn--ghost" onClick={() => { onLogout(); setMenuOpen(false); }}>
                {t("nav_signout")}
              </button>
            </>
          ) : (
            <button className="mobile-menu-btn" onClick={() => { onLogin(); setMenuOpen(false); }}>
              {t("nav_signin")}
            </button>
          )}
        </div>
      )}

      {/* ── Secondary Nav ── */}
      <div className="secondary-nav">
        <div className="secondary-nav-inner">
          <button className="snav-item" onClick={() => { setSearched(false); setMode("name"); setQuery(""); setCuisine(""); setCourse(""); }}>
            <HomeIcon size={15} strokeWidth={1.8} /> Home
          </button>
          <button className="snav-item" onClick={() => { setMode("name"); setSearched(false); setQuery(""); }}>
            <Search size={15} strokeWidth={1.8} /> Explore Recipes
          </button>
          <button className="snav-item" onClick={() => { setSearched(false); setCuisine(""); setCourse(""); setMode("name"); }}>
            <LayoutGrid size={15} strokeWidth={1.8} /> Categories
          </button>
          {user && (
            <>
              <button className="snav-item" onClick={onMealPlan}>
                <CalendarDays size={15} strokeWidth={1.8} /> Meal Planner
              </button>
              <button className="snav-item" onClick={onProfile}>
                <ChefHat size={15} strokeWidth={1.8} /> My Recipes
              </button>
              <button className="snav-item" onClick={onProfile}>
                <Heart size={15} strokeWidth={1.8} /> Favorites
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="hero">
        <h1>Good food. Made easy.<br />Made for you.</h1>
        <p>Discover African recipes, get smart suggestions and cook with confidence.</p>

        {/* Mode toggle */}
        <div className="mode-toggle">
          <button className={`mode-btn${mode === "name" ? " active" : ""}`} onClick={() => switchMode("name")}>
            {t("by_name")}
          </button>
          <button className={`mode-btn${mode === "ingredients" ? " active" : ""}`} onClick={() => switchMode("ingredients")}>
            {t("by_ingredients")}
          </button>
        </div>

        {/* Name search */}
        {mode === "name" && (
          <div ref={suggestRef} style={{ position: "relative", zIndex: 10 }}>
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
            <div className="popular-chips">
              <span className="popular-label">Popular searches:</span>
              {["Jollof Rice", "Matoke", "Chicken Stew", "Groundnut Soup", "Fried Plantain"].map(q => (
                <button key={q} className="popular-chip" onClick={() => { setQuery(q); searchByName(q); }}>
                  {q}
                </button>
              ))}
            </div>
            <div style={{ marginTop: "1rem" }}>
              <button className="search-btn" onClick={handleNameSearch} disabled={!query.trim()}>
                {t("search_btn")}
              </button>
            </div>
          </div>
        )}

        {/* Ingredient pill input */}
        {mode === "ingredients" && (
          <>
            <PillInput
              pills={pills}
              ingInput={ingInput}
              ingRef={ingRef}
              ingSuggest={ingSuggest}
              showIngSug={showIngSug}
              hint={pillHint}
              onIngChange={handleIngChange}
              onKeyDown={handleIngKeyDown}
              onFocus={handleIngFocus}
              onSuggestPick={addPill}
              onRemovePill={handleRemovePill}
            />
            <div style={{ marginTop: ".75rem" }}>
              <button className="search-btn" onClick={handleIngSearch} disabled={pills.length < 2 || loading}>
                {loading ? "…" : t("search_ing_btn")}
              </button>
            </div>

          </>
        )}

        {/* ── AI Generate CTA ── */}
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
                <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenLimitHit(false); setGenRecipe(null); setError(""); }}>
                  Cancel
                </button>
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
                rows={3}
                autoFocus
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

      {/* ── Main content ── */}
      <div className="main">
        {error && <div className="error-banner">{error}</div>}

        {/* Generate results */}
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

        {genRecipe && (
          <div className="gen-panel">
            {genRecipe.sections ? (
              /* ── Combo meal ── */
              <>
                <div className="gen-header">
                  <span className="ai-badge gen-badge">AI-Generated Meal</span>
                  <h2 className="gen-title">Combination Meal</h2>
                  <p className="gen-desc">
                    {genRecipe.sections.length} dishes generated based on your request.
                  </p>
                </div>

                {genRecipe.sections.map((section, idx) => (
                  <div key={idx} className="combo-section">
                    <div className={`combo-label combo-label--${(section.label || "").toLowerCase()}`}>
                      {section.label}
                    </div>
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
                    {section.tips && (
                      <div className="gen-tips"><strong>Chef's tip:</strong> {section.tips}</div>
                    )}
                    {section.health_tip && (
                      <div className="gen-health-tip">
                        <span className="gen-health-icon">🌿</span>
                        <div>
                          <strong>Health Tip</strong>
                          <p>{section.health_tip}</p>
                        </div>
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
                      <button className="gen-dl-btn" onClick={() => downloadRecipePDF(section, "ai")}>
                        ⬇ Download PDF
                      </button>
                      {!user && <span className="gen-save-hint">Sign in to save</span>}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              /* ── Single recipe ── */
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
                {genRecipe.tips && (
                  <div className="gen-tips"><strong>Chef's tip:</strong> {genRecipe.tips}</div>
                )}
                {genRecipe.health_tip && (
                  <div className="gen-health-tip">
                    <span className="gen-health-icon">🌿</span>
                    <div>
                      <strong>Health Tip</strong>
                      <p>{genRecipe.health_tip}</p>
                    </div>
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
                  <button className="gen-dl-btn" onClick={() => downloadRecipePDF(genRecipe, "ai")}>
                    ⬇ Download PDF
                  </button>
                  {!user && <span className="gen-save-hint">Sign in to save this recipe</span>}
                </div>
              </>
            )}
          </div>
        )}

        {/* Browse / search results */}
        <>
          {!searched && (
              <div className="category-section">
                <h2 className="category-section-title">Browse by category</h2>
                <div className="category-pills">
                  {CATEGORY_FILTERS.map(cat => {
                    const isActive = cat.cuisine === cuisine && cat.course === course;
                    return (
                      <button
                        key={cat.label}
                        className={`category-pill${isActive ? " active" : ""}`}
                        onClick={() => { setCuisine(cat.cuisine); setCourse(cat.course); setPage(1); }}
                      >
                        <div className="category-pill-icon-wrap">
                          <cat.Icon size={22} strokeWidth={1.8} />
                        </div>
                        <span className="category-pill-label">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "ingredients" && searched && aiResults.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 className="section-heading">
                  AI suggestions <span className="ai-badge">CookSmart AI</span>
                  <span className="count">{aiResults.length} picks</span>
                </h2>
                <div className="recipe-grid">
                  {aiResults.map(r => (
                    <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)} aiReason={r.ai_reason}
                      isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                      onAddToMealPlan={onAddToMealPlan} />
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

            {results.length > 0 && (
              <h2 className="section-heading">
                {searched
                  ? mode === "ingredients" ? "Exact matches" : "Search results"
                  : cuisine || course ? "Filtered recipes" : "All recipes"}
                <span className="count">{totalCount} recipes</span>
              </h2>
            )}

            {loading && !aiLoading && <SkeletonGrid />}

            {!loading && results.length > 0 && (
              <div className="recipe-grid">
                {results.map(r => (
                  <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                    matchCount={mode === "ingredients" ? r.match_count : null}
                    requestedCount={mode === "ingredients" ? r.requested_count : null}
                    isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                    onAddToMealPlan={onAddToMealPlan} />
                ))}
              </div>
            )}

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

            {!loading && searched && results.length === 0 && aiResults.length === 0 && (
              <div className="state-center">
                <div className="emoji">🍽️</div>
                <h3>No recipes found</h3>
                <p>
                  {mode === "ingredients"
                    ? "Try adding different ingredients, or use fewer to broaden your search."
                    : "Try a different dish name, or browse all recipes by clearing your search."}
                </p>
                <button
                  className="search-btn"
                  style={{ marginTop: "1.5rem", display: "inline-block", width: "auto", padding: ".65rem 1.75rem" }}
                  onClick={() => { setSearched(false); setResults([]); setQuery(""); setPills([]); loadBrowse(); }}
                >
                  Browse all recipes
                </button>
              </div>
            )}

            {!searched && totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span className="page-info">Page {page} of {totalPages}</span>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
        </>
      </div>
    </div>
  );
}
