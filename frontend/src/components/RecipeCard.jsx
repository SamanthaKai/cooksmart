import { useState } from "react";
import { getRecipeImageUrl } from "../utils/imageHelper";

function RecipeImage({ recipe, emoji }) {
  const sources = getRecipeImageUrl(recipe);
  const [idx, setIdx]       = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) return <span className="card-img-emoji">{emoji}</span>;

  return (
    <>
      {!loaded && <span className="card-img-skeleton" aria-hidden="true" />}
      <img
        key={sources[idx]}
        src={sources[idx]}
        alt={recipe.name}
        loading="lazy"
        decoding="async"
        className={`card-img-photo${loaded ? " loaded" : ""}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (idx + 1 < sources.length) {
            setIdx(i => i + 1);
          } else {
            setFailed(true);
          }
        }}
      />
    </>
  );
}

export default function RecipeCard({ recipe, emoji, onClick, aiReason, matchCount, requestedCount }) {
  return (
    <div className="recipe-card" onClick={onClick}>
      <div className="card-img">
        <RecipeImage recipe={recipe} emoji={emoji} />
        <span className={`card-cuisine${recipe.cuisine_type === "western" ? " western" : ""}`}>
          {recipe.cuisine_type}
        </span>
      </div>

      <div className="card-body">
        <h3 className="card-title">{recipe.name}</h3>
        {recipe.local_name && recipe.local_name !== recipe.name && (
          <p className="card-local">{recipe.local_name}</p>
        )}
        {recipe.description && recipe.description !== "MISSING" && (
          <p className="card-desc">{recipe.description}</p>
        )}
        {matchCount != null && (
          <p className="card-match" style={{ marginTop: ".5rem" }}>
            {requestedCount != null
              ? `${matchCount} of ${requestedCount} ingredients matched (${Math.round(matchCount / requestedCount * 100)}%)`
              : `${matchCount} ingredient${matchCount !== 1 ? "s" : ""} matched`}
          </p>
        )}
        {aiReason && (
          <p className="card-ai-reason">{aiReason}</p>
        )}
        <div className="card-footer">
          <span className="card-community">{recipe.community || "International"}</span>
          <span className="card-course">{recipe.course}</span>
        </div>
      </div>
    </div>
  );
}
