import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api/client";
import RecipeCard from "../components/RecipeCard";
import LeftSidebar from "../components/LeftSidebar";
import ProfilePage from "./ProfilePage";
import MealPlanPage from "./MealPlanPage";
import RecipeDetail from "./RecipeDetail";
import { useLang } from "../context/LanguageContext";
import {
  LayoutGrid, Globe, Soup, UtensilsCrossed, Cookie, Sun, GlassWater,
  Bell, ChevronDown, ChevronUp, X as XIcon, Plus, Trash2,
  Search, ShoppingBasket, Sparkles, User,
  Home as HomeIcon, CalendarDays, Heart, Bookmark, ShoppingCart,
  Clock, Users, Leaf, Info,
} from "lucide-react";

const CATEGORY_FILTERS = [
  { label: "All Recipes", Icon: LayoutGrid,      type: "all" },
  { label: "African",     Icon: Globe,           type: "cuisine", value: "african" },
  { label: "Soups",       Icon: Soup,            type: "course",  value: "soup" },
  { label: "Main Dishes", Icon: UtensilsCrossed, type: "course",  value: "main" },
  { label: "Snacks",      Icon: Cookie,          type: "course",  value: "snack" },
  { label: "Breakfast",   Icon: Sun,             type: "course",  value: "breakfast" },
  { label: "Drinks",      Icon: GlassWater,      type: "course",  value: "beverage" },
];

