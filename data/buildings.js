/**
 * buildings.js
 * -----------------------------------------------------------------------
 * Edificios, adaptados de AoK DS:
 *   - Los Colonos construyen en una casilla adyacente (acción que consume
 *     su turno). El edificio queda listo al empezar el siguiente turno.
 *   - Granjas y minas dan ingresos fijos cada turno (el original no tiene
 *     recolección manual: los recursos llegan por edificio).
 *   - Solo la Mina puede ir sobre un yacimiento de bronce.
 *   - Cada edificio de producción entrena UNA unidad por turno, que aparece
 *     en una casilla libre adyacente y no puede actuar hasta el turno
 *     siguiente.
 *   - Campamento Base / Ciudadela: si un bando pierde todos, queda eliminado.
 *   - Como en AoK DS, la ciudad crece alrededor del campamento: los edificios
 *     "de ciudad" (townSlot) van en las 4 casillas pegadas a un campamento
 *     propio y las torres en sus 4 esquinas. Para tener más, funda otro
 *     campamento (a 4+ casillas de cualquier otro).
 *   - Si construyes un campamento sobre las ruinas de uno enemigo, capturas
 *     los edificios enemigos que queden a 2 casillas.
 *   - La Maravilla tarda 3 turnos en levantarse; si resiste 8 turnos tuyos
 *     completa, ganas. Al terminarla, el rival recibe refuerzos.
 *
 * attack/range > 0: el edificio dispara a un enemigo a su alcance al empezar
 * el turno de su dueño y contraataca si le atacan.
 * -----------------------------------------------------------------------
 */

