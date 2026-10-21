// Záložní kuchařka — když AI neodpovídá (není internet, výpadek), REMY vybere
// recepty z této databáze podle toho, kolik surovin z nich máš doma.
// Množství jsou pro 2 porce, při jiném počtu porcí se přepočítají.

import { findInPantry } from "./store.js";

const R = (name, emoji, time, difficulty, description, uses, steps) =>
  ({ name, emoji, time, difficulty, description, uses, steps });

const i = (name, amount, unit) => ({ name, amount, unit });

export const RECIPES = [
  R("Míchaná vajíčka s cibulkou", "🍳", 10, "snadné", "Rychlá klasika na snídani i večeři.",
    [i("vejce", 4, "ks"), i("cibule", 1, "ks"), i("máslo", 20, "g")],
    ["Cibuli oloupej a nakrájej najemno.", "Na pánvi rozpusť máslo a cibuli na něm 3 minuty osmahni.", "Vejce rozklepni do misky, osol, opepři a prošlehej vidličkou.", "Vlij vejce na pánev a za stálého míchání nech zatáhnout.", "Stáhni z plotny, dokud jsou vajíčka ještě krémová, a hned podávej."]),
  R("Bramboráky", "🥔", 40, "střední", "Křupavé placky z brambor s česnekem.",
    [i("brambory", 600, "g"), i("vejce", 1, "ks"), i("česnek", 1, "ks"), i("hladká mouka", 80, "g")],
    ["Brambory oloupej a nastrouhej najemno, vymačkej z nich vodu.", "Přidej vejce, prolisovaný česnek, mouku, sůl, pepř a majoránku.", "Vše dobře promíchej na hustší těsto.", "Na pánvi rozehřej olej a lžící dělej tenké placky.", "Smaž z obou stran dozlatova, asi 3 minuty z každé strany.", "Nech okapat na papírové utěrce."]),
  R("Těstoviny s rajčatovou omáčkou", "🍝", 25, "snadné", "Jednoduchá italská klasika z čerstvých rajčat.",
    [i("těstoviny", 250, "g"), i("rajčata", 3, "ks"), i("cibule", 1, "ks"), i("česnek", 1, "ks"), i("eidam", 50, "g")],
    ["Dej vařit osolenou vodu na těstoviny.", "Cibuli a česnek nakrájej najemno a osmahni na oleji.", "Přidej nakrájená rajčata, osol a duš 10 minut, až se rozpadnou.", "Těstoviny uvař podle návodu na obalu a sceď.", "Smíchej těstoviny s omáčkou a posyp nastrouhaným sýrem."]),
  R("Kuře na smetaně s rýží", "🍗", 35, "střední", "Krémové kuřecí kousky, které chutnají všem.",
    [i("kuřecí prsa", 300, "g"), i("smetana na vaření", 200, "ml"), i("cibule", 1, "ks"), i("rýže", 150, "g")],
    ["Rýži propláchni a uvař ve dvojnásobku osolené vody (asi 15 minut).", "Kuře nakrájej na kostky, osol a opepři.", "Na oleji osmahni nakrájenou cibuli, přidej kuře a opékej 6–8 minut.", "Zalij smetanou a nech 5 minut probublávat, až omáčka zhoustne.", "Podávej s rýží."]),
  R("Palačinky", "🥞", 30, "snadné", "Tenké palačinky na sladko.",
    [i("hladká mouka", 150, "g"), i("mléko", 300, "ml"), i("vejce", 2, "ks")],
    ["V misce prošlehej mléko s vejci a špetkou soli.", "Postupně přisypávej mouku a míchej, aby nevznikly hrudky.", "Těsto nech 10 minut odpočinout.", "Pánev potři olejem a nalij tenkou vrstvu těsta.", "Peč z každé strany asi minutu dozlatova.", "Plň marmeládou, tvarohem nebo čím máš rád."]),
  R("Bramborová kaše s volským okem", "🍳", 30, "snadné", "Domácí comfort food za pár korun.",
    [i("brambory", 600, "g"), i("mléko", 150, "ml"), i("máslo", 40, "g"), i("vejce", 2, "ks")],
    ["Brambory oloupej, nakrájej a uvař v osolené vodě doměkka (asi 20 minut).", "Sceď je a rozmačkej s máslem a teplým mlékem.", "Na pánvi usmaž vejce jako volská oka.", "Kaši dej na talíř a navrch polož vejce."]),
  R("Rizoto se zeleninou", "🍚", 35, "střední", "Krémová rýže s mrkví a sýrem.",
    [i("rýže", 200, "g"), i("mrkev", 2, "ks"), i("cibule", 1, "ks"), i("máslo", 30, "g"), i("eidam", 50, "g")],
    ["Cibuli a mrkev nakrájej na malé kostičky.", "Na másle osmahni cibuli, přidej mrkev a rýži a 2 minuty opékej.", "Postupně podlévej horkou vodou s bujónem, vždy po naběračce, a míchej.", "Po asi 20 minutách, když je rýže měkká, vmíchej nastrouhaný sýr.", "Dochuť solí a pepřem."]),
  R("Omeleta se sýrem a rajčaty", "🧀", 12, "snadné", "Nadýchaná omeleta plná sýra.",
    [i("vejce", 4, "ks"), i("eidam", 60, "g"), i("rajčata", 1, "ks"), i("máslo", 15, "g")],
    ["Vejce prošlehej se solí a pepřem.", "Na pánvi rozpusť máslo a vlij vejce.", "Když spodek zatáhne, posyp sýrem a nakrájeným rajčetem.", "Přelož napůl a nech minutu dojít pod pokličkou."]),
  R("Kuřecí nudle s mrkví", "🍜", 25, "snadné", "Rychlé asijské nudle z pánve.",
    [i("těstoviny", 200, "g"), i("kuřecí prsa", 250, "g"), i("mrkev", 2, "ks"), i("česnek", 1, "ks")],
    ["Těstoviny uvař a sceď.", "Kuře nakrájej na nudličky a orestuj na oleji dozlatova.", "Přidej mrkev nakrájenou na tenké nudličky a česnek.", "Přimíchej těstoviny, dochuť sójovou omáčkou nebo solí.", "Krátce vše promíchej na pánvi a podávej."]),
  R("Bramborová polévka", "🍲", 40, "snadné", "Hustá polévka jako od babičky.",
    [i("brambory", 400, "g"), i("mrkev", 1, "ks"), i("cibule", 1, "ks"), i("česnek", 1, "ks")],
    ["Cibuli nakrájej a osmahni v hrnci na oleji.", "Přidej na kostky nakrájené brambory a mrkev.", "Zalij asi litrem vody, osol a přidej majoránku.", "Vař 25 minut, dokud nejsou brambory měkké.", "Na konci přidej prolisovaný česnek a část brambor rozmačkej."]),
  R("Smažená rýže s vejcem", "🍳", 20, "snadné", "Nejlepší způsob, jak využít rýži.",
    [i("rýže", 150, "g"), i("vejce", 2, "ks"), i("mrkev", 1, "ks"), i("cibule", 1, "ks")],
    ["Rýži uvař (nebo použij včerejší).", "Na pánvi orestuj nakrájenou cibuli a mrkev.", "Přidej rýži a opékej, až je trochu křupavá.", "Udělej uprostřed místo, rozklepni vejce a zamíchej je.", "Vše promíchej a dochuť solí nebo sójovou omáčkou."]),
  R("Zapečené brambory se sýrem", "🧀", 45, "střední", "Brambory zapečené se smetanou a sýrem.",
    [i("brambory", 700, "g"), i("smetana na vaření", 200, "ml"), i("eidam", 100, "g"), i("česnek", 1, "ks")],
    ["Troubu předehřej na 200 °C.", "Brambory oloupej a nakrájej na tenká kolečka.", "Pekáček vymaž máslem a skládej brambory, každou vrstvu osol.", "Smetanu smíchej s prolisovaným česnekem a zalij brambory.", "Posyp sýrem a peč 35 minut dozlatova."]),
  R("Rajčatová polévka", "🍅", 25, "snadné", "Svěží polévka z rajčat.",
    [i("rajčata", 4, "ks"), i("cibule", 1, "ks"), i("česnek", 1, "ks"), i("smetana na vaření", 50, "ml")],
    ["Cibuli a česnek osmahni v hrnci.", "Přidej nakrájená rajčata a zalij 500 ml vody.", "Vař 15 minut, osol a opepři.", "Rozmixuj tyčovým mixérem a vmíchej smetanu."]),
  R("Lívance", "🥞", 30, "snadné", "Malé nadýchané placky na snídani.",
    [i("hladká mouka", 200, "g"), i("mléko", 250, "ml"), i("vejce", 1, "ks"), i("máslo", 20, "g")],
    ["Smíchej mouku, mléko, vejce, špetku soli a lžičku prášku do pečiva.", "Těsto by mělo být hustší než na palačinky.", "Na pánvi rozpusť trochu másla a lžící dělej malé placky.", "Peč z obou stran dozlatova."]),
  R("Kuřecí rizoto", "🍗", 40, "střední", "Sytý oběd z jednoho hrnce.",
    [i("rýže", 200, "g"), i("kuřecí prsa", 250, "g"), i("mrkev", 1, "ks"), i("cibule", 1, "ks")],
    ["Kuře nakrájej na kostky a osmahni s cibulí.", "Přidej nakrájenou mrkev a rýži.", "Zalij dvojnásobkem vody, osol a přikryj.", "Duš na mírném ohni 20 minut, dokud rýže nevsákne vodu."]),
  R("Česnečka", "🧄", 20, "snadné", "Polévka, která postaví na nohy.",
    [i("brambory", 300, "g"), i("česnek", 1, "ks"), i("eidam", 60, "g")],
    ["Brambory nakrájej na kostičky a uvař v litru osolené vody s kmínem.", "Až jsou měkké, přidej prolisovaný česnek a majoránku.", "Polévku nech už jen chvíli prohřát, nevař.", "Do talíře dej nastrouhaný sýr a zalij polévkou."]),
];

// Kolik surovin z receptu máš a v jakém množství (0–1)
function score(recipe) {
  let have = 0;
  for (const u of recipe.uses) {
    const p = findInPantry(u.name);
    if (!p) continue;
    have += p.unit === u.unit ? Math.min(1, p.amount / u.amount) : 0.8;
  }
  return have / recipe.uses.length;
}

export function localSuggestions({ portions = 2, exclude = [], count = 3 }) {
  const factor = portions / 2;
  return RECIPES
    .filter((r) => !exclude.includes(r.name))
    .map((r) => ({ r, s: score(r) }))
    .filter(({ s }) => s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, count)
    .map(({ r }) => {
      const uses = [], missing = [];
      for (const u of r.uses) {
        const scaled = { ...u, amount: u.unit === "ks" ? Math.max(1, Math.round(u.amount * factor)) : Math.round(u.amount * factor) };
        (findInPantry(u.name) ? uses : missing).push(scaled);
      }
      return { ...r, portions, uses, missing, source: "kuchařka" };
    });
}
