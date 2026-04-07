export function getRecipeImageUrl(recipe) {
  // Clean the recipe name (remove special chars, keep spaces as-is for filename)
  const cleanName = recipe.name.trim();
  
  // Try exact match first (with spaces)
  const exactMatch = `/images/id_${recipe.id} ${cleanName}.jpg`;
  const exactMatchPng = `/images/id_${recipe.id} ${cleanName}.png`;
  const exactMatchWebp = `/images/id_${recipe.id} ${cleanName}.webp`;
  const exactMatchJpeg = `/images/id_${recipe.id} ${cleanName}.jpeg`;
  
  // Try with hyphens instead of spaces (like id_12-Bean-Stew)
  const hyphenName = cleanName.replace(/ /g, '-');
  const hyphenMatch = `/images/id_${recipe.id}-${hyphenName}.jpg`;
  
  // Fallback to just ID
  const idOnly = `/images/id_${recipe.id}.jpg`;
  const idOnlyPng = `/images/id_${recipe.id}.png`;
  
  return [exactMatch, exactMatchPng, exactMatchWebp, exactMatchJpeg, hyphenMatch, idOnly, idOnlyPng];
}