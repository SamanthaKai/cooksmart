import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";

const COURSES = ["main","soup","side","sauce","beverage","breakfast","snack","seasoning"];

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

export default function Home({ onSelectRecipe, user, onLogout, onProfile, onLogin, savedIds, onToggleSave, onRequestLogin }) {
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
      try { setSuggestions(await api.suggest(query)); } catch {}
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
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleNameSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setShowSuggest(false);
    setLoading(true); setSearched(true); setError("");
    try {
      const data = await api.search({ q: query, cuisine, course, page: 1, per_page: 12 });
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
    let ingredients = [...genPills];
    const context = genText.trim();
    if (!ingredients.length && !context) {
      setError("Describe what you have or add some ingredients."); return;
    }
    setGenRecipe(null); setGenLoading(true); setError("");
    // NLP extraction if user typed plain text and no pills yet
    if (context && !ingredients.length) {
      try {
        const data = await api.nlpExtract(context);
        ingredients = data.ingredients || [];
        if (ingredients.length) setGenPills(ingredients);
      } catch {}
    }
    if (!ingredients.length) {
      setError("Couldn't extract ingredients — try listing them more specifically.");
      setGenLoading(false); return;
    }
    setGenerating(true);
    try {
      const data = await api.aiGenerate(ingredients, context);
      setGenRecipe(data.recipe);
    } catch (e) {
      setError(e.message || "Failed to generate recipe.");
    } finally {
      setGenerating(false); setGenLoading(false);
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
          {user ? (
            <div className="navbar-user">
              <span className="navbar-user-name">Hi, {user.name.split(" ")[0]}</span>
              <button className="navbar-profile-btn" onClick={onProfile}>Profile</button>
              <button className="navbar-logout" onClick={onLogout}>Sign out</button>
            </div>
          ) : (
            <div className="navbar-guest">
              <button className="navbar-signin-btn" onClick={onLogin}>Sign in</button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="hero">
        <h1>Discover African cuisine&nbsp;&amp; beyond</h1>
        <p>Search by dish name, or tell us what's in your kitchen and we'll find something delicious.</p>

        {/* Mode toggle */}
        <div className="mode-toggle">
          <button className={`mode-btn${mode === "name" ? " active" : ""}`} onClick={() => switchMode("name")}>
            By name
          </button>
          <button className={`mode-btn${mode === "ingredients" ? " active" : ""}`} onClick={() => switchMode("ingredients")}>
            By ingredients
          </button>
        </div>

        {/* Name search */}
        {mode === "name" && (
          <div ref={suggestRef}>
            <form className="search-wrap" onSubmit={handleNameSearch}>
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
              </span>
              <input
                className="search-input"
                placeholder="e.g. Matoke, Jollof Rice, Chicken Stew…"
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
            <div style={{ marginTop: "1rem" }}>
              <button className="search-btn" onClick={handleNameSearch} disabled={!query.trim()}>
                Search recipes
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
                {loading ? "Searching…" : "Find recipes"}
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
              {genPills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".6rem" }}>
                  {genPills.map(p => (
                    <span key={p} className="pill">
                      {p}
                      <button type="button" className="pill-remove" onClick={() => setGenPills(ps => ps.filter(x => x !== p))}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="ai-gen-actions">
                <button className="search-btn" onClick={handleGenerate}
                  disabled={genLoading || generating || (!genText.trim() && !genPills.length)}>
                  {generating ? "Generating…" : genLoading ? "Reading ingredients…" : "Build my dish"}
                </button>
                <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenText(""); setGenPills([]); setGenRecipe(null); setError(""); }}>
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

        {genRecipe && (
          <div className="gen-panel">
            <div className="gen-header">
              <span className="ai-badge gen-badge">AI-Generated Recipe</span>
              <h2 className="gen-title">{genRecipe.dish_name}</h2>
              {genRecipe.local_name && <p className="gen-local">{genRecipe.local_name}</p>}
              <p className="gen-desc">{genRecipe.description}</p>
              <div className="gen-meta">
                {genRecipe.cuisine     && <span className="meta-chip cuisine">{genRecipe.cuisine}</span>}
                {genRecipe.cooking_time && <span className="meta-chip">⏱ {genRecipe.cooking_time}</span>}
                {genRecipe.servings    && <span className="meta-chip">👥 {genRecipe.servings}</span>}
              </div>
            </div>
            <div className="gen-body">
              <div className="gen-section">
                <h3>Ingredients</h3>
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
                <h3>Instructions</h3>
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
          </div>
        )}

        {/* Browse / search results */}
        <>
          {!searched && (
              <div className="filters">
                <span className="filter-label">Cuisine:</span>
                {["african","western"].map(c => (
                  <button key={c} className={`filter-chip${cuisine === c ? " active" : ""}`}
                    onClick={() => { setCuisine(cuisine === c ? "" : c); setPage(1); }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
                <span className="filter-label" style={{ marginLeft: "8px" }}>Course:</span>
                {COURSES.map(c => (
                  <button key={c} className={`filter-chip${course === c ? " active" : ""}`}
                    onClick={() => { setCourse(course === c ? "" : c); setPage(1); }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
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
                      isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin} />
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

            {loading && !aiLoading && (
              <div className="state-center"><div className="spinner" /><p>Finding recipes…</p></div>
            )}

            {!loading && results.length > 0 && (
              <div className="recipe-grid">
                {results.map(r => (
                  <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)}
                    matchCount={mode === "ingredients" ? r.match_count : null}
                    requestedCount={mode === "ingredients" ? r.requested_count : null}
                    isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin} />
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
                      isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin} />
                  ))}
                </div>
              </div>
            )}

            {!loading && searched && results.length === 0 && aiResults.length === 0 && (
              <div className="state-center">
                <div className="emoji">🍽️</div>
                <h3>No recipes found</h3>
                <p>Try different {mode === "ingredients" ? "ingredients" : "search terms"} or remove a filter.</p>
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
