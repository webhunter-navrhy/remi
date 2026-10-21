# REMY 🧑‍🍳

**Co uvařit z toho, co máš doma.**
Napíšeš nebo vyfotíš, co máš v lednici, řekneš počet porcí a REMY ti navrhne jídla i s postupem. Pamatuje si, co máš doma, a když něco uvaříš, sám suroviny ze spíže odečte.

🔗 **Aplikace:** https://webhunter-navrhy.github.io/remi/
🎤 **Prezentace:** https://webhunter-navrhy.github.io/remi/prezentace/

Školní projekt předmětu Programování a vývoj aplikací (Vibecoding, 1. pololetí), třída 2.A.

| Člen týmu | Na čem pracoval |
| --- | --- |
| Rafael Borri | funkcionalita – napojení na AI, spíž, logika vaření, worker |
| Samuel Vargas | design – vzhled, barvy, písma, mobilní verze |

---

## Co aplikace umí

- **Spíž** – přidávání potravin volným textem („6 vajec, 1 l mléka, kilo brambor“), úprava množství tlačítky +/− nebo kliknutím, mazání s možností vrátit zpět.
- **Rozpoznání z fotky** – vyfotíš lednici nebo nákup, AI najde potraviny a odhadne množství; před přidáním je zkontroluješ a opravíš.
- **Návrhy receptů od AI** – podle spíže, počtu porcí a přání (rychlé, bez masa, sladké, lehké, polévka nebo vlastní text). Tlačítko „Ukaž jiné návrhy“ přinese další jídla.
- **Detail receptu** – suroviny s barevným označením (mám / mám málo / nemám), postup s odškrtáváním hotových kroků.
- **Uvařeno** – jedním klikem se spotřebované suroviny odečtou ze spíže (s možností „Zpět“), jídlo se uloží do historie.
- **Oblíbené recepty a historie vaření.**
- **Záložní kuchařka** – když AI neodpovídá (výpadek, bez internetu), REMY vybere recepty z vlastní databáze 16 jídel podle toho, co máš doma.
- Funguje na mobilu i počítači, má tmavý režim a jde přidat na plochu telefonu (PWA).

## Jak to funguje

```
Prohlížeč (HTML + CSS + JavaScript)          Cloudflare Worker (worker/)          Workers AI
 ├─ spíž, historie, oblíbené → localStorage    POST /recognize  ──────────────▶   Llama 4 Scout (vidí obrázky)
 ├─ parser textu, záložní kuchařka            POST /recipes    ──────────────▶   Llama 3.3 70B (texty)
 └─ fetch() na worker  ─────────────────────▶  hlídá vstupy, vynucuje JSON schéma, opakuje pokus
```

Proč worker? Frontend běží na GitHub Pages a do kódu, který vidí každý, nesmí přijít žádný tajný klíč. Worker běží na serveru Cloudflare a AI volá za nás.

## Struktura projektu

```
index.html              obrazovky aplikace (Spíž, Vařit, Uložené)
css/style.css           vzhled – barvy, písma, mobil, tmavý režim
js/app.js               logika rozhraní – navigace, spíž, návrhy, detail receptu
js/store.js             ukládání dat do localStorage, slučování a odečítání surovin
js/parse.js             převod textu „6 vajec, 1 l mléka“ na položky spíže
js/api.js               volání AI workeru, zmenšení fotky před odesláním
js/fallback.js          záložní kuchařka bez AI
sw.js, manifest.webmanifest   instalace na plochu telefonu, offline režim
worker/                 Cloudflare Worker s AI (src/index.js, wrangler.toml)
prezentace/             prezentace k výstupům
docs/                   návrh aplikace a poznámky k použití AI
```

## Spuštění lokálně

Aplikace nepotřebuje žádnou instalaci ani build:

```bash
git clone https://github.com/webhunter-navrhy/remi.git
cd remi
python3 -m http.server 8000
# otevři http://localhost:8000
```

(Přes `file://` to nepojede, protože JavaScriptové moduly potřebují webový server.)

### Nasazení workeru

```bash
cd worker
npx wrangler login
npx wrangler deploy
```

Po nasazení uprav adresu v `js/api.js` (`API_URL`).

## Technologie

- HTML, CSS, JavaScript (ES moduly, bez frameworku)
- Cloudflare Workers + Workers AI (Llama 4 Scout pro fotky, Llama 3.3 70B pro recepty)
- GitHub Pages (hosting), localStorage (data uživatele)
- Písma Instrument Serif a DM Sans (Google Fonts)

## AI při vývoji

Viz [docs/ai-pouziti.md](docs/ai-pouziti.md): příklady promptů, co fungovalo, co ne a co jsme opravovali ručně.
