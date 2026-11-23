// app.js — app state, rendering and event listeners.
import { getGames, getGameDetails } from "./api.js";
import * as storage from "./storage.js";

const $ = (selector) => document.querySelector(selector); // short for querySelector
const grid = $("#grid");
const modal = $("#modal");
const modalBody = $("#modal-body");
const searchInput = $("#search");

const state = {
  games: [],        // games from the last API call
  featured: [],     // first 5 default games, shown in the hero
  heroIndex: 0,
  prefs: storage.getPrefs(), // { genre, sort }
  vaultTab: "wishlist",
  controller: null, // lets a new search cancel the old request
  openGame: null,   // game shown in the modal
};

// ---------- helpers ----------
function escapeHTML(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function isInVault(id) {
  return storage.getVault().some((item) => item.id === id);
}

function findGame(id) {
  const all = [...state.games, ...state.featured, ...storage.getVault(), ...storage.getRecent()];
  return all.find((game) => game.id === id);
}

// ---------- cards ----------
function createCard(game) {
  const card = createElement("article", "card");
  card.dataset.id = game.id;
  const open = createElement("button", "card__open");
  open.dataset.action = "open";
  const img = createElement("img", "");
  // RAWG can serve a smaller copy of the image, which loads much faster.
  img.src = (game.background_image || "").replace("/media/games/", "/media/resize/640/-/games/");
  img.alt = `${game.name} cover art`;
  img.loading = "lazy";
  const genre = game.genres[0] ? game.genres[0].name : "";
  open.append(img, createElement("p", "", [(game.released || "").slice(0, 4), genre].filter(Boolean).join(" · ")), createElement("h3", "", game.name));
  card.append(open);
  if (game.metacritic) {
    const level = game.metacritic >= 75 ? "high" : "mid";
    card.append(createElement("span", `score score--${level}`, String(game.metacritic)));
  }
  const save = createElement("button", "card__save", isInVault(game.id) ? "In Vault" : "+ Vault");
  save.dataset.action = "save";
  card.append(save);
  return card;
}

function renderCards(container, games) {
  container.replaceChildren();
  games.forEach((game) => container.append(createCard(game)));
}

// Error and empty states: a message plus one button.
function showMessage(container, text, buttonLabel, onClick) {
  container.innerHTML = `<div class="message"><p>${escapeHTML(text)}</p><button class="btn btn--accent">${buttonLabel}</button></div>`;
  container.querySelector("button").addEventListener("click", onClick);
}

// ---------- browse ----------
const sorters = {
  metacritic: (a, b) => (b.metacritic || 0) - (a.metacritic || 0),
  rating: (a, b) => b.rating - a.rating,
  released: (a, b) => (b.released || "").localeCompare(a.released || ""),
  name: (a, b) => a.name.localeCompare(b.name),
};

function renderBrowse() {
  const { genre, sort } = state.prefs;
  const visible = state.games
    .filter((game) => genre === "all" || game.genres.some((g) => g.slug === genre))
    .sort(sorters[sort]);
  $("#status").textContent = `${visible.length} games`;
  if (visible.length === 0) {
    const query = searchInput.value.trim();
    showMessage(grid, `No games match ${query ? `“${query}”` : "this filter"}.`, "Clear filters", clearFilters);
  } else {
    renderCards(grid, visible);
  }
}

async function loadGames() {
  if (state.controller) state.controller.abort();
  state.controller = new AbortController();
  grid.innerHTML = '<div class="card skeleton"></div>'.repeat(8);
  $("#status").textContent = "Loading…";
  try {
    const searchText = searchInput.value.trim();
    state.games = await getGames(searchText, state.controller.signal);
    if (!searchText && state.featured.length === 0) {
      state.featured = state.games.slice(0, 5);
      renderHero();
    }
    renderBrowse();
  } catch (error) {
    if (error.name === "AbortError") return; // replaced by a newer search
    $("#status").textContent = "";
    showMessage(grid, error.message, "Retry", loadGames);
  }
}

function clearFilters() {
  searchInput.value = "";
  state.prefs = { genre: "all", sort: "metacritic" };
  storage.savePrefs(state.prefs);
  $("#genre").value = state.prefs.genre;
  $("#sort").value = state.prefs.sort;
  loadGames();
}

// ---------- hero ----------
function renderHero() {
  const game = state.featured[state.heroIndex];
  if (!game) return;
  $("#hero").classList.remove("is-loading");
  $("#hero-img").src = game.background_image;
  $("#hero-img").alt = `${game.name} key art`;
  $("#hero-kicker").textContent = `Featured ${state.heroIndex + 1} / ${state.featured.length}`;
  $("#hero-title").textContent = game.name;
  // Only show fields RAWG actually has, never "undefined".
  const score = game.metacritic ? `Metacritic ${game.metacritic}` : "";
  $("#hero-meta").textContent = [(game.released || "").slice(0, 4), game.genres.map((g) => g.name).join(", "), score].filter(Boolean).join(" · ");
  $("#hero-save").textContent = isInVault(game.id) ? "In Vault" : "Add to Vault";
}

function moveHero(step) {
  const count = state.featured.length;
  if (count === 0) return;
  state.heroIndex = (state.heroIndex + step + count) % count; // wraps around
  renderHero();
}

// ---------- vault & recently viewed ----------
function toggleVault(id) {
  if (isInVault(id)) storage.removeFromVault(id);
  else storage.setStatus(findGame(id), "wishlist");
  refresh();
}

function renderVault() {
  const vault = storage.getVault();
  $("#vault-count").textContent = vault.length;
  // reduce: total playtime and Metacritic total in one pass.
  const totals = vault.reduce((sum, game) => {
    sum.hours += game.playtime;
    if (game.metacritic) { sum.score += game.metacritic; sum.scored += 1; }
    return sum;
  }, { hours: 0, score: 0, scored: 0 });
  const average = totals.scored ? ` · avg Metacritic ${Math.round(totals.score / totals.scored)}` : "";
  $("#vault-stats").textContent = `${vault.length} games · ${totals.hours} hrs of average playtime${average}`;
  document.querySelectorAll(".tab").forEach((tab) => {
    const count = vault.filter((game) => game.status === tab.dataset.tab).length;
    tab.textContent = `${tab.dataset.tab} (${count})`;
    tab.classList.toggle("is-active", tab.dataset.tab === state.vaultTab);
  });
  const list = vault.filter((game) => game.status === state.vaultTab).sort((a, b) => b.addedAt - a.addedAt);
  if (list.length === 0) $("#vault-grid").innerHTML = '<p class="empty">Nothing here yet. Add games from Browse.</p>';
  else renderCards($("#vault-grid"), list);
}

function renderRecent() {
  const recent = storage.getRecent();
  $("#recent-section").hidden = recent.length === 0;
  renderCards($("#recent"), recent);
}

// Redraw everything that shows Vault state.
function refresh() {
  if (state.games.length) renderBrowse();
  renderVault();
  renderRecent();
  renderHero();
  if (state.openGame) renderDetail(state.openGame);
}

// ---------- detail modal ----------
async function openDetail(id) {
  modal.hidden = false;
  document.body.classList.add("no-scroll");
  modalBody.innerHTML = '<div class="skeleton detail__loading"></div>';
  $("#modal-close").focus();
  try {
    const game = await getGameDetails(id);
    state.openGame = game;
    storage.addRecent(game);
    renderRecent();
    renderDetail(game);
  } catch (error) {
    showMessage(modalBody, error.message, "Retry", () => openDetail(id));
  }
}

function renderDetail(game) {
  const names = (list) => (list || []).map((item) => item.name).join(", ");
  const saved = storage.getVault().find((item) => item.id === game.id);
  const facts = {
    Released: game.released,
    Developer: names(game.developers),
    Publisher: names(game.publishers),
    Genres: names(game.genres),
    Platforms: (game.platforms || []).map((p) => p.platform.name).join(", "),
    Playtime: game.playtime ? `${game.playtime} hrs` : "",
    "Age rating": game.esrb_rating ? game.esrb_rating.name : "",
    Metacritic: game.metacritic,
  };
  const rows = Object.entries(facts)
    .filter((entry) => entry[1]) // skip empty fields
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHTML(value)}</dd>`)
    .join("");
  const buttons = ["wishlist", "playing", "finished", "remove"]
    .filter((status) => status !== "remove" || saved)
    .map((status) => `<button class="btn ${saved && saved.status === status ? "btn--accent" : ""}" data-status="${status}">${status}</button>`)
    .join("");
  modalBody.innerHTML = `
    <img class="detail__img" src="${escapeHTML(game.background_image || "")}" alt="${escapeHTML(game.name)} artwork">
    <div class="detail__body">
      <h2>${escapeHTML(game.name)}</h2>
      <div class="detail__buttons">${buttons}</div>
      <p class="detail__text">${escapeHTML(game.description_raw || "No description yet.")}</p>
      <dl class="facts">${rows}</dl>
      ${game.website ? `<a href="${escapeHTML(game.website)}" target="_blank" rel="noopener">Official website →</a>` : ""}
    </div>`;
}

function closeDetail() {
  modal.hidden = true;
  state.openGame = null;
  document.body.classList.remove("no-scroll");
}

// ---------- events ----------
// Event delegation: one listener handles every card inside a container.
function handleCardClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.closest(".card").dataset.id);
  if (button.dataset.action === "save") toggleVault(id);
  else openDetail(id);
}
["#grid", "#vault-grid", "#recent"].forEach((selector) => $(selector).addEventListener("click", handleCardClick));

// Debounce: search only after the user stops typing for 400 ms.
let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadGames, 400);
});
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  loadGames();
  $("#browse").scrollIntoView();
});

// Genre and sort only re-arrange the loaded games, so no new request.
["genre", "sort"].forEach((name) => {
  $(`#${name}`).value = state.prefs[name];
  $(`#${name}`).addEventListener("change", (event) => {
    state.prefs[name] = event.target.value;
    storage.savePrefs(state.prefs);
    renderBrowse();
  });
});

$("#tabs").addEventListener("click", (event) => {
  if (!event.target.dataset.tab) return;
  state.vaultTab = event.target.dataset.tab;
  renderVault();
});

$("#hero-details").addEventListener("click", () => openDetail(state.featured[state.heroIndex].id));
$("#hero-save").addEventListener("click", () => toggleVault(state.featured[state.heroIndex].id));

modalBody.addEventListener("click", (event) => {
  const status = event.target.dataset.status;
  if (!status) return;
  if (status === "remove") storage.removeFromVault(state.openGame.id);
  else storage.setStatus(state.openGame, status);
  refresh();
});
// Close with the ✕ button or by clicking the dark backdrop.
modal.addEventListener("click", (event) => {
  if (event.target === modal || event.target.id === "modal-close") closeDetail();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeDetail();
  if (!modal.hidden || event.target.matches("input, select")) return;
  if (event.key === "ArrowRight") moveHero(1);
  if (event.key === "ArrowLeft") moveHero(-1);
});

// Hero auto-advances every 6 s, but pauses while the mouse is over it.
setInterval(() => {
  if (modal.hidden && !$("#hero").matches(":hover")) moveHero(1);
}, 6000);

// ---------- start ----------
renderVault();
renderRecent();
loadGames();
