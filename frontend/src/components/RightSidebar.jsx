import { useState, useEffect } from "react";
import { Sparkles, ChevronRight, Crown, Plus, CalendarDays, ShoppingCart } from "lucide-react";
import { api } from "../api/client";
import { getRecipeImage } from "../utils/imageHelper";

const DAYS_SHORT = { Monday:"Mon", Tuesday:"Tue", Wednesday:"Wed", Thursday:"Thu", Friday:"Fri", Saturday:"Sat", Sunday:"Sun" };

const DEMO_SHOPPING = [
  { id: 1, name: "Tomatoes",    checked: false },
  { id: 2, name: "Bell Peppers",checked: false },
  { id: 3, name: "Goat Meat",   checked: false },
  { id: 4, name: "Plantain",    checked: false },
  { id: 5, name: "Spinach",     checked: false },
];

function RecipeThumbnail({ recipe, size = 56 }) {
  const [src, setSrc]       = useState(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!recipe) return;
    let active = true;
    getRecipeImage(recipe).then(url => {
      if (!active) return;
      if (url) setSrc(url); else setFailed(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [recipe?.id]);

  const style = { width: size, height: size, borderRadius: 10, flexShrink: 0, overflow: "hidden", background: "var(--cream-dark)", display: "flex", alignItems: "center", justifyContent: "center" };

  if (failed || !recipe) return <div style={style} />;
  if (!src) return <div style={{ ...style, animation: "pulse 1.5s ease-in-out infinite" }} />;

  return (
    <div style={style}>
      <img
        src={src} alt={recipe.name} loading="lazy" decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0, transition: "opacity .3s" }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function RightSidebar({ user, onMealPlan, onSelectRecipe, onLogin }) {
  const [suggestion, setSuggestion]   = useState(null);
  const [mealPlan,   setMealPlan]     = useState([]);
  const [premToast,  setPremToast]    = useState(false);
  const [shopping,   setShopping]     = useState(DEMO_SHOPPING);

  useEffect(() => {
    const randomPage = Math.floor(Math.random() * 4) + 1;
    api.recipes({ page: randomPage, per_page: 3 })
      .then(d => { const picks = d.results || []; if (picks.length) setSuggestion(picks[Math.floor(Math.random() * picks.length)]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setMealPlan([]); return; }
    api.getMealPlan().then(d => setMealPlan(d.plan || [])).catch(() => {});
  }, [user]);

  function showPremium() {
    setPremToast(true);
    setTimeout(() => setPremToast(false), 2400);
  }

  function toggleShoppingItem(id) {
    setShopping(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  }

  const upcomingMeals = mealPlan.slice(0, 3);

  return (
    <aside className="right-sidebar">

      {/* ── AI Suggestion ── */}
      <div className="rs-card">
        <div className="rs-card-head">
          <Sparkles size={13} strokeWidth={2} className="rs-sparkle" />
          <span className="rs-card-title">AI Suggestion</span>
        </div>
        {suggestion ? (
          <>
            <div className="rs-suggestion-body">
              <p className="rs-suggestion-text">
                How about trying <strong>"{suggestion.name}"</strong> today?
              </p>
              <RecipeThumbnail recipe={suggestion} size={64} />
            </div>
            <button className="rs-see-recipe-btn" onClick={() => onSelectRecipe(suggestion.id)}>
              See Recipe
            </button>
          </>
        ) : (
          <p className="rs-empty-text">Finding a suggestion…</p>
        )}
      </div>

      {/* ── Meal Plan ── */}
      <div className="rs-card">
        <div className="rs-card-head-row">
          <div className="rs-card-head">
            <CalendarDays size={13} strokeWidth={2} />
            <span className="rs-card-title">Your Meal Plan</span>
          </div>
          <button className="rs-link" onClick={user ? onMealPlan : onLogin}>View plan</button>
        </div>

        {upcomingMeals.length > 0 ? (
          <div className="rs-meal-list">
            {upcomingMeals.map(item => (
              <button key={item.id} className="rs-meal-row" onClick={() => onSelectRecipe(item.recipe.id)}>
                <span className="rs-meal-day">{DAYS_SHORT[item.day_of_week] ?? item.day_of_week}</span>
                <RecipeThumbnail recipe={item.recipe} size={40} />
                <span className="rs-meal-name">{item.recipe.name}</span>
                <ChevronRight size={13} strokeWidth={2} className="rs-chevron" />
              </button>
            ))}
          </div>
        ) : (
          <p className="rs-empty-text">{user ? "No meals planned yet." : "Sign in to see your meal plan."}</p>
        )}

        <button className="rs-outline-btn" onClick={user ? onMealPlan : onLogin}>
          Plan Your Meals
        </button>
      </div>

      {/* ── Shopping List ── */}
      <div className="rs-card">
        <div className="rs-card-head-row">
          <div className="rs-card-head">
            <ShoppingCart size={13} strokeWidth={2} />
            <span className="rs-card-title">Your Shopping List</span>
          </div>
          <button className="rs-link">View all</button>
        </div>
        <div className="rs-shopping-list">
          {shopping.map(item => (
            <label key={item.id} className="rs-shopping-item">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleShoppingItem(item.id)}
                className="rs-shopping-check"
              />
              <span className={`rs-shopping-name${item.checked ? " checked" : ""}`}>{item.name}</span>
            </label>
          ))}
        </div>
        <button className="rs-add-items-btn">
          <Plus size={13} strokeWidth={2} /> Add Items
        </button>
      </div>

      {/* ── Premium ── */}
      <div className="rs-premium-card">
        <div className="rs-premium-top">
          <div>
            <h4 className="rs-premium-title">Unlock more with CookSmart Premium</h4>
            <p className="rs-premium-desc">Get personalized meal plans, advanced AI help & more.</p>
          </div>
          <Crown size={28} strokeWidth={1.5} className="rs-crown" />
        </div>
        <button className="rs-premium-btn" onClick={showPremium}>Try Premium</button>
        {premToast && <div className="rs-premium-toast">Coming soon!</div>}
      </div>

    </aside>
  );
}
