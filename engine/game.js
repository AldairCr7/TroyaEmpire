/**
 * game.js
 * -----------------------------------------------------------------------
 * Estado y reglas de una partida. La UI y la IA solo hablan con esta clase:
 *
 *   Turno de un jugador
 *     1. Se completan construcciones, entra el ingreso de granjas/minas/
 *        campamento, los templos curan y las torres disparan.
 *     2. Cada unidad puede MOVERSE y luego ACTUAR (atacar, construir,
 *        curar, usar poder…) o esperar. Mover sin actuar se puede deshacer.
 *     3. Cada edificio entrena una unidad; el campamento investiga una
 *        tecnología y puede avanzar de era (una cosa de cada por turno).
 *   Victoria: el bando que se queda sin Campamento Base/Ciudadela pierde, o
 *   gana quien mantenga en pie su Maravilla 8 turnos.
 *   Población: como en AoK DS, el límite depende de tus ingresos por turno.
 *   Eras: además del coste, hay que investigar N tecnologías de la era actual.
 *   En "Asedio de Troya", si los troyanos aguantan hasta el turno límite,
 *   ganan ellos.
 *
 * Emite eventos (on/emit) para que el renderer anime sin conocer las reglas.
 * -----------------------------------------------------------------------
 */

import { Grid } from "../grid/grid.js";
import { UnitInstance } from "../grid/unit.js";
import { UNITS, PRODUCED_AT } from "../data/units.js";
import { HEROES } from "../data/heroes.js";
import { BUILDINGS } from "../data/buildings.js";
import { TECHNOLOGIES } from "../data/technologies.js";
import { getTerrain } from "../data/terrain.js";
import { HOUSES } from "../data/houses.js";
import { resolveCombat, attackRangeOf } from "./combat.js";

export const ERAS = [
  null,
  { id: 1, name: "Campamento" },
  { id: 2, name: "Asedio", cost: { grain: 450, bronze: 200 } },
  { id: 3, name: "Héroes", cost: { grain: 700, bronze: 400 } },
  { id: 4, name: "La Caída", cost: { grain: 1000, bronze: 650 } }
];

/**
 * Lo que gana un héroe por cada era avanzada. La defensa sube menos que el
 * ataque a propósito: en este motor el daño es 40 × ataque / defensa, así que
 * un punto de defensa pesa más que uno de ataque.
 */
const HERO_ERA_ATTACK = 0.15;
const HERO_ERA_DEFENSE = 0.10;

export const FACTIONS = {
  greek: { id: "greek", name: "Aqueos", heroes: ["achilles", "odysseus"], color: "#2f6f8f", light: "#7fc3dd" },
  trojan: { id: "trojan", name: "Troyanos", heroes: ["hector", "paris"], color: "#a8442a", light: "#f09a74" },
  neutral: { id: "neutral", name: "Aldeanos", heroes: [], color: "#8a7a64", light: "#c9b99b" }
};

const HERO_REVIVE_COST = { grain: 250, bronze: 150 };
export const POP_CAP = 40; // techo absoluto; el límite real sale de los ingresos
/** Tecnologías de la era actual necesarias para avanzar a la siguiente */
export const ERA_TECHS_NEEDED = { 2: 2, 3: 4, 4: 5 };
export const WONDER_TURNS = 8;
const RELIC_INCOME = 25;
const MERCENARY_ERA = 2;
/** Mercado del campamento: 100 de un recurso por X del otro */
const BASE_TRADE = { grainToBronze: 45, bronzeToGrain: 70 };
const HERO_REVIVE_DELAY = 2;
/** Turnos de recarga de los poderes que se activan con botón */
export const POWER_COOLDOWN = { wrathOfAchilles: 1, achillesHeelShot: 2, rallyTheWalls: 3, trojanHorseGambit: 3 };

let _nextBuildingId = 1;

class BuildingInstance {
  constructor(template, ownerId, x, y, underConstruction = false) {
    this.instanceId = `b${_nextBuildingId++}`;
    this.kind = "building";
    this.template = template;
    this.ownerId = ownerId;
    this.x = x; this.y = y;
    this.maxHp = template.hp;
    this.currentHp = underConstruction ? Math.round(template.hp * 0.5) : template.hp;
    this.underConstruction = underConstruction;
    this.buildTurnsLeft = underConstruction ? (template.buildTurns || 1) : 0;
    this.producedThisTurn = false;
    this.relics = 0;
  }
  get name() { return this.template.name; }
  isAlive() { return this.currentHp > 0; }
}

export class Game {
  /**
   * @param map resultado de generateMap
   * @param options { players: {greek:{control,difficulty}, trojan:{...}}, fog }
   */
  constructor(map, options) {
    this.map = map;
    this.scenario = map.scenario;
    this.turnLimit = null;   // ya no hay límite de turnos en ningún escenario
    this.fog = options.fog !== false;
    this.grid = new Grid(map.width, map.height, map.terrain);
    for (const d of map.deposits) this.grid.getTile(d.x, d.y).deposit = d.type || "bronze";
    for (const p of map.pickups || []) this.grid.getTile(p.x, p.y).pickup = p.type;

    this.units = new Map();
    this.buildings = new Map();
    this.listeners = [];
    this.log = [];
    this.round = 1;
    this.order = options.firstPlayer === "trojan" ? ["trojan", "greek"] : ["greek", "trojan"];
    this.currentIdx = 0;
    this.winner = null;

    const siege = !!map.citadel;
    this.mods = options.mods || {};
    this.killedHeroes = new Set();
    this.players = {};
    for (const id of this.order) {
      const opt = options.players[id];
      const startEra = Math.max(siege ? 2 : 1, this.mods.era || 1);
      this.players[id] = {
        id, name: FACTIONS[id].name, control: opt.control, difficulty: opt.difficulty || "normal",
        house: opt.house || null,
        grain: siege ? (id === "greek" ? 1200 : 400) : 400,
        bronze: siege ? (id === "greek" ? 700 : 250) : 200,
        era: startEra,
        techs: new Set(), researchedThisTurn: false, advancedThisTurn: false,
        deadHeroes: {}, alive: true, mercenaryThisTurn: false, wonder: null,
        explored: new Uint8Array(map.width * map.height),
        visible: new Uint8Array(map.width * map.height),
        stats: { kills: 0, lost: 0, built: 0 }
      };
    }
    if (this.players.greek.control === "ai" && this.players.trojan.control === "ai") this.fog = false;

    // objetivos de cada bando (la campaña los trae hechos; si no, los del mapa)
    this.goals = options.goals || map.goals || {
      greek: { type: "destroyCapitals", text: "Destruye los campamentos troyanos" },
      trojan: { type: "destroyCapitals", text: siege ? "Rompe el cerco: arrasa su campamento" : "Destruye los campamentos aqueos" }
    };

    this._setupStart(siege);
    if (siege) for (const t of ["bronzeSmithing", "hardenedLeather"]) this.players.greek.techs.add(t);
    for (const id of this.order) this.updateVision(id);
    this._beginTurn(true);
  }

