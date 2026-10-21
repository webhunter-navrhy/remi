// REMY API — malý Cloudflare Worker, který mluví s AI.
// Frontend (GitHub Pages) nemůže mít v kódu API klíč, proto AI voláme přes tenhle worker.
//   POST /recognize  { image: "data:image/jpeg;base64,..." }      → { ingredients: [...] }
//   POST /recipes    { ingredients: [...], portions, note, count } → { recipes: [...] }

const VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const ING = {
  type: "object",
  properties: { name: { type: "string" }, amount: { type: "number" }, unit: { type: "string", enum: ["ks", "g", "ml"] } },
  required: ["name", "amount", "unit"],
};
const RECIPES_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          emoji: { type: "string" },
          time: { type: "number" },
          difficulty: { type: "string" },
          description: { type: "string" },
          uses: { type: "array", items: ING },
          missing: { type: "array", items: ING },
          steps: { type: "array", items: { type: "string" } },
        },
        required: ["name", "emoji", "time", "difficulty", "description", "uses", "missing", "steps"],
      },
    },
  },
  required: ["recipes"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, app: "REMY API", endpoints: ["/recognize", "/recipes"] });
    }
    if (request.method !== "POST") return json({ error: "Použij POST" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Neplatný JSON" }, 400);
    }

    try {
      if (url.pathname === "/recognize") return json(await recognize(env, body));
      if (url.pathname === "/recipes") return json(await recipes(env, body));
      return json({ error: "Neznámý endpoint" }, 404);
    } catch (err) {
      return json({ error: "AI teď neodpověděla, zkus to znovu.", detail: String(err?.message || err) }, 502);
    }
  },
};

// Rozpoznání ingrediencí z fotky (lednice, nákup, spíž…)
async function recognize(env, { image }) {
  if (!image || !image.startsWith("data:image/")) throw new Error("Chybí fotka");
  if (image.length > 6_000_000) throw new Error("Fotka je moc velká");

  const prompt = `Jsi pomocník do kuchyně. Na fotce jsou potraviny (lednice, spíž nebo nákup).
Vypiš VŠECHNY potraviny, které na fotce vidíš, česky a v 1. pádě jednotného čísla (např. "vejce", "mléko", "rajče").
Odhadni množství. Jednotky používej jen: ks, g, ml.
Odpověz POUZE validním JSON bez dalšího textu ve tvaru:
{"ingredients":[{"name":"vejce","amount":6,"unit":"ks"},{"name":"mléko","amount":1000,"unit":"ml"}]}`;

  const res = await env.AI.run(VISION_MODEL, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ],
    max_tokens: 1200,
    temperature: 0.2,
  });

  const data = parseJson(res);
  const list = Array.isArray(data?.ingredients) ? data.ingredients : [];
  return { ingredients: list.map(cleanIngredient).filter(Boolean) };
}

// Návrhy receptů z toho, co je doma
async function recipes(env, { ingredients = [], portions = 2, note = "", count = 3, exclude = [] }) {
  const have = ingredients
    .map(cleanIngredient)
    .filter(Boolean)
    .map((i) => `- ${i.name}: ${i.amount} ${i.unit}`)
    .join("\n");
  if (!have) throw new Error("Spíž je prázdná");
  portions = Math.min(Math.max(parseInt(portions) || 2, 1), 12);
  count = Math.min(Math.max(parseInt(count) || 3, 1), 5);

  const prompt = `Jsi REMY, malý šéfkuchař (jako krysa z Ratatouille). Uživatel má doma tyto potraviny:
${have}

Navrhni ${count} různá jídla pro ${portions} ${portions === 1 ? "porci" : portions < 5 ? "porce" : "porcí"}, která jdou uvařit HLAVNĚ z těchto potravin.
Základní věci jako sůl, pepř, voda a olej ber jako samozřejmost (nepiš je do "uses" ani "missing").
Do "uses" dej jen potraviny ze seznamu výše a přesné množství, které recept spotřebuje (stejné názvy a jednotky jako v seznamu).
Do "missing" dej maximálně 2 věci, které by se hodily dokoupit (může být prázdné).
${note ? `Přání uživatele: ${note}\n` : ""}${exclude.length ? `Tato jídla už uživatel viděl, navrhni jiná: ${exclude.join(", ")}\n` : ""}Navrhuj skutečná, chutná jídla, která se v Česku běžně vaří (žádné vymyšlené kombinace), a ať se od sebe liší (např. hlavní jídlo, polévka/příloha, něco rychlého).
Piš spisovnou češtinou, jednoduše, aby to zvládl i úplný začátečník. Postup 5–8 kroků, každý krok jedna až dvě věty v rozkazovacím způsobu 2. osoby (např. "Nakrájej cibuli najemno a osmahni ji 3 minuty na oleji."), s konkrétními časy, teplotami a velikostí plotny.
Odpověz POUZE validním JSON bez dalšího textu ve tvaru:
{"recipes":[{"name":"Míchaná vajíčka se sýrem","emoji":"🍳","time":15,"difficulty":"snadné","description":"Jedna věta o jídle.","uses":[{"name":"vejce","amount":4,"unit":"ks"}],"missing":[{"name":"pažitka","amount":10,"unit":"g"}],"steps":["Krok 1","Krok 2"]}]}`;

  // JSON schéma donutí model vrátit správnou strukturu; když se to i tak nepovede, zkusíme to ještě jednou
  let data;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    try {
      const res = await env.AI.run(TEXT_MODEL, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3500,
        temperature: attempt ? 0.4 : 0.7,
        response_format: { type: "json_schema", json_schema: RECIPES_SCHEMA },
      });
      data = parseJson(res);
    } catch (err) {
      if (attempt) throw err;
    }
  }
  const list = Array.isArray(data?.recipes) ? data.recipes : [];
  return {
    recipes: list
      .filter((r) => r && r.name && Array.isArray(r.steps))
      .map((r) => ({
        name: String(r.name).slice(0, 80),
        emoji: typeof r.emoji === "string" ? r.emoji.slice(0, 4) : "🍽️",
        time: parseInt(r.time) || 30,
        difficulty: String(r.difficulty || "snadné"),
        description: String(r.description || ""),
        portions,
        uses: (r.uses || []).map(cleanIngredient).filter(Boolean),
        missing: (r.missing || []).map(cleanIngredient).filter(Boolean),
        steps: r.steps.map(String).slice(0, 12),
        source: "ai",
      })),
  };
}

// AI občas obalí JSON do ```json``` nebo přidá text okolo — vytáhneme jen objekt
function parseJson(res) {
  const raw = res?.response ?? res?.result?.response ?? res;
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI nevrátila JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function cleanIngredient(i) {
  if (!i || !i.name) return null;
  const unit = ["ks", "g", "ml"].includes(i.unit) ? i.unit : "ks";
  const amount = Math.max(0, Math.round(Number(i.amount) || (unit === "ks" ? 1 : 100)));
  return { name: String(i.name).trim().toLowerCase().slice(0, 40), amount, unit };
}
