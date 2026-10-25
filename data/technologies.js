/**
 * technologies.js
 * -----------------------------------------------------------------------
 * Árbol tecnológico completo, adaptado del árbol real de AoK DS.
 * effect.type indica qué sistema debe aplicarlo:
 *   "unitDefense" / "unitAttack"  -> resources.js aplica el modificador a
 *                                    unidades de una era y categoría concreta
 *   "resourceIncome"              -> +% a la recolección de un recurso
 *   "buildingCost" / "unitCost"   -> -% o -flat al coste
 *   "sight" / "campDefense"       -> modificadores directos
 *   "unlock"                      -> desbloquea una unidad o mecánica
 * -----------------------------------------------------------------------
 */

/**
 * Cada tecnología vive DENTRO de un edificio, como en el original: sin
 * Herrería no hay mejoras de armas ni de armadura, sin Universidad no hay
 * asedio pesado, y sin Castillo no hay zapadores ni espías. `requiere`
 * encadena unas con otras.
 */
export const TECHNOLOGIES = {

  // ================= ERA 1 — CAMPAMENTO =================
  woolCloaks: {
    id: "woolCloaks", name: "Capas de Lana", era: 1,
    edificio: "camp",
    cost: { grain: 50, bronze: 0 },
    effect: { type: "unitDefense", target: "villager", value: 0.25 },
    description: "Todos los colonos ganan +25% defensa."
  },
  campScouts: {
    id: "campScouts", name: "Vigías del Campamento", era: 1,
    edificio: "camp",
    cost: { grain: 50, bronze: 0 },
    effect: { type: "sight", target: "camp", value: 4 },
    description: "El Campamento Base gana +4 de visión."
  },
  sandals: {
    id: "sandals", name: "Sandalias de Cuero", era: 1,
    edificio: "camp",
    cost: { grain: 50, bronze: 0 },
    effect: { type: "unitMove", target: "villager", value: 1 },
    description: "Los colonos ganan +1 de movimiento."
  },
  bronzeTips: {
    id: "bronzeTips", name: "Puntas de Bronce", era: 1,
    edificio: "barracks",
    cost: { grain: 50, bronze: 50 },
    effect: { type: "unitAttack", target: "recruit", value: 0.25 },
    description: "Los Reclutas ganan +25% ataque."
  },

  // ================= ERA 2 — ASEDIO =================
  campWatch: {
    id: "campWatch", name: "Guardia del Campamento", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 50 },
    effect: { type: "campDefense", value: 0.20, sight: 2 },
    description: "El Campamento Base gana +20% defensa y +2 visión."
  },
  woodenCarts: {
    id: "woodenCarts", name: "Carretas de Madera", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 50 },
    effect: { type: "buildingCost", value: -0.10 },
    description: "El coste de los edificios se reduce un 10%."
  },
  deepMining: {
    id: "deepMining", name: "Minería Profunda", era: 2,
    edificio: "mine",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "resourceIncome", resource: "bronze", value: 0.15 },
    description: "+15% al ingreso de bronce."
  },
  yokeHarness: {
    id: "yokeHarness", name: "Arnés de Yugo", era: 2,
    edificio: "mill",
    cost: { grain: 100, bronze: 50 },
    effect: { type: "resourceIncome", resource: "grain", value: 0.10 },
    description: "+10% al ingreso de grano."
  },
  hardenedLeather: {
    id: "hardenedLeather", name: "Cuero Endurecido", era: 2,
    edificio: "blacksmith",
    requiere: "paddedVests",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitDefense", target: "infantry", era: 2, value: 0.25 },
    description: "Unidades de infantería de la era 2 ganan +25% defensa."
  },
  bronzeBarding: {
    id: "bronzeBarding", name: "Blindaje de Bronce", era: 2,
    edificio: "blacksmith",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitDefense", target: "chariot", era: 2, value: 0.25 },
    description: "Carros de la era 2 ganan +25% defensa."
  },
  finerArrows: {
    id: "finerArrows", name: "Flechas Finas", era: 2,
    edificio: "blacksmith",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitAttack", target: "ranged", era: 2, value: 0.25 },
    description: "Unidades a distancia de la era 2 ganan +25% ataque."
  },
  paddedVests: {
    id: "paddedVests", name: "Chalecos Acolchados", era: 2,
    edificio: "blacksmith",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitDefense", target: "ranged", era: 2, value: 0.25 },
    description: "Unidades a distancia de la era 2 ganan +25% defensa."
  },
  bronzeSmithing: {
    id: "bronzeSmithing", name: "Fundición de Bronce", era: 2,
    edificio: "blacksmith",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitAttack", target: ["infantry", "chariot"], era: 2, value: 0.25 },
    description: "Infantería y carros de la era 2 ganan +25% ataque."
  },
  scoutTraining: {
    id: "scoutTraining", name: "Adiestramiento de Exploradores", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 0 },
    effect: { type: "sight", target: "infantry", value: 2 },
    description: "Toda la infantería gana +2 visión."
  },
  cartography: {
    id: "cartography", name: "Cartografía", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 50 },
    effect: { type: "sight", target: "all", value: 2 },
    description: "Todas las unidades ganan +2 visión."
  },
  seaTrade: {
    id: "seaTrade", name: "Comercio Marítimo", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "tradeRate", value: 0.15 },
    description: "Mejora la tasa de comercio."
  },
  coinage: {
    id: "coinage", name: "Acuñación", era: 2,
    edificio: "camp",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "resourceIncome", resource: "bronze", value: 0.10 },
    description: "+10% al ingreso de bronce."
  },

  // ================= ERA 3 — HÉROES =================
  campPatrol: {
    id: "campPatrol", name: "Patrulla del Campamento", era: 3,
    edificio: "camp",
    requiere: "campWatch",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "campDefense", value: 0.20, sight: 2 },
    description: "El Campamento Base gana +20% defensa y +2 visión."
  },
  handCarts: {
    id: "handCarts", name: "Carros de Mano", era: 3,
    edificio: "camp",
    requiere: "woodenCarts",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "buildingCost", value: -0.10 },
    description: "El coste de los edificios se reduce un 10%."
  },
  shaftMining: {
    id: "shaftMining", name: "Minería de Pozo", era: 3,
    edificio: "mine",
    requiere: "deepMining",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "resourceIncome", resource: "bronze", value: 0.15 },
    description: "+15% al ingreso de bronce."
  },
  heavyPlow: {
    id: "heavyPlow", name: "Arado Pesado", era: 3,
    edificio: "mill",
    requiere: "yokeHarness",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "resourceIncome", resource: "grain", value: 0.10 },
    description: "+10% al ingreso de grano."
  },
  bronzeArmor: {
    id: "bronzeArmor", name: "Coraza de Bronce", era: 3,
    edificio: "blacksmith",
    requiere: "hideArmor",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitDefense", target: "infantry", era: 3, value: 0.25 },
    description: "Infantería de la era 3 gana +25% defensa."
  },
  reinforcedBarding: {
    id: "reinforcedBarding", name: "Blindaje Reforzado", era: 3,
    edificio: "blacksmith",
    requiere: "bronzeBarding",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitDefense", target: "chariot", era: 3, value: 0.25 },
    description: "Carros de la era 3 ganan +25% defensa."
  },
  barbedArrows: {
    id: "barbedArrows", name: "Flechas con Púas", era: 3,
    edificio: "blacksmith",
    requiere: "finerArrows",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitAttack", target: "ranged", era: 3, value: 0.25 },
    description: "Unidades a distancia de la era 3 ganan +25% ataque."
  },
  hideArmor: {
    id: "hideArmor", name: "Armadura de Piel", era: 3,
    edificio: "blacksmith",
    requiere: "hardenedLeather",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitDefense", target: "ranged", era: 3, value: 0.25 },
    description: "Unidades a distancia de la era 3 ganan +25% defensa."
  },
  ironCasting: {
    id: "ironCasting", name: "Fundición de Hierro", era: 3,
    edificio: "blacksmith",
    requiere: "bronzeSmithing",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitAttack", target: ["infantry", "chariot"], era: 3, value: 0.25 },
    description: "Infantería y carros de la era 3 ganan +25% ataque."
  },
  levyTraining: {
    id: "levyTraining", name: "Instrucción de Leva", era: 3,
    edificio: "barracks",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "unitCost", target: "infantry", grain: -15, bronze: -15 },
    description: "El coste de la infantería se reduce en 15 grano/15 bronce."
  },
  chariotBreeding: {
    id: "chariotBreeding", name: "Cría de Caballos", era: 3,
    edificio: "stable",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "unitCost", target: "chariot", grain: -15, bronze: -15 },
    description: "El coste de los carros se reduce en 15 grano/15 bronce."
  },
  archeryGuild: {
    id: "archeryGuild", name: "Gremio de Arqueros", era: 3,
    edificio: "archeryRange",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "unitCost", target: "ranged", grain: -15, bronze: -15 },
    description: "El coste de las unidades a distancia se reduce en 15 grano/15 bronce."
  },
  siegeGuild: {
    id: "siegeGuild", name: "Gremio de Asedio", era: 3,
    edificio: "siegeWorkshop",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "unitCost", target: "siege", grain: -15, bronze: -15 },
    description: "El coste de las unidades de asedio se reduce en 15 grano/15 bronce."
  },
  merchantFleet: {
    id: "merchantFleet", name: "Flota Mercante", era: 3,
    edificio: "camp",
    requiere: "seaTrade",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "resourceIncome", resource: "bronze", value: 0.05, tradeRate: 0.15 },
    description: "+5% ingreso de bronce y mejora el comercio."
  },
  templeOffering: {
    id: "templeOffering", name: "Ofrenda al Templo", era: 3,
    edificio: "temple",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "healBoost", value: 0.15 },
    description: "Mejora la curación de los Sacerdotes."
  },
  oracleFavor: {
    id: "oracleFavor", name: "Favor del Oráculo", era: 3,
    edificio: "temple",
    cost: { grain: 150, bronze: 100 },
    effect: { type: "inspireBoost", value: 0.15 },
    description: "Mejora la habilidad de Inspirar de los Sacerdotes."
  },
  priestlyRobes: {
    id: "priestlyRobes", name: "Vestiduras Sacerdotales", era: 3,
    edificio: "temple",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "unitDefense", target: "priest", value: 0.25 },
    description: "Los Sacerdotes ganan +25% defensa."
  },
  arrowSlits: {
    id: "arrowSlits", name: "Aspilleras", era: 3,
    edificio: "university",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "buildingDefense", target: "watchtower", value: 0.25 },
    description: "Las Torres de Vigía ganan +25% defensa."
  },
  stoneMasonry: {
    id: "stoneMasonry", name: "Cantería", era: 3,
    edificio: "university",
    cost: { grain: 100, bronze: 100 },
    effect: { type: "buildingDefense", target: "all", value: 0.05 },
    description: "Todos los edificios ganan +5% defensa."
  },

  // ================= ERA 4 — LA CAÍDA =================
  cropRotation: {
    id: "cropRotation", name: "Rotación de Cultivos", era: 4,
    edificio: "mill",
    requiere: "heavyPlow",
    cost: { grain: 200, bronze: 100 },
    effect: { type: "resourceIncome", resource: "grain", value: 0.10 },
    description: "+10% al ingreso de grano."
  },
  fullBronzeArmor: {
    id: "fullBronzeArmor", name: "Panoplia Completa", era: 4,
    edificio: "blacksmith",
    requiere: "bronzeArmor",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "unitDefense", target: "infantry", era: 4, value: 0.25 },
    description: "Infantería de la era 4 gana +25% defensa."
  },
  royalBarding: {
    id: "royalBarding", name: "Blindaje Real", era: 4,
    edificio: "blacksmith",
    requiere: "reinforcedBarding",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "unitDefense", target: "chariot", era: 4, value: 0.25 },
    description: "Carros de la era 4 ganan +25% defensa."
  },
  masterFletching: {
    id: "masterFletching", name: "Emplumado Maestro", era: 4,
    edificio: "blacksmith",
    requiere: "barbedArrows",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "unitDefense", target: "ranged", era: 4, value: 0.25 },
    description: "Unidades a distancia de la era 4 ganan +25% defensa."
  },
  heroicTraining: {
    id: "heroicTraining", name: "Adiestramiento Heroico", era: 4,
    edificio: "barracks",
    requiere: "levyTraining",
    cost: { grain: 300, bronze: 200 },
    effect: { type: "unlock", target: "champion" },
    description: "Desbloquea a los Campeones."
  },
  chariotMastery: {
    id: "chariotMastery", name: "Maestría del Carro", era: 4,
    edificio: "stable",
    requiere: "chariotBreeding",
    cost: { grain: 300, bronze: 200 },
    effect: { type: "unlock", target: "royalChariot" },
    description: "Desbloquea el Carro Real."
  },
  fireArrows: {
    id: "fireArrows", name: "Flechas Incendiarias", era: 4,
    edificio: "archeryRange",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "removeBuildingPenalty", target: "ranged" },
    description: "Las unidades a distancia ya no sufren penalización contra edificios."
  },
  sappers: {
    id: "sappers", name: "Zapadores", era: 4,
    edificio: "castle",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "unitAttack", target: "infantry", vs: "building", value: 0.50 },
    description: "Toda la infantería mejora a +50% ataque contra edificios."
  },
  wallReinforcement: {
    id: "wallReinforcement", name: "Refuerzo de Murallas", era: 4,
    edificio: "castle",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "buildingDefense", target: "citadel", value: 0.35 },
    description: "La Ciudadela gana +35% defensa."
  },
  spyNetwork: {
    id: "spyNetwork", name: "Red de Espías", era: 4,
    edificio: "castle",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "revealEnemyCamps" },
    description: "Revela todos los campamentos enemigos."
  },
  tradeGuilds: {
    id: "tradeGuilds", name: "Gremios de Comercio", era: 4,
    edificio: "camp",
    requiere: "coinage",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "resourceIncome", resource: "bronze", value: 0.05, tradeRate: 0.15 },
    description: "+5% ingreso de bronce y mejora el comercio."
  },
  siegeEngineering: {
    id: "siegeEngineering", name: "Ingeniería de Asedio", era: 4,
    edificio: "university",
    cost: { grain: 250, bronze: 150 },
    effect: { type: "unlock", target: ["heavyCatapult", "siegeRam", "heavyScorpion", "trebuchet"] },
    description: "Desbloquea el asedio pesado: catapulta pesada, ariete de asedio, escorpión pesado y trebuchet."
  },
  chemistry: {
    id: "chemistry", name: "Química", era: 4,
    edificio: "university",
    cost: { grain: 280, bronze: 220 },
    effect: { type: "unlock", target: ["handCannoneer", "bombardCannon", "monsMeg"] },
    description: "El fuego que arde sin leña. Desbloquea el Arcabucero, el Cañón de Bombarda y el Mons Meg."
  },
  architecture: {
    id: "architecture", name: "Arquitectura", era: 4,
    edificio: "university",
    requiere: "stoneMasonry",
    cost: { grain: 150, bronze: 150 },
    effect: { type: "buildingDefense", target: "all", value: 0.05 },
    description: "Todos los edificios ganan +5% defensa."
  },
  ballistics: {
    id: "ballistics", name: "Balística", era: 4,
    edificio: "university",
    requiere: "siegeEngineering",
    cost: { grain: 200, bronze: 200 },
    effect: { type: "unitAttack", target: "siege", minRange: 2, value: 0.25 },
    description: "Unidades de asedio con alcance >1 ganan +25% ataque."
  },
  trojanHorseBlueprint: {
    id: "trojanHorseBlueprint", name: "Plano del Caballo de Troya", era: 4,
    edificio: "siegeWorkshop",
    cost: { grain: 400, bronze: 300 },
    faction: "greek",
    effect: { type: "unlock", target: "trojanHorse" },
    description: "(Solo Aqueos) Desbloquea la construcción del Caballo de Troya."
  }
};

export function getTech(id) {
  return TECHNOLOGIES[id] || null;
}

export function getTechsByEra(era) {
  return Object.values(TECHNOLOGIES).filter(t => t.era === era);
}
