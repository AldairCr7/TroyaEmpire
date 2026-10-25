/**
 * ai.js — el ordenador que juega.
 * -----------------------------------------------------------------------
 * Un turno de la IA es, en este orden:
 *
 *   1. economía  →  subir de era si toca, investigar, vender el excedente
 *   2. unidades  →  cada una decide por su cuenta, de la más frágil a la
 *                   más dura, para que los que tiran de lejos disparen
 *                   antes de que la infantería les tape la línea
 *   3. reclutar  →  con lo que haya sobrado
 *
 * Cada unidad razona igual: ¿hay un ataque que me salga a cuenta desde
 * alguna casilla a la que llego? Si lo hay y el saldo supera el listón de
 * la dificultad, ataco. Si no, me acerco a mi objetivo esquivando el peligro.
 */
import { BUILDINGS } from "../data/buildings.js";
import { ERAS } from "./game.js";

/**
 * Lo que separa a las tres dificultades:
 *   attackThreshold  saldo mínimo (daño hecho − recibido) para atacar; en
 *                    difícil es negativo, o sea que acepta malos cambios
 *   mistake          probabilidad de dejar pasar el mejor movimiento
 *   bonus            recursos regalados cada turno
 */
const DIFF = {
  easy: { attackThreshold: 20, mistake: 0.3, bonus: 0 },
  normal: { attackThreshold: -10, mistake: 0.05, bonus: 10 },
  hard: { attackThreshold: -25, mistake: 0, bonus: 35 }
};

export async function runAITurn(game, pause) {
  const me = game.current;
  const cfg = DIFF[me.difficulty] || DIFF.normal;
  const enemyId = game.opponentOf(me.id);
  if (cfg.bonus) { me.grain += cfg.bonus; me.bronze += Math.round(cfg.bonus * 0.6); }

  planEconomy(game, me);
  // mercado: convertir el excedente de grano en bronce y al revés
  while (me.grain > 400 && me.grain > me.bronze * 2.2) { if (!game.trade(me.id, "grain")) break; }
  while (me.bronze > 250 && me.bronze > me.grain * 1.8) { if (!game.trade(me.id, "bronze")) break; }

  if (me.bronze > 650 && game.canHireMercenary(me.id)) game.hireMercenary(me.id);

  // orden: héroes y los de lejos primero (ablandan), luego melé, luego apoyo
  const rank = u => u.isHero() ? 0 : ["ranged", "skirmish", "siege"].includes(u.template.category) ? 1 : u.template.category === "support" ? 3 : 2;
  const units = game.unitsOf(me.id).sort((a, b) => rank(a) - rank(b));

  const fieldCache = new Map();
  for (const unit of units) {
    if (game.winner) return;
    if (!unit.isAlive() || unit.hasActed) continue;
    try {
      await actUnit(game, unit, enemyId, cfg, fieldCache, pause);
    } catch (e) {
      console.error("IA:", e);
      unit.hasActed = true;
    }
  }
  if (game.winner) return;

  recruit(game, me, enemyId);
  planEconomy(game, me);
  await pause(250);
}

// ------------------------------------------------------------------ economía
function planEconomy(game, me) {
  const next = ERAS[me.era + 1];
  const army = game.unitsOf(me.id).filter(u => u.template.category !== "support").length;
  const military = game.buildingsOf(me.id).filter(b => b.template.produces && !b.template.isCapital).length;
  const leftover = next ? Math.min(me.grain - next.cost.grain, me.bronze - next.cost.bronze) : -1;
  if (next && !me.advancedThisTurn && army >= 3 + me.era && military >= Math.min(me.era, 3) && leftover >= 120) {
    game.advanceEra(me.id);
  }
  if (!me.researchedThisTurn && next && !game.eraProgress(me.id).ok) {
    // faltan tecnologías de esta era para poder subir: la más barata
    const cheap = game.researchOptions(me.id)
      .filter(o => o.tech.era === me.era && game.canAfford(me.id, o.cost))
      .sort((a, b) => (a.cost.grain + a.cost.bronze) - (b.cost.grain + b.cost.bronze))[0];
    if (cheap) game.research(me.id, cheap.tech.id);
  }
  if (!me.researchedThisTurn) {
    const reserve = next ? next.cost : { grain: 0, bronze: 0 };
    const opts = game.researchOptions(me.id)
      .filter(o => me.grain - o.cost.grain > reserve.grain * 0.5 && me.bronze - o.cost.bronze > reserve.bronze * 0.5)
      .map(o => ({ ...o, score: techScore(o.tech) }))
      .sort((a, b) => b.score - a.score);
    if (opts.length && opts[0].score > 0) game.research(me.id, opts[0].tech.id);
  }
}

