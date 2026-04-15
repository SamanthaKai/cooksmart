import { useState } from "react";

function getImageSources(recipe) {
  console.log('getImageSources called with recipe:', recipe);
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
  
  // Use the standard name-based approach
  const cleanName = recipe.name.trim();
  const encodedName = encodeURIComponent(cleanName);
  const hyphenName = cleanName.replace(/ /g, '-');
  
  const sources = [
    `/images/id_${recipe.id}%20${encodedName}.jpg${cacheBuster}`,
    `/images/id_${recipe.id}%20${encodedName}.jpeg${cacheBuster}`,
    `/images/id_${recipe.id}%20${encodedName}.png${cacheBuster}`,
    `/images/id_${recipe.id}%20${encodedName}.webp${cacheBuster}`,
    `/images/id_${recipe.id}-${hyphenName}.jpg${cacheBuster}`,
    `/images/id_${recipe.id}.jpg${cacheBuster}`,
    `/images/id_${recipe.id}.png${cacheBuster}`
  ];
  console.log('Generated sources array:', sources);
  return sources;
}

export default function RecipeCard({ recipe, emoji, onClick, aiReason, matchCount, requestedCount }) {
  console.log('RecipeCard received recipe:', recipe);
  const sources = getImageSources(recipe);
  console.log('Generated sources:', sources);
  
  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  
  const currentSrc = sources && sources[currentSrcIndex] ? sources[currentSrcIndex] : '';
  console.log('Current src:', currentSrc);
  
  const handleError = () => {
    if (currentSrcIndex + 1 < sources.length) {
      setCurrentSrcIndex(currentSrcIndex + 1);
    } else {
      setImgError(true);
    }
  };
  
  return (
    <div className="recipe-card" onClick={onClick}>
      <div className="card-img">
        {!imgError && currentSrc ? (
          <img 
            key={currentSrc}
            src={currentSrc}
            alt={recipe.name}
            onError={handleError}
          />
        ) : (
          <span>{emoji}</span>
        )}
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