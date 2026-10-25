/**
 * units.js
 * -----------------------------------------------------------------------
 * Definición de todas las unidades del juego "Guerra de Troya".
 * Los stats siguen el mismo patrón matemático investigado en
 * Age of Empires: The Age of Kings (DS): base 100 + incremento fijo por
 * era, movimiento 7 para infantería / 10 para carros, rango según tipo.
 *
 * ERAS:
 *   1 = Campamento   2 = Asedio   3 = Héroes   4 = La Caída
 *
 * category: "infantry" | "spear" | "ranged" | "skirmish" | "chariot" | "siege" | "support"
 * attackBonus: modificadores contra tipos de unidad concretos (multiplicador, ej 1.33 = +33%)
 * abilities: strings que consume combat.js para aplicar reglas especiales
 * -----------------------------------------------------------------------
 */

export const UNITS = {

  // ============================ INFANTERÍA (línea de espada corta) ============================
  recruit: {
    id: "recruit", name: "Recluta", faction: "any", category: "infantry", era: 1,
    cost: { grain: 75, bronze: 25 }, hp: 100, move: 7, attack: 100, defense: 100,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: [],
    upgradeTo: "hoplite"
  },
  hoplite: {
    id: "hoplite", name: "Hoplita", faction: "any", category: "infantry", era: 2,
    cost: { grain: 95, bronze: 30 }, hp: 100, move: 7, attack: 150, defense: 150,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: [],
    upgradeTo: "eliteHoplite"
  },
  eliteHoplite: {
    id: "eliteHoplite", name: "Hoplita de Élite", faction: "any", category: "infantry", era: 3,
    cost: { grain: 130, bronze: 45 }, hp: 100, move: 7, attack: 200, defense: 200,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: [],
    upgradeTo: "champion"
  },
  champion: {
    id: "champion", name: "Campeón", faction: "any", category: "infantry", era: 4,
    cost: { grain: 175, bronze: 50 }, hp: 100, move: 7, attack: 250, defense: 250,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: [],
    requiresTech: "heroicTraining" // equivalente a "Arena" del original
  },

  // ============================ FALANGE (anti-carro) ============================
  spearman: {
    id: "spearman", name: "Lancero", faction: "any", category: "spear", era: 2,
    cost: { grain: 115, bronze: 40 }, hp: 100, move: 7, attack: 100, defense: 150,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["antiChariot"], // +83% ATK/DEF y First Strike vs. carros
    upgradeTo: "phalanx"
  },
  phalanx: {
    id: "phalanx", name: "Falange", faction: "any", category: "spear", era: 3,
    cost: { grain: 215, bronze: 60 }, hp: 100, move: 7, attack: 200, defense: 250,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["antiChariot"],
    upgradeTo: "elitePhalanx"
  },
  elitePhalanx: {
    id: "elitePhalanx", name: "Falange de Élite", faction: "any", category: "spear", era: 4,
    cost: { grain: 240, bronze: 70 }, hp: 100, move: 7, attack: 250, defense: 300,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["antiChariot"]
  },

  // ============================ A DISTANCIA: ARQUEROS ============================
  archer: {
    id: "archer", name: "Arquero Cretense", faction: "any", category: "ranged", era: 2,
    cost: { grain: 105, bronze: 45 }, hp: 100, move: 7, attack: 100, defense: 100,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: [],
    upgradeTo: "eliteArcher"
  },
  eliteArcher: {
    id: "eliteArcher", name: "Arquero de Élite", faction: "any", category: "ranged", era: 4,
    cost: { grain: 190, bronze: 75 }, hp: 100, move: 7, attack: 200, defense: 200,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: []
  },

  // ============================ A DISTANCIA: HONDEROS (skirmish) ============================
  slinger: {
    id: "slinger", name: "Hondero", faction: "any", category: "skirmish", era: 2,
    cost: { grain: 95, bronze: 40 }, hp: 100, move: 7, attack: 110, defense: 110,
    sight: 7, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["skirmish"], // golpea primero si le atacan en melé
    upgradeTo: "eliteSlinger"
  },
  eliteSlinger: {
    id: "eliteSlinger", name: "Hondero de Élite", faction: "any", category: "skirmish", era: 3,
    cost: { grain: 125, bronze: 50 }, hp: 100, move: 7, attack: 150, defense: 150,
    sight: 7, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["skirmish"],
    upgradeTo: "expertSlinger"
  },
  expertSlinger: {
    id: "expertSlinger", name: "Hondero Experto", faction: "any", category: "skirmish", era: 4,
    cost: { grain: 145, bronze: 55 }, hp: 100, move: 7, attack: 190, defense: 190,
    sight: 7, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["skirmish"]
  },

  // ============================ A DISTANCIA: JABALINEROS PESADOS (línea "ballesta") ============================
  javelineer: {
    id: "javelineer", name: "Jabalinero Pesado", faction: "any", category: "ranged", era: 3,
    cost: { grain: 125, bronze: 50 }, hp: 100, move: 7, attack: 200, defense: 175,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack"],
    upgradeTo: "eliteJavelineer"
  },
  eliteJavelineer: {
    id: "eliteJavelineer", name: "Jabalinero de Élite", faction: "any", category: "ranged", era: 4,
    cost: { grain: 165, bronze: 60 }, hp: 100, move: 7, attack: 250, defense: 225,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack"]
  },

  // ============================ CARROS (equivalente a caballería) ============================
  scoutChariot: {
    id: "scoutChariot", name: "Carro Explorador", faction: "any", category: "chariot", era: 1,
    cost: { grain: 80, bronze: 0 }, hp: 100, move: 10, attack: 100, defense: 100,
    sight: 9, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["scout"], // cruza terreno difícil como si costase 2 de movimiento
    upgradeTo: "lightChariot"
  },
  lightChariot: {
    id: "lightChariot", name: "Carro Ligero", faction: "any", category: "chariot", era: 2,
    cost: { grain: 130, bronze: 60 }, hp: 100, move: 10, attack: 150, defense: 150,
    sight: 8, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: [],
    upgradeTo: "warChariot"
  },
  warChariot: {
    id: "warChariot", name: "Carro de Guerra", faction: "any", category: "chariot", era: 3,
    cost: { grain: 180, bronze: 90 }, hp: 100, move: 10, attack: 200, defense: 200,
    sight: 8, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge"], // +33% ATK en terreno de llanura/camino de llanura
    upgradeTo: "heavyWarChariot"
  },
  heavyWarChariot: {
    id: "heavyWarChariot", name: "Carro de Guerra Pesado", faction: "any", category: "chariot", era: 4,
    cost: { grain: 220, bronze: 110 }, hp: 100, move: 10, attack: 250, defense: 250,
    sight: 8, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge"],
    upgradeTo: "royalChariot"
  },
  royalChariot: {
    id: "royalChariot", name: "Carro Real", faction: "any", category: "chariot", era: 4,
    cost: { grain: 260, bronze: 140 }, hp: 100, move: 10, attack: 300, defense: 300,
    sight: 8, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge"],
    requiresTech: "chariotMastery" // equivalente a "Escuderos" -> Paladín
  },

  // ============================ ASEDIO ============================
  batteringRam: {
    id: "batteringRam", name: "Ariete", faction: "any", category: "siege", era: 3,
    cost: { grain: 160, bronze: 80 }, hp: 150, move: 5, attack: 300, defense: 200,
    sight: 5, range: 1,
    attackBonus: { building: 3 },
    abilities: ["buildingsOnly", "noCounter"],
    upgradeTo: "siegeRam"
  },
  siegeTower: {
    id: "siegeTower", name: "Torre de Asedio", faction: "any", category: "siege", era: 3,
    cost: { grain: 200, bronze: 120 }, hp: 200, move: 4, attack: 0, defense: 250,
    sight: 6, range: 0,
    attackBonus: {},
    abilities: ["transportInfantry"] // permite montar 3 infantes y asaltar murallas
  },
  catapult: {
    id: "catapult", name: "Catapulta", faction: "any", category: "siege", era: 3,
    cost: { grain: 180, bronze: 100 }, hp: 100, move: 4, attack: 220, defense: 120,
    sight: 6, range: 4,
    attackBonus: { building: 1.6 },
    abilities: ["deploy", "splashDamage"],
    upgradeTo: "heavyCatapult"
  },
  heavyCatapult: {
    id: "heavyCatapult", name: "Catapulta Pesada", faction: "any", category: "siege", era: 4,
    cost: { grain: 230, bronze: 140 }, hp: 100, move: 4, attack: 280, defense: 160,
    sight: 6, range: 4,
    attackBonus: { building: 1.6 },
    abilities: ["deploy", "splashDamage"],
    requiresTech: "siegeEngineering"
  },

  // ============================ NAVES (sobre el agua, desde el Puerto) ============================
  // ---------------------------- camellos: el antídoto contra los carros ----
  camel: {
    id: "camel", name: "Camello", faction: "any", category: "chariot", era: 2,
    cost: { grain: 120, bronze: 55 }, hp: 100, move: 9, attack: 130, defense: 150,
    sight: 6, range: 1,
    attackBonus: { building: 0.5, chariot: 1.6 },
    abilities: ["desertCharge", "scaresHorses"], // carga en desierto y espanta a los caballos
    upgradeTo: "heavyCamel"
  },
  heavyCamel: {
    id: "heavyCamel", name: "Camello Pesado", faction: "any", category: "chariot", era: 3,
    cost: { grain: 175, bronze: 85 }, hp: 100, move: 9, attack: 185, defense: 205,
    sight: 6, range: 1,
    attackBonus: { building: 0.5, chariot: 1.6 },
    abilities: ["desertCharge", "scaresHorses"]
  },

  // ---------------------------- escorpión: asedio que solo mata tropa -----
  scorpion: {
    id: "scorpion", name: "Escorpión", faction: "any", category: "siege", era: 3,
    cost: { grain: 140, bronze: 90 }, hp: 100, move: 4, attack: 210, defense: 105,
    sight: 6, range: 3,
    attackBonus: {},
    abilities: ["unitsOnly", "noMoveAndAttack"],
    upgradeTo: "heavyScorpion"
  },
  heavyScorpion: {
    id: "heavyScorpion", name: "Escorpión Pesado", faction: "any", category: "siege", era: 4, requiresTech: "siegeEngineering",
    cost: { grain: 190, bronze: 120 }, hp: 100, move: 4, attack: 275, defense: 140,
    sight: 6, range: 3,
    attackBonus: {},
    abilities: ["unitsOnly", "noMoveAndAttack"]
  },

  // ---------------------------- arqueros montados -------------------------
  horseArcher: {
    id: "horseArcher", name: "Arquero a Caballo", faction: "any", category: "ranged", era: 3,
    cost: { grain: 155, bronze: 80 }, hp: 100, move: 10, attack: 150, defense: 125,
    sight: 8, range: 2,
    attackBonus: { building: 0.5 },
    abilities: [],
    upgradeTo: "heavyHorseArcher"
  },
  heavyHorseArcher: {
    id: "heavyHorseArcher", name: "Arquero a Caballo Pesado", faction: "any", category: "ranged", era: 4,
    cost: { grain: 205, bronze: 105 }, hp: 100, move: 10, attack: 205, defense: 170,
    sight: 8, range: 2,
    attackBonus: { building: 0.5 },
    abilities: []
  },

  // ---------------------------- asedio pesado -----------------------------
  siegeRam: {
    id: "siegeRam", name: "Ariete de Asedio", faction: "any", category: "siege", era: 4, requiresTech: "siegeEngineering",
    cost: { grain: 230, bronze: 130 }, hp: 220, move: 5, attack: 420, defense: 290,
    sight: 4, range: 1,
    attackBonus: { building: 3 },
    abilities: ["buildingsOnly", "noCounter"]
  },
  trebuchet: {
    id: "trebuchet", name: "Trebuchet", faction: "any", category: "siege", era: 4, requiresTech: "siegeEngineering",
    cost: { grain: 300, bronze: 200 }, hp: 100, move: 3, attack: 400, defense: 115,
    sight: 7, range: 5,
    attackBonus: { building: 2.5 },
    abilities: ["noMoveAndAttack", "deploy", "splashDamage"]
  },

  // ---------------------------- pólvora (necesita Química) ----------------
  handCannoneer: {
    id: "handCannoneer", name: "Arcabucero", faction: "any", category: "ranged", era: 4, requiresTech: "chemistry",
    cost: { grain: 200, bronze: 150 }, hp: 100, move: 6, attack: 285, defense: 150,
    sight: 6, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack"]
  },
  bombardCannon: {
    id: "bombardCannon", name: "Cañón de Bombarda", faction: "any", category: "siege", era: 4, requiresTech: "chemistry",
    cost: { grain: 280, bronze: 220 }, hp: 100, move: 3, attack: 380, defense: 145,
    sight: 7, range: 4,
    attackBonus: { building: 2 },
    abilities: ["noMoveAndAttack", "deploy", "splashDamage"]
  },
  monsMeg: {
    id: "monsMeg", name: "Mons Meg", faction: "any", category: "siege", era: 4, requiresTech: "chemistry",
    cost: { grain: 380, bronze: 320 }, hp: 120, move: 2, attack: 500, defense: 190,
    sight: 8, range: 5,
    attackBonus: { building: 2.4 },
    abilities: ["noMoveAndAttack", "deploy", "splashDamage"]
  },

  // ============================ UNIDADES ÚNICAS DE CADA CASA ============================
  myrmidon: {
    id: "myrmidon", name: "Mirmidón", faction: "greek", house: "mirmidones", category: "infantry", era: 2,
    cost: { grain: 120, bronze: 45 }, hp: 100, move: 8, attack: 185, defense: 155,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["seasonedVeteran"]
  },
  spartan: {
    id: "spartan", name: "Hoplita Espartano", faction: "greek", house: "esparta", category: "spear", era: 2,
    cost: { grain: 140, bronze: 55 }, hp: 100, move: 7, attack: 165, defense: 185,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["antiChariot", "frenzy"]
  },
  royalGuard: {
    id: "royalGuard", name: "Guardia Real Micénica", faction: "greek", house: "micenas", category: "infantry", era: 3,
    cost: { grain: 175, bronze: 70 }, hp: 120, move: 7, attack: 215, defense: 215,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: []
  },
  dardanRider: {
    id: "dardanRider", name: "Jinete Dárdano", faction: "trojan", house: "dardanos", category: "chariot", era: 2,
    cost: { grain: 150, bronze: 70 }, hp: 100, move: 11, attack: 165, defense: 160,
    sight: 9, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge"]
  },
  lycianArcher: {
    id: "lycianArcher", name: "Arquero Licio", faction: "trojan", house: "licios", category: "ranged", era: 2,
    cost: { grain: 135, bronze: 60 }, hp: 100, move: 7, attack: 150, defense: 130,
    sight: 8, range: 4,
    attackBonus: { building: 0.5 },
    abilities: ["volley"]
  },
  amazon: {
    id: "amazon", name: "Amazona", faction: "trojan", house: "amazonas", category: "skirmish", era: 2,
    cost: { grain: 130, bronze: 55 }, hp: 100, move: 9, attack: 145, defense: 125,
    sight: 8, range: 2,
    abilities: ["skirmish", "woodsman"]
  },


  // ======================= MERCENARIOS DEL MERCADO =======================
  // Como en el original: son las unidades únicas de los pueblos que no salen
  // como bando jugable. Se contratan en el mercado pagando bronce, no piden
  // edificio ni investigación, y cada día hay tres distintos en oferta.

  woadRaider: {
    id: "woadRaider", name: "Saqueador Celta", faction: "any", category: "infantry", era: 2,
    mercenary: true,
    cost: { grain: 0, bronze: 240 }, hp: 100, move: 9, attack: 175, defense: 120,
    sight: 6, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["causeFear"],
    upgradeTo: "eliteWoadRaider"
  },
  eliteWoadRaider: {
    id: "eliteWoadRaider", name: "Saqueador Celta de Élite", faction: "any", category: "infantry", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 340 }, hp: 100, move: 9, attack: 235, defense: 165,
    sight: 6, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["causeFear"]
  },

  berserker: {
    id: "berserker", name: "Berserker Vikingo", faction: "any", category: "infantry", era: 2,
    mercenary: true,
    cost: { grain: 0, bronze: 250 }, hp: 100, move: 7, attack: 165, defense: 160,
    sight: 5, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["frenzy"],
    upgradeTo: "eliteBerserker"
  },
  eliteBerserker: {
    id: "eliteBerserker", name: "Berserker de Élite", faction: "any", category: "infantry", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 350 }, hp: 100, move: 7, attack: 225, defense: 215,
    sight: 5, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["frenzy"]
  },

  templar: {
    id: "templar", name: "Caballero Templario", faction: "any", category: "chariot", era: 3,
    mercenary: true,
    cost: { grain: 0, bronze: 300 }, hp: 100, move: 9, attack: 190, defense: 200,
    sight: 6, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge", "zeal"],
    upgradeTo: "eliteTemplar"
  },
  eliteTemplar: {
    id: "eliteTemplar", name: "Templario de Élite", faction: "any", category: "chariot", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 400 }, hp: 100, move: 9, attack: 250, defense: 260,
    sight: 6, range: 1,
    attackBonus: { building: 0.5, infantry: 1.33, ranged: 1.33 },
    abilities: ["plainsCharge", "zeal"]
  },

  janissary: {
    id: "janissary", name: "Jenízaro Turco", faction: "any", category: "ranged", era: 3,
    mercenary: true,
    cost: { grain: 0, bronze: 290 }, hp: 100, move: 6, attack: 250, defense: 140,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack"],
    upgradeTo: "eliteJanissary"
  },
  eliteJanissary: {
    id: "eliteJanissary", name: "Jenízaro de Élite", faction: "any", category: "ranged", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 390 }, hp: 100, move: 6, attack: 310, defense: 180,
    sight: 7, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack"]
  },

  warElephant: {
    id: "warElephant", name: "Elefante de Guerra", faction: "any", category: "chariot", era: 3,
    mercenary: true,
    cost: { grain: 0, bronze: 380 }, hp: 160, move: 6, attack: 230, defense: 230,
    sight: 5, range: 1,
    attackBonus: { building: 1.33, infantry: 1.33 },
    abilities: ["causeFear", "noScare", "splashDamage"],
    upgradeTo: "eliteWarElephant"
  },
  eliteWarElephant: {
    id: "eliteWarElephant", name: "Elefante de Guerra de Élite", faction: "any", category: "chariot", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 480 }, hp: 180, move: 6, attack: 300, defense: 300,
    sight: 5, range: 1,
    attackBonus: { building: 1.33, infantry: 1.33 },
    abilities: ["causeFear", "noScare", "splashDamage"]
  },

  chuKoNu: {
    id: "chuKoNu", name: "Chu Ko Nu", faction: "any", category: "ranged", era: 3,
    mercenary: true,
    cost: { grain: 0, bronze: 280 }, hp: 100, move: 6, attack: 140, defense: 130,
    sight: 6, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack", "rapidFire"],
    upgradeTo: "eliteChuKoNu"
  },
  eliteChuKoNu: {
    id: "eliteChuKoNu", name: "Chu Ko Nu de Élite", faction: "any", category: "ranged", era: 4,
    mercenary: true,
    cost: { grain: 0, bronze: 380 }, hp: 100, move: 6, attack: 185, defense: 170,
    sight: 6, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["noMoveAndAttack", "rapidFire"]
  },

  // ============================ NO COMBATIENTES ============================
  villager: {
    id: "villager", name: "Colono", faction: "any", category: "support", era: 1,
    cost: { grain: 50, bronze: 0 }, hp: 50, move: 7, attack: 10, defense: 50,
    sight: 6, range: 1,
    attackBonus: {},
    abilities: ["build", "gather"]
  },
  priest: {
    id: "priest", name: "Sacerdote", faction: "any", category: "support", era: 3,
    cost: { grain: 150, bronze: 50 }, hp: 100, move: 6, attack: 0, defense: 175,
    sight: 7, range: 1,
    attackBonus: {},
    abilities: ["heal", "inspire", "convert", "carryRelic"],
    upgradeTo: "elitePriest" // cura, inspira, convierte y porta reliquias
  },

  // ============================ MERCENARIOS (mercado) ============================
  elitePriest: {
    id: "elitePriest", name: "Sacerdote de Élite", faction: "any", category: "support", era: 4,
    cost: { grain: 180, bronze: 110 }, hp: 90, move: 7, attack: 0, defense: 110,
    sight: 7, range: 0,
    attackBonus: {},
    abilities: ["heal", "improvedHeal", "inspire", "convert", "carryRelic"]
  },
  mercenary: {
    id: "mercenary", name: "Mercenario Tracio", faction: "any", category: "infantry", era: 2,
    cost: { grain: 0, bronze: 230 }, hp: 100, move: 7, attack: 170, defense: 140,
    sight: 7, range: 1,
    attackBonus: { building: 1.33, siege: 1.33 },
    abilities: ["mercenary"] // se contrata en el mercado del campamento, solo con bronce
  },

  // ============================ UNIDAD ESPECIAL ÚNICA ============================
  trojanHorse: {
    id: "trojanHorse", name: "Caballo de Troya", faction: "greek", category: "special", era: 4,
    cost: { grain: 400, bronze: 300 }, hp: 300, move: 3, attack: 0, defense: 400,
    sight: 5, range: 0,
    attackBonus: {},
    abilities: ["trojanHorseInfiltration"], // mecánica única: ver módulo de reglas especiales
    unique: true,
    requiresTech: "trojanHorseBlueprint"
  }
};

