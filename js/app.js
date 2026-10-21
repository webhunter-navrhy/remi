// REMY — hlavní logika rozhraní (přepínání obrazovek, spíž, návrhy receptů, detail)

import * as store from "./store.js";
import { parseIngredients, emojiFor } from "./parse.js";
import { recognizeImage, suggestRecipes, resizeImage } from "./api.js";
import { localSuggestions } from "./fallback.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = store.formatAmount;

const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_HEART = '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

let suggested = [];   // aktuálně zobrazené návrhy
let seen = [];        // názvy, které už Remy navrhl (pro „Ukaž jiné“)

// ================= navigace =================

function route() {
  const tab = (location.hash || "#spiz").slice(1);
  const valid = ["spiz", "varit", "ulozene"].includes(tab) ? tab : "spiz";
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== valid));
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === valid));
  if (valid === "varit") renderCookLead();
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);

// ================= spíž =================

function step(item) {
  if (item.unit === "ks") return 1;
  return item.amount >= 1000 ? 250 : item.amount >= 200 ? 100 : 50;
}

function renderPantry() {
  const { pantry } = store.getState();
  $("#pantry-count").textContent = pantry.length;
  $("#pantry-empty").hidden = pantry.length > 0;
  $("#clear-pantry").hidden = pantry.length === 0;
  $("#cta-cook").hidden = pantry.length === 0;
  $("#pantry-list").innerHTML = pantry
    .map(
      (p) => `
    <li class="item" data-id="${p.id}">
      <span class="item-emoji" aria-hidden="true">${emojiFor(p.name)}</span>
      <span class="item-name">${esc(p.name)}</span>
      <div class="qty">
        <button type="button" data-act="minus" aria-label="Ubrat">−</button>
        <button type="button" class="qty-val" data-act="edit" title="Klikni pro úpravu">${fmt(p.amount, p.unit)}</button>
        <button type="button" data-act="plus" aria-label="Přidat">+</button>
      </div>
      <button type="button" class="del" data-act="del" aria-label="Odebrat ${esc(p.name)}">${ICON_X}</button>
    </li>`
    )
    .join("");
}

$("#pantry-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".item").dataset.id;
  const item = store.getState().pantry.find((p) => p.id === id);
  if (!item) return;
  const act = btn.dataset.act;
  if (act === "plus") store.updateItem(id, { amount: item.amount + step(item) });
  if (act === "minus") {
    const next = item.amount - step(item);
    next <= 0 ? store.removeItem(id) : store.updateItem(id, { amount: next });
  }
  if (act === "del") {
    store.removeItem(id);
    toast(`${item.name} odebráno`, () => store.addItem(item));
  }
  if (act === "edit") editAmount(btn, item);
});

// Klik na množství → přímá úprava čísla
function editAmount(btn, item) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.inputMode = "decimal";
  input.className = "qty-val";
  input.value = item.amount;
  input.setAttribute("aria-label", `Množství (${item.unit})`);
  btn.replaceWith(input);
  input.focus();
  input.select();
  const done = () => {
    const v = parseFloat(input.value);
    if (isNaN(v)) return renderPantry();
    v <= 0 ? store.removeItem(item.id) : store.updateItem(item.id, { amount: v });
  };
  input.addEventListener("blur", done, { once: true });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") renderPantry();
  });
}

$("#quick-add").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#quick-input");
  const items = parseIngredients(input.value);
  if (!items.length) return input.focus();
  items.forEach(store.addItem);
  input.value = "";
  toast(items.length === 1 ? `Přidáno: ${items[0].name}` : `Přidáno ${items.length} potravin`);
});

$("#demo-btn").addEventListener("click", () => {
  if (store.getState().pantry.length && !confirm("Nahradit současnou spíž ukázkovou?")) return;
  store.loadDemo();
  toast("Ukázková spíž je připravená");
});

$("#clear-pantry").addEventListener("click", () => {
  if (confirm("Opravdu vyprázdnit celou spíž?")) store.clearPantry();
});

