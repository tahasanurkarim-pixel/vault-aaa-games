// api.js — every request to the RAWG API lives here.
// Uses API_KEY, API_BASE and GAMES_PER_PAGE from config.js.

// Calls fetch and returns the JSON, or throws an Error with a readable message.
async function request(path, params, signal) {
  if (API_KEY === "YOUR_RAWG_KEY") throw new Error("No RAWG API key yet. Add your free key in js/config.js.");

  const url = new URL(API_BASE + path);
  url.searchParams.set("key", API_KEY);
  for (const name in params) url.searchParams.set(name, params[name]);

  let response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error; // a newer search replaced this one
    throw new Error("Could not reach RAWG. Check your connection.");
  }
  if (!response.ok) throw new Error(`RAWG returned an error (HTTP ${response.status}).`);
  return response.json();
}

// No search text: the most popular big PlayStation-era action/adventure games
// scoring 88+ on Metacritic (GTA V, Red Dead Redemption 2, God of War, Uncharted 4...).
async function getGames(searchText, signal) {
  const params = searchText
    ? { search: searchText, search_precise: true }
    : { genres: "action,adventure", parent_platforms: 2, metacritic: "88,100", ordering: "-added", dates: "2013-01-01,2026-12-31" };
  params.page_size = GAMES_PER_PAGE;
  const data = await request("/games", params, signal);
  return data.results;
}

async function getGameDetails(id) {
  return request(`/games/${id}`, {});
}