function PillInput({ pills, ingInput, ingRef, ingSuggest, showIngSug, hint,
                     onIngChange, onKeyDown, onFocus, onSuggestPick, onRemovePill, inputRef }) {
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
          ref={inputRef}
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

// Inline guest gate shown within a locked view
function GuestGateView({ message, onSignIn }) {
  return (
    <div className="guest-gate">
      <div className="guest-gate-icon">
        <User size={32} strokeWidth={1.5} />
      </div>
      <p className="guest-gate-msg">{message}</p>
      <button className="guest-gate-btn" onClick={onSignIn}>Sign In</button>
    </div>
  );
}

export default function Home({
  onSelectRecipe, user, onLogout, onLogin, onUserUpdate,
  savedIds, likedIds, onToggleSave, onToggleLike, onRequestLogin, onAddToMealPlan,
  currentRecipeId, onClearRecipe,
}) {
  const { t } = useLang();
  const [menuOpen, setMenuOpen]         = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView] = useState("home");
  // "home"|"explore"|"airecipes"|"myrecipes"|"favorites"|"shopping"|"mealplan"|"profile"

  // ── Search / filter ───────────────────────────────────────────────────────
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
  const [genOpen, setGenOpen]       = useState(false);

  const [genText, setGenText]       = useState("");
  const [genPills, setGenPills]     = useState([]);
  const [genLoading, setGenLoading] = useState(false);

  // ── AI Recipes history ────────────────────────────────────────────────────
  const [aiHistory, setAiHistory]         = useState([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(false);
  const [aiExpandedId, setAiExpandedId]   = useState(null);
  const [aiDeletingId, setAiDeletingId]   = useState(null);

  const [genCount, setGenCount]         = useState(() => parseInt(localStorage.getItem('cs_gen_count') || '0', 10));
  const [genLimitHit, setGenLimitHit]   = useState(false);
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

  // ── My Recipes / Favorites ────────────────────────────────────────────────
  const [viewRecipes, setViewRecipes] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);

  // ── Mobile guest banner ───────────────────────────────────────────────────
  const [mobileBanner, setMobileBanner] = useState(null);

  // ── Shopping list (localStorage) ─────────────────────────────────────────
  const [shoppingItems, setShoppingItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs_shopping') || '[]'); } catch { return []; }
  });
  const [shoppingInput, setShoppingInput] = useState("");

  const suggestRef   = useRef(null);
  const ingRef       = useRef(null);
  const nameInputRef = useRef(null);
  const ingInputRef  = useRef(null);
  const userMenuRef  = useRef(null);

  useEffect(() => {
    localStorage.setItem('cs_shopping', JSON.stringify(shoppingItems));
  }, [shoppingItems]);

  useEffect(() => {
    if (view === "myrecipes" && user) {
      setViewLoading(true);
      api.getSaved()
        .then(d => setViewRecipes(d.recipes || []))
        .catch(() => setViewRecipes([]))
        .finally(() => setViewLoading(false));
    } else if (view === "favorites" && user) {
      setViewLoading(true);
      api.getLiked()
        .then(d => setViewRecipes(d.recipes || []))
        .catch(() => setViewRecipes([]))
        .finally(() => setViewLoading(false));
    } else if (view === "airecipes" && user) {
      setAiHistoryLoading(true);
      api.getGeneratedRecipes()
        .then(d => setAiHistory(d.recipes || []))
        .catch(() => setAiHistory([]))
        .finally(() => setAiHistoryLoading(false));
    }
  }, [view, user]);

  // ── Browse ────────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (view === "explore" || view === "home") loadBrowse();
  }, [loadBrowse, view]);

  // ── Autocomplete ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (mode !== "ingredients" || ingInput.length < 2) { setIngSuggest([]); return; }
    const timer = setTimeout(async () => {
      try { setIngSuggest(await api.ingredientSuggest(ingInput)); } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [ingInput, mode]);

  useEffect(() => {
    function handle(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggest(false);
      if (ingRef.current     && !ingRef.current.contains(e.target))     setShowIngSug(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (menuOpen && !e.target.closest('.home-topbar') && !e.target.closest('.mobile-menu')) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  // ── Search handlers ───────────────────────────────────────────────────────
  async function searchByName(searchQuery) {
    if (!searchQuery.trim()) return;
    setView("explore");
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
    setView("explore");
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
    if (!ingredients.length) { setError("Could you describe a bit more?"); setGenLoading(false); return; }
    setGenerating(true);
    try {
      const data = await api.aiGenerate(ingredients, context);
      if (data.clarify) { setGenClarifyMsg(data.message); return; }
      setGenRecipe(data.recipe);
      setGenOpen(false);
      setView("explore");
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

  async function handleDeleteAiRecipe(id) {
    setAiDeletingId(id);
    try {
      await api.deleteGeneratedRecipe(id);
      setAiHistory(prev => prev.filter(r => r.id !== id));
      if (aiExpandedId === id) setAiExpandedId(null);
    } catch {}
    finally { setAiDeletingId(null); }
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
    setView("explore");
  }

  // ── Sidebar navigation ────────────────────────────────────────────────────
  function handleSidebarNavigate(id) {
    if (currentRecipeId) onClearRecipe?.();
    setMobileBanner(null);

    if (id === "home") {
      setView("home");
      setSearched(false); setCuisine(""); setCourse("");
      setMode("name"); setQuery(""); setPills([]);
      setGenOpen(false); setGenRecipe(null);
    } else if (id === "explore") {
      setView("explore");
      setSearched(false); setQuery("");
    } else if (id === "airecipes") {
      setView("airecipes");
      setAiExpandedId(null);
    } else if (id === "mealplan") {
      if (!user) { onRequestLogin(); return; }
      setView("mealplan");
    } else if (id === "profile") {
      if (!user) { onRequestLogin(); return; }
      setView("profile");
    } else {
      setView(id); // myrecipes | favorites | shopping
    }
  }

  function showMobileBanner(feature) {
    const messages = {
      mealplan:  "Save your meal plan — sign in (free)",
      favorites: "Favorites are saved with your account. Sign in to keep them.",
    };
    setMobileBanner({ feature, message: messages[feature] });
    setTimeout(() => setMobileBanner(null), 4000);
  }

  // ── Shopping helpers ──────────────────────────────────────────────────────
  function addShoppingItem() {
    const name = shoppingInput.trim();
    if (!name) return;
    setShoppingItems(prev => [...prev, { id: Date.now(), name, checked: false }]);
    setShoppingInput("");
  }

  function toggleShoppingItem(id) {
    setShoppingItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  }

  function removeShoppingItem(id) {
    setShoppingItems(prev => prev.filter(item => item.id !== id));
  }

  function clearCheckedItems() {
    setShoppingItems(prev => prev.filter(item => !item.checked));
  }

  function handleCardSearchName() {
    if (mode !== "name") switchMode("name");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => nameInputRef.current?.focus(), 300);
  }

  function handleCardSearchIngredients() {
    if (mode !== "ingredients") switchMode("ingredients");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => ingInputRef.current?.focus(), 300);
  }

  const pillHint = pills.length === 0 ? "Add at least 2 ingredients"
    : pills.length === 1 ? "Add 1 more ingredient"
    : `${pills.length} ingredients — ready to search!`;

  const activePage =
    view === "airecipes"  ? "airecipes"  :
    view === "myrecipes"  ? "myrecipes"  :
    view === "favorites"  ? "favorites"  :
    view === "shopping"   ? "shopping"   :
    view === "mealplan"   ? "mealplan"   :
    view === "profile"    ? "profile"    :
    searched || view === "explore" ? "explore" :
    (cuisine || course) ? "categories" : "home";

  const isHeroView = view === "home" || view === "explore";

  // ── AI gen panel renderer (shared between airecipes view) ────────────────
  function renderGenPanel() {
    if (!genRecipe) return null;
    return (
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
                    {section.cooking_time && <span className="meta-chip"><Clock size={12} strokeWidth={2} style={{ marginRight: 3 }} />{section.cooking_time}</span>}
                    {section.servings     && <span className="meta-chip"><Users size={12} strokeWidth={2} style={{ marginRight: 3 }} />{section.servings}</span>}
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
                    <span className="gen-health-icon"><Leaf size={16} strokeWidth={1.8} /></span>
                    <div><strong>Health Tip</strong><p>{section.health_tip}</p></div>
                  </div>
                )}
                <div className="gen-save-bar">
                  <button
                    className={`gen-save-btn${genSectionSaved[idx] ? " saved" : ""}`}
                    onClick={user ? () => handleSaveSectionRecipe(section, idx) : undefined}
                    disabled={!user || genSectionSaving[idx] || genSectionSaved[idx]}
                    title={!user ? "Sign in to save" : undefined}
                  >
                    {genSectionSaved[idx] ? "Saved!" : genSectionSaving[idx] ? "Saving…" : "Save to my profile"}
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
                {genRecipe.cooking_time && <span className="meta-chip"><Clock size={12} strokeWidth={2} style={{ marginRight: 3 }} />{genRecipe.cooking_time}</span>}
                {genRecipe.servings     && <span className="meta-chip"><Users size={12} strokeWidth={2} style={{ marginRight: 3 }} />{genRecipe.servings}</span>}
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
                <span className="gen-health-icon"><Leaf size={16} strokeWidth={1.8} /></span>
                <div><strong>Health Tip</strong><p>{genRecipe.health_tip}</p></div>
              </div>
            )}
            <div className="gen-save-bar">
              <button
                className={`gen-save-btn${genSaved ? " saved" : ""}`}
                onClick={user ? handleSaveRecipe : undefined}
                disabled={!user || genSaving || genSaved}
                title={!user ? "Sign in to save" : undefined}
              >
                {genSaved ? "Saved to profile!" : genSaving ? "Saving…" : "Save to my profile"}
              </button>
              {!user && <span className="gen-save-hint">Sign in to save this recipe</span>}
            </div>
          </>
        )}
      </div>
    );
  }

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
          <button className="topbar-icon-btn" aria-label="Notifications">
            <Bell size={18} strokeWidth={1.8} />
          </button>

          {user ? (
            <div
              ref={userMenuRef}
              className="topbar-user"
              onClick={() => setUserMenuOpen(o => !o)}
              role="button"
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <div className="topbar-avatar">{user.name[0].toUpperCase()}</div>
              <ChevronDown size={14} strokeWidth={2} style={{ color: "var(--stone)" }} />
              <div className="topbar-dropdown" style={{ display: userMenuOpen ? "flex" : "none" }}>
                <button
                  className="topbar-dd-item topbar-dd-item--danger"
                  onClick={e => { e.stopPropagation(); onLogout(); setUserMenuOpen(false); }}
                >
                  {t("nav_signout")}
                </button>
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
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { handleSidebarNavigate("favorites"); setMenuOpen(false); }}>Favorites</button>
              <button className="mobile-menu-btn mobile-menu-btn--secondary" onClick={() => { handleSidebarNavigate("myrecipes"); setMenuOpen(false); }}>Saved Recipes</button>
              <button className="mobile-menu-btn mobile-menu-btn--ghost" onClick={() => { onLogout(); setMenuOpen(false); }}>{t("nav_signout")}</button>
            </>
          ) : (
            <button className="mobile-menu-btn" onClick={() => { onLogin(); setMenuOpen(false); }}>{t("nav_signin")}</button>
          )}
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="home-body">

        <LeftSidebar
          user={user}
          onRequestLogin={onRequestLogin}
          activePage={activePage}
          onNavigate={handleSidebarNavigate}
          onCategorySelect={handleCatClick}
        />

        <main className="home-main">
          {/* ════ RECIPE DETAIL — shown over any view ════ */}
          {currentRecipeId && (
            <div key={`recipe-${currentRecipeId}`} className="view-fade">
              <div className="home-content" style={{ paddingTop: "1.5rem" }}>
                <RecipeDetail
                  isEmbedded
                  recipeId={currentRecipeId}
                  onBack={() => { onClearRecipe(); window.scrollTo(0, 0); }}
                  onSelectRecipe={onSelectRecipe}
                  savedIds={savedIds}
                  likedIds={likedIds}
                  onToggleSave={onToggleSave}
                  onToggleLike={onToggleLike}
                  onRequestLogin={onRequestLogin}
                  onAddToMealPlan={onAddToMealPlan}
                />
              </div>
            </div>
          )}

          {!currentRecipeId && <div key={view} className="view-fade">

            {/* ════ AI RECIPES — history of saved generated recipes ════ */}
            {view === "airecipes" && (
              <div className="home-content">
                <div className="view-section-head">
                  <h2 className="view-section-title">
                    <Sparkles size={20} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
                    AI Recipes
                  </h2>
                  <p className="view-section-sub">Recipes you created with CookSmart AI</p>
                </div>

                {!user ? (
                  <GuestGateView
                    message="Sign in to save and view your AI-generated recipes."
                    onSignIn={onLogin}
                  />
                ) : aiHistoryLoading ? (
                  <div className="state-center"><div className="spinner" /></div>
                ) : aiHistory.length === 0 ? (
                  <div className="state-center">
                    <Sparkles size={40} strokeWidth={1.3} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
                    <h3>No AI recipes saved yet</h3>
                    <p>Use CookSmart AI from the home page to generate your first recipe, then save it here.</p>
                    <button className="search-btn" style={{ marginTop: "1.5rem", width: "auto", padding: ".65rem 1.75rem" }}
                      onClick={() => handleSidebarNavigate("home")}>
                      Go to Home
                    </button>
                  </div>
                ) : (
                  <div className="ai-history-list">
                    {aiHistory.map(r => {
                      const isOpen = aiExpandedId === r.id;
                      const ings   = Array.isArray(r.ingredients) ? r.ingredients : [];
                      const steps  = Array.isArray(r.steps)       ? r.steps       : [];
                      return (
                        <div key={r.id} className={`ai-history-row${isOpen ? " ai-history-row--open" : ""}`}>
                          <button
                            className="ai-history-header"
                            onClick={() => setAiExpandedId(isOpen ? null : r.id)}
                          >
                            <div className="ai-history-info">
                              <span className="ai-history-name">{r.dish_name}</span>
                              {r.local_name && <span className="ai-history-local">{r.local_name}</span>}
                              <div className="ai-history-meta">
                                {r.cuisine      && <span className="meta-chip cuisine" style={{ fontSize: ".72rem" }}>{r.cuisine}</span>}
                                {r.cooking_time && <span className="meta-chip" style={{ fontSize: ".72rem", display: "inline-flex", alignItems: "center", gap: "3px" }}><Clock size={10} strokeWidth={2} />{r.cooking_time}</span>}
                                {r.servings     && <span className="meta-chip" style={{ fontSize: ".72rem", display: "inline-flex", alignItems: "center", gap: "3px" }}><Users size={10} strokeWidth={2} />{r.servings}</span>}
                              </div>
                            </div>
                            <div className="ai-history-actions">
                              <button
                                className="ai-history-delete"
                                onClick={e => { e.stopPropagation(); handleDeleteAiRecipe(r.id); }}
                                disabled={aiDeletingId === r.id}
                                title="Delete"
                                aria-label="Delete recipe"
                              >
                                <Trash2 size={14} strokeWidth={1.8} />
                              </button>
                              {isOpen
                                ? <ChevronUp size={15} strokeWidth={2} style={{ color: "var(--stone)", flexShrink: 0 }} />
                                : <ChevronDown size={15} strokeWidth={2} style={{ color: "var(--stone)", flexShrink: 0 }} />}
                            </div>
                          </button>

                          {isOpen && (
                            <div className="ai-history-body">
                              {r.description && <p className="ai-history-desc">{r.description}</p>}
                              {ings.length > 0 && (
                                <div className="ai-history-section">
                                  <h4 className="ai-history-section-title">Ingredients</h4>
                                  <ul className="gen-ing-list">
                                    {ings.map((ing, i) => (
                                      <li key={i} className="gen-ing-item">
                                        <span className="gen-ing-name">{ing.item}</span>
                                        {ing.quantity && <span className="gen-ing-qty">{ing.quantity}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {steps.length > 0 && (
                                <div className="ai-history-section">
                                  <h4 className="ai-history-section-title">Steps</h4>
                                  <ol className="gen-steps">
                                    {steps.map((step, i) => (
                                      <li key={i}>{step.replace(/^Step\s*\d+:\s*/i, "")}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {r.health_tip && (
                                <div className="gen-health-tip" style={{ margin: "1rem 0 0" }}>
                                  <span className="gen-health-icon"><Leaf size={14} strokeWidth={1.8} /></span>
                                  <div><strong>Health tip:</strong> {r.health_tip}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ════ MY RECIPES ════ */}
            {view === "myrecipes" && (
              <div className="home-content">
                <div className="view-section-head">
                  <h2 className="view-section-title">
                    <Bookmark size={20} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
                    My Recipes
                  </h2>
                  <p className="view-section-sub">Recipes you've saved</p>
                </div>
                {!user ? (
                  <GuestGateView
                    message="Save recipes you love. Sign in to build your collection."
                    onSignIn={onLogin}
                  />
                ) : viewLoading ? <SkeletonGrid count={6} /> : viewRecipes.length === 0 ? (
                  <div className="state-center">
                    <Bookmark size={40} strokeWidth={1.3} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
                    <h3>No saved recipes yet</h3>
                    <p>Tap the bookmark icon on any recipe to save it here.</p>
                    <button className="search-btn" style={{ marginTop: "1.5rem", width: "auto", padding: ".65rem 1.75rem" }}
                      onClick={() => handleSidebarNavigate("explore")}>Browse Recipes</button>
                  </div>
                ) : (
                  <div className="recipe-grid">
                    {viewRecipes.map(r => (
                      <RecipeCard key={r.id} recipe={r}
                        onClick={() => onSelectRecipe(r.id)}
                        isSaved={savedIds?.has(r.id)}
                        onToggleSave={onToggleSave || onRequestLogin}
                        onAddToMealPlan={onAddToMealPlan} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ FAVORITES ════ */}
            {view === "favorites" && (
              <div className="home-content">
                <div className="view-section-head">
                  <h2 className="view-section-title">
                    <Heart size={20} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
                    Favorites
                  </h2>
                  <p className="view-section-sub">Recipes you've liked</p>
                </div>
                {!user ? (
                  <GuestGateView
                    message="Favorites are saved with your account. Sign in to keep them."
                    onSignIn={onLogin}
                  />
                ) : viewLoading ? <SkeletonGrid count={6} /> : viewRecipes.length === 0 ? (
                  <div className="state-center">
                    <Heart size={40} strokeWidth={1.3} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
                    <h3>No favorites yet</h3>
                    <p>Tap the heart icon on any recipe to add it here.</p>
                    <button className="search-btn" style={{ marginTop: "1.5rem", width: "auto", padding: ".65rem 1.75rem" }}
                      onClick={() => handleSidebarNavigate("explore")}>Browse Recipes</button>
                  </div>
                ) : (
                  <div className="recipe-grid">
                    {viewRecipes.map(r => (
                      <RecipeCard key={r.id} recipe={r}
                        onClick={() => onSelectRecipe(r.id)}
                        isSaved={savedIds?.has(r.id)}
                        onToggleSave={onToggleSave || onRequestLogin}
                        onAddToMealPlan={onAddToMealPlan} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ════ SHOPPING LIST ════ */}
            {view === "shopping" && (
              <div className="home-content">
                <div className="view-section-head">
                  <h2 className="view-section-title">
                    <ShoppingCart size={20} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
                    Shopping List
                  </h2>
                  <p className="view-section-sub">Your grocery items</p>
                </div>
                <form className="shopping-add-row" onSubmit={e => { e.preventDefault(); addShoppingItem(); }}>
                  <input
                    className="shopping-add-input"
                    placeholder="Add an item…"
                    value={shoppingInput}
                    onChange={e => setShoppingInput(e.target.value)}
                    autoComplete="off"
                  />
                  <button type="submit" className="shopping-add-btn">
                    <Plus size={16} strokeWidth={2} /> Add
                  </button>
                </form>
                {shoppingItems.length === 0 ? (
                  <div className="state-center" style={{ paddingTop: "3rem" }}>
                    <ShoppingCart size={40} strokeWidth={1.3} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
                    <h3>Your list is empty</h3>
                    <p>Type an item above and press Enter to add it.</p>
                  </div>
                ) : (
                  <>
                    <div className="shopping-list">
                      {shoppingItems.map(item => (
                        <label key={item.id} className="shopping-item-row">
                          <input type="checkbox" checked={item.checked} onChange={() => toggleShoppingItem(item.id)} className="shopping-item-check" />
                          <span className={`shopping-item-name${item.checked ? " checked" : ""}`}>{item.name}</span>
                          <button type="button" className="shopping-item-delete" onClick={e => { e.preventDefault(); removeShoppingItem(item.id); }} title="Remove">
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </label>
                      ))}
                    </div>
                    {shoppingItems.some(i => i.checked) && (
                      <button className="shopping-clear-btn" onClick={clearCheckedItems}>Clear checked items</button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ════ MEAL PLAN — embedded ════ */}
            {view === "mealplan" && (
              <div className="home-content">
                <MealPlanPage
                  isEmbedded
                  onBack={() => handleSidebarNavigate("explore")}
                  onSelectRecipe={onSelectRecipe}
                />
              </div>
            )}

            {/* ════ PROFILE — embedded ════ */}
            {view === "profile" && user && (
              <div className="home-content">
                <ProfilePage
                  isEmbedded
                  user={user}
                  onBack={() => handleSidebarNavigate("home")}
                  onUserUpdate={onUserUpdate}
                  onSelectRecipe={onSelectRecipe}
                />
              </div>
            )}

            {/* ════ HOME + EXPLORE ════ */}
            {isHeroView && (
              <>
                {/* ── Hero ── */}
                <div className="hero">
                  <h1 className="hero-title">Built for African kitchens.</h1>
                  <p className="hero-sub">Search, discover, and cook African meals.</p>

                  {/* Search bar */}
                  <div ref={suggestRef} style={{ position: "relative", zIndex: 10 }} className="hero-search-wrap">
                    <div className="search-mode-tabs">
                      <button
                        className={`search-mode-tab${mode === "name" ? " active" : ""}`}
                        onClick={() => mode !== "name" && switchMode("name")}
                      >By Recipe Name</button>
                      <button
                        className={`search-mode-tab${mode === "ingredients" ? " active" : ""}`}
                        onClick={() => mode !== "ingredients" && switchMode("ingredients")}
                      >By Ingredients</button>
                    </div>

                    {mode === "name" ? (
                      <form className="search-wrap" onSubmit={handleNameSearch}>
                        <span className="search-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                          </svg>
                        </span>
                        <input
                          ref={nameInputRef}
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
                    ) : (
                      <div className="search-wrap ing-mode-wrap">
                        <PillInput
                          pills={pills} ingInput={ingInput} ingRef={ingRef}
                          ingSuggest={ingSuggest} showIngSug={showIngSug} hint={pillHint}
                          onIngChange={handleIngChange} onKeyDown={handleIngKeyDown}
                          onFocus={handleIngFocus} onSuggestPick={addPill} onRemovePill={handleRemovePill}
                          inputRef={ingInputRef}
                        />
                        <button type="button" className="search-mode-btn search-mode-btn--close" onClick={() => switchMode("name")}>
                          <XIcon size={15} strokeWidth={2} />
                        </button>
                      </div>
                    )}
                  </div>

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
                        <Sparkles size={14} strokeWidth={2} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                        Not sure what to cook? Use CookSmart AI
                      </button>
                    ) : genLimitHit ? (
                      <div className="gen-limit-box">
                        <p>You've used your 2 free generations. Sign in to keep going.</p>
                        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                          <button className="gen-limit-signin-btn" onClick={onLogin}>Sign In</button>
                          <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenLimitHit(false); setError(""); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="ai-gen-box">
                        {!user && (
                          <p className="gen-guest-note">
                            {genCount === 0 ? "2 free generations available — sign in for unlimited." :
                             genCount === 1 ? "1 free generation left." : null}
                          </p>
                        )}
                        <textarea
                          className="nlp-textarea"
                          placeholder='e.g. "I have chicken, tomatoes and some garlic at home"'
                          value={genText}
                          onChange={e => setGenText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate(); }}
                          rows={3} autoFocus
                        />
                        <div className="ai-gen-actions">
                          <button className="search-btn" onClick={handleGenerate}
                            disabled={genLoading || generating || (!genText.trim() && !genPills.length)}>
                            {generating ? t("generating") : genLoading ? t("reading_ings") : t("generate_btn")}
                          </button>
                          <button className="ai-gen-cancel" onClick={() => { setGenOpen(false); setGenText(""); setGenPills([]); setError(""); setGenLimitHit(false); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Feature Grid — home view only ── */}
                {view === "home" && (
                  <section className="feature-grid-section">
                    <h2 className="feature-grid-title">
                      {user ? `Hi, ${user.name.split(" ")[0]}` : "Start cooking in seconds"}
                    </h2>
                    <p className="feature-grid-subtitle">
                      {user ? "What are you cooking today?" : "Everything you need to discover, plan and cook great food."}
                    </p>
                    <div className="feature-grid">
                      <div className="feature-card" onClick={handleCardSearchName} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && handleCardSearchName()}>
                        <div className="feature-card-icon"><Search size={24} strokeWidth={2} /></div>
                        <div className="feature-card-title">Search by Recipe Name</div>
                        <div className="feature-card-desc">Find dishes like Jollof Rice, Matoke, or Fried Rice instantly.</div>
                      </div>
                      <div className="feature-card" onClick={handleCardSearchIngredients} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && handleCardSearchIngredients()}>
                        <div className="feature-card-icon"><ShoppingBasket size={24} strokeWidth={2} /></div>
                        <div className="feature-card-title">Search by Ingredients</div>
                        <div className="feature-card-desc">Type what you have — get recipes you can actually cook.</div>
                      </div>
                      <div className="feature-card" onClick={() => { setGenOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") { setGenOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); } }}>
                        <div className="feature-card-icon"><Sparkles size={24} strokeWidth={2} /></div>
                        <div className="feature-card-title">Generate a Recipe with AI</div>
                        <div className="feature-card-desc">No idea what to cook? Let AI create something just for you.</div>
                      </div>
                      <div className="feature-card" onClick={() => handleSidebarNavigate(user ? "profile" : "explore")} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && handleSidebarNavigate(user ? "profile" : "explore")}>
                        <div className="feature-card-icon"><User size={24} strokeWidth={2} /></div>
                        <div className="feature-card-title">Your Personalised Profile</div>
                        <div className="feature-card-desc">Save preferences, dietary needs, and your favourite meals.</div>
                      </div>
                    </div>
                  </section>
                )}

                {/* ── Content area ── */}
                <div className="home-content">
                  {error && <div className="error-banner">{error}</div>}

                  {generating && (
                    <div className="gen-loading">
                      <div className="spinner" style={{ margin: "0 auto 1rem" }} />
                      <p>CookSmart AI is creating your recipe…</p>
                    </div>
                  )}

                  {genClarifyMsg && !generating && (
                    <div className="gen-clarify-box">
                      <span className="gen-clarify-icon"><UtensilsCrossed size={18} strokeWidth={1.8} /></span>
                      <p>{genClarifyMsg}</p>
                    </div>
                  )}

                  {/* AI-generated recipe — shown alone, no recipe grid beneath */}
                  {genRecipe && !generating && (
                    <>
                      {!user && genCount >= 1 && (
                        <div className="gen-tries-note">
                          {genCount === 1
                            ? <>1 free try left as a guest. <button className="gen-tries-signin" onClick={onLogin}>Sign in</button> to get unlimited tries.</>
                            : <>No more guest tries. <button className="gen-tries-signin" onClick={onLogin}>Sign in</button> to keep using AI.</>}
                        </div>
                      )}
                      {renderGenPanel()}
                      <button
                        style={{ marginBottom: "1.5rem", padding: ".5rem 1rem", background: "none", border: "1.5px solid var(--border)", borderRadius: 99, cursor: "pointer", fontSize: ".85rem", color: "var(--stone)" }}
                        onClick={() => { setGenRecipe(null); setGenText(""); setGenPills([]); setGenClarifyMsg(""); setGenSaved(false); setGenSectionSaved([]); }}
                      >
                        Clear result
                      </button>
                    </>
                  )}

                  {/* ── Category pills — EXPLORE only, hidden when generated recipe is showing ── */}
                  {view === "explore" && !searched && !genRecipe && (
                    <div className="category-section">
                      <div className="section-head-row" style={{ marginBottom: ".85rem" }}>
                        <h2 className="category-section-title" style={{ marginBottom: 0 }}>Browse by category</h2>
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

                  {/* ── Recipe sections — EXPLORE only, hidden when generated recipe is showing ── */}
                  {view === "explore" && !genRecipe && (
                    <>
                      {mode === "ingredients" && searched && aiResults.length > 0 && (
                        <div style={{ marginBottom: "2.5rem" }}>
                          <h2 className="section-heading">
                            AI suggestions <span className="ai-badge">CookSmart AI</span>
                            <span className="count">{aiResults.length} picks</span>
                          </h2>
                          <div className="recipe-grid">
                            {aiResults.map(r => (
                              <RecipeCard key={r.id} recipe={r} onClick={() => onSelectRecipe(r.id)}
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

                      {loading && !aiLoading && <SkeletonGrid />}

                      {!loading && results.length > 0 && (
                        !searched && !cuisine && !course && results.length >= 6 ? (
                          <>
                            <div className="recipe-section">
                              <div className="section-head-row">
                                <h2 className="section-heading">
                                  Recommended for you
                                  <span className="section-tag">Based on your preferences</span>
                                </h2>
                                <button className="section-view-all" onClick={() => setCourse("main")}>View all</button>
                              </div>
                              <div className="recipe-grid">
                                {results.slice(0, 3).map(r => (
                                  <RecipeCard key={r.id} recipe={r} onClick={() => onSelectRecipe(r.id)}
                                    isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                                    onAddToMealPlan={onAddToMealPlan} />
                                ))}
                              </div>
                            </div>
                            {results.length > 3 && (
                              <div className="recipe-section">
                                <div className="section-head-row">
                                  <h2 className="section-heading">
                                    Trending this week
                                    <span className="section-tag">Popular with our community</span>
                                  </h2>
                                  <button className="section-view-all">View all</button>
                                </div>
                                <div className="recipe-grid">
                                  {results.slice(3, 6).map(r => (
                                    <RecipeCard key={r.id} recipe={r} onClick={() => onSelectRecipe(r.id)}
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
                              {searched ? (mode === "ingredients" ? "Exact matches" : "Search results") : cuisine || course ? "Filtered recipes" : "All recipes"}
                              <span className="count">{totalCount} recipes</span>
                            </h2>
                            <div className="recipe-grid">
                              {results.map(r => (
                                <RecipeCard key={r.id} recipe={r} onClick={() => onSelectRecipe(r.id)}
                                  matchCount={mode === "ingredients" ? r.match_count : null}
                                  requestedCount={mode === "ingredients" ? r.requested_count : null}
                                  isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                                  onAddToMealPlan={onAddToMealPlan} />
                              ))}
                            </div>
                          </>
                        )
                      )}

                      {mode === "ingredients" && searched && partials.length > 0 && (
                        <div style={{ marginTop: "2.5rem" }}>
                          <h2 className="section-heading">You might also like <span className="count">partial matches</span></h2>
                          <div className="recipe-grid">
                            {partials.map(r => (
                              <RecipeCard key={r.id} recipe={r} onClick={() => onSelectRecipe(r.id)}
                                matchCount={r.match_count} requestedCount={r.requested_count}
                                isSaved={savedIds?.has(r.id)} onToggleSave={onToggleSave || onRequestLogin}
                                onAddToMealPlan={onAddToMealPlan} />
                            ))}
                          </div>
                        </div>
                      )}

                      {!loading && searched && results.length === 0 && aiResults.length === 0 && (
                        <div className="state-center">
                          <UtensilsCrossed size={40} strokeWidth={1.3} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
                          <h3>No recipes found</h3>
                          <p>{mode === "ingredients" ? "Try different ingredients or fewer to broaden your search." : "Try a different dish name."}</p>
                          <button className="search-btn"
                            style={{ marginTop: "1.5rem", display: "inline-block", width: "auto", padding: ".65rem 1.75rem" }}
                            onClick={() => { setSearched(false); setResults([]); setQuery(""); setPills([]); loadBrowse(); }}>
                            Browse all recipes
                          </button>
                        </div>
                      )}

                      {!searched && totalPages > 1 && (
                        <div className="pagination">
                          <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                          <span className="page-info">Page {page} of {totalPages}</span>
                          <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

          </div>}{/* end view-fade */}

          {/* Mobile guest banner (non-blocking, dismissible) */}
          {mobileBanner && (
            <div className="mobile-guest-banner">
              <span>{mobileBanner.message}</span>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexShrink: 0 }}>
                <button className="mobile-guest-signin" onClick={() => { setMobileBanner(null); onLogin(); }}>Sign In</button>
                <button className="mobile-guest-dismiss" onClick={() => setMobileBanner(null)}>
                  <XIcon size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-item${view === "home" ? " active" : ""}`} onClick={() => handleSidebarNavigate("home")}>
          <HomeIcon size={20} strokeWidth={1.8} />
          <span>Home</span>
        </button>
        <button className={`bottom-nav-item${view === "explore" ? " active" : ""}`} onClick={() => handleSidebarNavigate("explore")}>
          <Search size={20} strokeWidth={1.8} />
          <span>Explore</span>
        </button>
        <button className={`bottom-nav-item${view === "airecipes" ? " active" : ""}`} onClick={() => handleSidebarNavigate("airecipes")}>
          <Sparkles size={20} strokeWidth={1.8} />
          <span>AI</span>
        </button>
        <button
          className={`bottom-nav-item${view === "mealplan" ? " active" : ""}`}
          onClick={user ? () => handleSidebarNavigate("mealplan") : () => showMobileBanner("mealplan")}
        >
          <CalendarDays size={20} strokeWidth={1.8} />
          <span>Meals</span>
        </button>
        <button
          className={`bottom-nav-item${view === "profile" ? " active" : ""}`}
          onClick={user ? () => handleSidebarNavigate("profile") : onLogin}
        >
          <User size={20} strokeWidth={1.8} />
          <span>Profile</span>
        </button>
      </nav>

    </div>
  );
}
