import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { getRecipeImage } from "../utils/imageHelper";

function getFlavorDescriptor(recipe) {
  const name = (recipe.name || "").toLowerCase();
  const course = (recipe.course || "").toLowerCase();
  if (name.includes("pepper") || name.includes("peri")) return "Spicy & Comforting";
  if (name.includes("jollof")) return "Classic & Flavorful";
  if (name.includes("stew") || name.includes("beef")) return "Rich & Hearty";
  if (name.includes("chicken")) return "Tender & Savory";
  if (name.includes("plantain") || name.includes("fried plantain")) return "Sweet & Crispy";
  if (name.includes("fish") || name.includes("tilapia") || name.includes("catfish")) return "Fresh & Aromatic";
  if (name.includes("matoke") || name.includes("banana")) return "Hearty & Filling";
  if (name.includes("groundnut") || name.includes("peanut")) return "Nutty & Comforting";
  if (name.includes("egusi") || name.includes("okra")) return "Bold & Authentic";
  if (name.includes("rice")) return "Light & Satisfying";
  if (course === "soup") return "Warm & Nourishing";
  if (course === "breakfast") return "Light & Wholesome";
  if (course === "beverage") return "Refreshing & Cool";
  if (course === "snack") return "Crispy & Delicious";
  return "Bold & Flavorful";
}

function RecipeImage({ recipe, emoji }) {
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

  if (failed) return <span className="card-img-emoji">{emoji}</span>;
  if (!src) return <span className="card-img-skeleton" aria-hidden="true" />;

  return (
    <img
      src={src}
      alt={recipe.name}
      loading="lazy"
      decoding="async"
      className={`card-img-photo${loaded ? " loaded" : ""}`}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export default function RecipeCard({
  recipe, emoji, onClick,
  aiReason, matchCount, requestedCount,
  isSaved, onToggleSave,
}) {
  return (
    <div className="recipe-card" onClick={onClick}>
      <div className="card-img">
        <RecipeImage recipe={recipe} emoji={emoji} />
        <span className={`card-cuisine${recipe.cuisine_type === "western" ? " western" : ""}`}>
          {recipe.cuisine_type}
        </span>
        {/* Save button — always shown; handled by parent (guest → modal) */}
        <button
          className={`card-save-btn${isSaved ? " saved" : ""}`}
          onClick={e => { e.stopPropagation(); onToggleSave?.(recipe.id); }}
          title={isSaved ? "Saved" : "Save recipe"}
          aria-label={isSaved ? "Remove from saved" : "Save recipe"}
        >
          <BookmarkIcon filled={!!isSaved} />
        </button>
      </div>

      <div className="card-body">
        <h3 className="card-title">{recipe.name}</h3>
        <p className="card-flavor">{getFlavorDescriptor(recipe)}</p>
        {recipe.local_name && recipe.local_name !== recipe.name && (
          <p className="card-local">{recipe.local_name}</p>
        )}
        {matchCount != null && (
          <p className="card-match" style={{ marginTop: ".5rem" }}>
            {requestedCount != null
              ? `${matchCount} of ${requestedCount} ingredients matched (${Math.round(matchCount / requestedCount * 100)}%)`
              : `${matchCount} ingredient${matchCount !== 1 ? "s" : ""} matched`}
          </p>
        )}
        {aiReason && <p className="card-ai-reason">{aiReason}</p>}

        <div className="card-footer">
          <div className="card-footer-meta">
            <span className="card-time">
              <Clock size={12} strokeWidth={2} />
              {recipe.cook_time ? `${recipe.cook_time} mins` : recipe.prep_time ? `${recipe.prep_time} mins` : "30 mins"}
            </span>
            <span className="card-difficulty">{recipe.difficulty || "Medium"}</span>
          </div>
          <span className="card-course">{recipe.course}</span>
        </div>
      </div>
    </div>
  );
}