export const BUILDINGS = {
  camp: {
    id: "camp", name: "Campamento Base", era: 1,
    cost: { grain: 300, bronze: 200 }, hp: 400, defense: 250, attack: 60, range: 2, sight: 6,
    income: { grain: 60, bronze: 50 },
    produces: ["villager"], researches: true, isCapital: true,
    description: "Corazón de tu ciudad: entrena colonos, investiga, avanza de era y comercia. Admite 4 edificios pegados y 4 torres en las esquinas."
  },
  citadel: {
    id: "citadel", name: "Ciudadela de Troya", era: 1,
    cost: null, hp: 900, defense: 400, attack: 150, range: 3, sight: 8,
    income: { grain: 50, bronze: 40 },
    produces: ["villager"], researches: true, isCapital: true, scenarioOnly: true,
    description: "La Pérgamo de Príamo. Si cae, cae Troya."
  },
  mill: {
    id: "mill", name: "Molino", era: 1,
    cost: { grain: 60, bronze: 20 }, hp: 200, defense: 130, sight: 3,
    income: { grain: 20 }, requiresDeposit: "wheat",
    description: "Va sobre un trigal. Da 20 de grano por turno y permite levantar hasta 4 granjas, una en cada lado. Si al molino le estorba un camino, una montaña o el mar, ese lado se queda sin granja."
  },
  farm: {
    id: "farm", name: "Granja", era: 1,
    cost: { grain: 50, bronze: 0 }, hp: 120, defense: 80, sight: 2,
    income: { grain: 28 }, terrain: ["plains", "desert", "hill", "beach"],
    requiresMill: true,
    description: "+28 de grano por turno. Solo en una casilla pegada a un Molino tuyo (como máximo cuatro por molino)."
  },
  mine: {
    id: "mine", name: "Mina de Bronce", era: 1,
    cost: { grain: 75, bronze: 0 }, hp: 150, defense: 120, sight: 2,
    income: { bronze: 50 }, requiresDeposit: "bronze",
    description: "+50 de bronce por turno. Solo sobre un yacimiento de bronce, que siempre está en colina o montaña."
  },
  barracks: {
    id: "barracks", name: "Cuartel", era: 1,
    cost: { grain: 100, bronze: 50 }, hp: 250, defense: 180, sight: 4,
    produces: ["recruit", "spearman", "myrmidon", "spartan", "royalGuard"],
    townSlot: true,
    description: "Entrena infantería, lanceros y la unidad única de tu casa."
  },
  archeryRange: {
    id: "archeryRange", name: "Campo de Tiro", era: 2,
    cost: { grain: 125, bronze: 50 }, hp: 220, defense: 160, sight: 4,
    produces: ["archer", "slinger", "javelineer", "horseArcher", "handCannoneer", "lycianArcher", "amazon"],
    townSlot: true,
    description: "Entrena arqueros, honderos y jabalineros."
  },
  stable: {
    id: "stable", name: "Establo de Carros", era: 1,
    cost: { grain: 150, bronze: 75 }, hp: 250, defense: 180, sight: 4,
    produces: ["scoutChariot", "camel", "dardanRider"],
    townSlot: true,
    description: "Entrena carros de guerra."
  },
  village: {
    id: "village", name: "Aldea", era: 1,
    cost: null, hp: 200, defense: 140, sight: 4,
    income: { grain: 35, bronze: 25 },
    scenarioOnly: true, capturable: true, neutral: true,
    description: "Aldea de la Tróade. Cualquier unidad de tierra que termine su movimiento encima la captura: pasa a dar sus ingresos a su dueño."
  },
  siegeWorkshop: {
    id: "siegeWorkshop", name: "Taller de Asedio", era: 3,
    cost: { grain: 200, bronze: 150 }, hp: 250, defense: 160, sight: 4,
    produces: ["batteringRam", "siegeTower", "catapult", "scorpion", "bombardCannon", "trojanHorse"],
    townSlot: true,
    description: "Construye arietes, torres de asedio y catapultas."
  },
  temple: {
    id: "temple", name: "Templo", era: 3,
    cost: { grain: 150, bronze: 100 }, hp: 220, defense: 200, sight: 5,
    produces: ["priest"], healAura: 15,
    townSlot: true,
    description: "Entrena sacerdotes y guarda reliquias (+25 bronce por turno cada una). Cura 15 HP por turno a los aliados adyacentes."
  },
  blacksmith: {
    id: "blacksmith", name: "Herrería", era: 2,
    cost: { grain: 120, bronze: 100 }, hp: 240, defense: 190, sight: 3,
    townSlot: true,
    description: "Sin ella no hay mejoras de armas ni de armadura: todas las de ataque y defensa de infantería, carros y arqueros salen de aquí."
  },
  university: {
    id: "university", name: "Universidad", era: 3,
    cost: { grain: 200, bronze: 175 }, hp: 260, defense: 200, sight: 5,
    townSlot: true,
    description: "Mampostería, arquitectura, aspilleras y, sobre todo, Ingeniería de Asedio y Balística: sin Universidad no hay asedio pesado."
  },
  castle: {
    id: "castle", name: "Castillo", era: 3,
    cost: { grain: 350, bronze: 300 }, hp: 650, defense: 420, attack: 130, range: 3, sight: 7,
    produces: ["myrmidon", "spartan", "royalGuard", "dardanRider", "lycianArcher", "amazon", "trebuchet", "monsMeg"],
    outpost: true,
    description: "Base avanzada: se levanta lejos de la ciudad, dispara, y entrena la unidad única de tu casa y la catapulta pesada. Da mucha defensa a quien se para encima."
  },
  watchtower: {
    id: "watchtower", name: "Torre de Vigía", era: 2,
    cost: { grain: 100, bronze: 100 }, hp: 250, defense: 250, attack: 110, range: 3, sight: 8,
    towerCorner: true,
    description: "Dispara al enemigo más débil a su alcance cada turno. Va en una esquina de un campamento."
  },
  wonder: {
    id: "wonder", name: "Maravilla: Templo de Atenea", era: 4,
    cost: { grain: 1200, bronze: 900 }, hp: 800, defense: 320, sight: 5,
    description: "Si resiste en pie 8 turnos tuyos, ganas la guerra. Al terminarla, el enemigo recibe refuerzos."
  },
  wall: {
    id: "wall", name: "Muralla de Troya", era: 1,
    cost: null, hp: 320, defense: 350, sight: 3, scenarioOnly: true, isWall: true,
    description: "Solo los arietes y la infantería la dañan de verdad. Al caer deja escombros."
  },
  gate: {
    id: "gate", name: "Puerta Escea", era: 1,
    cost: null, hp: 260, defense: 300, sight: 3, scenarioOnly: true, isWall: true, isGate: true,
    description: "Los defensores la cruzan; los atacantes tienen que derribarla."
  }
};

/** Edificios que un Colono puede levantar en la era dada */
export function getBuildableBuildings(era) {
  return Object.values(BUILDINGS).filter(b => b.cost && !b.scenarioOnly && b.era <= era);
}
