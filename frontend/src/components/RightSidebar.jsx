import { useState, useEffect } from "react";
import { Sparkles, ChevronRight, Crown, Plus, CalendarDays, ShoppingCart } from "lucide-react";
import { api } from "../api/client";

const DAYS_SHORT = { Monday:"Mon", Tuesday:"Tue", Wednesday:"Wed", Thursday:"Thu", Friday:"Fri", Saturday:"Sat", Sunday:"Sun" };

export default function RightSidebar({ user, onMealPlan, onSelectRecipe, onLogin }) {
  const [suggestion, setSuggestion]   = useState(null);
  const [mealPlan,   setMealPlan]     = useState([]);
  const [premToast,  setPremToast]    = useState(false);

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
        <p className="rs-empty-text">
          {user
            ? "Add recipes to your meal plan to build a shopping list."
            : "Sign in to track your shopping list."}
        </p>
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
