import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";

const COURSES = ["main","soup","side","sauce","beverage","breakfast","snack","seasoning"];

export default function Home({ onSelectRecipe, user, onLogout }) {
  const [mode, setMode]               = useState("name");      // "name" | "ingredients" | "generate"
  const [query, setQuery]             = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

  // Ingredient / generate mode shared state
  const [pills, setPills]           = useState([]);
  const [ingInput, setIngInput]     = useState("");
  const [ingSuggest, setIngSuggest] = useState([]);
  const [showIngSug, setShowIngSug] = useState(false);

  // Results
  const [results, setResults]       = useState([]);
  const [aiResults, setAiResults]   = useState([]);
  const [partials, setPartials]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [searched, setSearched]     = useState(false);
  const [error, setError]           = useState("");

  // Generate mode state
  const [genRecipe, setGenRecipe]   = useState(null);
  const [generating, setGenerating] = useState(false);

  // Browse / filters
  const [cuisine, setCuisine]       = useState("");
  const [course, setCourse]         = useState("");
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const suggestRef = useRef(null);
  const ingRef     = useRef(null);

  // ── Initial browse load ────────────────────────────────────────────────────
  useEffect(() => { loadBrowse(); }, [cuisine, course, page]);

  async function loadBrowse() {
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
  }

  // ── Name auto-suggest ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "name" || query.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try { setSuggestions(await api.suggest(query)); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [query, mode]);

  // ── Ingredient auto-suggest ────────────────────────────────────────────────
  useEffect(() => {
    if ((mode !== "ingredients" && mode !== "generate") || ingInput.length < 2) {
      setIngSuggest([]); return;
    }
    const t = setTimeout(async () => {
      try { setIngSuggest(await api.ingredientSuggest(ingInput)); } catch {}
    }, 220);
    return () => clearTimeout(t);
  }, [ingInput, mode]);

  // ── Close dropdowns on outside click ──────────────────────────────────────
  useEffect(() => {
    function handle(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggest(false);
      if (ingRef.current && !ingRef.current.contains(e.target)) setShowIngSug(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Name search ───────────────────────────────────────────────────────────
  async function handleNameSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setShowSuggest(false);
    setLoading(true);
    setSearched(true);
    setError("");
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

  // ── Ingredient search ─────────────────────────────────────────────────────
  async function handleIngSearch() {
    if (pills.length < 2) { setError("Add at least 2 ingredients."); return; }
    setLoading(true);
    setAiLoading(true);
    setSearched(true);
    setError("");
    try {
      const [dbData, aiData] = await Promise.allSettled([
        api.searchIngredients({ ingredients: pills, cuisine }),
        api.aiSuggest(pills),
      ]);
      if (dbData.status === "fulfilled") {
        setResults(dbData.value.exact_matches || []);
        setPartials(dbData.value.partial_matches || []);
      }
      if (aiData.status === "fulfilled") {
        setAiResults(aiData.value.suggestions || []);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }

  // ── AI Generate ───────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (pills.length < 1) { setError("Add at least 1 ingredient."); return; }
    setGenerating(true);
    setError("");
    setGenRecipe(null);
    try {
      const data = await api.aiGenerate(pills);
      setGenRecipe(data.recipe);
    } catch (e) {
      setError(e.message || "Failed to generate recipe.");
    } finally {
      setGenerating(false);
    }
  }

  function addPill(name) {
    const n = name.trim().toLowerCase();
    if (!n || pills.includes(n)) return;
    setPills(p => [...p, n]);
    setIngInput("");
    setIngSuggest([]);
    setShowIngSug(false);
  }

  function handleIngKeyDown(e) {
    if ((e.key === "Enter" || e.key === ",") && ingInput.trim()) {
      e.preventDefault();
      addPill(ingInput);
    }
    if (e.key === "Backspace" && !ingInput && pills.length) {
      setPills(p => p.slice(0, -1));
    }
  }

  function switchMode(m) {
    setMode(m);
    setSearched(false);
    setResults([]);
    setAiResults([]);
    setPartials([]);
    setError("");
    setQuery("");
    setPills([]);
    setIngInput("");
    setGenRecipe(null);
    loadBrowse();
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

  // ── Ingredient pill input (shared between ingredients + generate modes) ────
  const PillInput = ({ hint, minPills = 2 }) => (
    <div className="ing-wrap" ref={ingRef}>
      <div className="ing-pills">
        {pills.map(p => (
          <span key={p} className="pill">
            {p}
            <button className="pill-remove" onClick={() => setPills(pills.filter(x => x !== p))}>×</button>
          </span>
        ))}
        <input
          className="ing-input"
          placeholder={pills.length === 0 ? "Type an ingredient and press Enter…" : "Add another…"}
          value={ingInput}
          onChange={e => { setIngInput(e.target.value); setShowIngSug(true); }}
          onKeyDown={handleIngKeyDown}
          onFocus={() => setShowIngSug(true)}
          autoComplete="off"
        />
        {showIngSug && ingSuggest.length > 0 && (
          <div className="ing-suggest">
            {ingSuggest.map(s => (
              <div key={s.id} className="ing-suggest-item" onMouseDown={() => addPill(s.name)}>
                <span>{s.name}</span>
                <span className="ing-cat">{s.category}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="ing-hint">{hint}</p>
    </div>
  );

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand">Cook<span>Smart</span></span>
        <div className="navbar-right">
          {totalCount > 0 && mode !== "generate" && (
            <span className="navbar-count">{totalCount} recipes</span>
          )}
          {user && (
            <div className="navbar-user">
              <span className="navbar-user-name">Hi, {user.name.split(" ")[0]}</span>
              <button className="navbar-logout" onClick={onLogout}>Sign out</button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <h1>
          {mode === "generate"
            ? "Generate a Recipe with AI"
            : "Discover African cuisine\u00a0& beyond"}
        </h1>
        <p>
          {mode === "generate"
            ? "Tell CookSmart AI what ingredients you have — it will create an authentic Ugandan recipe just for you."
            : "Search by dish name, or tell us what's in your kitchen and we'll find something delicious."}
        </p>

        {/* Mode toggle */}
        <div className="mode-toggle">
          <button className={`mode-btn${mode === "name" ? " active" : ""}`} onClick={() => switchMode("name")}>
            Search by name
          </button>
          <button className={`mode-btn${mode === "ingredients" ? " active" : ""}`} onClick={() => switchMode("ingredients")}>
            Search by ingredients
          </button>
          <button className={`mode-btn${mode === "generate" ? " active" : ""}`} onClick={() => switchMode("generate")}>
            ✨ Generate with AI
          </button>
        </div>

        {/* Name search */}
        {mode === "name" && (
          <div ref={suggestRef}>
            <form className="search-wrap" onSubmit={handleNameSearch}>
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
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
                    <div key={s.id} className="suggest-item" onMouseDown={() => { setQuery(s.name); setShowSuggest(false); onSelectRecipe(s.id); }}>
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

        {/* Ingredient search */}
        {mode === "ingredients" && (
          <>
            <PillInput hint={
              pills.length === 0 ? "Add at least 2 ingredients" :
              pills.length === 1 ? "Add at least 1 more ingredient" :
              `${pills.length} ingredients added — ready to search!`
            } />
            <div style={{ marginTop: ".75rem" }}>
              <button className="search-btn" onClick={handleIngSearch} disabled={pills.length < 2 || loading}>
                {loading ? "Searching…" : "Find recipes"}
              </button>
            </div>
          </>
        )}

        {/* Generate mode */}
        {mode === "generate" && (
          <>
            <PillInput hint={
              pills.length === 0 ? "Add at least 1 ingredient" :
              `${pills.length} ingredient${pills.length !== 1 ? "s" : ""} added — ready to generate!`
            } />
            <div style={{ marginTop: ".75rem" }}>
              <button className="search-btn" onClick={handleGenerate} disabled={pills.length < 1 || generating}>
                {generating ? "Generating recipe…" : "Generate Recipe"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="main">
        {error && (
          <div className="error-banner">{error}</div>
        )}

        {/* ── Generate mode results ── */}
        {mode === "generate" && generating && (
          <div className="gen-loading">
            <div className="spinner" style={{ margin: "0 auto 1rem" }} />
            <p>CookSmart AI is creating your recipe…</p>
            <p style={{ fontSize: ".85rem", marginTop: ".35rem" }}>This may take a few seconds.</p>
          </div>
        )}

        {mode === "generate" && genRecipe && (
          <div className="gen-panel">
            <div className="gen-header">
              <span className="ai-badge gen-badge">AI-Generated Recipe</span>
              <h2 className="gen-title">{genRecipe.dish_name}</h2>
              {genRecipe.local_name && (
                <p className="gen-local">{genRecipe.local_name}</p>
              )}
              <p className="gen-desc">{genRecipe.description}</p>
              <div className="gen-meta">
                {genRecipe.cuisine && (
                  <span className="meta-chip cuisine">{genRecipe.cuisine}</span>
                )}
                {genRecipe.cooking_time && (
                  <span className="meta-chip">⏱ {genRecipe.cooking_time}</span>
                )}
                {genRecipe.servings && (
                  <span className="meta-chip">👥 {genRecipe.servings}</span>
                )}
              </div>
            </div>

            <div className="gen-body">
              {/* Ingredients */}
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

              {/* Steps */}
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
              <div className="gen-tips">
                <strong>Chef's tip:</strong> {genRecipe.tips}
              </div>
            )}

            <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
              <button className="search-btn" style={{ background: "var(--earth)" }}
                onClick={() => { setGenRecipe(null); setPills([]); setError(""); }}>
                Generate Another
              </button>
            </div>
          </div>
        )}

        {/* ── Ingredient mode results ── */}
        {mode !== "generate" && (
          <>
            {/* Filters */}
            {!searched && (
              <div className="filters">
                <span className="filter-label">Cuisine:</span>
                {["african","western"].map(c => (
                  <button key={c} className={`filter-chip${cuisine === c ? " active" : ""}`} onClick={() => { setCuisine(cuisine === c ? "" : c); setPage(1); }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
                <span className="filter-label" style={{ marginLeft: "8px" }}>Course:</span>
                {COURSES.map(c => (
                  <button key={c} className={`filter-chip${course === c ? " active" : ""}`} onClick={() => { setCourse(course === c ? "" : c); setPage(1); }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* AI suggestions (ingredient mode) */}
            {mode === "ingredients" && searched && aiResults.length > 0 && (
              <div style={{ marginBottom: "2.5rem" }}>
                <h2 className="section-heading">
                  AI suggestions
                  <span className="ai-badge">CookSmart AI</span>
                  <span className="count">{aiResults.length} picks</span>
                </h2>
                <div className="recipe-grid">
                  {aiResults.map(r => (
                    <RecipeCard key={r.id} recipe={r} emoji={emoji(r)} onClick={() => onSelectRecipe(r.id)} aiReason={r.ai_reason} />
                  ))}
                </div>
              </div>
            )}

            {/* AI loading */}
            {mode === "ingredients" && searched && aiLoading && (
              <div style={{ marginBottom: "2rem", padding: "1.5rem", background: "var(--white)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="spinner" style={{ margin: 0, width: 24, height: 24, borderWidth: 2 }} />
                <span style={{ fontSize: ".9rem", color: "var(--stone)" }}>CookSmart AI is finding the best matches…</span>
              </div>
            )}

            {/* Results heading */}
            {results.length > 0 && (
              <h2 className="section-heading">
                {searched
                  ? mode === "ingredients" ? "Exact matches" : "Search results"
                  : cuisine || course ? "Filtered recipes" : "All recipes"}
                <span className="count">{totalCount} recipes</span>
              </h2>
            )}

            {/* Loading */}
            {loading && !aiLoading && (
              <div className="state-center">
                <div className="spinner" />
                <p>Finding recipes…</p>
              </div>
            )}

            {/* Results grid */}
            {!loading && results.length > 0 && (
              <div className="recipe-grid">
                {results.map(r => (
                  <RecipeCard
                    key={r.id}
                    recipe={r}
                    emoji={emoji(r)}
                    onClick={() => onSelectRecipe(r.id)}
                    matchCount={mode === "ingredients" ? r.match_count : null}
                    requestedCount={mode === "ingredients" ? r.requested_count : null}
                  />
                ))}
              </div>
            )}

            {/* Partial matches */}
            {mode === "ingredients" && searched && partials.length > 0 && (
              <div style={{ marginTop: "2.5rem" }}>
                <h2 className="section-heading">
                  You might also like
                  <span className="count">partial matches</span>
                </h2>
                <div className="recipe-grid">
                  {partials.map(r => (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      emoji={emoji(r)}
                      onClick={() => onSelectRecipe(r.id)}
                      matchCount={r.match_count}
                      requestedCount={r.requested_count}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && searched && results.length === 0 && aiResults.length === 0 && (
              <div className="state-center">
                <div className="emoji">🍽️</div>
                <h3>No recipes found</h3>
                <p>Try different {mode === "ingredients" ? "ingredients" : "search terms"} or remove a filter.</p>
              </div>
            )}

            {/* Pagination (browse mode) */}
            {!searched && totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span className="page-info">Page {page} of {totalPages}</span>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
