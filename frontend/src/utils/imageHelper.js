const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "";
const BASE_URL = "https://api.unsplash.com/search/photos";

// In-memory cache so the same recipe never fires twice per session
const memCache = new Map();

// Throttle: max 3 concurrent Unsplash requests so 12 cards don't all fire at once
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

function sessionKey(id) { return `cs_img_${id}`; }

// Try to find a local image for the recipe (used for African dishes)
async function getLocalImage(recipe) {
  const base = `/images/id_${recipe.id} ${recipe.name}`;
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    try {
      const res = await fetch(encodeURI(base + ext), { method: "HEAD" });
      if (res.ok) return base + ext;
    } catch {}
  }
  return null;
}

function buildUnsplashQuery(recipe) {
  const name = recipe.name || "";
  if (!name) return "food dish";
  return `${name} food`;
}

export async function getRecipeImage(recipe) {
  const sk = sessionKey(recipe.id);

  if (memCache.has(sk)) return memCache.get(sk);

  try {
    const stored = sessionStorage.getItem(sk);
    if (stored) { memCache.set(sk, stored); return stored; }
  } catch {}

  // African dishes: use local images only
  if (recipe.cuisine_type === "african") {
    const local = await getLocalImage(recipe);
    if (local) {
      memCache.set(sk, local);
      try { sessionStorage.setItem(sk, local); } catch {}
    }
    return local;
  }

  // Western / other dishes: use Unsplash
  if (!UNSPLASH_KEY) return null;

  try {
    const res = await throttledFetch(
      `${BASE_URL}?query=${encodeURIComponent(buildUnsplashQuery(recipe))}&per_page=1&orientation=landscape&client_id=${UNSPLASH_KEY}`
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
