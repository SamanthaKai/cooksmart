const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";
const BASE_URL = "https://api.unsplash.com/search/photos";

// In-memory + sessionStorage cache (v4 busts stale Unsplash results for corrected recipes)
const memCache = new Map();
function sessionKey(id) { return `cs_img_v4_${id}`; }

// Override Unsplash search queries for specific recipe IDs where the recipe name
// gives poor Unsplash results.
const QUERY_OVERRIDES = {
  58: "crispy breaded chicken nuggets",
  90: "french omelette eggs skillet",
};

// Throttle: max 3 concurrent Unsplash requests
let _active = 0;
const _queue = [];
const MAX_CONCURRENT = 3;

function throttledFetch(url) {
  return new Promise((resolve, reject) => {
    function attempt() {
      if (_active >= MAX_CONCURRENT) { _queue.push(attempt); return; }
      _active++;
      fetch(url)
        .then(resolve, reject)
        .finally(() => {
          _active--;
          if (_queue.length) _queue.shift()();
        });
    }
    attempt();
  });
}

// Extensions that differ from the default .jpg
const LOCAL_EXT = {
  19: ".png",
  23: ".jpeg",
  24: ".webp",
  28: ".jpeg",
  43: ".png",
  59: ".png",
  60: ".png",
  63: ".png",
  65: ".png",
  66: ".png",
};

function getLocalImageUrl(recipe) {
  const ext = LOCAL_EXT[recipe.id] || ".jpg";
  return `/images/id_${recipe.id} ${recipe.name}${ext}`;
}

export async function getRecipeImage(recipe) {
  const sk = sessionKey(recipe.id);

  if (memCache.has(sk)) return memCache.get(sk);

  try {
    const stored = sessionStorage.getItem(sk);
    if (stored) { memCache.set(sk, stored); return stored; }
  } catch {}

  // African dishes: serve local image directly — no API call needed
  if (recipe.cuisine_type === "african") {
    const url = getLocalImageUrl(recipe);
    memCache.set(sk, url);
    try { sessionStorage.setItem(sk, url); } catch {}
    return url;
  }

  // Western / other: use Unsplash
  if (!UNSPLASH_KEY) return null;

  try {
    const query = QUERY_OVERRIDES[recipe.id] ?? ((recipe.name || "") + " food");
    const res = await throttledFetch(
      `${BASE_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&client_id=${UNSPLASH_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const url = data.results?.[0]?.urls?.small ?? null;
    if (url) {
      memCache.set(sk, url);
      try { sessionStorage.setItem(sk, url); } catch {}
    }
    return url;
  } catch {
    return null;
  }
}