function techScore(t) {
  const e = t.effect;
  switch (e.type) {
    case "resourceIncome": return 9;
    case "unitAttack": return 8;
    case "unitDefense": return 7;
    case "unlock": return 10;
    case "unitCost": return 5;
    case "campDefense": return 4;
    case "healBoost": case "buildingCost": return 3;
    case "sight": return 2;
    default: return 1;
  }
}

// ------------------------------------------------------------------ reclutar
function recruit(game, me, enemyId) {
  const enemyUnits = game.unitsOf(enemyId);
  const enemyChariots = enemyUnits.filter(u => u.template.category === "chariot").length;
  const enemyWalls = game.buildingsOf(enemyId).some(b => b.template.isWall);
  const mine = game.unitsOf(me.id);
  const villagers = mine.filter(u => u.templateId === "villager").length;
  const nextEra = ERAS[me.era + 1];
  const army = mine.filter(u => u.template.category !== "support").length;
  const cap = game.capitals(me.id)[0];
  const underAttack = cap && enemyUnits.some(e => Math.abs(e.x - cap.x) + Math.abs(e.y - cap.y) <= 5);
  // modo ahorro: con un ejército decente, guardar para la siguiente era
  // (sobre todo si hace falta asedio para tirar una muralla)
  const saving = enemyWalls && me.era < 3 && !underAttack && army >= 6;

  const buildings = game.buildingsOf(me.id).filter(b => b.template.produces);
  // asedio primero si hay murallas que tirar; militares después; colonos al final
  const prio = b => b.template.isCapital ? 2 : (enemyWalls && b.template.id === "siegeWorkshop") ? 0 : 1;
  buildings.sort((a, b) => prio(a) - prio(b));

  for (const b of buildings) {
    const opts = game.recruitOptions(b).filter(o => game.canAfford(me.id, o.cost) && (!o.hero || o.ready));
    if (!opts.length) continue;
    let choice = null;
    const hero = opts.find(o => o.hero);
    if (hero) choice = hero;
    else if (b.template.isCapital) {
      if (villagers < 2 + me.era && mine.length < 20) choice = opts.find(o => o.unitId === "villager");
    } else {
      if (saving) continue;
      // guardar para la siguiente era si estamos cerca
      if (nextEra && me.grain < nextEra.cost.grain * 1.1 && me.grain > nextEra.cost.grain * 0.7 && mine.length > 6) continue;
      const scored = opts.map(o => {
        const t = o.template;
        let s = t.attack + t.defense * 0.8;
        if (t.category === "spear") s += enemyChariots * 60;
        if (t.category === "chariot") s += 40;
        if (["ranged", "skirmish"].includes(t.category)) s += 30 - mine.filter(u => u.template.category === "ranged").length * 10;
        if (t.category === "ranged" && t.move >= 9) s += 70;   // arqueros montados
        if (t.abilities?.includes("buildingsOnly")) s = enemyWalls ? 380 - mine.filter(u => u.template.abilities?.includes("buildingsOnly")).length * 150 : 50;
        if (t.abilities?.includes("transportInfantry")) s = enemyWalls ? 200 - mine.filter(u => u.template.abilities?.includes("transportInfantry")).length * 250 : -1;
        if (t.id === "trojanHorse") s = enemyWalls ? 500 : -1;
        if (t.abilities?.includes("splashDamage")) s -= mine.filter(u => u.template.abilities?.includes("splashDamage")).length * 90;
        // los camellos solo valen la pena si el otro saca carros
        if (t.abilities?.includes("scaresHorses")) s += enemyChariots * 90 - 60;
        // el escorpión no tira muros: es para la tropa, y de lejos
        if (t.abilities?.includes("unitsOnly")) s += enemyUnits.length * 12;
        if (t.category === "support") s = mine.filter(u => u.template.category === "support").length < 1 + Math.floor(me.era / 2) ? 120 : -1;
        return { o, s };
      }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      choice = scored[0]?.o || null;
    }
    if (choice) game.recruit(b, choice.unitId);
  }
}

// -------------------------------------------------------------- una unidad
/**
 * Qué hace una unidad en su turno. Las que tienen oficio propio (colono,
 * sacerdote) se desvían a su función; el resto busca el mejor ataque a su
 * alcance y, si no le sale a cuenta ninguno, avanza hacia su objetivo.
 */
async function actUnit(game, unit, enemyId, cfg, fieldCache, pause) {
  const ab = unit.template.abilities || [];

  if (unit.templateId === "villager") return actVillager(game, unit, enemyId, fieldCache, pause);
  if (unit.template.category === "support") return actPriest(game, unit, enemyId, fieldCache, pause);

  // --- poderes de héroe: se gastan en cuanto hay a quién
  if (unit.isHero()) {
    for (const a of game.heroActions(unit)) {
      if (a.targets && a.targets.length) {
        const victima = a.targets.slice().sort((x, y) => x.currentHp - y.currentHp)[0];
        game.usePower(unit, a.power.id, victima);
        await pause(250);
        break;
      }
      if (!a.targets) { game.usePower(unit, a.power.id); await pause(250); break; }
    }
  }

  /**
   * El mejor ataque posible, probando también desde qué casilla. Devuelve el
   * saldo: lo que hago menos lo que me hacen, con premio por rematar y por
   * morder un campamento, y castigo por quedarme en sitio peligroso.
   */
  const mejorAtaque = () => {
    const quieto = unit.hasMoved || unit.deployed || ab.includes("noMoveAndAttack");
    const origenes = quieto ? [{ x: unit.x, y: unit.y }] : [...game.getReachable(unit).values()];
    let best = null;
    for (const o of origenes) {
      for (const t of game.getTargets(unit, o)) {
        const r = game.predictAttack(unit, t, o);
        if (!r) continue;
        const muere = t.currentHp <= r.targetDamageTaken;
        // El premio por rematar y por morder un campamento tiene que ser
        // pequeño: con premios gordos la tropa se suicida contra la muralla
        // y el ejército se funde antes de llegar a la era 2.
        const saldo = r.targetDamageTaken
          - r.attackerDamageTaken * (isFragile(unit) ? 1.8 : 1.3)
          + (muere ? 25 : 0)
          + (t.kind === "building" && t.template.isCapital ? 20 : 0)
          - danger(game, unit, o, enemyId) * 0.25;
        if (!best || saldo > best.saldo) best = { origen: o, objetivo: t, saldo };
      }
    }
    return best;
  };

  let plan = mejorAtaque();
  // en fácil, de vez en cuando deja pasar la buena
  if (plan && cfg.mistake && Math.random() < cfg.mistake) plan = null;

  if (plan && plan.saldo >= cfg.attackThreshold) {
    if (plan.origen.x !== unit.x || plan.origen.y !== unit.y) {
      game.moveUnit(unit, plan.origen.x, plan.origen.y);
      await pause();
    }
    if (unit.isAlive() && game.getTargets(unit).includes(plan.objetivo)) {
      game.attack(unit, plan.objetivo);
      await pause(300);
      return;
    }
  }

  // --- máquinas que se montan: montarse si hay blanco, bajarse si no
  if (ab.includes("deploy") && game.canDeploy(unit)) {
    const hayBlanco = game.getTargets(unit).length > 0;
    if (hayBlanco !== !!unit.deployed) {
      game.toggleDeploy(unit);
      await pause(200);
      const t = game.getTargets(unit).sort((a, b) => a.currentHp - b.currentHp)[0];
      if (unit.deployed && t) { game.attack(unit, t); await pause(300); }
      return;
    }
  }

  // --- nada que atacar: avanzar hacia el objetivo
  const goal = pickObjective(game, unit, enemyId);
  if (!goal) { game.waitUnit(unit); return; }

  if (!unit.hasMoved && !unit.deployed) {
    const field = flowField(game, unit, goal, fieldCache);
    let best = null, bestS = Infinity;
    for (const r of game.getReachable(unit).values()) {
      const base = field[r.y * game.grid.width + r.x];
      if (!isFinite(base)) continue;
      // los frágiles pagan mucho más caro quedarse expuestos
      const miedo = danger(game, unit, r, enemyId) * (isFragile(unit) ? 1.4 : 0.6);
      const golpes = expectedDamage(game, unit, r, enemyId) * (isFragile(unit) ? 0.5 : 0.25);
      const s = base + miedo + golpes;
      if (s < bestS) { bestS = s; best = r; }
    }
    if (best && (best.x !== unit.x || best.y !== unit.y)) {
      game.moveUnit(unit, best.x, best.y);
      await pause();
      // al llegar puede que ya haya algo a tiro
      const tras = mejorAtaque();
      if (tras && tras.saldo >= cfg.attackThreshold && game.getTargets(unit).includes(tras.objetivo)) {
        game.attack(unit, tras.objetivo);
        await pause(300);
        return;
      }
    }
  }
  if (!unit.hasActed) game.waitUnit(unit);
}

// ------------------------------------------------------------- movimiento
async function moveToward(game, unit, goal, enemyId, pause) {
  if (unit.hasMoved) return;
  const reach = game.getReachable(unit);
  let best = null, bestS = Infinity;
  for (const r of reach.values()) {
    const s = Math.abs(r.x - goal.x) + Math.abs(r.y - goal.y) + danger(game, unit, r, enemyId) * 0.3;
    if (s < bestS) { bestS = s; best = r; }
  }
  if (best && (best.x !== unit.x || best.y !== unit.y)) { game.moveUnit(unit, best.x, best.y); await pause(); }
}

function isFragile(unit) {
  return ["ranged", "skirmish", "siege", "support"].includes(unit.template.category);
}

/**
 * Daño esperado si terminamos en `pos`: los enemigos que llegan a ella,
 * como mucho 4 (las casillas de alrededor), empezando por los que más pegan.
 */
function expectedDamage(game, unit, pos, enemyId, hpLeft = unit.currentHp) {
  const hits = [];
  for (const e of game.unitsOf(enemyId)) {
    if (!(e.template.attack > 0) || e.template.abilities?.includes("buildingsOnly")) continue;
    const dist = Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y);
    if (dist > e.template.move * 0.8 + (e.template.range || 1)) continue;
    hits.push(40 * (e.template.attack * (e.currentHp / e.maxHp)) / unit.template.defense);
  }
  for (const b of game.buildingsOf(enemyId)) {
    if (b.template.attack > 0 && Math.abs(b.x - pos.x) + Math.abs(b.y - pos.y) <= b.template.range) hits.push(40 * b.template.attack / unit.template.defense);
  }
  hits.sort((a, b) => b - a);
  return hits.slice(0, 4).reduce((a, b) => a + b, 0) * (hpLeft > 0 ? 1 : 0);
}

