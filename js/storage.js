// storage.js — everything saved in localStorage (as JSON).

// JSON.parse is wrapped in try/catch so broken data can't crash the app.
function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadList(key) {
  const list = load(key, []);
  return Array.isArray(list) ? list : [];
}

// Keep only the fields the cards need, so saved data stays small.
function toSummary(game) {
  const { id, name, released, background_image, metacritic } = game;
  const genres = (game.genres || []).map((genre) => ({ name: genre.name, slug: genre.slug }));
  return { id, name, released, background_image, metacritic, playtime: game.playtime || 0, genres };
}

// Vault: [{ ...summary, status: "wishlist" | "playing" | "finished", addedAt }]
export const getVault = () => loadList("vault");
export function setStatus(game, status) {
  const vault = getVault().filter((item) => item.id !== game.id);
  vault.push({ ...toSummary(game), status, addedAt: Date.now() });
  save("vault", vault);
}
export function removeFromVault(id) {
  save("vault", getVault().filter((item) => item.id !== id));
}

// Recently viewed: newest first, no duplicates, max 8.
export const getRecent = () => loadList("recent");
export function addRecent(game) {
  const others = getRecent().filter((item) => item.id !== game.id);
  save("recent", [toSummary(game), ...others].slice(0, 8));
}

// Last used genre filter and sort order.
export const getPrefs = () => ({ genre: "all", sort: "metacritic", ...load("prefs", {}) });
export const savePrefs = (prefs) => save("prefs", prefs);
