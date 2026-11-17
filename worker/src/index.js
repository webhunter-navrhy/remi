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

// Chyba, jejíž text chceme ukázat uživateli přesně tak, jak je
class UserError extends Error {}

// Jednotná hláška, kdykoli z fotky nic rozumného nevyleze — nikdy nesmí přijít prázdná odpověď
const NO_FOOD =
  "Na fotce se mi nepodařilo rozpoznat žádné potraviny. Vyfoť obsah lednice, spíže nebo nákupu zblízka, při dobrém světle a bez rozmazání.";

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
      if (err instanceof UserError) return json({ error: err.message }, 422);
      return json({ error: "AI teď neodpověděla, zkus to znovu.", detail: String(err?.message || err) }, 502);
    }
  },
};

// Rozpoznání ingrediencí z fotky (lednice, nákup, spíž…)
async function recognize(env, { image }) {
  if (!image || !image.startsWith("data:image/")) throw new UserError("Chybí fotka");
  if (image.length > 6_000_000) throw new UserError("Fotka je moc velká");

  const prompt = `Jsi kuchařský asistent, který z fotky rozpoznává potraviny.

POSTUP:
1. Projdi celou fotku — lednici, polici, stůl, nákupní tašku i obaly.
2. Pojmenuj každou rozpoznatelnou potravinu česky, v 1. pádě jednotného čísla ("vejce", "mléko", "rajče").
3. U každé odhadni množství. Jednotky používej jen: ks, g, ml.

PRAVIDLA:
- Ignoruj to, co není jídlo (nádobí, ruce, nábytek, pozadí, text v pozadí).
- Rozmazaná fotka, špatné světlo ani šikmý úhel nejsou důvod k selhání: rozpoznej, co vidíš, a zbytek vynech.
- Když je vidět jen část potraviny nebo jen obal, poznej ji podle nápisu a použij rozumné výchozí množství (1 ks, 100 g, 500 ml).
- Nehádej přesná čísla, stačí rozumný odhad.
- Stejnou potravinu nepiš dvakrát — množství sečti.

KDYŽ FOTKU NELZE ZPRACOVAT (není na ní jídlo, je celá tmavá nebo nečitelná, nebo jde o něco jiného než potraviny):
Nevymýšlej si potraviny. Vrať jen chybu, bez seznamu:
{"error":"Na fotce nevidím žádné potraviny. Vyfoť obsah lednice nebo spíže zblízka a při dobrém světle."}

VÝSTUP:
- Odpověz POUZE validním JSON — žádný text okolo, žádné \`\`\` markery.
- Nikdy nevracej prázdný seznam, prázdný řetězec ani jen "{}". Buď potraviny, nebo "error".
- Tvar: {"ingredients":[{"name":"vejce","amount":6,"unit":"ks"},{"name":"mléko","amount":1000,"unit":"ml"}]}`;

  // Model občas vrátí neúplný JSON nebo prázdný text — jednou to zkusíme znovu,
  // a když ani podruhé nic nepřijde, vrátíme jasnou hlášku místo prázdna.
  let data;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
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
      max_tokens: 1400,
      temperature: attempt ? 0.1 : 0.2,
    });
    try {
      data = parseJson(res);
    } catch (err) {
      if (attempt) throw new UserError(NO_FOOD);
    }
  }

  // Model může poslat i vlastní {"error": "..."} — ten ukážeme uživateli
  if (typeof data?.error === "string" && data.error.trim()) {
    throw new UserError(data.error.trim().slice(0, 200));
  }

  const list = Array.isArray(data) ? data : data?.ingredients;
  const ingredients = (Array.isArray(list) ? list : []).map(cleanIngredient).filter(Boolean);
  if (!ingredients.length) throw new UserError(NO_FOOD);
  return { ingredients };
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
  if (!i || typeof i.name !== "string") return null;
  const name = i.name.trim();
  if (!name) return null;
  const unit = ["ks", "g", "ml"].includes(i.unit) ? i.unit : "ks";
  const amount = Math.max(0, Math.round(Number(i.amount) || (unit === "ks" ? 1 : 100)));
  return { name: name.toLowerCase().slice(0, 40), amount, unit };
}
