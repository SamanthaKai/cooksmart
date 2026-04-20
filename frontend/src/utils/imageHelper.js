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

function buildQuery(recipe) {
  const name = recipe.name || "";
  if (!name) return "African food dish";
  if (recipe.cuisine_type === "african") return `${name} Ugandan African food`;
  if (recipe.cuisine_type === "western") return `${name} food`;
  return `${name} food dish`;
}

export async function getRecipeImage(recipe) {
  const sk = sessionKey(recipe.id);

  if (memCache.has(sk)) return memCache.get(sk);

  try {
    const stored = sessionStorage.getItem(sk);
    if (stored) { memCache.set(sk, stored); return stored; }
  } catch {}

  if (!UNSPLASH_KEY) return null;

  try {
    const res = await throttledFetch(
      `${BASE_URL}?query=${encodeURIComponent(buildQuery(recipe))}&per_page=1&orientation=landscape&client_id=${UNSPLASH_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Use "small" (400px wide) — fast, good enough for cards and detail hero
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