// ================= fotka → ingredience =================

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let image;
  try {
    image = await resizeImage(file);
  } catch (err) {
    return toast(err.message);
  }
  openSheet(`
    <div class="sheet-top"><h2 style="margin:0">Remy se dívá…</h2>${closeBtn()}</div>
    <img class="scan-preview" src="${image}" alt="Tvoje fotka">
    <div class="status"><span class="pot"></span><span>Hledám na fotce potraviny, chvilku to trvá (10–20 s).</span></div>
  `);
  try {
    const { ingredients } = await recognizeImage(image);
    if (!$("#sheet").open) return;
    renderScanResult(image, ingredients);
  } catch (err) {
    if (!$("#sheet").open) return;
    $("#sheet-body").querySelector(".status").outerHTML =
      `<div class="status error">Nepovedlo se: ${esc(err.message)} Zkus jinou fotku, nebo potraviny napiš ručně.</div>`;
  }
});

function renderScanResult(image, ingredients) {
  if (!ingredients.length) {
    $("#sheet-body").querySelector(".status").outerHTML =
      '<div class="status error">Na fotce jsem žádné potraviny nenašel. Zkus to vyfotit zblízka a při dobrém světle.</div>';
    return;
  }
  const unitSelect = (u) =>
    `<select aria-label="Jednotka">${["ks", "g", "ml"].map((x) => `<option ${x === u ? "selected" : ""}>${x}</option>`).join("")}</select>`;
  openSheet(`
    <div class="sheet-top"><h2 style="margin:0">Našel jsem ${ingredients.length} ${plural(ingredients.length, "potravinu", "potraviny", "potravin")}</h2>${closeBtn()}</div>
    <img class="scan-preview" src="${image}" alt="Tvoje fotka">
    <p class="desc">Zkontroluj, jestli to sedí. Můžeš opravit název nebo množství a odškrtnout, co nechceš.</p>
    <h4>Rozpoznané potraviny</h4>
    <ul class="scan-list">
      ${ingredients
        .map(
          (i) => `<li>
          <input type="checkbox" checked aria-label="Přidat">
          <span aria-hidden="true">${emojiFor(i.name)}</span>
          <input class="s-name" value="${esc(i.name)}" aria-label="Název">
          <input class="s-amt" type="number" min="0" value="${i.amount}" aria-label="Množství">
          ${unitSelect(i.unit)}
        </li>`
        )
        .join("")}
    </ul>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-close>Zrušit</button>
      <button type="button" class="btn btn-primary" id="scan-add">Přidat do spíže</button>
    </div>
  `);
  $("#scan-add").addEventListener("click", () => {
    let n = 0;
    $("#sheet-body").querySelectorAll(".scan-list li").forEach((li) => {
      if (!li.querySelector("input[type=checkbox]").checked) return;
      store.addItem({
        name: li.querySelector(".s-name").value,
        amount: li.querySelector(".s-amt").value,
        unit: li.querySelector("select").value,
      });
      n++;
    });
    closeSheet();
    toast(`Do spíže přibylo ${n} ${plural(n, "potravina", "potraviny", "potravin")}`);
  });
}

// ================= návrhy receptů =================

function renderCookLead() {
  const n = store.getState().pantry.length;
  $("#cook-lead").textContent = n
    ? `Ve spíži máš ${n} ${plural(n, "potravinu", "potraviny", "potravin")}. Remy z nich navrhne tři jídla.`
    : "Spíž je zatím prázdná — nejdřív přidej, co máš doma.";
  $("#portions").textContent = store.getState().portions;
}

document.querySelectorAll("[data-portions]").forEach((b) =>
  b.addEventListener("click", () => {
    const n = Math.min(12, Math.max(1, store.getState().portions + Number(b.dataset.portions)));
    store.setPortions(n);
    $("#portions").textContent = n;
  })
);

$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) chip.classList.toggle("on");
});

function currentNote() {
  const chips = [...document.querySelectorAll(".chip.on")].map((c) => c.dataset.note);
  const own = $("#note").value.trim();
  return [...chips, own].filter(Boolean).join(", ");
}

const LOADING = [
  "Remy čichá ke spíži…",
  "Prohlíží, co máš v lednici…",
  "Vymýšlí, co by se k sobě hodilo…",
  "Počítá porce…",
  "Píše recept, ať to zvládneš i ty…",
];