/** Peligro aproximado de terminar en una casilla: enemigos que llegan a ella */
function danger(game, unit, pos, enemyId) {
  let d = 0;
  for (const e of game.unitsOf(enemyId)) {
    if (!(e.template.attack > 0)) continue;
    const dist = Math.abs(e.x - pos.x) + Math.abs(e.y - pos.y);
    const reach = Math.ceil(e.template.move * 0.7) + (e.template.range || 1);
    if (dist <= reach) d += (e.template.attack / Math.max(1, unit.template.defense)) * 18 * (e.currentHp / e.maxHp);
  }
  return d;
}

function nearestPickup(game, from, types, maxDist = 99) {
  let best = null, bd = Infinity;
  for (let y = 0; y < game.grid.height; y++) for (let x = 0; x < game.grid.width; x++) {
    const p = game.grid.tiles[y][x].pickup;
    if (!p || !types.includes(p) || game.unitAt(x, y)) continue;
    const d = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (d < bd && d <= maxDist) { bd = d; best = { x, y }; }
  }
  return best;
}

function nearestCapital(game, ownerId, from) {
  const caps = game.capitals(ownerId);
  caps.sort((a, b) => dist(a, from) - dist(b, from));
  return caps[0] || null;
}

function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function pickObjective(game, unit, enemyId) {
  const myCap = game.capitals(unit.ownerId)[0];
  const enemies = game.unitsOf(enemyId);
  // defender lo propio: enemigos pegados a cualquiera de nuestros edificios
  const mine = game.buildingsOf(unit.ownerId).filter(b => !b.template.isWall);
  const raiders = enemies.filter(e => mine.some(b => dist(e, b) <= (b.template.isCapital ? 5 : 3)));
  if (raiders.length) {
    const r = raiders.sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    if (dist(r, unit) <= 12) return r;
  }
  const ab = unit.template.abilities || [];
  const buildings = game.buildingsOf(enemyId);
  if (ab.includes("buildingsOnly") || ab.includes("transportInfantry") || ab.includes("trojanHorseInfiltration")) {
    const walls = buildings.filter(b => b.template.isWall);
    const pool = walls.length ? walls : buildings;
    return pool.sort((a, b) => dist(a, unit) - dist(b, unit))[0] || null;
  }
  // sin máquinas de asedio no se estrella el ejército contra la muralla:
  // espera en un punto de reunión fuera del alcance de las torres
  const walls = buildings.filter(b => b.template.isWall);
  const siegeReady = game.unitsOf(unit.ownerId).filter(u => ["buildingsOnly", "transportInfantry", "trojanHorseInfiltration"].some(a => u.template.abilities?.includes(a))).length;
  if (walls.length && siegeReady < 2 && myCap) {
    const outside = enemies.filter(e => !game.buildingAt(e.x, e.y) && dist(e, myCap) < dist(e, walls[0]) + 2 && dist(e, unit) <= 8);
    if (outside.length) return outside.sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    const gate = walls.filter(w => w.template.isGate).sort((a, b) => dist(a, myCap) - dist(b, myCap))[0] || walls[0];
    const k = 0.5;
    return { x: Math.round(myCap.x + (gate.x - myCap.x) * k), y: Math.round(myCap.y + (gate.y - myCap.y) * k), rally: true };
  }

  const wonder = buildings.find(b => b.template.id === "wonder");
  if (wonder && game.players[enemyId].wonder) return wonder;

  // unidades cercanas primero; si no, edificios; al final la capital
  const near = enemies.filter(e => dist(e, unit) <= 10).sort((a, b) => dist(a, unit) - dist(b, unit));
  if (near.length) return near[0];

  // aldeas sin tomar: botín barato que además sube los ingresos. Y si el
  // objetivo del escenario ES tomarlas, se van a buscar al otro lado del mapa.
  if (["infantry", "spear", "chariot", "ranged", "skirmish"].includes(unit.template.category)) {
    const goal = game.goals?.[unit.ownerId];
    const mine = game.buildingsOf(unit.ownerId).filter(b => b.template.capturable).length;
    const objetivo = goal?.type === "villages" && mine < (goal.count || 0);
    const free = [...game.buildings.values()].filter(b => b.isAlive() && b.template.capturable
      && b.ownerId !== unit.ownerId && !game.unitAt(b.x, b.y));
    const radio = objetivo ? 999 : 10;
    const near = free.filter(v => dist(v, unit) <= radio).sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    if (near) return near;
    // defendida: ir a por quien la ocupa
    if (objetivo) {
      const held = [...game.buildings.values()].filter(b => b.isAlive() && b.template.capturable && b.ownerId !== unit.ownerId)
        .map(b => game.unitAt(b.x, b.y)).filter(u => u && u.ownerId !== unit.ownerId)
        .sort((a, b) => dist(a, unit) - dist(b, unit))[0];
      if (held) return held;
    }
  }
  const loot = nearestPickup(game, unit, ["goats", "bag", "ruins"], 8);
  if (loot && unit.template.category !== "siege") return loot;
  const cap = game.capitals(enemyId)[0];
  const wallsLeft = buildings.filter(b => b.template.isWall);
  if (cap && wallsLeft.length && !["infantry", "spear"].includes(unit.template.category)) {
    // sin arietes no tiene sentido esperar en la muralla: ir a la puerta más cercana
    return wallsLeft.sort((a, b) => dist(a, unit) - dist(b, unit))[0];
  }
  return cap || enemies.sort((a, b) => dist(a, unit) - dist(b, unit))[0] || null;
}

