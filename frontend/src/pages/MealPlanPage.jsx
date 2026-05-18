import { useState, useEffect } from "react";
import { api } from "../api/client";

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function MealPlanPage({ onBack, onSelectRecipe }) {
  const [plan, setPlan]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(false);

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

  // Deduplicate recipes and extract their raw ingredient strings
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
    <div className="app">
      <nav className="navbar">
        <span className="navbar-brand">Cook<span>Smart</span></span>
        <span style={{ fontSize: ".82rem", color: "var(--stone)" }}>📅 Weekly Meal Plan</span>
      </nav>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "1.5rem 1.5rem 5rem" }}>
        <button className="back-btn" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back to recipes
        </button>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: ".5rem" }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.9rem", color: "var(--charcoal)" }}>
            Your Meal Plan
          </h2>
          {plan.length > 0 && (
            <span style={{ fontSize: ".85rem", color: "var(--stone)" }}>
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
          /* ── Empty state — centred vertically and horizontally ── */
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            textAlign: "center",
            minHeight: "calc(100vh - 280px)",
            padding: "2rem 1rem",
            color: "var(--stone)",
          }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>📅</div>
            <h3 style={{ marginBottom: ".5rem", color: "var(--charcoal)", fontSize: "1.1rem" }}>
              No meals planned yet
            </h3>
            <p style={{ fontSize: ".9rem", maxWidth: 340, marginBottom: "1.5rem", lineHeight: 1.55 }}>
              Browse recipes and tap <strong>Add to Meal Plan</strong> to build your week.
            </p>
            <button
              className="nlp-extract-btn"
              style={{ width: "auto", padding: ".65rem 1.5rem" }}
              onClick={onBack}
            >
              Browse recipes
            </button>
          </div>
        ) : (
          <>
            {/* ── Days ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2.5rem" }}>
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
                      padding: ".55rem 1.25rem", fontWeight: 600,
                      fontSize: ".88rem", letterSpacing: ".02em",
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
                            padding: ".7rem 1.25rem",
                            borderBottom: idx < items.length - 1 ? "1px solid var(--cream-dark)" : "none",
                          }}
                        >
                          <div>
                            <button
                              style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit" }}
                              onClick={() => onSelectRecipe(item.recipe.id)}
                            >
                              <span style={{ fontWeight: 600, color: "var(--charcoal)", fontSize: ".95rem" }}>
                                {item.recipe.name}
                              </span>
                              {item.recipe.local_name && item.recipe.local_name !== item.recipe.name && (
                                <span style={{ marginLeft: ".5rem", fontSize: ".8rem", color: "var(--stone)" }}>
                                  ({item.recipe.local_name})
                                </span>
                              )}
                            </button>
                            <div style={{ fontSize: ".77rem", color: "var(--stone)", marginTop: "2px" }}>
                              {[item.recipe.cuisine_type, item.recipe.course !== "sauce" ? item.recipe.course : null, item.recipe.servings && `${item.recipe.servings} servings`].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemove(item.id)}
                            title="Remove from plan"
                            aria-label="Remove from meal plan"
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "var(--stone)", fontSize: "1rem",
                              padding: ".3rem .5rem", borderRadius: 6,
                              lineHeight: 1, flexShrink: 0,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Shopping List — grouped by recipe ── */}
            {recipeGroups.length > 0 && (
              <div style={{
                background: "var(--white)", borderRadius: "var(--radius)",
                border: "1px solid var(--border)", boxShadow: "var(--shadow)",
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
                }}>
                  <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: "1.2rem" }}>
                    🛒 Shopping List
                  </h3>
                  <button
                    onClick={handleCopy}
                    style={{
                      padding: ".42rem 1rem", borderRadius: 99,
                      border: `1.5px solid ${copied ? "var(--green)" : "var(--earth)"}`,
                      background: copied ? "var(--green)" : "transparent",
                      color: copied ? "var(--white)" : "var(--earth)",
                      cursor: "pointer", fontSize: ".82rem", fontWeight: 600,
                      transition: "all .2s",
                    }}
                  >
                    {copied ? "✓ Copied!" : "Copy list"}
                  </button>
                </div>

                <div style={{ padding: "1rem 1.25rem 1.5rem" }}>
                  {recipeGroups.map((group, gi) => (
                    <div
                      key={gi}
                      style={{ marginBottom: gi < recipeGroups.length - 1 ? "1.35rem" : 0 }}
                    >
                      <p style={{
                        fontWeight: 700,
                        color: "var(--earth)",
                        fontSize: ".9rem",
                        marginBottom: ".4rem",
                        letterSpacing: ".01em",
                      }}>
                        {group.name}
                      </p>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {group.ingredients.map((ing, ii) => (
                          <li
                            key={ii}
                            style={{
                              fontSize: ".88rem",
                              color: "var(--charcoal)",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: ".4rem",
                              lineHeight: 1.55,
                              marginBottom: ".2rem",
                            }}
                          >
                            <span style={{ color: "var(--earth)", fontWeight: 700, flexShrink: 0, lineHeight: 1.55 }}>•</span>
                            {ing}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