async function suggest(more = false) {
  const { pantry, portions } = store.getState();
  if (!pantry.length) {
    showStatus("error", 'Spíž je prázdná. <a href="#spiz">Přidej potraviny</a> a pak se vrať.');
    return;
  }
  if (!more) seen = [];
  const btn = $("#suggest-btn");
  btn.disabled = true;
  $("#more-btn").hidden = true;
  if (!more) $("#recipes").innerHTML = "";

  let i = 0;
  showStatus("", `<span class="pot"></span><span id="loading-text">${LOADING[0]}</span>`);
  const ticker = setInterval(() => {
    const el = $("#loading-text");
    if (el) el.textContent = LOADING[++i % LOADING.length];
  }, 3500);

  const ingredients = pantry.map(({ name, amount, unit }) => ({ name, amount, unit }));
  try {
    const { recipes } = await suggestRecipes({ ingredients, portions, note: currentNote(), exclude: seen });
    if (!recipes?.length) throw new Error("AI nic nenavrhla");
    suggested = recipes;
    $("#suggest-status").hidden = true;
  } catch (err) {
    // záloha: offline kuchařka
    suggested = localSuggestions({ portions, exclude: seen });
    showStatus(
      "info",
      suggested.length
        ? "AI teď neodpovídá, tak jsem vybral recepty z vlastní kuchařky."
        : "AI teď neodpovídá a v záložní kuchařce nic nesedí na tvou spíž. Zkus to za chvilku znovu."
    );
  } finally {
    clearInterval(ticker);
    btn.disabled = false;
  }
  seen.push(...suggested.map((r) => r.name));
  renderRecipes($("#recipes"), suggested);
  $("#more-btn").hidden = !suggested.length;
}

$("#suggest-btn").addEventListener("click", () => suggest(false));
$("#more-btn").addEventListener("click", () => suggest(true));

function showStatus(kind, html) {
  const el = $("#suggest-status");
  el.className = `status ${kind}`;
  el.innerHTML = html;
  el.hidden = false;
}

// kolik surovin z receptu je doma v dostatečném množství
function availability(recipe) {
  const rows = [];
  for (const u of recipe.uses || []) {
    const p = store.findInPantry(u.name);
    let state = "miss";
    if (p) state = p.unit !== u.unit || p.amount >= u.amount ? "have" : "low";
    rows.push({ ...u, state, pantry: p });
  }
  for (const m of recipe.missing || []) rows.push({ ...m, state: "miss", optional: true });
  return rows;
}

function renderRecipes(container, list) {
  container.innerHTML = list
    .map((r, idx) => {
      const rows = availability(r).filter((x) => !x.optional);
      const have = rows.filter((x) => x.state === "have").length;
      return `
      <button type="button" class="recipe-card" data-idx="${idx}">
        <span class="emoji" aria-hidden="true">${esc(r.emoji || "🍽️")}</span>
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.description)}</p>
        <span class="meta">
          <span class="tag">⏱ ${r.time} min</span>
          <span class="tag">${esc(r.difficulty)}</span>
          ${rows.length ? `<span class="tag ${have === rows.length ? "ok" : ""}">máš ${have}/${rows.length}</span>` : ""}
          ${r.source === "ai" ? '<span class="tag ai">✦ AI</span>' : ""}
        </span>
      </button>`;
    })
    .join("");
  container.onclick = (e) => {
    const card = e.target.closest(".recipe-card");
    if (card) openRecipe(list[card.dataset.idx]);
  };
}

// ================= detail receptu =================