  // ------------------------------------------------------------------ eventos
  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }
  say(text, tone = "info") {
    const entry = { text, tone, round: this.round, player: this.current?.id };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.emit("log", entry);
  }

  get current() { return this.players[this.order[this.currentIdx]]; }
  opponentOf(id) { return this.order.find(o => o !== id); }

  // ------------------------------------------------------------------ montaje
  _setupStart(siege) {
    const s = this.map.starts;
    // aldeas de la Tróade: se capturan pisándolas. Un escenario puede darlas
    // ya en manos de un bando, y entonces vienen con guarnición.
    const vOwner = this.mods.villageOwner || "neutral";
    for (const v of this.map.villages || []) {
      const t = this.grid.getTile(v.x, v.y);
      if (!t || t.building || t.deposit) continue;
      this.placeBuilding("village", vOwner, v.x, v.y);
      if (vOwner === "neutral") continue;
      // el primer defensor se queda DENTRO de la aldea: hay que sacarlo para tomarla
      const guard = this.mods.villageGuard || ["spearman"];
      guard.forEach((tid, i) => {
        const spot = i === 0 && !this.grid.isOccupied(v.x, v.y)
          ? { x: v.x, y: v.y }
          : this.freeSpotNear(v.x, v.y, 2, vOwner, UNITS[tid]);
        if (!spot) return;
        const u = this.spawnUnit(tid, vOwner, spot.x, spot.y);
        u.hasActed = true; u.hasMoved = true;
      });
    }
    // aqueos
    const gcamp = this.placeBuilding("camp", "greek", s.greek.camp.x, s.greek.camp.y);
    if (siege) {
      for (const type of ["barracks", "archeryRange"]) {
        const spot = this.freeBuildSpot(gcamp.x, gcamp.y, 4);
        if (spot) this.placeBuilding(type, "greek", spot.x, spot.y);
      }
    }
    // troyanos
    if (this.map.citadel) {
      this.placeBuilding("citadel", "trojan", this.map.citadel.x, this.map.citadel.y);
      for (const w of this.map.walls) this.placeBuilding(w.type, "trojan", w.x, w.y);
      for (const b of s.trojan.buildings || []) {
        const t = this.grid.getTile(b.x, b.y);
        if (t && !t.building && getTerrain(t.terrain).passable) this.placeBuilding(b.type, "trojan", b.x, b.y);
      }
    } else {
      this.placeBuilding("camp", "trojan", s.trojan.camp.x, s.trojan.camp.y);
    }

    const armies = siege ? {
      greek: ["achilles", "odysseus", "hoplite", "hoplite", "hoplite", "hoplite", "spearman", "archer", "archer", "lightChariot", "villager", "villager", "villager", "villager"],
      trojan: ["hector", "paris", "hoplite", "spearman", "spearman", "archer", "archer", "slinger", "villager"]
    } : {
      greek: ["achilles", "odysseus", "villager", "villager", "recruit", "recruit", "scoutChariot"],
      trojan: ["hector", "paris", "villager", "villager", "recruit", "recruit", "scoutChariot"]
    };
    // retoques de la campaña: héroes ausentes y tropas de refuerzo
    const off = this.mods.heroesOff || {};
    const extra = this.mods.extra || {};
    for (const id of this.order) {
      const camp = this.capitals(id)[0];
      const list = armies[id].filter(t => !(off[id] || []).includes(t)).concat(extra[id] || []);
      for (const tid of list) {
        const template = UNITS[tid] || HEROES[tid];
        const spot = this.freeSpotNear(camp.x, camp.y, 6, id, template)
;
        if (spot) this.spawnUnit(tid, id, spot.x, spot.y);
      }
      // la casa elegida empieza con un par de sus unidades únicas
      const house = HOUSES[this.players[id].house];
      if (house && UNITS[house.unique] && UNITS[house.unique].era <= this.players[id].era) {
        for (let i = 0; i < 2; i++) {
          const spot = this.freeSpotNear(camp.x, camp.y, 6, id, UNITS[house.unique]);
          if (spot) this.spawnUnit(house.unique, id, spot.x, spot.y);
        }
      }
    }
  }

  placeBuilding(typeId, ownerId, x, y, underConstruction = false) {
    const b = new BuildingInstance(BUILDINGS[typeId], ownerId, x, y, underConstruction);
    this.buildings.set(b.instanceId, b);
    this.grid.getTile(x, y).building = b.instanceId;
    return b;
  }

  spawnUnit(templateId, ownerId, x, y) {
    const template = UNITS[templateId] || HEROES[templateId];
    const u = new UnitInstance(template, ownerId, x, y);
    this.units.set(u.instanceId, u);
    this.grid.setUnit(x, y, u.instanceId);
    return u;
  }

  /** Casilla libre más cercana (por pasos transitables) donde puede estar una unidad */
  freeSpotNear(x, y, maxDist, ownerId, template = null) {
    const seen = new Set([`${x},${y}`]);
    let frontier = [{ x, y }];
    for (let d = 0; d <= maxDist && frontier.length; d++) {
      const next = [];
      for (const p of frontier) {
        if (!(p.x === x && p.y === y) || d > 0) {
          if (!this.grid.isOccupied(p.x, p.y) && this.canStand(p.x, p.y, ownerId, template)) return p;
        }
        for (const n of this.grid.getOrthogonalNeighbors(p.x, p.y)) {
          const k = `${n.x},${n.y}`;
          if (seen.has(k)) continue;
          seen.add(k);
          if (isFinite(this.baseStepCost(n.x, n.y, ownerId, template))) next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  }


  /** Casilla construible, sin edificio, unidad ni yacimiento, lo más cerca posible */
  freeBuildSpot(x, y, maxDist) {
    let best = null;
    for (const t of this.grid.tilesInRange(x, y, maxDist, 1)) {
      const tile = this.grid.getTile(t.x, t.y);
      if (tile.building || tile.unit || tile.deposit || !getTerrain(tile.terrain).buildable) continue;
      if (!best || t.dist < best.dist) best = t;
    }
    return best;
  }

  // ------------------------------------------------------------------ consultas
  unitAt(x, y) {
    const t = this.grid.getTile(x, y);
    const u = t && t.unit ? this.units.get(t.unit) : null;
    return u && u.isAlive() ? u : null;
  }
  buildingAt(x, y) {
    const t = this.grid.getTile(x, y);
    const b = t && t.building ? this.buildings.get(t.building) : null;
    return b && b.isAlive() ? b : null;
  }
  unitsOf(ownerId) { return [...this.units.values()].filter(u => u.ownerId === ownerId && u.isAlive()); }
  buildingsOf(ownerId) { return [...this.buildings.values()].filter(b => b.ownerId === ownerId && b.isAlive()); }
  capitals(ownerId) { return this.buildingsOf(ownerId).filter(b => b.template.isCapital); }

  /**
   * Curación pasiva que recibe una unidad propia al empezar tu turno en esa casilla.
   * Te curas parándote sobre CUALQUIER edificio tuyo ya terminado — el
   * campamento, un cuartel, una torre, un molino o una granja — y además el
   * Templo cura a los que tiene pegados en cruz. Se queda con la mayor.
   * @returns {{amount:number, source:string}|null}
   */
  healingAt(x, y, ownerId) {
    let mejor = null;
    const apunta = (edificio, cantidad) => {
      if (!mejor || cantidad > mejor.amount) mejor = { amount: cantidad, source: edificio.template.name };
    };
    const b = this.buildingAt(x, y);
    if (b && b.ownerId === ownerId && !b.underConstruction && !b.template.isWall) {
      apunta(b, b.template.isCapital ? 20 : b.template.healAura || 15);
    }
    for (const n of this.grid.getOrthogonalNeighbors(x, y)) {
      const a = this.buildingAt(n.x, n.y);
      if (!a || a.ownerId !== ownerId || !a.template.healAura || a.underConstruction) continue;
      apunta(a, a.template.healAura);
    }
    return mejor;
  }
  heroesOf(ownerId) { return this.unitsOf(ownerId).filter(u => u.isHero()); }
  hasTech(ownerId, techId) { return this.players[ownerId].techs.has(techId); }

  isVisible(ownerId, x, y) {
    if (!this.fog) return true;
    return !!this.players[ownerId].visible[y * this.grid.width + x];
  }
  isExplored(ownerId, x, y) {
    if (!this.fog) return true;
    return !!this.players[ownerId].explored[y * this.grid.width + x];
  }

  // ------------------------------------------------------------------ movimiento
  /** Coste de entrar en una casilla ignorando otras unidades */
  baseStepCost(x, y, ownerId, template) {
    const tile = this.grid.getTile(x, y);
    if (!tile) return Infinity;
    const b = tile.building ? this.buildings.get(tile.building) : null;
    const terrain = getTerrain(tile.terrain);
    if (b && b.isAlive()) {
      if (b.template.isWall) {
        if (b.template.isGate && b.ownerId === ownerId) return 1;
        // torre de asedio aliada pegada a la muralla: la infantería sube
        if (template && ["infantry", "spear"].includes(template.category) && this.siegeTowerAdjacent(x, y, ownerId)) return 2;
        return Infinity;
      }
      // las aldeas se toman entrando en ellas (no las máquinas de asedio)
      if (b.template.capturable && b.ownerId !== ownerId) {
        if (template && template.category === "siege") return Infinity;
      } else if (b.ownerId !== ownerId) return Infinity; // no se entra en edificios enemigos
    }
    // Un edificio tuyo es suelo firme: cruzarlo cuesta 1 y no arrastra la
    // penalización del terreno que tiene debajo, como en el original. Por eso
    // un castillo en la montaña deja pasar al asedio, que si no, no podría.
    if (b && b.isAlive() && b.ownerId === ownerId && !b.template.isWall) return 1;
    if (!terrain.passable) return Infinity;
    let cost = terrain.moveCost;
    if (template?.abilities?.includes("scout")) cost = Math.min(cost, 2);
    // los carros y el asedio sufren más en terreno abrupto
    if (template && (template.category === "chariot" || template.category === "siege") && (terrain.id === "forest" || terrain.id === "swamp")) cost += 1;
    return cost;
  }

  siegeTowerAdjacent(x, y, ownerId) {
    return this.grid.getOrthogonalNeighbors(x, y).some(n => {
      const u = this.unitAt(n.x, n.y);
      return u && u.ownerId === ownerId && u.template.abilities?.includes("transportInfantry");
    });
  }

  canStand(x, y, ownerId, template) {
    return isFinite(this.baseStepCost(x, y, ownerId, template));
  }

  /** Bono pasivo de la casa elegida por el jugador (data/houses.js) */
  houseBonus(ownerId) {
    const p = this.players[ownerId];
    return p && p.house ? HOUSES[p.house]?.bonus || null : null;
  }

  _houseHits(bonus, unit) {
    if (!bonus.target) return true;
    const cat = unit.template.category;
    return bonus.target.includes(cat) || bonus.target.includes(unit.templateId);
  }

  moveBonus(unit, pos = unit) {
    let bonus = 0;
    const p = this.players[unit.ownerId];
    const hb = this.houseBonus(unit.ownerId);
    if (hb) {
      if (hb.type === "heroMove" && unit.isHero()) bonus += hb.value;
      if (hb.type === "move" && this._houseHits(hb, unit)) bonus += hb.value;
    }
    for (const id of p.techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "unitMove" && this._techTargets(e, unit)) bonus += e.value;
    }
    for (const h of this.heroesOf(unit.ownerId)) {
      if (h === unit) continue;
      const adj = Math.max(Math.abs(h.x - pos.x), Math.abs(h.y - pos.y)) === 1;
      if (!adj) continue;
      if (h.templateId === "achilles") bonus += 2;
      if (h.templateId === "odysseus") bonus += 2;
    }
    return bonus;
  }

  /**
   * Zona de control: una casilla pegada a un enemigo con armas detiene a
   * quien entra en ella (no se puede pasar de largo junto a un ejército).
   * Los exploradores la ignoran.
   */
  inZoneOfControl(x, y, unit) {
    if (unit.template.abilities?.includes("scout")) return false;
    for (const n of this.grid.getOrthogonalNeighbors(x, y)) {
      const e = this.unitAt(n.x, n.y);
      if (!e || e.ownerId === unit.ownerId || !(e.template.attack > 0)) continue;
      if (this.fog && !this.isVisible(unit.ownerId, n.x, n.y)) continue;
      return true;
    }
    return false;
  }

  getReachable(unit) {
    // una máquina montada no se mueve hasta desmontarla
    if (unit.deployed) {
      const m = new Map([[`${unit.x},${unit.y}`, { x: unit.x, y: unit.y, cost: 0, prev: null }]]);
      m.all = m;
      return m;
    }
    const move = unit.getEffectiveMove(this.moveBonus(unit));
    return this.grid.getReachableTiles(unit.x, unit.y, move,
      (x, y) => {
        const other = this.unitAt(x, y);
        if (other && other.ownerId !== unit.ownerId) return Infinity; // el enemigo bloquea
        return this.baseStepCost(x, y, unit.ownerId, unit.template);
      },
      (x, y) => !this.unitAt(x, y),
      (x, y) => this.inZoneOfControl(x, y, unit));
  }

  moveUnit(unit, x, y) {
    if (unit.hasMoved || unit.hasActed || unit.ownerId !== this.current.id) return null;
    const reach = this.getReachable(unit);
    if (!reach.has(`${x},${y}`)) return null;
    const path = this.grid.pathTo(reach, x, y);
    unit.lastMove = { x: unit.x, y: unit.y };
    this.grid.clearUnit(unit.x, unit.y);
    unit.x = x; unit.y = y;
    this.grid.setUnit(x, y, unit.instanceId);
    unit.hasMoved = !(path.length === 1);
    this.emit("move", { unit, path });
    this._collectPickup(unit);
    this._captureBuilding(unit);
    this.updateVision(unit.ownerId);
    return path;
  }

  /** Aldeas: quien termina su movimiento encima se queda con ellas */
  _captureBuilding(unit) {
    const b = this.buildingAt(unit.x, unit.y);
    if (!b || !b.template.capturable || b.ownerId === unit.ownerId) return;
    const from = b.ownerId;
    b.ownerId = unit.ownerId;
    b.producedThisTurn = true;
    unit.pickedThisMove = true; // ya no puede deshacer el movimiento
    const inc = b.template.income || {};
    this.say(`${FACTIONS[unit.ownerId].name}: ${b.name} capturada (+${inc.grain || 0} grano, +${inc.bronze || 0} bronce por turno).`,
      from === "neutral" ? "good" : "era");
    this.emit("capture", { building: b, by: unit });
    this.emit("change");
  }

  /** Cabras, bolsas y ruinas se recogen al terminar el movimiento encima */
  _collectPickup(unit) {
    const tile = this.grid.getTile(unit.x, unit.y);
    const type = tile.pickup;
    if (!type) return;
    const p = this.players[unit.ownerId];
    if (type === "relic") {
      if (!unit.template.abilities?.includes("carryRelic") || unit.relic) return;
      unit.relic = true; tile.pickup = null;
      unit.pickedThisMove = true;
      this.say(`${unit.name} recoge una reliquia sagrada. Llévala junto a un Templo propio.`, "good");
      this.emit("pickup", { unit, type }); this.emit("terrain");
      return;
    }
    if (unit.template.category === "siege") return;
    tile.pickup = null;
    unit.pickedThisMove = true;
    if (type === "goats") { p.grain += 120; this.say(`${unit.name} reúne un rebaño de cabras: +120 de grano.`, "good"); }
    if (type === "bag") { p.bronze += 100; this.say(`${unit.name} encuentra una bolsa de bronce: +100.`, "good"); }
    if (type === "ruins") this._openRuins(unit);
    this.emit("pickup", { unit, type });
    this.emit("terrain");
  }

  _openRuins(unit) {
    const p = this.players[unit.ownerId];
    const r = Math.random();
    const granary = () => { p.grain += 180; this.say("Las ruinas guardaban un granero: +180 de grano.", "good"); };
    const treasure = () => { p.bronze += 150; this.say("Entre las ruinas hay un tesoro: +150 de bronce.", "good"); };
    if (r < 0.28) granary();
    else if (r < 0.52) treasure();
    else if (r < 0.72) {
      const spot = this.freeSpotNear(unit.x, unit.y, 3, unit.ownerId);
      if (!spot) return treasure();
      const m = this.spawnUnit("mercenary", unit.ownerId, spot.x, spot.y);
      m.hasActed = true; m.hasMoved = true;
      this.emit("spawn", { unit: m });
      this.say("Unos mercenarios tracios acampados en las ruinas se unen a ti.", "good");
    } else if (r < 0.88) {
      const opts = Object.values(TECHNOLOGIES).filter(t => t.era <= p.era && !p.techs.has(t.id) && (!t.faction || t.faction === unit.ownerId));
      if (!opts.length) return granary();
      const t = opts[Math.floor(Math.random() * opts.length)];
      p.techs.add(t.id);
      this.say(`Las ruinas esconden un saber antiguo: ${t.name} (gratis).`, "good");
      if (t.effect.type === "unlock") this._upgradeUnits(unit.ownerId);
    } else {
      const dmg = Math.min(unit.currentHp - 1, 40);
      unit.applyDamage(dmg);
      this.emit("damage", { entity: unit, amount: dmg });
      this.say(`¡Una trampa en las ruinas! ${unit.name} pierde ${dmg} HP.`, "bad");
    }
  }

  /** Deshace el último movimiento si la unidad aún no ha actuado */
  undoMove(unit) {
    if (!unit.hasMoved || unit.hasActed || !unit.lastMove || unit.pickedThisMove) return false;
    this.grid.clearUnit(unit.x, unit.y);
    unit.x = unit.lastMove.x; unit.y = unit.lastMove.y;
    this.grid.setUnit(unit.x, unit.y, unit.instanceId);
    unit.hasMoved = false;
    unit.lastMove = null;
    this.emit("teleport", { unit });
    this.updateVision(unit.ownerId);
    return true;
  }

  waitUnit(unit) {
    unit.hasActed = true;
    unit.hasMoved = true;
    this.emit("change");
  }

  // ------------------------------------------------------------------ asedio montado
  canDeploy(unit) {
    return !!unit.template.abilities?.includes("deploy") && !unit.hasActed;
  }

  toggleDeploy(unit) {
    if (!this.canDeploy(unit)) return false;
    unit.deployed = !unit.deployed;
    unit.hasActed = true; unit.hasMoved = true;
    this.say(unit.deployed
      ? `${unit.name} queda montada: ya puede disparar, pero no moverse.`
      : `${unit.name} se desmonta para poder moverse.`, "info");
    this.emit("power", { hero: unit });
    this.emit("change");
    return true;
  }

  // ------------------------------------------------------------------ modificadores
  _techTargets(effect, unit) {
    const tgt = effect.target;
    if (tgt == null || tgt === "all") return true;
    const list = Array.isArray(tgt) ? tgt : [tgt];
    const cat = unit.template.category;
    return list.some(t => t === unit.templateId || t === cat
      || (t === "infantry" && cat === "spear") || (t === "ranged" && cat === "skirmish"));
  }

  _techEraOk(effect, unit) {
    return effect.era == null || unit.template.era === effect.era;
  }

  hasTechEffect(ownerId, type, unit) {
    for (const id of this.players[ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === type && (!unit || this._techTargets(e, unit))) return true;
    }
    return false;
  }

  /** Suma de % de ataque para `att` situado en `pos` golpeando a `target` */
  attackModifier(att, pos, target) {
    if (att.kind === "building") return 0;
    let mod = 0;
    const p = this.players[att.ownerId];
    if (!p) return 0;
    const hb = this.houseBonus(att.ownerId);
    if (hb && hb.type === "attack" && this._houseHits(hb, att)) mod += hb.value;
    // Los héroes no se quedan atrás: la tropa de línea sube de 100 a 250 de
    // ataque entre la era 1 y la 4, y un Aquiles de cifras fijas acababa por
    // debajo de un campeón cualquiera. Crecen con la guerra, como ella.
    if (att.isHero?.()) mod += HERO_ERA_ATTACK * (p.era - 1);
    for (const id of p.techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type !== "unitAttack" || !this._techTargets(e, att) || !this._techEraOk(e, att)) continue;
      if (e.vs === "building" && target.kind !== "building") continue;
      if (e.minRange && (att.template.range || 1) < e.minRange) continue;
      mod += e.value;
    }
    const terrain = this.grid.terrainAt(pos.x, pos.y);
    if (att.template.abilities?.includes("plainsCharge") && terrain.chariotChargeBonus) mod += 0.33;
    if (att.template.abilities?.includes("desertCharge") && terrain.desertChargeBonus) mod += 0.33;
    // leñador: pega más dentro del bosque, atacando y defendiendo
    if (att.template.abilities?.includes("woodsman") && terrain.id === "forest") mod += 0.33;
    // andanada: mientras le quede más de la mitad de la vida, dispara en masa
    if (att.template.abilities?.includes("volley") && att.currentHp > att.maxHp * 0.5) mod += 0.25;
    if (att.template.category === "chariot" && terrain.desertChargeBonus) mod += 0.15;
    // los camellos espantan a los caballos: el carro que los tiene delante
    // pega con menos ganas, atacando y defendiendo
    if (att.template.category === "chariot" && target?.template?.abilities?.includes("scaresHorses")
      && !att.template.abilities?.includes("noScare")) mod -= 0.25;
    // causar miedo: quien lo tiene delante pega con menos ganas, siempre
    if (target?.template?.abilities?.includes("causeFear")) mod -= 0.2;
    // fuego rápido: dispara el doble de veces, así que vale por dos
    if (att.template.abilities?.includes("rapidFire")) mod += 1;
    if (att.template.abilities?.includes("antiChariot") && target.kind === "unit" && target.template.category === "chariot") mod += 0.83;

    for (const h of this.heroesOf(att.ownerId)) {
      if (h === att) continue;
      const adj = Math.max(Math.abs(h.x - pos.x), Math.abs(h.y - pos.y)) === 1;
      const inSight = Math.abs(h.x - pos.x) + Math.abs(h.y - pos.y) <= h.template.sight;
      // La furia de Aquiles arrastra a la línea de choque, no a los arqueros:
      // es el espejo del favor de Afrodita, que solo levanta a los de lejos.
      if (h.templateId === "achilles" && inSight && h.currentHp > h.maxHp * 0.5
        && !["ranged", "skirmish", "siege"].includes(att.template.category)) mod += 0.33;
      if (h.templateId === "hector" && adj) mod += 0.25;
      if (h.templateId === "paris" && inSight && ["ranged", "skirmish"].includes(att.template.category)) mod += 0.33;
      if (h.templateId === "odysseus" && adj && (att.template.range || 1) > 1) mod += 0.25;
    }
    return mod;
  }

  defenseModifier(def, pos, attacker) {
    let mod = 0;
    const p = this.players[def.ownerId];
    if (!p) return 0; // aldeas neutrales
    const hb = this.houseBonus(def.ownerId);
    if (hb && hb.type === "buildingDefense" && def.kind === "building") mod += hb.value;
    if (def.isHero?.()) mod += HERO_ERA_DEFENSE * (p.era - 1);
    if (hb && hb.type === "defense" && def.kind === "unit" && this._houseHits(hb, def)) mod += hb.value;
    if (def.kind === "building") {
      for (const id of p.techs) {
        const e = TECHNOLOGIES[id].effect;
        if (e.type === "buildingDefense" && (e.target === "all" || e.target === def.template.id || (e.target === "citadel" && def.template.isCapital))) mod += e.value;
        if (e.type === "campDefense" && def.template.isCapital) mod += e.value;
      }
      return mod;
    }
    for (const id of p.techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "unitDefense" && this._techTargets(e, def) && this._techEraOk(e, def)) mod += e.value;
    }
    const tile = this.grid.getTile(pos.x, pos.y);
    const terrain = getTerrain(tile.terrain);
    if (def.template.category !== "chariot" || terrain.defenseMod < 0) mod += terrain.defenseMod;
    // en un puente no hay dónde cubrirse de flechas y piedras
    if (terrain.isBridge && attacker && Math.abs(attacker.x - pos.x) + Math.abs(attacker.y - pos.y) > 1) mod -= 0.35;
    // Defensa por estar dentro de un edificio tuyo, con las cifras del
    // original: +40% en castillo y torre (como la montaña), +10% en una
    // granja, +20% en todo lo demás.
    const b = tile.building ? this.buildings.get(tile.building) : null;
    if (b && b.isAlive() && b.ownerId === def.ownerId) {
      mod += b.template.isWall ? 0.4
        : (b.template.outpost || b.template.towerCorner) ? 0.4
          : b.template.id === "farm" ? 0.1
            : 0.2;
    }
    if (attacker?.kind === "unit" && def.template.abilities?.includes("antiChariot") && attacker.template.category === "chariot") mod += 0.83;

    // causar miedo: el que ataca a un elefante o a un celta se encoge también
    if (attacker?.template?.abilities?.includes("causeFear") && def.kind === "unit") mod -= 0.15;
    for (const h of this.heroesOf(def.ownerId)) {
      if (h === def) continue;
      const adj = Math.max(Math.abs(h.x - pos.x), Math.abs(h.y - pos.y)) === 1;
      const inSight = Math.abs(h.x - pos.x) + Math.abs(h.y - pos.y) <= h.template.sight;
      if (h.templateId === "hector" && inSight) mod += 0.20;
      if (h.templateId === "paris" && adj) mod += 0.33;
    }
    for (const h of this.heroesOf(this.opponentOf(def.ownerId))) {
      if (h.templateId === "odysseus" && Math.abs(h.x - pos.x) + Math.abs(h.y - pos.y) <= h.template.sight) mod -= 0.15;
    }
    return mod;
  }

  sightOf(entity) {
    let s = entity.template.sight || 3;
    if (!this.players[entity.ownerId]) return s; // aldeas neutrales
    if (entity.kind === "building") {
      if (entity.template.isCapital) {
        for (const id of this.players[entity.ownerId].techs) {
          const e = TECHNOLOGIES[id].effect;
          if (e.type === "sight" && e.target === "camp") s += e.value;
          if (e.type === "campDefense" && e.sight) s += e.sight;
        }
      }
      return s;
    }
    for (const id of this.players[entity.ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "sight" && e.target !== "camp" && this._techTargets(e, entity)) s += e.value;
    }
    for (const h of this.heroesOf(entity.ownerId)) {
      if (h !== entity && h.templateId === "odysseus" && Math.max(Math.abs(h.x - entity.x), Math.abs(h.y - entity.y)) === 1) s += 2;
    }
    return s;
  }

  updateVision(ownerId) {
    const p = this.players[ownerId];
    p.visible.fill(0);
    const W = this.grid.width;
    const mark = (e) => {
      for (const t of this.grid.getVisibleTiles(e.x, e.y, this.sightOf(e))) {
        p.visible[t.y * W + t.x] = 1;
        p.explored[t.y * W + t.x] = 1;
      }
    };
    this.unitsOf(ownerId).forEach(mark);
    this.buildingsOf(ownerId).forEach(mark);
    if (this.hasTechEffect(ownerId, "revealEnemyCamps")) {
      for (const b of this.capitals(this.opponentOf(ownerId))) p.explored[b.y * W + b.x] = 1;
    }
  }

  // ------------------------------------------------------------------ ataque
  /** Objetivos que `unit` puede atacar desde `pos` */
  getTargets(unit, pos = unit) {
    if (unit.hasActed || !(unit.template.attack > 0)) return [];
    // una máquina de asedio solo dispara montada
    if (unit.template.abilities?.includes("deploy") && !unit.deployed) return [];
    if (unit.hasMoved && unit.template.abilities?.includes("noMoveAndAttack") && (pos.x !== unit.lastMove?.x || pos.y !== unit.lastMove?.y)) return [];
    const r = attackRangeOf(this, unit, pos.x, pos.y);
    const out = [];
    for (const t of this.grid.tilesInRange(pos.x, pos.y, r.max, r.min)) {
      const u = this.unitAt(t.x, t.y);
      if (u && u.ownerId !== unit.ownerId && this.isVisible(unit.ownerId, t.x, t.y)) {
        if (!unit.template.abilities?.includes("buildingsOnly")) out.push(u);
        continue;
      }
      if (unit.template.abilities?.includes("unitsOnly")) continue;
      const b = this.buildingAt(t.x, t.y);
      if (b && b.ownerId !== unit.ownerId && !u) out.push(b);
    }
    return out;
  }

  /** Objetivos alcanzables moviéndose primero (para marcar casillas rojas) */
  getThreatTiles(unit, reach) {
    const tiles = new Map();
    const moveAttack = !unit.template.abilities?.includes("noMoveAndAttack");
    const origins = moveAttack ? [...reach.values()] : [{ x: unit.x, y: unit.y }];
    for (const o of origins) {
      const r = attackRangeOf(this, unit, o.x, o.y);
      for (const t of this.grid.tilesInRange(o.x, o.y, r.max, r.min)) tiles.set(`${t.x},${t.y}`, t);
    }
    return tiles;
  }

  predictAttack(unit, target, pos = unit) {
    return resolveCombat(this, unit, target, { attPos: pos, apply: false });
  }

  attack(unit, target) {
    if (unit.hasActed || unit.ownerId !== this.current.id) return null;
    if (!this.getTargets(unit).includes(target)) return null;
    const result = resolveCombat(this, unit, target, { apply: true });
    unit.hasActed = true; unit.hasMoved = true;
    this.emit("attack", { attacker: unit, target, result });
    const tName = target.name;
    this.say(`${unit.name} ataca a ${tName}: −${result.targetDamageTaken}${result.counter ? ` · contraataque −${result.attackerDamageTaken}` : ""}${result.defenderFirst ? " (primer golpe del defensor)" : ""}`,
      unit.ownerId === "greek" ? "greek" : "trojan");
    if (result.attackerRibbon) this.say(`${unit.name} gana una cinta de veteranía (+15%).`, "good");
    if (result.targetRibbon && target.isAlive()) this.say(`${tName} gana una cinta de veteranía (+15%).`, "good");
    for (const s of result.splash) this.emit("damage", { entity: s.unit, amount: s.damage });
    this._cleanupDead(unit.ownerId);
    return result;
  }

  _cleanupDead(killerOwner) {
    for (const u of [...this.units.values()]) {
      if (u.currentHp > 0) continue;
      this.units.delete(u.instanceId);
      this.grid.clearUnit(u.x, u.y);
      this.players[u.ownerId].stats.lost++;
      if (u.relic) { const t = this.grid.getTile(u.x, u.y); if (!t.pickup) t.pickup = "relic"; this.emit("terrain"); }
      if (killerOwner && killerOwner !== u.ownerId && this.players[killerOwner]) this.players[killerOwner].stats.kills++;
      if (u.isHero()) {
        this.killedHeroes.add(u.templateId);
        this.players[u.ownerId].deadHeroes[u.templateId] = this.round;
        this.say(`¡Ha caído ${u.name}! Podrá volver desde el campamento en ${HERO_REVIVE_DELAY} turnos.`, "bad");
      } else {
        this.say(`${u.name} (${FACTIONS[u.ownerId].name}) ha caído.`, "muted");
      }
      this.emit("death", { entity: u });
    }
    for (const b of [...this.buildings.values()]) {
      if (b.currentHp > 0) continue;
      this.buildings.delete(b.instanceId);
      const tile = this.grid.getTile(b.x, b.y);
      tile.building = null;
      if (b.template.id === "wonder" && this.players[b.ownerId].wonder?.id === b.instanceId) {
        this.players[b.ownerId].wonder = null;
        this.say("¡La Maravilla ha sido derribada!", "era");
      }
      if (b.template.isWall) {
        tile.terrain = "rubble";
        this.say(`¡Brecha en la muralla de Troya!`, "good");
      } else if (b.template.isCapital) {
        tile.terrain = "rubble";
        tile.campRuins = true;
        this.say(`${b.name} (${FACTIONS[b.ownerId].name}) ha caído. Un colono puede fundar un campamento sobre sus ruinas y capturar lo que quede alrededor.`, "bad");
      } else {
        this.say(`${b.name} (${FACTIONS[b.ownerId].name}) ha sido destruido.`, "bad");
      }
      this.emit("death", { entity: b });
      this.emit("terrain");
    }
    for (const id of this.order) this.updateVision(id);
    this.checkVictory();
  }

  // ------------------------------------------------------------------ colonos y edificios
  /**
   * Como en el original, el colono levanta el edificio EN LA CASILLA DONDE
   * ESTÁ PARADO: se mueve hasta el trigal, el yacimiento o el hueco del
   * molino y construye ahí mismo.
   */
  buildOptions(villager) {
    if (!villager.template.abilities?.includes("build") || villager.hasActed) return [];
    const p = this.players[villager.ownerId];
    const out = [];
    const caps = this.capitals(villager.ownerId);
    const allCaps = [...this.buildings.values()].filter(b => b.isAlive() && b.template.isCapital);
    const hasWonder = this.buildingsOf(villager.ownerId).some(b => b.template.id === "wonder");
    for (const n of [{ x: villager.x, y: villager.y }]) {
      const tile = this.grid.getTile(n.x, n.y);
      if (tile.building) continue;
      const terrain = getTerrain(tile.terrain);
      const slot = caps.some(c => Math.abs(c.x - n.x) + Math.abs(c.y - n.y) === 1);
      const corner = caps.some(c => Math.abs(c.x - n.x) === 1 && Math.abs(c.y - n.y) === 1);
      for (const b of Object.values(BUILDINGS)) {
        if (!b.cost || b.scenarioOnly || b.era > p.era) continue;
        if (b.id === "wonder" && hasWonder) continue;
        if (b.id === "camp") {
          // nuevo campamento: sobre ruinas de uno enemigo, o lejos de los demás
          const far = allCaps.every(c => Math.abs(c.x - n.x) + Math.abs(c.y - n.y) >= 4);
          if (!(tile.campRuins || (far && terrain.buildable && !tile.deposit))) continue;
        } else if (b.requiresDeposit) {
          const necesita = typeof b.requiresDeposit === "string" ? b.requiresDeposit : "bronze";
          if (tile.deposit !== necesita) continue;
        } else {
          if (tile.deposit || !(b.terrain ? b.terrain.includes(tile.terrain) : terrain.buildable)) continue;
          if (b.townSlot && !slot) continue;      // edificios de ciudad: pegados al campamento
          if (b.towerCorner && !corner) continue; // torres: en las esquinas del campamento
          // el castillo es una base avanzada: no se pega a la ciudad, y solo
          // uno cada cierta distancia, como en el original
          if (b.outpost) {
            if (slot || corner) continue;
            const cerca = this.buildingsOf(villager.ownerId)
              .some(o => o.template.outpost && Math.abs(o.x - n.x) + Math.abs(o.y - n.y) < 6);
            if (cerca) continue;
          }
          // las granjas solo nacen pegadas a un molino propio ya terminado
          if (b.requiresMill && !this.millAt(n.x, n.y, villager.ownerId)) continue;
          // el puerto necesita mar abierto al lado para botar las naves
          if (b.coastal && !this.grid.getOrthogonalNeighbors(n.x, n.y).some(w => {
            const t2 = this.grid.terrainAt(w.x, w.y);
            return t2 && t2.isWater && !t2.isBridge;
          })) continue;
        }
        out.push({ x: n.x, y: n.y, building: b, cost: this.buildingCost(villager.ownerId, b) });
      }
    }
    return out;
  }

  /** Molino propio terminado pegado a esta casilla (las granjas cuelgan de él) */
  millAt(x, y, ownerId) {
    for (const n of this.grid.getOrthogonalNeighbors(x, y)) {
      const b = this.buildingAt(n.x, n.y);
      if (b && b.ownerId === ownerId && b.template.id === "mill" && !b.underConstruction) return b;
    }
    return null;
  }

  /** Huecos de granja que le quedan a un molino (máximo 4, uno por lado) */
  millSlots(mill) {
    return this.grid.getOrthogonalNeighbors(mill.x, mill.y).filter(n => {
      const t = this.grid.getTile(n.x, n.y);
      if (!t || t.building || t.unit || t.deposit) return false;
      const terr = getTerrain(t.terrain);
      return terr.buildable && !terr.isRoad;
    });
  }

  /** Casillas libres alrededor de los campamentos propios ("slot" pegadas, "corner" esquinas) */
  townSlots(ownerId, kind = "slot") {
    const out = [];
    for (const c of this.capitals(ownerId)) {
      const around = kind === "slot"
        ? this.grid.getOrthogonalNeighbors(c.x, c.y)
        : this.grid.getAllNeighbors(c.x, c.y).filter(n => n.x !== c.x && n.y !== c.y);
      for (const n of around) {
        const t = this.grid.getTile(n.x, n.y);
        if (!t.building && !t.deposit && getTerrain(t.terrain).buildable) out.push(n);
      }
    }
    return out;
  }

  buildingCost(ownerId, b) {
    let mult = 1;
    for (const id of this.players[ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "buildingCost") mult += e.value;
    }
    return { grain: Math.round(b.cost.grain * mult), bronze: Math.round(b.cost.bronze * mult) };
  }

  canAfford(ownerId, cost) {
    const p = this.players[ownerId];
    return p.grain >= (cost.grain || 0) && p.bronze >= (cost.bronze || 0);
  }
  pay(ownerId, cost) {
    const p = this.players[ownerId];
    p.grain -= cost.grain || 0; p.bronze -= cost.bronze || 0;
  }

  build(villager, x, y, buildingId) {
    const opt = this.buildOptions(villager).find(o => o.x === x && o.y === y && o.building.id === buildingId);
    if (!opt || !this.canAfford(villager.ownerId, opt.cost)) return null;
    this.pay(villager.ownerId, opt.cost);
    const tile = this.grid.getTile(x, y);
    const onRuins = buildingId === "camp" && tile.campRuins;
    const b = this.placeBuilding(buildingId, villager.ownerId, x, y, true);
    villager.hasActed = true; villager.hasMoved = true;
    this.players[villager.ownerId].stats.built++;
    const turns = opt.building.buildTurns || 1;
    this.say(`Colono empieza ${opt.building.name}. ${turns > 1 ? `Tardará ${turns} turnos.` : "Estará listo el próximo turno."}`, "info");
    if (onRuins) {
      tile.campRuins = false;
      // capturar los edificios enemigos que rodeaban el campamento caído
      let n = 0;
      for (const e of this.buildings.values()) {
        if (!e.isAlive() || e.ownerId === villager.ownerId || e.template.isCapital || e.template.isWall) continue;
        if (Math.abs(e.x - x) + Math.abs(e.y - y) <= 2) { e.ownerId = villager.ownerId; n++; }
      }
      if (n) this.say(`¡Sobre las ruinas capturas ${n} edificio(s) enemigo(s)!`, "good");
    }
    this.emit("build", { building: b });
    this.emit("terrain");
    this.updateVision(villager.ownerId);
    return b;
  }

  /** Colono repara un edificio propio adyacente (+60 HP) */
  repairTargets(villager) {
    if (!villager.template.abilities?.includes("build") || villager.hasActed) return [];
    return this.grid.getOrthogonalNeighbors(villager.x, villager.y)
      .map(n => this.buildingAt(n.x, n.y))
      .filter(b => b && b.ownerId === villager.ownerId && b.currentHp < b.maxHp);
  }
  /**
   * Lo que cuesta dejar un edificio como nuevo: el porcentaje de vida que le
   * falta, aplicado a su precio. Reparar a medias no existe, como en el
   * original: o lo dejas entero, o no lo tocas.
   */
  repairCost(b) {
    const falta = 1 - b.currentHp / b.maxHp;
    const base = this.buildingCost(b.ownerId, b.template);
    return {
      grain: Math.round((base.grain || 0) * falta),
      bronze: Math.round((base.bronze || 0) * falta)
    };
  }

  repair(villager, b) {
    if (!this.repairTargets(villager).includes(b)) return false;
    if (b.currentHp >= b.maxHp) return false;
    const cost = this.repairCost(b);
    if (!this.canAfford(villager.ownerId, cost)) {
      this.say(`Reparar ${b.name} cuesta ${cost.grain} de grano y ${cost.bronze} de bronce.`, "bad");
      return false;
    }
    this.pay(villager.ownerId, cost);
    const healed = b.maxHp - b.currentHp;
    b.currentHp = b.maxHp;
    villager.hasActed = true; villager.hasMoved = true;
    this.emit("heal", { entity: b, amount: healed });
    this.say(`${b.name} reparado del todo (+${healed}) por ${cost.grain}/${cost.bronze}.`, "good");
    return true;
  }

  // ------------------------------------------------------------------ sacerdotes
  supportTargets(priest) {
    if (!priest.template.abilities?.includes("heal") || priest.hasActed) return [];
    return this.grid.getAllNeighbors(priest.x, priest.y).map(n => this.unitAt(n.x, n.y)).filter(u => u && u.ownerId === priest.ownerId);
  }
  healUnit(priest, target) {
    if (!this.supportTargets(priest).includes(target)) return false;
    // como en el original, el de élite cura bastante más
    let amount = priest.template.abilities?.includes("improvedHeal") ? 45 : 30;
    if (this.hasTechEffect(priest.ownerId, "healBoost")) amount = Math.round(amount * 1.15 + 5);
    const healed = target.heal(amount);
    priest.hasActed = true; priest.hasMoved = true;
    this.emit("heal", { entity: target, amount: healed });
    this.say(`${priest.name} cura a ${target.name} (+${healed}).`, "good");
    return true;
  }
  inspireUnit(priest, target) {
    if (!this.supportTargets(priest).includes(target) || target.hasActed) return false;
    let v = 0.25;
    if (this.hasTechEffect(priest.ownerId, "inspireBoost")) v += 0.15;
    target.applyTempBuff("attack", v);
    priest.hasActed = true; priest.hasMoved = true;
    this.emit("buff", { entity: target });
    this.say(`${priest.name} inspira a ${target.name} (+${Math.round(v * 100)}% ataque este turno).`, "good");
    return true;
  }

  /** Enemigos vecinos que un sacerdote puede intentar convertir (no héroes ni edificios) */
  convertTargets(priest) {
    if (!priest.template.abilities?.includes("convert") || priest.hasActed) return [];
    return this.grid.getOrthogonalNeighbors(priest.x, priest.y).map(n => this.unitAt(n.x, n.y))
      .filter(u => u && u.ownerId !== priest.ownerId && !u.isHero());
  }

  /** Probabilidad de conversión: más fácil cuanto más herido esté el objetivo */
  convertChance(priest, target) {
    let c = 0.3 + 0.4 * (1 - target.currentHp / target.maxHp);
    if (this.hasTechEffect(priest.ownerId, "inspireBoost")) c += 0.15;
    if (target.template.category === "siege") c += 0.1;
    return Math.min(0.9, c);
  }

  convertUnit(priest, target) {
    if (!this.convertTargets(priest).includes(target)) return null;
    priest.hasActed = true; priest.hasMoved = true;
    const ok = Math.random() < this.convertChance(priest, target);
    if (ok && this.unitsOf(priest.ownerId).length < this.popCap(priest.ownerId)) {
      const from = target.ownerId;
      target.ownerId = priest.ownerId;
      target.hasActed = true; target.hasMoved = true;
      this.players[from].stats.lost++;
      this.say(`¡${priest.name} convence a ${target.name} de cambiar de bando!`, "good");
      this.emit("power", { hero: target });
      for (const id of this.order) this.updateVision(id);
    } else {
      this.say(`${target.name} no escucha a ${priest.name}.`, "muted");
      this.emit("power", { hero: priest });
    }
    this.emit("change");
    return ok;
  }

  /** Templos propios pegados a un sacerdote que lleva una reliquia */
  relicTemples(priest) {
    if (!priest.relic || priest.hasActed) return [];
    return this.grid.getOrthogonalNeighbors(priest.x, priest.y).map(n => this.buildingAt(n.x, n.y))
      .filter(b => b && b.ownerId === priest.ownerId && b.template.id === "temple" && !b.underConstruction);
  }

  offerRelic(priest, temple) {
    if (!this.relicTemples(priest).includes(temple)) return false;
    priest.relic = false;
    temple.relics = (temple.relics || 0) + 1;
    priest.hasActed = true; priest.hasMoved = true;
    this.say(`${priest.name} deposita la reliquia en el Templo: +${RELIC_INCOME} de bronce por turno.`, "good");
    this.emit("power", { hero: priest });
    this.emit("change");
    return true;
  }

  /** Mercado del campamento: contratar un mercenario (uno por turno, desde la era 2) */
  mercenaryCost() { return { grain: 0, bronze: UNITS.mercenary.cost.bronze }; }
  /**
   * Los tres mercenarios que hay hoy en el mercado. Como en el original, se
   * sortean cada día y no piden ni edificio ni investigación: solo bronce.
   * El sorteo depende del turno y del bando, así que es el mismo para los dos
   * jugadores dentro de una partida y se puede volver a calcular sin guardarlo.
   */
  mercenaryOffer(ownerId) {
    const p = this.players[ownerId];
    if (p.era < MERCENARY_ERA) return [];
    const pool = Object.values(UNITS).filter(u => u.mercenary && u.era <= p.era && !u.upgradeOf);
    // las de élite solo aparecen como mejora de su base, nunca sueltas
    const raices = pool.filter(u => Object.values(UNITS).every(o => o.upgradeTo !== u.id));
    if (!raices.length) return [];
    // baraja determinista: misma oferta si vuelves a abrir el mercado
    let semilla = (this.round * 2654435761 + (ownerId === "greek" ? 11 : 97)) >>> 0;
    const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
    const barajado = raices.slice();
    for (let i = barajado.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [barajado[i], barajado[j]] = [barajado[j], barajado[i]];
    }
    return barajado.slice(0, 3).map(u => {
      const id = this.lineTop(u.id, ownerId);
      return { unitId: id, template: UNITS[id], cost: UNITS[id].cost };
    });
  }

  canHireMercenary(ownerId, unitId = null) {
    const p = this.players[ownerId];
    if (ownerId !== this.current.id || p.era < MERCENARY_ERA || p.mercenaryThisTurn) return false;
    if (this.unitsOf(ownerId).length >= this.popCap(ownerId) || !this.capitals(ownerId).length) return false;
    const oferta = this.mercenaryOffer(ownerId);
    if (!oferta.length) return false;
    const elegido = unitId ? oferta.find(o => o.unitId === unitId) : oferta.find(o => this.canAfford(ownerId, o.cost));
    return !!elegido && this.canAfford(ownerId, elegido.cost);
  }

  hireMercenary(ownerId, unitId = null) {
    const oferta = this.mercenaryOffer(ownerId);
    const elegido = unitId ? oferta.find(o => o.unitId === unitId) : oferta.find(o => this.canAfford(ownerId, o.cost));
    if (!elegido || !this.canHireMercenary(ownerId, elegido.unitId)) return null;
    const cap = this.capitals(ownerId).find(c => this.freeSpotNear(c.x, c.y, 2, ownerId));
    if (!cap) return null;
    const spot = this.freeSpotNear(cap.x, cap.y, 2, ownerId);
    this.pay(ownerId, elegido.cost);
    const u = this.spawnUnit(elegido.unitId, ownerId, spot.x, spot.y);
    u.hasActed = true; u.hasMoved = true;
    this.players[ownerId].mercenaryThisTurn = true;
    this.say(elegido.template.name + " se une a tu ejército por " + elegido.cost.bronze + " de bronce.", "info");
    this.emit("spawn", { unit: u });
    this.updateVision(ownerId);
    return u;
  }

  // ------------------------------------------------------------------ héroes
  /** Poderes que se activan con botón este turno */
  heroActions(hero) {
    if (!hero.isHero() || hero.powerUsed) return [];
    hero.cooldowns = hero.cooldowns || {};
    const onCapital = this.capitals(hero.ownerId).some(b => b.x === hero.x && b.y === hero.y);
    const out = [];
    for (const p of hero.template.heroPowers) {
      if ((hero.cooldowns[p.id] || 0) > this.round) continue;
      if (p.id === "wrathOfAchilles") {
        const targets = this.grid.getAllNeighbors(hero.x, hero.y).map(n => this.unitAt(n.x, n.y)).filter(u => u && u.ownerId !== hero.ownerId);
        if (targets.length) out.push({ power: p, targets });
      }
      if (p.id === "rallyTheWalls") {
        const allies = [hero, ...this.grid.getAllNeighbors(hero.x, hero.y).map(n => this.unitAt(n.x, n.y)).filter(u => u && u.ownerId === hero.ownerId)];
        if (allies.some(u => u.currentHp < u.maxHp)) out.push({ power: p, targets: null });
      }
      if (p.id === "achillesHeelShot") {
        const r = attackRangeOf(this, hero);
        const targets = this.grid.tilesInRange(hero.x, hero.y, r.max, 1).map(t => this.unitAt(t.x, t.y))
          .filter(u => u && u.ownerId !== hero.ownerId && u.isHero() && this.isVisible(hero.ownerId, u.x, u.y));
        if (targets.length) out.push({ power: p, targets });
      }
      if (p.id === "trojanHorseGambit" && onCapital) out.push({ power: p, targets: null });
    }
    return out;
  }

  usePower(hero, powerId, target = null) {
    const action = this.heroActions(hero).find(a => a.power.id === powerId);
    if (!action) return false;
    if (action.targets && !action.targets.includes(target)) return false;
    hero.powerUsed = true;
    hero.cooldowns[powerId] = this.round + (POWER_COOLDOWN[powerId] || 1);
    if (powerId === "wrathOfAchilles" || powerId === "achillesHeelShot") {
      const dmg = Math.min(target.currentHp, powerId === "wrathOfAchilles" ? 30 : 25);
      target.applyDamage(dmg);
      this.emit("power", { hero, target, amount: dmg });
      this.emit("damage", { entity: target, amount: dmg });
      this.say(`${action.power.name}: ${target.name} recibe ${dmg} de daño.`, "good");
      this._cleanupDead(hero.ownerId);
    } else if (powerId === "rallyTheWalls") {
      const allies = [hero, ...this.grid.getAllNeighbors(hero.x, hero.y).map(n => this.unitAt(n.x, n.y)).filter(u => u && u.ownerId === hero.ownerId)];
      for (const u of allies) { const h = u.heal(15); if (h) this.emit("heal", { entity: u, amount: h }); }
      this.say(`${action.power.name}: Héctor y los suyos recuperan 15 HP.`, "good");
    } else if (powerId === "trojanHorseGambit") {
      this.players[hero.ownerId].bronze += 100;
      this.emit("power", { hero });
      this.say(`${action.power.name}: +100 de bronce al tesoro.`, "good");
    }
    this.emit("change");
    return true;
  }

  /** Descuento de coste por héroes sobre un campamento (Aquiles / Paris) */
  heroCostDiscount(ownerId) {
    const caps = this.capitals(ownerId);
    const on = this.heroesOf(ownerId).filter(h => caps.some(c => c.x === h.x && c.y === h.y));
    return on.some(h => h.templateId === "achilles" || h.templateId === "paris") ? 20 : 0;
  }
  researchDiscount(ownerId) {
    const caps = this.capitals(ownerId);
    return this.heroesOf(ownerId).some(h => h.templateId === "hector" && caps.some(c => c.x === h.x && c.y === h.y)) ? 50 : 0;
  }

  // Caballo de Troya: pegado a la muralla, suelta a sus guerreros dentro
  horseTargets(unit) {
    if (!unit.template.abilities?.includes("trojanHorseInfiltration") || unit.hasActed) return [];
    return this.grid.getOrthogonalNeighbors(unit.x, unit.y).map(n => this.buildingAt(n.x, n.y)).filter(b => b && b.template.isWall && b.ownerId !== unit.ownerId);
  }
  infiltrate(unit, wall) {
    if (!this.horseTargets(unit).includes(wall)) return false;
    const dx = wall.x - unit.x, dy = wall.y - unit.y;
    const inside = { x: wall.x + dx, y: wall.y + dy };
    const troop = this.lineTop("recruit", unit.ownerId);
    const placed = [];
    for (let i = 0; i < 3; i++) {
      const s = this.freeSpotNear(inside.x, inside.y, 3, unit.ownerId);
      if (!s) break;
      const u = this.spawnUnit(troop, unit.ownerId, s.x, s.y);
      u.hasActed = true; u.hasMoved = true;
      placed.push(u);
    }
    this.units.delete(unit.instanceId);
    this.grid.clearUnit(unit.x, unit.y);
    this.emit("death", { entity: unit, silent: true });
    this.say(`¡El Caballo de Troya se abre! ${placed.length} guerreros aparecen tras la muralla.`, "good");
    for (const u of placed) this.emit("spawn", { unit: u });
    this.updateVision(unit.ownerId);
    return true;
  }

  // ------------------------------------------------------------------ producción
  lineTop(rootId, ownerId) {
    let id = rootId;
    for (;;) {
      const next = UNITS[id].upgradeTo;
      if (!next) break;
      const t = UNITS[next];
      if (t.era > this.players[ownerId].era) break;
      if (t.requiresTech && !this.hasTech(ownerId, t.requiresTech)) break;
      id = next;
    }
    return id;
  }

  unitCost(ownerId, template) {
    let g = template.cost.grain, br = template.cost.bronze;
    for (const id of this.players[ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "unitCost" && this._techTargets(e, { template, templateId: template.id })) { g += e.grain; br += e.bronze; }
    }
    const d = this.heroCostDiscount(ownerId);
    return { grain: Math.max(0, g - d), bronze: Math.max(0, br - d) };
  }

  recruitOptions(building) {
    if (building.underConstruction || building.producedThisTurn || building.ownerId !== this.current.id) return [];
    const p = this.players[building.ownerId];
    const out = [];
    for (const root of building.template.produces || []) {
      const t0 = UNITS[root];
      if (t0.era > p.era) continue;
      if (t0.requiresTech && !this.hasTech(building.ownerId, t0.requiresTech)) continue;
      if (t0.faction !== "any" && t0.faction !== building.ownerId) continue;
      if (t0.house && t0.house !== p.house) continue; // unidad única de otra casa
      if (t0.unique && this.unitsOf(building.ownerId).some(u => u.templateId === root)) continue;
      const id = this.lineTop(root, building.ownerId);
      const t = UNITS[id];
      out.push({ unitId: id, template: t, cost: this.unitCost(building.ownerId, t) });
    }
    if (building.template.isCapital) {
      for (const [heroId, diedAt] of Object.entries(p.deadHeroes)) {
        const ready = this.round - diedAt >= HERO_REVIVE_DELAY;
        out.push({ unitId: heroId, template: HEROES[heroId], cost: HERO_REVIVE_COST, hero: true, ready, readyIn: HERO_REVIVE_DELAY - (this.round - diedAt) });
      }
    }
    return out;
  }

  recruit(building, unitId) {
    const opt = this.recruitOptions(building).find(o => o.unitId === unitId);
    if (!opt || (opt.hero && !opt.ready) || !this.canAfford(building.ownerId, opt.cost)) return null;
    if (this.unitsOf(building.ownerId).length >= this.popCap(building.ownerId)) { this.say(`Límite de población alcanzado (${this.popCap(building.ownerId)}).`, "bad"); return null; }
    // La unidad sale DEL edificio, en su misma casilla: igual que el colono
    // construye donde está parado. Si hay alguien ahí dentro, hay que sacarlo
    // antes de entrenar al siguiente.
    let spot = null;
    if (!this.unitAt(building.x, building.y)) {
      spot = { x: building.x, y: building.y };
    } else {
      // si hay alguien dentro, sale pegado al edificio antes que no salir
      spot = this.freeSpotNear(building.x, building.y, 2, building.ownerId, opt.template);
      if (!spot) { this.say("No hay sitio libre junto al edificio.", "bad"); return null; }
    }
    this.pay(building.ownerId, opt.cost);
    const u = this.spawnUnit(unitId, building.ownerId, spot.x, spot.y);
    u.hasActed = true; u.hasMoved = true;
    building.producedThisTurn = true;
    if (opt.hero) delete this.players[building.ownerId].deadHeroes[unitId];
    this.say(`${building.name} entrena: ${u.name}.`, "info");
    this.emit("spawn", { unit: u });
    this.updateVision(building.ownerId);
    return u;
  }

  /** En el asedio, una ciudad bloqueada no puede sostener un ejército tan grande */
  popCap(ownerId) {
    // como en AoK DS, el ejército que puedes mantener depende de lo que ingresas
    // (las reliquias no cuentan). En el asedio, Troya bloqueada mantiene menos.
    const inc = this.income(ownerId, false);
    let cap = 8 + Math.floor((inc.grain + inc.bronze) / 30);
    if (this.map.citadel && ownerId === "trojan") cap = Math.round(cap * 0.8);
    return Math.max(8, Math.min(POP_CAP, cap));
  }

  tradeRates(ownerId) {
    let bonus = 0;
    for (const id of this.players[ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.tradeRate) bonus += e.tradeRate;
      else if (e.type === "tradeRate") bonus += e.value;
    }
    return {
      grainToBronze: Math.round(BASE_TRADE.grainToBronze * (1 + bonus)),
      bronzeToGrain: Math.round(BASE_TRADE.bronzeToGrain * (1 + bonus))
    };
  }

  /** Cambia 100 de `from` ("grain"|"bronze") por el otro recurso */
  trade(ownerId, from) {
    const p = this.players[ownerId];
    if (ownerId !== this.current.id || p[from] < 100) return false;
    const r = this.tradeRates(ownerId);
    p[from] -= 100;
    if (from === "grain") p.bronze += r.grainToBronze; else p.grain += r.bronzeToGrain;
    this.emit("change");
    return true;
  }

  // ------------------------------------------------------------------ investigación y eras
  /** Edificios propios ya terminados, por su tipo */
  hasBuilding(ownerId, id) {
    return this.buildingsOf(ownerId).some(b => b.template.id === id && !b.underConstruction);
  }

  /**
   * Por qué una tecnología no se puede investigar todavía: por era, por
   * edificio o porque falta la anterior de su cadena. Devuelve null si sí.
   */
  researchBlocker(ownerId, tech) {
    const p = this.players[ownerId];
    if (tech.era > p.era) return { tipo: "era", texto: `Era ${tech.era}` };
    if (tech.edificio && !this.hasBuilding(ownerId, tech.edificio)) {
      return { tipo: "edificio", edificio: tech.edificio, texto: BUILDINGS[tech.edificio]?.name || tech.edificio };
    }
    if (tech.requiere && !p.techs.has(tech.requiere)) {
      return { tipo: "tecnologia", texto: TECHNOLOGIES[tech.requiere]?.name || tech.requiere };
    }
    return null;
  }

  /** Todas las tecnologías de este bando, investigadas o no, con su estado */
  techTree(ownerId) {
    const p = this.players[ownerId];
    const disc = this.researchDiscount(ownerId);
    return Object.values(TECHNOLOGIES)
      .filter(t => !t.faction || t.faction === ownerId)
      .map(t => ({
        tech: t,
        cost: { grain: Math.max(0, t.cost.grain - disc), bronze: Math.max(0, t.cost.bronze - disc) },
        hecha: p.techs.has(t.id),
        bloqueo: p.techs.has(t.id) ? null : this.researchBlocker(ownerId, t)
      }));
  }

  researchOptions(ownerId) {
    return this.techTree(ownerId)
      .filter(o => !o.hecha && !o.bloqueo)
      .map(({ tech, cost }) => ({ tech, cost }));
  }

  research(ownerId, techId) {
    const p = this.players[ownerId];
    if (p.researchedThisTurn || ownerId !== this.current.id) return false;
    const opt = this.researchOptions(ownerId).find(o => o.tech.id === techId);
    if (!opt || !this.canAfford(ownerId, opt.cost)) return false;
    this.pay(ownerId, opt.cost);
    p.techs.add(techId);
    p.researchedThisTurn = true;
    this.say(`Investigado: ${opt.tech.name}. ${opt.tech.description}`, "good");
    // desbloqueos que mejoran unidades ya existentes (Campeón, Carro Real…)
    if (opt.tech.effect.type === "unlock") this._upgradeUnits(ownerId);
    this.updateVision(ownerId);
    this.emit("change");
    return true;
  }

  /** Tecnologías de la era actual investigadas y necesarias para subir */
  eraProgress(ownerId) {
    const p = this.players[ownerId];
    const have = [...p.techs].filter(id => TECHNOLOGIES[id].era === p.era).length;
    const need = ERA_TECHS_NEEDED[p.era + 1] ?? 0;
    return { have, need, ok: have >= need };
  }

  advanceEra(ownerId) {
    const p = this.players[ownerId];
    const next = ERAS[p.era + 1];
    if (!next || p.advancedThisTurn || ownerId !== this.current.id || !this.canAfford(ownerId, next.cost)) return false;
    if (!this.eraProgress(ownerId).ok) return false;
    this.pay(ownerId, next.cost);
    p.era++;
    p.advancedThisTurn = true;
    this.say(`${p.name} entra en la Era ${p.era}: ${next.name}.`, "era");
    const n = this._upgradeUnits(ownerId);
    if (n) this.say(`${n} unidades mejoran a su nueva versión.`, "good");
    this.emit("era", { player: p });
    this.emit("change");
    return true;
  }

  _upgradeUnits(ownerId) {
    let count = 0;
    for (const u of this.unitsOf(ownerId)) {
      if (!UNITS[u.templateId]) continue;
      const top = this.lineTopFrom(u.templateId, ownerId);
      if (top !== u.templateId) { u.upgradeTo(UNITS[top]); count++; }
    }
    return count;
  }
  lineTopFrom(id, ownerId) { return this.lineTop(id, ownerId); }

  // ------------------------------------------------------------------ turnos
  income(ownerId, withRelics = true) {
    const out = { grain: 0, bronze: 0 };
    let gMult = 1, bMult = 1;
    const hb = this.houseBonus(ownerId);
    if (hb && hb.type === "income") {
      if (hb.resource === "grain") gMult += hb.value; else bMult += hb.value;
    }
    for (const id of this.players[ownerId].techs) {
      const e = TECHNOLOGIES[id].effect;
      if (e.type === "resourceIncome" && e.resource === "grain") gMult += e.value;
      if (e.type === "resourceIncome" && e.resource === "bronze") bMult += e.value;
    }
    for (const b of this.buildingsOf(ownerId)) {
      if (b.underConstruction || !b.template.income) continue;
      // Como en el original: una mina a media vida saca la mitad de metal.
      const salud = Math.max(0, b.currentHp / b.maxHp);
      out.grain += (b.template.income.grain || 0) * salud;
      out.bronze += (b.template.income.bronze || 0) * salud;
    }
    out.grain = Math.round(out.grain);
    out.bronze = Math.round(out.bronze);
    out.grain = Math.round(out.grain * gMult);
    out.bronze = Math.round(out.bronze * bMult);
    if (withRelics) for (const b of this.buildingsOf(ownerId)) out.bronze += (b.relics || 0) * RELIC_INCOME;
    return out;
  }

  _beginTurn(first = false) {
    const p = this.current;
    p.researchedThisTurn = false;
    p.advancedThisTurn = false;
    p.mercenaryThisTurn = false;
    for (const u of this.unitsOf(p.id)) {
      u.resetTurnState(); u.lastMove = null; u.pickedThisMove = false;
    }
    for (const b of this.buildingsOf(p.id)) {
      b.producedThisTurn = false;
      if (b.underConstruction) {
        b.buildTurnsLeft = (b.buildTurnsLeft || 1) - 1;
        if (b.buildTurnsLeft > 0) {
          b.currentHp = Math.min(b.maxHp, b.currentHp + Math.round(b.maxHp * 0.2));
          this.say(`${b.name}: faltan ${b.buildTurnsLeft} turno(s) de obra.`, "info");
        } else {
          b.underConstruction = false;
          b.currentHp = b.maxHp;
          this.say(`${b.name} terminado.`, "good");
          if (b.template.id === "wonder") this._wonderCompleted(b);
        }
      } else if (b.template.id === "wonder" && p.wonder) {
        p.wonder.left--;
        if (p.wonder.left <= 0) { this._declare(p.id, `La Maravilla de los ${p.name} ha resistido ${WONDER_TURNS} turnos. ¡Los dioses les dan la victoria!`); return; }
        this.say(`La Maravilla resiste: faltan ${p.wonder.left} turnos para la victoria.`, "era");
      }
    }
    if (!first) {
      const inc = this.income(p.id);
      p.grain += inc.grain; p.bronze += inc.bronze;
    }
    // curación de edificios propios: templos pegados y campamentos pisados
    for (const u of this.unitsOf(p.id)) {
      const cura = this.healingAt(u.x, u.y, p.id);
      if (!cura) continue;
      const h = u.heal(cura.amount);
      if (h) this.emit("heal", { entity: u, amount: h });
    }
    this.updateVision(p.id);
    // torres y campamentos disparan
    for (const b of this.buildingsOf(p.id)) {
      if (!(b.template.attack > 0) || b.underConstruction) continue;
      const r = attackRangeOf(this, b);
      const targets = this.grid.tilesInRange(b.x, b.y, r.max, 1).map(t => this.unitAt(t.x, t.y)).filter(u => u && u.ownerId !== p.id);
      if (!targets.length) continue;
      targets.sort((a, c) => a.currentHp - c.currentHp);
      const t = targets[0];
      const res = resolveCombat(this, b, t, { apply: false });
      const dmg = res.targetDamageTaken;
      t.applyDamage(dmg);
      this.emit("shoot", { from: b, target: t, amount: dmg });
      this.say(`${b.name} dispara a ${t.name}: −${dmg}`, p.id);
    }
    this._cleanupDead(p.id);
    if (this.winner) return;
    this.say(`— Turno ${this.round}: ${p.name} —`, "turn");
    this.emit("turnStart", { player: p });
  }

  endTurn() {
    if (this.winner) return;
    for (const u of this.unitsOf(this.current.id)) { u.lastMove = null; }
    this.currentIdx = (this.currentIdx + 1) % this.order.length;
    if (this.currentIdx === 0) this.round++;
    if (!this.current.alive) return this.endTurn();
    this._beginTurn();
  }

  /**
   * Estado del objetivo de un bando, para pintarlo en pantalla.
   * @returns {{text:string, now:number, need:number, done:boolean}}
   */
  goalProgress(ownerId) {
    const g = this.goals[ownerId];
    const foe = this.opponentOf(ownerId);
    if (!g) return null;
    switch (g.type) {
      case "villages": {
        const n = this.buildingsOf(ownerId).filter(b => b.template.capturable).length;
        return { type: g.type, text: g.text || `Controla ${g.count} aldeas`, now: n, need: g.count, done: n >= g.count };
      }
      case "killHero": {
        const done = this.killedHeroes.has(g.hero);
        return { type: g.type, text: g.text || "Mata al héroe enemigo", now: done ? 1 : 0, need: 1, done };
      }
      case "reachCamp": {
        const on = this.capitals(foe).some(c => { const u = this.unitAt(c.x, c.y); return u && u.ownerId === ownerId; });
        return { type: g.type, text: g.text || "Toma su campamento", now: on ? 1 : 0, need: 1, done: on };
      }
      default: {
        const left = this.capitals(foe).length;
        return { type: "destroyCapitals", text: g.text || `Destruye sus campamentos`, now: left === 0 ? 1 : 0, need: 1, done: left === 0 };
      }
    }
  }

  checkVictory() {
    if (this.winner) return;
    // eliminación: quedarse sin campamento o sin nada en el tablero
    for (const id of this.order) {
      const p = this.players[id];
      if (!p.alive) continue;
      const noCapital = this.capitals(id).length === 0;
      const nothing = this.unitsOf(id).length === 0 && this.buildingsOf(id).filter(b => !b.template.isWall).length === 0;
      if (noCapital || nothing) {
        p.alive = false;
        const other = this.opponentOf(id);
        const msg = id === "trojan" && this.map.citadel
          ? "La Ciudadela ha caído. ¡Troya arde!"
          : `${p.name} se ha quedado sin campamento. ¡Victoria de los ${FACTIONS[other].name}!`;
        this._declare(other, msg);
        return;
      }
    }
    // objetivos propios del escenario
    for (const id of this.order) {
      const g = this.goalProgress(id);
      if (g && g.done) {
        this._declare(id, `${this.players[id].name}: objetivo cumplido — ${g.text}.`);
        return;
      }
    }
  }

  _wonderCompleted(b) {
    const p = this.players[b.ownerId];
    p.wonder = { id: b.instanceId, left: WONDER_TURNS };
    this.say(`¡${p.name} terminan su Maravilla! Si resiste ${WONDER_TURNS} turnos, ganan la guerra.`, "era");
    // como en AoK DS, el rival recibe refuerzos para intentar derribarla
    const foe = this.opponentOf(b.ownerId);
    const cap = this.capitals(foe)[0];
    if (cap) {
      const troops = [this.lineTop("recruit", foe), this.lineTop("recruit", foe), this.lineTop("spearman", foe), this.lineTop("archer", foe), "batteringRam"];
      let n = 0;
      for (const id of troops) {
        const spot = this.freeSpotNear(cap.x, cap.y, 4, foe);
        if (!spot) break;
        const u = this.spawnUnit(id, foe, spot.x, spot.y);
        u.hasActed = this.current.id === foe; u.hasMoved = u.hasActed;
        this.emit("spawn", { unit: u }); n++;
      }
      this.say(`Los ${FACTIONS[foe].name} reciben ${n} unidades de refuerzo para derribar la Maravilla.`, "bad");
    }
  }

  _declare(winner, message) {
    this.winner = winner;
    this.say(message, "era");
    this.emit("gameOver", { winner, message });
  }
}
