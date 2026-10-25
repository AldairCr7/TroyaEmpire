/**
 * campaign.js
 * -----------------------------------------------------------------------
 * La campaña: capítulos encadenados con su propio briefing y sus propios
 * objetivos, como en AoK DS. Se juega siempre del lado aqueo y los héroes
 * conservan sus cintas de veteranía de un capítulo al siguiente.
 *
 * Cada capítulo define:
 *   scenario/size/seed  → qué mapa genera engine/mapgen.js
 *   goals               → objetivos de cada bando (los evalúa engine/game.js)
 *   mods                → retoques del montaje inicial (héroes ausentes,
 *                         era de salida, tropas extra, aldeas…)
 *
 * Tipos de objetivo admitidos:
 *   destroyCapitals  tumbar todos los campamentos/ciudadela del rival
 *   villages         controlar N aldeas
 *   killHero         matar a un héroe concreto
 *   reachCamp        poner una unidad sobre el campamento enemigo
 *   protect          (derrota) pierdes si ese héroe cae
 * -----------------------------------------------------------------------
 */

export const CAMPAIGN = [
  {
    id: "desembarco",
    name: "I · El desembarco",
    subtitle: "Playa de la Tróade, año primero",
    scenario: "playa", size: "medium", seed: "ilion-aulide", difficulty: "easy",
    briefing: [
      "Mil naves han cruzado el Egeo y la arena está llena de quillas varadas.",
      "Los troyanos bajaron a la playa para empujarnos otra vez al mar. Si no afianzamos la cabeza de playa antes de que acabe el verano, la expedición entera se deshace.",
      "Rompe su campamento. Protasilao ya ha caído: sé tú el segundo en pisar tierra, no el primero en morir."
    ],
    goals: {
      greek: { type: "destroyCapitals", text: "Destruye el campamento troyano" },
      trojan: { type: "destroyCapitals", text: "Empújalos de vuelta al mar: arrasa su campamento" }
    },
    mods: { era: 1, villages: 3, extra: { greek: ["recruit", "recruit", "scoutChariot"] } }
  },
  {
    id: "ciudades",
    name: "II · Las ciudades vecinas",
    subtitle: "Lirneso, Pédaso y Tebas de Hipoplacia",
    scenario: "aleatorio", size: "medium", seed: "lirneso", difficulty: "easy",
    briefing: [
      "Troya no cae por hambre si la Tróade entera le manda grano.",
      "Aquiles lleva nueve años saqueando las ciudades de alrededor: cada aldea que tomemos deja de alimentar a Príamo y empieza a alimentarnos a nosotros.",
      "Toma cuatro aldeas. No hace falta quemarlas: basta con plantarse dentro."
    ],
    goals: {
      greek: { type: "villages", count: 3, text: "Controla 3 aldeas de la Tróade" },
      trojan: { type: "destroyCapitals", text: "Arrasa el campamento aqueo" }
    },
    mods: {
      era: 2, villages: 5, villagesFar: true,
      villageOwner: "trojan", villageGuard: ["spearman"],
      extra: { greek: ["hoplite", "hoplite", "hoplite", "archer", "lightChariot"] }
    }
  },
  {
    id: "colera",
    name: "III · La cólera de Aquiles",
    subtitle: "El campamento, sin su mejor lanza",
    scenario: "escamandro", size: "medium", seed: "briseida", difficulty: "normal",
    briefing: [
      "Agamenón se ha quedado con Briseida y Aquiles se ha retirado a su tienda. No va a luchar.",
      "Héctor lo sabe, y viene con todo lo que tiene. Sin los mirmidones no podemos ganar esta batalla: solo aguantarla.",
      "Aguanta su embate sin Aquiles y, cuando flaquee, derriba al propio Héctor."
    ],
    goals: {
      greek: { type: "killHero", hero: "hector", text: "Aguanta su embate y da muerte a Héctor" },
      trojan: { type: "destroyCapitals", text: "Arrasar el campamento aqueo" }
    },
    mods: { era: 2, heroesOff: { greek: ["achilles"] }, extra: { trojan: ["warChariot", "archer", "hoplite", "hoplite"] } }
  },
  {
    id: "tenedos",
    name: "IV · Las islas",
    subtitle: "Tenedos y la costa",
    scenario: "playa", size: "medium", seed: "tenedos", difficulty: "normal",
    briefing: [
      "Mientras Héctor nos tenga clavados en la arena, la flota puede hacer lo que la infantería no: rodearlo.",
      "Carga la tropa en las naves de transporte, desembárcala en la costa troyana y toma sus aldeas por la espalda.",
      "Las naves de guerra cubren el desembarco: nadie llega a una playa con enemigos esperando."
    ],
    goals: {
      greek: { type: "villages", count: 3, text: "Controla 3 aldeas de la costa" },
      trojan: { type: "destroyCapitals", text: "Arrasa el campamento aqueo" }
    },
    mods: {
      era: 2, villages: 4, villagesFar: true,
      villageOwner: "trojan", villageGuard: ["spearman"],
      extra: { greek: ["hoplite", "archer", "lightChariot"] }
    }
  },
  {
    id: "hector",
    name: "V · Héctor",
    subtitle: "Ante la Puerta Escea",
    scenario: "ida", size: "medium", seed: "patroclo", difficulty: "normal",
    briefing: [
      "Patroclo salió con la armadura de Aquiles y volvió en una camilla. Héctor lo mató creyendo matar a otro.",
      "Ya no hay cólera que valga: Aquiles ha vuelto al campo y solo busca una cosa.",
      "Mata a Héctor. Y que Aquiles siga en pie cuando acabe el día: si cae él, se acaba la guerra para nosotros."
    ],
    goals: {
      greek: { type: "killHero", hero: "hector", text: "Da muerte a Héctor" },
      trojan: { type: "killHero", hero: "achilles", text: "Dar muerte a Aquiles" }
    },
    mods: { era: 3 }
  },
  {
    id: "caballo",
    name: "VI · El caballo de madera",
    subtitle: "La última noche de Ilión",
    scenario: "asedio", size: "large", seed: "epeo", difficulty: "hard",
    briefing: [
      "Diez años de muralla y ni una brecha. Odiseo propone algo que no es una batalla, es un engaño.",
      "Epeo construirá el caballo en el taller de asedio. Pégalo a la muralla y soltará a tus hombres dentro.",
      "O eso, o los arietes. Pero tiene que ser esta noche: derriba la Ciudadela antes de que se acabe el tiempo."
    ],
    goals: {
      greek: { type: "destroyCapitals", text: "Derriba la Ciudadela de Troya" },
      trojan: { type: "destroyCapitals", text: "Arrasa el campamento aqueo" }
    },
    mods: { era: 3, extra: { greek: ["batteringRam", "catapult", "siegeTower"] } }
  }
];

export function chapter(i) {
  return CAMPAIGN[Math.max(0, Math.min(CAMPAIGN.length - 1, i))];
}

const KEY = "troya:campaign";

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw.chapter === "number") return raw;
  } catch { /* sin almacenamiento */ }
  return { chapter: 0, done: [], heroes: {} };
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}

export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  return { chapter: 0, done: [], heroes: {} };
}
