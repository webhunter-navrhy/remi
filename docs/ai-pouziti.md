# Jak jsme při vývoji používali AI

## Nástroje

- **AI agent v terminálu** (OpenCode / Claude Code) – návrh struktury projektu, generování kódu, testování v prohlížeči.
- **Workers AI** (Cloudflare) – AI přímo v aplikaci: rozpoznání potravin z fotky a návrhy receptů.

## Příklady promptů

**Zadání celé aplikace agentovi:**
> Udělej webovou aplikaci REMY: uživatel napíše nebo vyfotí, co má doma za jídlo, zadá počet porcí a aplikace mu navrhne recepty. Aplikace si pamatuje, co má doma, a po uvaření suroviny sama odečte. Musí jít ručně přidat i odebrat. Čistý JavaScript bez frameworku, ať to běží na GitHub Pages.

**Prompt uvnitř aplikace (worker → AI), zkrácený:**
> Jsi REMY, malý šéfkuchař. Uživatel má doma tyto potraviny: … Navrhni 3 různá jídla pro 2 porce, která jdou uvařit HLAVNĚ z těchto potravin. Sůl, pepř, voda a olej ber jako samozřejmost. Do „uses“ dej jen potraviny ze seznamu a přesné množství… Postup 5–8 kroků v rozkazovacím způsobu 2. osoby… Odpověz POUZE validním JSON.

**Oprava chyby:**
> AI občas vrátí rozbitý JSON a aplikace spadne s chybou „Expected ',' after array element“. Oprav to tak, aby se to nestávalo.

## Co fungovalo

- Rozpoznání potravin z fotky – model Llama 4 Scout spolehlivě pozná vejce, mléko, zeleninu, ovoce.
- Vynucení **JSON schématu** v odpovědi AI – od té doby přichází vždy správná struktura.
- Záložní kuchařka – aplikace funguje, i když AI vypadne.

## Co nefungovalo a co jsme museli opravit

| Problém | Řešení |
| --- | --- |
| Původně plánovaný Gemini API klíč nefungoval (staré modely už nejsou dostupné, nové vracely 404). | Přešli jsme na Cloudflare Workers AI – zdarma a bez klíče ve frontendu. |
| API klíč nesmí být v kódu na GitHub Pages (viděl by ho každý). | Vlastní Cloudflare Worker jako prostředník. |
| AI vracela občas nevalidní JSON nebo text okolo něj. | Funkce `parseJson` vytáhne jen objekt, JSON schéma, a druhý pokus při chybě. |
| Menší model vymýšlel divná jídla a míchal „uvař“ / „smícháme“. | Větší model (Llama 3.3 70B) a přesnější prompt: skutečná česká jídla, rozkazovací způsob, konkrétní časy. |
| „6 vajec“ se uložilo jako položka „vajec“. | Vlastní parser se slovníkem 2. pádu → 1. pád (`js/parse.js`). |
| „Rajčata“ a „rajče“ se ve spíži nesčítaly a recept je nenašel. | Normalizace názvů (bez diakritiky, kmeny slov) v `store.js`. |
| Seznam ve spíži při každém kliknutí na +/− problikl. | Odstraněná animace při překreslení seznamu. |
| Fotky z mobilu mají několik MB a worker je nepřijal. | Zmenšení fotky v prohlížeči na max 1024 px před odesláním. |

Veškerý kód vygenerovaný AI jsme před commitem vyzkoušeli v prohlížeči (mobil i počítač) a otestovali celý průchod: přidání potravin → návrh receptu → uvaření → odečtení ze spíže.