function openRecipe(recipe) {
  const rows = availability(recipe);
  const fav = store.isFavorite(recipe);
  openSheet(`
    <div class="sheet-top">
      <span class="emoji" aria-hidden="true">${esc(recipe.emoji || "🍽️")}</span>
      <div style="display:flex;gap:8px">
        <button type="button" class="icon-btn ${fav ? "fav" : ""}" id="fav-btn" aria-label="Uložit do oblíbených">${ICON_HEART}</button>
        ${closeBtn()}
      </div>
    </div>
    <h2>${esc(recipe.name)}</h2>
    <p class="desc">${esc(recipe.description)}</p>
    <div class="meta">
      <span class="tag">⏱ ${recipe.time} min</span>
      <span class="tag">${esc(recipe.difficulty)}</span>
      <span class="tag">🍽 ${recipe.portions} ${plural(recipe.portions, "porce", "porce", "porcí")}</span>
    </div>
    <h4>Suroviny</h4>
    <ul class="ing">
      ${rows
        .map(
          (r) => `<li class="${r.state}">
          <span class="dot">${r.state === "have" ? "✓" : r.state === "low" ? "!" : "+"}</span>
          <span>${esc(r.name)} ${r.optional ? '<span class="note">· dokoupit</span>' : r.state === "low" ? `<span class="note">· máš jen ${fmt(r.pantry.amount, r.pantry.unit)}</span>` : r.state === "miss" ? '<span class="note">· nemáš</span>' : ""}</span>
          <span class="amt">${fmt(r.amount, r.unit)}</span>
        </li>`
        )
        .join("")}
      <li class="have"><span class="dot">✓</span><span class="note">sůl, pepř, olej a voda</span></li>
    </ul>
    <h4>Postup <span style="text-transform:none;letter-spacing:0;font-weight:400">· klikni na hotový krok</span></h4>
    <ol class="steps">${recipe.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="sheet-actions">
      <button type="button" class="btn btn-primary btn-big" id="cooked-btn">Uvařeno — odečíst ze spíže</button>
    </div>
  `);
  $("#sheet-body").querySelector(".steps").addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) li.classList.toggle("done");
  });
  $("#fav-btn").addEventListener("click", (e) => {
    store.toggleFavorite(recipe);
    e.currentTarget.classList.toggle("fav", store.isFavorite(recipe));
    toast(store.isFavorite(recipe) ? "Uloženo do oblíbených" : "Odebráno z oblíbených");
  });
  $("#cooked-btn").addEventListener("click", () => {
    const snapshot = store.cook(recipe);
    closeSheet();
    toast("Dobrou chuť! Spíž jsem upravil.", () => store.restorePantry(snapshot));
    renderRecipes($("#recipes"), suggested);
  });
}

// ================= uložené =================

function renderSaved() {
  const { favorites, history } = store.getState();
  $("#fav-empty").hidden = favorites.length > 0;
  renderRecipes($("#favorites"), favorites);
  $("#history-empty").hidden = history.length > 0;
  $("#clear-history").hidden = history.length === 0;
  $("#history").innerHTML = history
    .map(
      (h, idx) => `<li data-idx="${idx}">
        <span class="h-emoji" aria-hidden="true">${esc(h.emoji || "🍽️")}</span>
        <span><span class="h-name">${esc(h.name)}</span><br>
        <span class="h-meta">${new Date(h.date).toLocaleDateString("cs-CZ", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · ${h.portions} ${plural(h.portions, "porce", "porce", "porcí")}${h.used.length ? " · spotřebováno: " + h.used.map((u) => `${u.name} ${fmt(u.amount, u.unit)}`).join(", ") : ""}</span></span>
      </li>`
    )
    .join("");
}

$("#history").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) openRecipe(store.getState().history[li.dataset.idx].recipe);
});
$("#clear-history").addEventListener("click", () => {
  if (confirm("Smazat celou historii vaření?")) store.clearHistory();
});

// ================= sheet, toast, pomocné =================

const closeBtn = () => `<button type="button" class="icon-btn" data-close aria-label="Zavřít">${ICON_X}</button>`;

function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  const d = $("#sheet");
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
function closeSheet() {
  $("#sheet").close();
}
$("#sheet").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]") || e.target === e.currentTarget) closeSheet();
});

let toastTimer;
function toast(text, undo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button">Zpět</button>' : ""}`;
  el.hidden = false;
  if (undo) el.querySelector("button").onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 6000 : 2800);
}

function plural(n, one, few, many) {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

// ================= start =================

store.subscribe(() => {
  renderPantry();
  renderSaved();
  renderCookLead();
});
renderPantry();
renderSaved();
route();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