/** Distancia de coste hasta las casillas junto al objetivo (con caché por tipo de unidad) */
function flowField(game, unit, target, cache) {
  const k = `${target.x},${target.y}:${unit.template.category}:${unit.template.abilities?.includes("scout")}`;
  if (cache.has(k)) return cache.get(k);
  // se calcula desde el objetivo; el objetivo mismo se trata como transitable
  const field = game.grid.costField(target.x, target.y, (x, y) => {
    const b = game.buildingAt(x, y);
    if (b && b.ownerId !== unit.ownerId && b.template.isWall) return 6; // "hay que tirarla"
    return game.baseStepCost(x, y, unit.ownerId, unit.template);
  });
  cache.set(k, field);
  return field;
}

// ------------------------------------------------------------------ colonos
async function actVillager(game, v, enemyId, cache, pause) {
  const me = game.players[v.ownerId];
  // reparar lo que esté dañado al lado
  const rep = game.repairTargets(v).filter(b => b.currentHp < b.maxHp * 0.7)
    .sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp))[0];
  if (rep && game.canAfford(v.ownerId, game.repairCost(rep))) { game.repair(v, rep); await pause(200); return; }

  const tryBuild = () => {
    const opts = game.buildOptions(v).filter(o => game.canAfford(v.ownerId, o.cost));
    if (!opts.length) return false;
    const have = id => game.buildingsOf(v.ownerId).filter(b => b.template.id === id).length;
    const want = o => {
      const id = o.building.id;
      if (id === "mine") return 100;
      if (id === "mill") {
        // primero se llenan los huecos del molino que ya tienes
        const huecos = game.buildingsOf(v.ownerId).filter(b => b.template.id === "mill" && !b.underConstruction)
          .flatMap(m => game.millSlots(m)).length;
        return (huecos >= 2 || have("mill") >= 1 + Math.ceil(me.era / 2)) ? -1 : 95;
      }
      if (id === "wonder") return me.grain > 1500 && me.bronze > 1100 ? 120 : -1;
      if (id === "camp") return game.townSlots(v.ownerId).length === 0 && me.era >= 2 && have("camp") < 3 ? 55 : -1;
      if (id === "farm") return have("farm") < 3 + me.era * 1.5 ? 80 - have("farm") * 8 : -1;
      if (id === "barracks") return have("barracks") === 0 ? 90 : have("barracks") < 2 && me.era >= 3 ? 30 : -1;
      if (id === "stable") return have("stable") === 0 ? 60 : -1;
      if (id === "archeryRange") return have("archeryRange") === 0 ? 70 : -1;
      if (id === "siegeWorkshop") return have("siegeWorkshop") === 0 ? (game.buildingsOf(enemyId).some(b => b.template.isWall) ? 95 : 45) : -1;
      if (id === "temple") return have("temple") === 0 ? 35 : -1;
      // Los edificios de investigación: valen lo que vale lo que desbloquean,
      // así que se miden por cuántas tecnologías tienes esperando detrás.
      if (id === "blacksmith") return have("blacksmith") === 0 ? 85 : -1;
      if (id === "university") return have("university") === 0 ? 75 : -1;
      if (id === "castle") return have("castle") === 0 && me.era >= 3 ? 65 : -1;
      if (id === "watchtower") return have("watchtower") < 1 ? 15 : -1;
      return -1;
    };
    const scored = opts.map(o => ({ o, s: want(o) - (game.grid.getTile(o.x, o.y).terrain.includes("Road") ? 20 : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) return false;
    const { o } = scored[0];
    return !!game.build(v, o.x, o.y, o.building.id);
  };

  if (tryBuild()) { await pause(200); return; }

  // si falta un edificio de ciudad y hay hueco junto al campamento, ir allí
  const cap = game.capitals(v.ownerId)[0];
  const haveB = id => game.buildingsOf(v.ownerId).some(b => b.template.id === id);
  const needTown = ["barracks", "blacksmith", "archeryRange", "stable", "university", "siegeWorkshop", "temple"]
    .some(id => !haveB(id) && BUILDINGS[id].era <= me.era && game.canAfford(v.ownerId, BUILDINGS[id].cost));
  const slots = game.townSlots(v.ownerId);
  if (needTown && slots.length) {
    const slot = slots.sort((a, b) => dist(a, v) - dist(b, v))[0];
    const reach = game.getReachable(v);
    let best = null, bestS = Infinity;
    for (const r of reach.values()) {
      const d = Math.abs(r.x - slot.x) + Math.abs(r.y - slot.y);
      const s2 = d * 4 + danger(game, v, r, enemyId) * 0.5;
      if (s2 < bestS) { bestS = s2; best = r; }
    }
    if (best && (best.x !== v.x || best.y !== v.y)) { game.moveUnit(v, best.x, best.y); await pause(); }
    if (tryBuild()) { await pause(200); return; }
    game.waitUnit(v); return;
  }

  // granjas: hay que colocarse en una casilla pegada al hueco del molino,
  // porque estando pegado al molino no se alcanza ningún lado libre
  const molinos = game.buildingsOf(v.ownerId).filter(b => b.template.id === "mill" && !b.underConstruction);
  const huecos = molinos.flatMap(m => game.millSlots(m));
  if (huecos.length && game.canAfford(v.ownerId, BUILDINGS.farm.cost)
    && game.buildingsOf(v.ownerId).filter(b => b.template.id === "farm").length < 2 + me.era * 2) {
    const hueco = huecos.sort((a, b) => dist(a, v) - dist(b, v))[0];
    const reach = game.getReachable(v);
    let best = null, bestS = Infinity;
    for (const r of reach.values()) {
      const d = Math.abs(r.x - hueco.x) + Math.abs(r.y - hueco.y);
      const s2 = d * 4 + danger(game, v, r, enemyId) * 0.5;
      if (s2 < bestS) { bestS = s2; best = r; }
    }
    if (best && (best.x !== v.x || best.y !== v.y)) { game.moveUnit(v, best.x, best.y); await pause(); }
    if (tryBuild()) { await pause(200); return; }
  }

  // ir hacia un yacimiento libre o hacia terreno despejado cerca del campamento
  const deposits = [];
  for (let y = 0; y < game.grid.height; y++) for (let x = 0; x < game.grid.width; x++) {
    const t = game.grid.getTile(x, y);
    if (t.deposit && !t.building) deposits.push({ x, y });
  }
  const safe = deposits.filter(d => danger(game, v, d, enemyId) < 10);
  let goal = safe.sort((a, b) => dist(a, v) - dist(b, v))[0];
  if (!goal && cap) goal = cap;
  if (goal) {
    const reach = game.getReachable(v);
    let best = null, bestS = Infinity;
    const field = flowField(game, v, goal, cache);
    for (const r of reach.values()) {
      const s = field[r.y * game.grid.width + r.x] + danger(game, v, r, enemyId) * 2;
      if (s < bestS) { bestS = s; best = r; }
    }
    if (best && (best.x !== v.x || best.y !== v.y)) { game.moveUnit(v, best.x, best.y); await pause(); }
    if (tryBuild()) { await pause(200); return; }
  }
  game.waitUnit(v);
}

async function actPriest(game, p, enemyId, cache, pause) {
  // reliquia en mano: al templo
  const temple = game.buildingsOf(p.ownerId).find(b => b.template.id === "temple" && !b.underConstruction);
  if (p.relic && temple) {
    const t = game.relicTemples(p)[0];
    if (t) { game.offerRelic(p, t); await pause(200); return; }
    await moveToward(game, p, temple, enemyId, pause);
    const t2 = game.relicTemples(p)[0];
    if (t2) { game.offerRelic(p, t2); await pause(200); return; }
    game.waitUnit(p); return;
  }
  // convertir a un enemigo herido si las probabilidades acompañan
  const conv = game.convertTargets(p).map(t => ({ t, c: game.convertChance(p, t) })).sort((a, b) => b.c - a.c)[0];
  if (conv && conv.c >= 0.5) { game.convertUnit(p, conv.t); await pause(300); return; }
  // ir a por una reliquia cercana y segura
  const relic = temple && !p.relic ? nearestPickup(game, p, ["relic"], 14) : null;
  if (relic && danger(game, p, relic, enemyId) < 25) {
    await moveToward(game, p, relic, enemyId, pause);
    if (p.hasActed) return;
  }
  const pickHurt = () => game.supportTargets(p).filter(u => u.currentHp < u.maxHp * 0.8).sort((a, b) => a.currentHp - b.currentHp)[0];
  let t = pickHurt();
  if (!t) {
    const hurt = game.unitsOf(p.ownerId).filter(u => u !== p && u.currentHp < u.maxHp * 0.7).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (hurt) {
      const reach = game.getReachable(p);
      let best = null, bestD = Infinity;
      for (const r of reach.values()) {
        const d = Math.max(Math.abs(r.x - hurt.x), Math.abs(r.y - hurt.y)) + danger(game, p, r, enemyId) * 0.1;
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best && (best.x !== p.x || best.y !== p.y)) { game.moveUnit(p, best.x, best.y); await pause(); }
      t = pickHurt();
    }
  }
  if (t) { game.healUnit(p, t); await pause(200); return; }
  const ally = game.supportTargets(p).find(u => !u.hasActed && u.template.attack > 0);
  if (ally) { game.inspireUnit(p, ally); await pause(150); return; }
  game.waitUnit(p);
}
