// Převod volného textu „6 vajec, 1 l mléka, kilo brambor“ na položky spíže

// 2. pád → 1. pád pro nejběžnější potraviny ("6 vajec" → "vejce")
const NOMINATIVE = {
  vajec: "vejce", vajicek: "vejce", vajicka: "vejce", mleka: "mléko", brambor: "brambory",
  mouky: "mouka", "hladke mouky": "hladká mouka", "polohrube mouky": "polohrubá mouka",
  cibuli: "cibule", rajcat: "rajčata", syra: "sýr", masla: "máslo", ryze: "rýže",
  testovin: "těstoviny", spaget: "špagety", mrkvi: "mrkev", mrkve: "mrkev", jablek: "jablka",
  cukru: "cukr", smetany: "smetana", jogurtu: "jogurt", chleba: "chleba", rohliku: "rohlíky",
  paprik: "papriky", okurek: "okurky", "kurecich prsou": "kuřecí prsa", "kureciho masa": "kuřecí maso",
  "mleteho masa": "mleté maso", slaniny: "slanina", sunky: "šunka", eidamu: "eidam",
  cesneku: "česnek", hub: "houby", zampionu: "žampiony", banan: "banány", citronu: "citrony",
  tvarohu: "tvaroh", "kysane smetany": "kysaná smetana", "smetany na vareni": "smetana na vaření",
  cuket: "cukety", "fazoli": "fazole", cocky: "čočka", oleje: "olej",
};

// Výchozí množství, když uživatel napíše jen název ("brambory")
const DEFAULTS = {
  brambory: [1000, "g"], mleko: [1000, "ml"], mouka: [1000, "g"], "hladka mouka": [1000, "g"],
  ryze: [500, "g"], testoviny: [500, "g"], spagety: [500, "g"], maslo: [250, "g"], syr: [200, "g"],
  eidam: [200, "g"], cukr: [1000, "g"], smetana: [200, "ml"], jogurt: [150, "g"], tvaroh: [250, "g"],
  "kureci prsa": [500, "g"], "mlete maso": [500, "g"], slanina: [150, "g"], sunka: [100, "g"],
  vejce: [10, "ks"], cocka: [500, "g"], olej: [1000, "ml"], rajcata: [4, "ks"], cibule: [3, "ks"],
  mrkev: [4, "ks"], papriky: [3, "ks"], jablka: [4, "ks"], "smetana na vareni": [200, "ml"],
};

const strip = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const UNIT_RE = "(kg|kila|kilo|dkg|dag|g|gramu|ml|dl|l|litr|litry|litru|ks|kus|kusy|kusu|balení|baleni)";
const NUM_RE = "(\\d+(?:[.,]\\d+)?|pul|půl|jeden|jedna|jedno|dva|dve|dvě|tri|tři|ctyri|čtyři|pet|pět)";

const WORD_NUM = { pul: 0.5, "půl": 0.5, jeden: 1, jedna: 1, jedno: 1, dva: 2, dve: 2, "dvě": 2, tri: 3, "tři": 3, ctyri: 4, "čtyři": 4, pet: 5, "pět": 5 };

function toNumber(s) {
  if (s == null) return null;
  if (s in WORD_NUM) return WORD_NUM[s];
  return parseFloat(s.replace(",", "."));
}

function toBaseUnit(amount, unit) {
  const u = strip(unit || "");
  if (["kg", "kila", "kilo"].includes(u)) return [amount * 1000, "g"];
  if (["dkg", "dag"].includes(u)) return [amount * 10, "g"];
  if (["g", "gramu"].includes(u)) return [amount, "g"];
  if (u === "l" || u.startsWith("litr")) return [amount * 1000, "ml"];
  if (u === "dl") return [amount * 100, "ml"];
  if (u === "ml") return [amount, "ml"];
  return [amount, "ks"];
}

function cleanName(name) {
  name = name.replace(/\s+/g, " ").replace(/^(ks|kus|kusy|kusu)\s+/i, "").trim().toLowerCase();
  const key = strip(name);
  return NOMINATIVE[key] || name;
}

export function parseIngredients(text) {
  const parts = String(text).split(/[,;\n]+|\s+a\s+/i).map((p) => p.trim()).filter(Boolean);
  const out = [];
  const front = new RegExp(`^${NUM_RE}?\\s*${UNIT_RE}?\\.?\\s+(.+)$`, "i");
  const back = new RegExp(`^(.+?)\\s+${NUM_RE}\\s*${UNIT_RE}?\\.?$`, "i");
  const unitOnly = new RegExp(`^${UNIT_RE}\\s+(.+)$`, "i"); // "kilo brambor"

  for (const part of parts) {
    let num = null, unit = null, name = part;
    let m;
    if ((m = part.match(unitOnly)) && !/^\d/.test(part)) {
      [, unit, name] = m; num = "1";
    } else if ((m = part.match(back)) && !/^\d/.test(part)) {
      [, name, num, unit] = m;
    } else if ((m = part.match(front)) && (m[1] || m[2])) {
      [, num, unit, name] = m;
    }
    name = cleanName(name);
    if (!name) continue;
    let amount = toNumber(num);
    if (amount == null || isNaN(amount)) {
      const d = DEFAULTS[strip(name)];
      out.push({ name, amount: d ? d[0] : 1, unit: d ? d[1] : "ks" });
      continue;
    }
    const [a, u] = toBaseUnit(amount, unit);
    out.push({ name, amount: a, unit: u });
  }
  return out;
}

// Ikonka k potravině — jen pro hezčí seznam
const EMOJI = [
  ["vejc", "🥚"], ["vajic", "🥚"], ["mlek", "🥛"], ["brambor", "🥔"], ["cibul", "🧅"], ["cesnek", "🧄"],
  ["rajc", "🍅"], ["mrkev", "🥕"], ["mrkv", "🥕"], ["syr", "🧀"], ["eidam", "🧀"], ["parmazan", "🧀"],
  ["maslo", "🧈"], ["mouk", "🌾"], ["chleb", "🍞"], ["rohlik", "🥖"], ["ryze", "🍚"], ["testovin", "🍝"],
  ["spaget", "🍝"], ["kure", "🍗"], ["kureci", "🍗"], ["maso", "🥩"], ["slanin", "🥓"], ["sunk", "🥓"],
  ["ryb", "🐟"], ["losos", "🐟"], ["tunak", "🐟"], ["paprik", "🫑"], ["okurk", "🥒"], ["cuket", "🥒"],
  ["salat", "🥬"], ["spenat", "🥬"], ["brokolic", "🥦"], ["houb", "🍄"], ["zampion", "🍄"], ["jablk", "🍎"],
  ["banan", "🍌"], ["citron", "🍋"], ["pomeranc", "🍊"], ["jahod", "🍓"], ["avokad", "🥑"], ["kukuric", "🌽"],
  ["fazol", "🫘"], ["cock", "🫘"], ["smetan", "🥛"], ["jogurt", "🥛"], ["tvaroh", "🥛"], ["cukr", "🍬"],
  ["med", "🍯"], ["olej", "🫒"], ["oliv", "🫒"], ["sul", "🧂"], ["cokolad", "🍫"], ["orech", "🥜"],
];

export function emojiFor(name) {
  const n = strip(name);
  for (const [k, e] of EMOJI) if (n.includes(k)) return e;
  return "🥫";
}