/**
 * Edificio que entrena cada unidad (data/buildings.js).
 * Solo se ofrecen las unidades "raíz" de cada línea disponibles en la era
 * del jugador; las mejoras de línea se aplican solas al subir de era
 * (igual que en AoK DS, donde el Hombre de Armas pasa a Espadachín).
 */
export const PRODUCED_AT = {
  villager: "camp",
  recruit: "barracks", spearman: "barracks",
  myrmidon: "barracks", spartan: "barracks", royalGuard: "barracks",
  archer: "archeryRange", slinger: "archeryRange", javelineer: "archeryRange",
  lycianArcher: "archeryRange", amazon: "archeryRange",
  scoutChariot: "stable", dardanRider: "stable",
  batteringRam: "siegeWorkshop", siegeTower: "siegeWorkshop", catapult: "siegeWorkshop",
  trojanHorse: "siegeWorkshop",
  priest: "temple", elitePriest: "temple",
  camel: "stable", heavyCamel: "stable",
  horseArcher: "archeryRange", heavyHorseArcher: "archeryRange",
  handCannoneer: "archeryRange",
  scorpion: "siegeWorkshop", heavyScorpion: "siegeWorkshop",
  siegeRam: "siegeWorkshop", bombardCannon: "siegeWorkshop",
  trebuchet: "castle", monsMeg: "castle",
};

/** Devuelve la definición de una unidad por id, o null si no existe */
export function getUnit(id) {
  return UNITS[id] || null;
}

/** Devuelve todas las unidades disponibles hasta una era dada (inclusive) */
export function getUnitsByEra(era) {
  return Object.values(UNITS).filter(u => u.era <= era);
}

/** Devuelve todas las unidades de una categoría concreta */
export function getUnitsByCategory(category) {
  return Object.values(UNITS).filter(u => u.category === category);
}
