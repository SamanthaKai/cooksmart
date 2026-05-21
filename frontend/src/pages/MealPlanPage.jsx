import { useState, useEffect } from "react";
import { api } from "../api/client";
import { CalendarDays, ShoppingCart, X, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function MealPlanPage({ onBack, onSelectRecipe, isEmbedded = false }) {
  const [plan, setPlan]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [copied, setCopied]       = useState(false);
  const [listOpen, setListOpen]   = useState(false);

  useEffect(() => {
    api.getMealPlan()
      .then(data => setPlan(data.plan || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(id) {
    try {
      await api.removeFromMealPlan(id);
      setPlan(prev => prev.filter(item => item.id !== id));
    } catch {}
  }

  const recipeGroups = [];
  const seenIds = new Set();
  plan.forEach(item => {
    if (!seenIds.has(item.recipe.id)) {
      seenIds.add(item.recipe.id);
      const ingredients = (item.recipe.ingredients_display || "")
        .split("|")
        .map(s => s.trim())
        .filter(Boolean);
      recipeGroups.push({ name: item.recipe.name, ingredients });
    }
  });

  function handleCopy() {
    const text = recipeGroups
      .map(g => `${g.name}\n${g.ingredients.map(i => `• ${i}`).join("\n")}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }).catch(() => {});
  }

  const byDay      = DAYS.reduce((acc, day) => { acc[day] = plan.filter(i => i.day_of_week === day); return acc; }, {});
  const activeDays = DAYS.filter(day => byDay[day].length > 0);

  return (
    <div className={isEmbedded ? "mealplan-embedded" : "app"}>
      {!isEmbedded && (
        <nav className="navbar">
          <span className="navbar-brand">Cook<span>Smart</span></span>
          <span style={{ display: "flex", alignItems: "center", gap: ".4rem", fontSize: ".82rem", color: "var(--stone)" }}>
            <CalendarDays size={15} strokeWidth={1.8} />
            Weekly Meal Plan
          </span>
        </nav>
      )}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: isEmbedded ? "0 0 3rem" : "1.5rem 1.5rem 5rem" }}>
        {!isEmbedded && (
          <button className="back-btn" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back to recipes
          </button>
        )}

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: ".5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
            <CalendarDays size={22} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.6rem", color: "var(--charcoal)", margin: 0 }}>
              Your Meal Plan
            </h2>
          </div>
          {plan.length > 0 && (
            <span style={{ fontSize: ".82rem", color: "var(--stone)" }}>
              {plan.length} recipe{plan.length !== 1 ? "s" : ""} across {activeDays.length} day{activeDays.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loading ? (
          <div className="state-center">
            <div className="spinner" />
            <p>Loading meal plan…</p>
          </div>
        ) : plan.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            textAlign: "center",
            minHeight: "calc(100vh - 280px)",
            padding: "2rem 1rem",
            color: "var(--stone)",
          }}>
            <CalendarDays size={44} strokeWidth={1.2} style={{ color: "var(--stone)", marginBottom: "1rem" }} />
            <h3 style={{ marginBottom: ".5rem", color: "var(--charcoal)", fontSize: "1.1rem" }}>
              No meals planned yet
            </h3>
            <p style={{ fontSize: ".9rem", maxWidth: 340, marginBottom: "1.5rem", lineHeight: 1.55 }}>
              Browse recipes and tap <strong>Add to Meal Plan</strong> to build your week.
            </p>
            <button
              className="search-btn"
              style={{ width: "auto", padding: ".65rem 1.5rem", marginTop: 0 }}
              onClick={onBack || (() => {})}
            >
              Browse recipes
            </button>
          </div>
        ) : (
          <>
            {/* Days */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem" }}>
              {DAYS.map(day => {
                const items = byDay[day];
                if (items.length === 0) return null;
                return (
                  <div key={day} style={{
                    background: "var(--white)", borderRadius: "var(--radius)",
                    border: "1px solid var(--border)", overflow: "hidden",
                    boxShadow: "var(--shadow)",
                  }}>
                    <div style={{
                      background: "var(--earth)", color: "var(--white)",
                      padding: ".5rem 1.25rem", fontWeight: 600,
                      fontSize: ".85rem", letterSpacing: ".02em",
                    }}>
                      {day}
                    </div>
                    <div>
                      {items.map((item, idx) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex", alignItems: "center",
                            justifyContent: "space-between",
                            padding: ".65rem 1.25rem",
                            borderBottom: idx < items.length - 1 ? "1px solid var(--cream-dark)" : "none",
                          }}
                        >
                          <div>
                            <button
                              style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit" }}
                              onClick={() => onSelectRecipe(item.recipe.id)}
                            >
                              <span style={{ fontWeight: 600, color: "var(--charcoal)", fontSize: ".92rem" }}>
                                {item.recipe.name}
                              </span>
                              {item.recipe.local_name && item.recipe.local_name !== item.recipe.name && (
                                <span style={{ marginLeft: ".5rem", fontSize: ".78rem", color: "var(--stone)" }}>
                                  ({item.recipe.local_name})
                                </span>
                              )}
                            </button>
                            <div style={{ fontSize: ".75rem", color: "var(--stone)", marginTop: "2px" }}>
                              {[item.recipe.cuisine_type, item.recipe.course !== "sauce" ? item.recipe.course : null, item.recipe.servings && `${item.recipe.servings} servings`].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemove(item.id)}
                            title="Remove from plan"
                            aria-label="Remove from meal plan"
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "var(--stone)", display: "flex", alignItems: "center",
                              padding: ".3rem .4rem", borderRadius: 6, flexShrink: 0,
                              transition: "color .15s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = "var(--earth)"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--stone)"}
                          >
                            <X size={15} strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Shopping list — collapsible */}
            {recipeGroups.length > 0 && (
              <div style={{
                background: "var(--white)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", boxShadow: "var(--shadow)",
                overflow: "hidden",
              }}>
                <button
                  onClick={() => setListOpen(o => !o)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: ".85rem 1.25rem",
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: listOpen ? "1px solid var(--border)" : "none",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: ".5rem", fontFamily: "'Playfair Display', serif", fontSize: "1.05rem", fontWeight: 700 }}>
                    <ShoppingCart size={17} strokeWidth={1.8} style={{ color: "var(--earth)" }} />
                    Shopping List
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: ".78rem", fontWeight: 400, color: "var(--stone)" }}>
                      ({recipeGroups.reduce((n, g) => n + g.ingredients.length, 0)} items)
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                    {listOpen && (
                      <button
                        onClick={e => { e.stopPropagation(); handleCopy(); }}
                        style={{
                          padding: ".3rem .8rem", borderRadius: 99,
                          border: `1.5px solid ${copied ? "var(--green)" : "var(--earth)"}`,
                          background: copied ? "var(--green)" : "transparent",
                          color: copied ? "var(--white)" : "var(--earth)",
                          cursor: "pointer", fontSize: ".78rem", fontWeight: 600,
                          display: "flex", alignItems: "center", gap: ".3rem",
                          transition: "all .2s",
                        }}
                      >
                        {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    )}
                    {listOpen
                      ? <ChevronUp size={16} strokeWidth={2} style={{ color: "var(--stone)" }} />
                      : <ChevronDown size={16} strokeWidth={2} style={{ color: "var(--stone)" }} />}
                  </span>
                </button>

                {listOpen && (
                  <div style={{ padding: ".85rem 1.25rem 1.25rem" }}>
                    {recipeGroups.map((group, gi) => (
                      <div key={gi} style={{ marginBottom: gi < recipeGroups.length - 1 ? "1.1rem" : 0 }}>
                        <p style={{
                          fontWeight: 700, color: "var(--earth)",
                          fontSize: ".85rem", marginBottom: ".35rem",
                        }}>
                          {group.name}
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {group.ingredients.map((ing, ii) => (
                            <li key={ii} style={{
                              fontSize: ".85rem", color: "var(--charcoal)",
                              display: "flex", alignItems: "flex-start",
                              gap: ".4rem", lineHeight: 1.5, marginBottom: ".15rem",
                            }}>
                              <span style={{ color: "var(--earth)", fontWeight: 700, flexShrink: 0 }}>•</span>
                              {ing}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
