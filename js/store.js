// Ukládání dat do prohlížeče (localStorage) — spíž, historie vaření, oblíbené recepty

const KEY = "remy:v1";

const empty = () => ({ pantry: [], history: [], favorites: [], portions: 2 });

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* soukromé okno apod. — aplikace funguje dál, jen bez paměti */
  }
  listeners.forEach((fn) => fn(state));
}

export const getState = () => state;
export const subscribe = (fn) => listeners.add(fn);

// "Rajčata" i "rajče" i "Rajce" → stejný klíč, aby se položky slučovaly
export function normalize(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// Volné porovnání názvů: "sýr eidam" ~ "eidam", "vejce" ~ "vajicka"
const STEMS = [
  ["vajic", "vejce"], ["vajec", "vejce"], ["brambor", "brambory"], ["rajc", "rajce"],
  ["cibul", "cibule"], ["mrkv", "mrkev"], ["paprik", "paprika"], ["testovin", "testoviny"],
  ["spaget", "testoviny"], ["ryz", "ryze"], ["mlek", "mleko"], ["mouk", "mouka"],
  ["maslo", "maslo"], ["cesnek", "cesnek"], ["kurec", "kure"], ["kure", "kure"],
  ["smetan", "smetana"], ["syr", "syr"], ["eidam", "syr"], ["parmazan", "syr"],
  ["jablk", "jablko"], ["banan", "banan"], ["chleb", "chleba"], ["okurk", "okurka"],
  ["salat", "salat"], ["slanin", "slanina"], ["sunk", "sunka"], ["cuket", "cuketa"],
  ["houb", "houby"], ["zampion", "houby"], ["fazol", "fazole"], ["cocka", "cocka"],
  ["cock", "cocka"], ["tunak", "tunak"], ["jogurt", "jogurt"], ["cukr", "cukr"],
];

export function stem(name) {
  const n = normalize(name);
  for (const [prefix, base] of STEMS) if (n.includes(prefix)) return base;
  return n.replace(/(y|e|a|i|u)$/, "");
}

export const sameIngredient = (a, b) => {
  const na = normalize(a), nb = normalize(b);
  return na === nb || stem(a) === stem(b) || (na.length > 3 && nb.includes(na)) || (nb.length > 3 && na.includes(nb));
};

export const findInPantry = (name) => state.pantry.find((p) => sameIngredient(p.name, name));

// ---------- spíž ----------

export function addItem({ name, amount, unit }) {
  name = String(name || "").trim().toLowerCase();
  if (!name) return;
  amount = Math.max(0, Number(amount) || 0);
  const existing = state.pantry.find((p) => normalize(p.name) === normalize(name) && p.unit === unit)
    || state.pantry.find((p) => sameIngredient(p.name, name) && p.unit === unit);
  if (existing) existing.amount = round(existing.amount + amount);
  else state.pantry.unshift({ id: crypto.randomUUID(), name, amount: round(amount), unit, added: Date.now() });
  save();
}

export function updateItem(id, patch) {
  const item = state.pantry.find((p) => p.id === id);
  if (!item) return;
  Object.assign(item, patch);
  item.amount = round(Math.max(0, item.amount));
  save();
}

export function removeItem(id) {
  state.pantry = state.pantry.filter((p) => p.id !== id);
  save();
}

export function clearPantry() {
  state.pantry = [];
  save();
}

export function setPortions(n) {
  state.portions = n;
  save();
}

// Po uvaření odečteme spotřebované suroviny. Vrací "snapshot" pro tlačítko Zpět.
export function cook(recipe) {
  const before = JSON.parse(JSON.stringify(state.pantry));
  const used = [];
  for (const u of recipe.uses || []) {
    const item = state.pantry.find((p) => sameIngredient(p.name, u.name) && p.unit === u.unit)
      || state.pantry.find((p) => sameIngredient(p.name, u.name));
    if (!item) continue;
    const take = item.unit === u.unit ? u.amount : convert(u.amount, u.unit, item.unit);
    item.amount = round(Math.max(0, item.amount - take));
    used.push({ name: item.name, amount: take, unit: item.unit });
  }
  // co došlo, ze spíže zmizí
  state.pantry = state.pantry.filter((p) => p.amount > 0);
  state.history.unshift({
    id: crypto.randomUUID(),
    date: Date.now(),
    name: recipe.name,
    emoji: recipe.emoji,
    portions: recipe.portions,
    used,
    recipe,
  });
  state.history = state.history.slice(0, 50);
  save();
  return before;
}

export function restorePantry(snapshot) {
  state.pantry = snapshot;
  state.history.shift();
  save();
}

// ---------- oblíbené ----------

export const isFavorite = (recipe) => state.favorites.some((f) => f.name === recipe.name);

export function toggleFavorite(recipe) {
  if (isFavorite(recipe)) state.favorites = state.favorites.filter((f) => f.name !== recipe.name);
  else state.favorites.unshift({ ...recipe, saved: Date.now() });
  save();
}

export function clearHistory() {
  state.history = [];
  save();
}

// ---------- pomocné ----------

const round = (n) => Math.round(n * 10) / 10;

// Hrubý převod, když AI vrátí jinou jednotku než máme ve spíži (1 ks ≈ 100 g)
function convert(amount, from, to) {
  if (from === to) return amount;
  if (from === "ks") return amount * 100;
  if (to === "ks") return Math.max(1, Math.round(amount / 100));
  return amount; // g ↔ ml bereme 1:1
}

export function formatAmount(amount, unit) {
  if (unit === "g" && amount >= 1000) return `${round(amount / 1000)} kg`;
  if (unit === "ml" && amount >= 1000) return `${round(amount / 1000)} l`;
  return `${round(amount)} ${unit}`;
}

export const DEMO_PANTRY = [
  { name: "vejce", amount: 8, unit: "ks" },
  { name: "brambory", amount: 1500, unit: "g" },
  { name: "cibule", amount: 3, unit: "ks" },
  { name: "česnek", amount: 1, unit: "ks" },
  { name: "mléko", amount: 1000, unit: "ml" },
  { name: "máslo", amount: 250, unit: "g" },
  { name: "hladká mouka", amount: 1000, unit: "g" },
  { name: "eidam", amount: 200, unit: "g" },
  { name: "rajčata", amount: 4, unit: "ks" },
  { name: "těstoviny", amount: 500, unit: "g" },
  { name: "kuřecí prsa", amount: 400, unit: "g" },
  { name: "smetana na vaření", amount: 200, unit: "ml" },
  { name: "rýže", amount: 500, unit: "g" },
  { name: "mrkev", amount: 3, unit: "ks" },
];

export function loadDemo() {
  state.pantry = [];
  DEMO_PANTRY.forEach((i) => state.pantry.push({ id: crypto.randomUUID(), ...i, added: Date.now() }));
  save();
}
