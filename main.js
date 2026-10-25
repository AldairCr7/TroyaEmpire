/**
 * main.js
 * -----------------------------------------------------------------------
 * Arranque y controlador de la interfaz: conecta los clics del mapa con
 * las reglas (engine/game.js), lanza los turnos de la IA y mantiene la
 * pantalla al día. Toda la lógica del juego vive en engine/.
 *
 * Flujo de órdenes, como en AoK DS / Advance Wars:
 *   1. Tocas una unidad → ves en azul adónde puede ir.
 *   2. Tocas una casilla → se mueve y SALTA SU MENÚ junto a ella
 *      (Atacar, Construir, Curar, Esperar, Regresar…). Hay que elegir;
 *      Esc o clic derecho = Regresar.
 *   3. Tocar un enemigo en rojo mueve y ataca de una vez (atajo).
 *   4. Tocas un edificio tuyo → salta su menú (entrenar, investigar…).
 * -----------------------------------------------------------------------
 */

import { generateMap, SCENARIOS } from "./engine/mapgen.js";
import { Game, FACTIONS, ERAS } from "./engine/game.js";
import { runAITurn } from "./engine/ai.js";
import { Renderer } from "./render/renderer.js";
import { getTerrain } from "./data/terrain.js";
import { unitSprite, buildingSprite, actionIcon } from "./render/sprites.js";
import { UNITS } from "./data/units.js";
import { HOUSES, housesOf } from "./data/houses.js";
import { CAMPAIGN, loadProgress, saveProgress, resetProgress } from "./data/campaign.js";
import * as hud from "./ui/hud.js";
import * as sfx from "./audio/sfx.js";
import * as musica from "./audio/musica.js";
import * as muestras from "./audio/muestras.js";

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const renderer = new Renderer($("board"), $("minimap"));
let game = null;
let settings = null;
let aiRunning = false;
let fastForward = false;

/**
 * Estado de la interacción.
 * phase: idle     → nada o una unidad seleccionada mostrando su alcance
 *        menu     → menú de acciones de la unidad abierto (obligatorio)
 *        target   → eligiendo objetivo de una acción (ataque, curar…)
 *        place    → eligiendo casilla para construir
 *        bmenu    → menú de un edificio abierto
 */
const ui = {
  sel: null,
  phase: "idle",
  reach: null,
  stayed: false,       // el menú se abrió sin moverse
  sub: null,           // submenú abierto dentro del menú ("build")
  action: null,        // { kind, label, targets, power }
  buildChoice: null,
  hover: null,
};

// ======================================================================
// Nueva partida
// ======================================================================
const LAST_KEY = "troya:lastSettings";

function randomSeed() {
  const words = ["aquiles", "helena", "priamo", "ilion", "escamandro", "tenedos", "micenas", "ida", "esparta", "pergamo", "dardanos", "aulide"];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 900 + 100)}`;
}

// ======================================================================
// Teclado: dos esquemas, y el cursor que se mueve con ellos
// ======================================================================
const CTRL_KEY = "troya:controles";

const ESQUEMAS = {
  flechas: {
    nombre: "Flechitas",
    arriba: ["arrowup"], abajo: ["arrowdown"], izq: ["arrowleft"], der: ["arrowright"],
    aceptar: ["a", "enter"], cancelar: ["s", "escape"], menu: ["w"], mapa: ["m"],
    leyenda: [["Mover el cuadro", "↑ ↓ ← →"], ["Aceptar", "A"], ["Cancelar / regresar", "S"], ["Menú del día", "W"], ["Mapa de la región", "M"]]
  },
  wasd: {
    nombre: "WASD",
    arriba: ["w"], abajo: ["s"], izq: ["a"], der: ["d"],
    aceptar: ["j", "enter"], cancelar: ["k", "escape"], menu: ["q"], mapa: ["m"],
    leyenda: [["Mover el cuadro", "W A S D"], ["Aceptar", "J"], ["Cancelar / regresar", "K"], ["Menú del día", "Q"], ["Mapa de la región", "M"]]
  }
};

let esquema = "flechas";

function cargarControles() {
  try { const v = localStorage.getItem(CTRL_KEY); if (ESQUEMAS[v]) esquema = v; } catch { /* sin almacenamiento */ }
  return esquema;
}

function aplicarControles(id, { guardar = true } = {}) {
  if (!ESQUEMAS[id]) return;
  esquema = id;
  if (guardar) { try { localStorage.setItem(CTRL_KEY, id); } catch { /* sin almacenamiento */ } }
  const e = ESQUEMAS[id];
  const kb = $("kb-pause"); if (kb) kb.textContent = e.menu[0].toUpperCase();
  const btn = $("btn-pause"); if (btn) btn.title = `Menú del día (${e.menu[0].toUpperCase()})`;
  const filas = e.leyenda.map(([q, k]) => `<li><span>${hud.esc(q)}</span><kbd>${hud.esc(k)}</kbd></li>`).join("");
  const leg = $("keys-legend");
  if (leg) leg.innerHTML = filas;
  const ayuda = $("help-keys");
  if (ayuda) { ayuda.className = "keys-legend"; ayuda.innerHTML = filas; }
  for (const i of document.querySelectorAll("input[name=controls-live]")) i.checked = i.value === id;
  for (const i of document.querySelectorAll("input[name=controls]")) i.checked = i.value === id;
  describeControles();
}

function describeControles() {
  const d = $("controls-desc");
  if (!d) return;
  const e = ESQUEMAS[esquema];
  d.textContent = `${e.leyenda[0][1]} para mover el cuadro · ${e.leyenda[1][1]} aceptar · ${e.leyenda[2][1]} cancelar · ${e.leyenda[3][1]} abre el menú.`;
}

function esTecla(k, lista) { return lista.includes(k); }

function readSetup() {
  const f = $("setup-form");
  const faction = f.querySelector("input[name=faction]:checked").value;
  const houseInput = f.querySelector("input[name=house]:checked");
  return {
    scenario: f.dataset.scenario || "playa",
    size: f.querySelector("input[name=size]:checked").value,
    faction,
    house: houseInput ? houseInput.value : housesOf(faction)[0].id,
    mode: f.querySelector("input[name=mode]:checked").value,
    fog: $("fog").checked,
    fast: $("fast").checked,
    seed: $("seed").value.trim() || randomSeed(),
    controls: $("setup-form").querySelector("input[name=controls]:checked")?.value || esquema
  };
}

/** Las casas disponibles dependen del bando elegido */
function buildHouses(saved) {
  const f = $("setup-form");
  const faction = f.querySelector("input[name=faction]:checked").value;
  const box = $("house-seg");
  const prev = f.querySelector("input[name=house]:checked")?.value;
  box.innerHTML = "";
  housesOf(faction).forEach((h, i) => {
    const l = document.createElement("label");
    l.title = `${h.blurb} — ${h.bonusText}. Unidad única: ${UNITS[h.unique].name}.`;
    const checked = (prev === h.id) || (!prev && saved === h.id) || (!prev && !saved && i === 0);
    l.innerHTML = `<input type="radio" name="house" value="${h.id}"${checked ? " checked" : ""}><span>${hud.esc(h.name)}</span>`;
    l.querySelector("input").addEventListener("change", describeHouse);
    box.appendChild(l);
  });
  describeHouse();
}

function describeHouse() {
  const id = $("setup-form").querySelector("input[name=house]:checked")?.value;
  const h = HOUSES[id];
  $("house-desc").innerHTML = h
    ? `<b>${hud.esc(h.bonusText)}</b> · unidad única: ${hud.esc(UNITS[h.unique].name)}. <span class="muted">${hud.esc(h.blurb)}</span>`
    : "";
}

let setupBound = false;
function buildSetup() {
  const list = $("scenario-list");
  list.innerHTML = "";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LAST_KEY) || "{}"); } catch { saved = {}; }
  const f = $("setup-form");
  f.dataset.scenario = saved.scenario || "playa";
  for (const sc of Object.values(SCENARIOS)) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "scn";
    b.setAttribute("aria-pressed", String(sc.id === f.dataset.scenario));
    b.innerHTML = `<span class="scn-txt"><span class="t">${hud.esc(sc.name)}</span><span class="s">${hud.esc(sc.description)}</span></span>`;
    const mini = document.createElement("canvas");
    mini.width = 84; mini.height = 58; mini.className = "scn-mini";
    dibujarMiniatura(mini, sc.id);
    b.insertBefore(mini, b.firstChild);
    b.addEventListener("click", () => {
      f.dataset.scenario = sc.id;
      list.querySelectorAll(".scn").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      drawPreview();
    });
    list.appendChild(b);
  }
  for (const [name, val] of [["size", saved.size], ["faction", saved.faction], ["mode", saved.mode], ["controls", saved.controls || esquema]]) {
    const inp = val && f.querySelector(`input[name=${name}][value=${val}]`);
    if (inp) inp.checked = true;
  }
  if (typeof saved.fog === "boolean") $("fog").checked = saved.fog;
  if (typeof saved.fast === "boolean") $("fast").checked = saved.fast;
  $("seed").value = randomSeed();
  buildHouses(saved.house);
  if (!setupBound) {
    setupBound = true;
    f.querySelectorAll("input[name=faction]").forEach(i => i.addEventListener("change", () => buildHouses(null)));
    f.querySelectorAll("input[name=size]").forEach(i => i.addEventListener("change", drawPreview));
    f.querySelectorAll("input[name=controls]").forEach(i => i.addEventListener("change", () => aplicarControles(i.value)));
    $("seed").addEventListener("input", () => { clearTimeout(drawPreview._t); drawPreview._t = setTimeout(drawPreview, 250); });
    $("reroll").addEventListener("click", () => { $("seed").value = randomSeed(); drawPreview(); });
  }
  drawPreview();
}

/** Miniatura de un escenario para su botón: solo el terreno, a semilla fija */
function dibujarMiniatura(cv, scenarioId) {
  const map = generateMap({ scenario: scenarioId, size: "small", seed: `vitrina-${scenarioId}` });
  const ctx = cv.getContext("2d");
  const k = Math.min(cv.width / map.width, cv.height / map.height);
  const ox = (cv.width - map.width * k) / 2, oy = (cv.height - map.height * k) / 2;
  ctx.fillStyle = "#0d141b";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = getTerrain(map.terrain[y][x]);
    ctx.fillStyle = t.isRoad && t.id !== "bridge" && t.id !== "cityFloor" ? "#cdb27a" : t.color;
    ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
  }
  for (const w of map.walls) { ctx.fillStyle = w.type === "gate" ? "#6e4a2a" : "#cbbd9f"; ctx.fillRect(ox + w.x * k, oy + w.y * k, Math.ceil(k), Math.ceil(k)); }
  const punto = (p, col) => {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ox + (p.x + 0.5) * k, oy + (p.y + 0.5) * k, Math.max(2, k * 0.7), 0, Math.PI * 2); ctx.fill();
  };
  punto(map.starts.greek.camp, FACTIONS.greek.light);
  punto(map.citadel || map.starts.trojan.camp, FACTIONS.trojan.light);
}

function drawPreview() {
  const s = readSetup();
  const map = generateMap({ scenario: s.scenario, size: s.size, seed: s.seed });
  const cv = $("preview"), ctx = cv.getContext("2d");
  const k = Math.min(cv.width / map.width, cv.height / map.height);
  const ox = (cv.width - map.width * k) / 2, oy = (cv.height - map.height * k) / 2;
  ctx.fillStyle = "#0f161d"; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = getTerrain(map.terrain[y][x]);
    ctx.fillStyle = t.isRoad && t.id !== "bridge" && t.id !== "cityFloor" ? "#cdb27a" : t.color;
    ctx.fillRect(ox + x * k, oy + y * k, Math.ceil(k), Math.ceil(k));
    if (t.id === "forest") { ctx.fillStyle = "#35512a"; ctx.beginPath(); ctx.arc(ox + (x + 0.5) * k, oy + (y + 0.5) * k, k * 0.32, 0, Math.PI * 2); ctx.fill(); }
    if (t.id === "mountain") { ctx.fillStyle = "#f2f0ea"; ctx.beginPath(); ctx.moveTo(ox + (x + 0.5) * k, oy + (y + 0.15) * k); ctx.lineTo(ox + (x + 0.8) * k, oy + (y + 0.7) * k); ctx.lineTo(ox + (x + 0.2) * k, oy + (y + 0.7) * k); ctx.fill(); }
  }
  for (const w of map.walls) { ctx.fillStyle = w.type === "gate" ? "#6e4a2a" : "#cbbd9f"; ctx.fillRect(ox + w.x * k, oy + w.y * k, k, k); }
  for (const d of map.deposits) { ctx.fillStyle = d.type === "wheat" ? "#f0cf72" : "#e08b3a"; ctx.beginPath(); ctx.arc(ox + (d.x + 0.5) * k, oy + (d.y + 0.5) * k, k * 0.28, 0, Math.PI * 2); ctx.fill(); }
  for (const p of map.pickups || []) {
    ctx.fillStyle = { goats: "#f4f0e6", bag: "#f0c24a", ruins: "#b3a58c", relic: "#ffd86b" }[p.type];
    ctx.fillRect(ox + (p.x + 0.35) * k, oy + (p.y + 0.35) * k, k * 0.3, k * 0.3);
  }
  const mark = (p, col, label) => {
    ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox + (p.x + 0.5) * k, oy + (p.y + 0.5) * k, Math.max(5, k * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "700 11px Figtree, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(label, ox + (p.x + 0.5) * k, oy + (p.y + 0.5) * k - Math.max(8, k * 0.7));
  };
  mark(map.starts.greek.camp, FACTIONS.greek.color, "Aqueos");
  mark(map.citadel || map.starts.trojan.camp, FACTIONS.trojan.color, map.citadel ? "Troya" : "Troyanos");
  const counts = (map.pickups || []).reduce((a, p) => (a[p.type] = (a[p.type] || 0) + 1, a), {});
  $("preview-desc").textContent = `${map.scenario.description} ${map.width}×${map.height} casillas · ${map.deposits.length} yacimientos · ${counts.ruins || 0} ruinas · ${counts.relic || 0} reliquias.`;
}

function startGame(s) {
  settings = s;
  if (s.controls) aplicarControles(s.controls);
  // Si empiezas una partida nueva mientras la IA estaba pensando, su bandera se
  // quedaba levantada y la partida siguiente nacía creyendo que no te tocaba:
  // ni Fin del día ni Mercado, y las unidades sin obedecer.
  aiRunning = false;
  fastForward = false;
  $("ai-indicator").hidden = true;
  renderer.follow = false;
  if (s.chapterIndex == null) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ ...s, seed: undefined, chapterIndex: undefined })); } catch { /* sin almacenamiento */ }
  }
  const ch = s.chapterIndex != null ? CAMPAIGN[s.chapterIndex] : null;
  const mods = ch?.mods || {};
  const map = generateMap({
    scenario: s.scenario, size: s.size, seed: s.seed,
    villages: mods.villages ?? null, villagesFar: !!mods.villagesFar
  });
  const other = s.faction === "greek" ? "trojan" : "greek";
  const randomHouse = side => { const l = housesOf(side); return l[Math.floor(Math.random() * l.length)].id; };
  const players = {};
  if (s.mode === "hotseat") { players.greek = { control: "human" }; players.trojan = { control: "human" }; }
  else if (s.mode === "watch") { players.greek = { control: "ai", difficulty: "normal" }; players.trojan = { control: "ai", difficulty: "normal" }; }
  else { players[s.faction] = { control: "human" }; players[other] = { control: "ai", difficulty: s.mode }; }
  players[s.faction].house = s.house || randomHouse(s.faction);
  players[other].house = players[other].house || randomHouse(other);
  game = new Game(map, { players, fog: s.fog, goals: ch?.goals || null, mods });
  // la campaña conserva la veteranía de los héroes de un capítulo al siguiente
  if (ch) {
    const prog = loadProgress();
    for (const u of game.unitsOf(s.faction)) {
      const saved = prog.heroes?.[u.templateId];
      if (u.isHero() && saved) { u.ribbons = saved.ribbons || 0; u.battlesFought = saved.battles || 0; }
    }
  }
  renderer.speed = s.fast ? 2.2 : 1;
  $("log").innerHTML = "";
  for (const e of game.log) hud.appendLog(e);
  game.on((type, data) => {
    sonarEvento(type, data);
    if (type === "log") hud.appendLog(data);
    if (type === "gameOver") setTimeout(() => showGameOver(data), 600);
    if (["change", "attack", "death", "spawn", "build", "era", "move", "teleport", "heal", "power", "pickup"].includes(type)) scheduleRefresh();
  });
  musica.poner("partida");
  renderer.viewerId = viewer;
  renderer.setGame(game);
  resetUI();
  refresh();
  afterTurnChange();
}

/** Desde qué bando se ve la niebla */
function viewer() {
  if (!game) return null;
  const humans = game.order.filter(id => game.players[id].control === "human");
  if (humans.length === 1) return humans[0];
  if (humans.length === 2) return game.current.id;
  return null;
}

function isHumanTurn() {
  return game && !game.winner && !aiRunning && game.current.control === "human";
}

// ======================================================================
// Turnos
// ======================================================================
async function afterTurnChange() {
  if (!game || game.winner) return;
  const cur = game.current;
  if (cur.control === "ai") { await runAI(); return; }
  const humans = game.order.filter(id => game.players[id].control === "human");
  if (humans.length === 2 && game.fog) {
    $("handoff-name").textContent = cur.name;
    $("handoff").hidden = false;
    $("handoff-keys").textContent = `Pulsa ${ESQUEMAS[esquema].leyenda[1][1]} para empezar.`;
    resetUI();
    $("btn-handoff").focus();
  }
  const focus = game.heroesOf(cur.id)[0] || game.capitals(cur.id)[0];
  if (focus) renderer.centerOn(focus.x, focus.y);
  refresh();
}

async function runAI() {
  aiRunning = true;
  renderer.follow = true;
  $("ai-indicator").hidden = false;
  resetUI();
  refresh();
  const pause = async (ms = 120) => {
    await renderer.idle();
    if (!fastForward) await sleep(ms / renderer.speed);
  };
  try {
    await renderer.idle();
    await runAITurn(game, pause);
    await renderer.idle();
  } catch (e) {
    console.error(e);
  }
  $("ai-indicator").hidden = true;
  renderer.follow = false;
  aiRunning = false;
  fastForward = false;
  renderer.speed = settings.fast ? 2.2 : 1;
  if (game.winner) { refresh(); return; }
  game.endTurn();
  refresh();
  await afterTurnChange();
}

function endTurn() {
  if (!isHumanTurn() || renderer.busy) return;
  if (ui.phase === "menu" || ui.phase === "target" || ui.phase === "place") {
    hud.toast("Termina primero la orden de la unidad (o pulsa Esc para regresar).");
    return;
  }
  sfx.play("finDia");
  resetUI();
  game.endTurn();
  refresh();
  afterTurnChange();
}

// ======================================================================
// Estado de selección
// ======================================================================
function resetUI() {
  menuEl._foco = null;
  ui.sel = null; ui.phase = "idle"; ui.reach = null; ui.stayed = false;
  ui.sub = null; ui.action = null; ui.buildChoice = null;
  hud.renderForecast(null, null, null, null, null);
  closeMenu();
  updateOverlay();
}

function select(entity) {
  if (entity) sfx.play("seleccion");
  const cur = ui.cur, teclado = ui.teclado;
  resetUI();
  ui.cur = cur; ui.teclado = teclado;
  ui.sel = entity;
  if (entity) ui.cur = { x: entity.x, y: entity.y };
  if (entity?.kind === "unit") {
    const mine = entity.ownerId === game.current.id && isHumanTurn();
    if (!mine || (!entity.hasMoved && !entity.hasActed)) ui.reach = game.getReachable(entity);
  }
  if (entity?.kind === "building" && entity.ownerId === game.current.id && isHumanTurn()) {
    ui.phase = "bmenu";
  }
  refresh();
}

function ownActive(u) {
  return u && u.kind === "unit" && u.ownerId === game.current.id && isHumanTurn() && !u.hasActed;
}

function visibleUnitAt(x, y) {
  const u = game.unitAt(x, y);
  if (!u) return null;
  const v = viewer();
  if (u.ownerId !== v && game.fog && v && !game.isVisible(v, x, y)) return null;
  return u;
}

function visibleBuildingAt(x, y) {
  const b = game.buildingAt(x, y);
  if (!b) return null;
  const v = viewer();
  if (b.ownerId !== v && game.fog && v && !game.isExplored(v, x, y)) return null;
  return b;
}

/** Mejor casilla desde la que atacar a `target` moviéndose primero */
function bestOrigin(unit, target) {
  if (unit.hasMoved) return null;
  const reach = ui.reach || game.getReachable(unit);
  let best = null;
  const origins = unit.template.abilities?.includes("noMoveAndAttack") ? [{ x: unit.x, y: unit.y }] : [...reach.values()];
  for (const o of origins) {
    if (!game.getTargets(unit, o).includes(target)) continue;
    const r = game.predictAttack(unit, target, o);
    const terr = game.grid.terrainAt(o.x, o.y);
    const score = r.targetDamageTaken * 2 - r.attackerDamageTaken * 2 + terr.defenseMod * 30 - (o.cost || 0) * 0.5 + (o.x === unit.x && o.y === unit.y ? 3 : 0);
    if (!best || score > best.score) best = { ...o, score, result: r };
  }
  return best;
}

// ======================================================================
// Clics en el mapa
// ======================================================================
async function onTileClick(x, y) {
  if (!game || renderer.busy) return;
  const unit = visibleUnitAt(x, y);
  const bld = visibleBuildingAt(x, y);
  const sel = ui.sel;

  if (!isHumanTurn()) { select(unit || bld || null); return; }

  // --- menú de unidad abierto: hay que elegir en el menú
  if (ui.phase === "menu") {
    if (unit === sel) return;
    sfx.play("negado");
    hud.toast("Elige una orden en el menú. Esc o clic derecho para regresar.");
    return;
  }

  // --- eligiendo objetivo
  if (ui.phase === "target") {
    const target = ui.action.targets.find(t => t.x === x && t.y === y);
    if (target) { await runAction(ui.action, target); return; }
    hud.toast("Toca uno de los objetivos resaltados, o Esc para volver al menú.");
    return;
  }

  // --- eligiendo casilla para construir
  if (ui.phase === "place") {
    const opt = game.buildOptions(sel).find(o => o.x === x && o.y === y && o.building.id === ui.buildChoice.id);
    if (opt) { game.build(sel, x, y, ui.buildChoice.id); await renderer.idle(); resetUI(); nextHint(); refresh(); return; }
    hud.toast("Toca una casilla dorada, o Esc para volver al menú.");
    return;
  }

  // --- menú de edificio: un clic fuera lo cierra y se procesa normal
  if (ui.phase === "bmenu") { closeMenu(); ui.phase = "idle"; if (bld === sel) { resetUI(); refresh(); return; } }

  // --- unidad propia seleccionada con órdenes pendientes
  if (ownActive(sel)) {
    const enemy = (unit && unit.ownerId !== sel.ownerId) ? unit : (bld && bld.ownerId !== sel.ownerId && !unit) ? bld : null;
    if (enemy) {
      // atajo: mover y atacar de una vez
      if (game.getTargets(sel).includes(enemy)) { await doAttack(sel, enemy); return; }
      const o = bestOrigin(sel, enemy);
      if (o) {
        game.moveUnit(sel, o.x, o.y);
        await renderer.idle();
        if (game.getTargets(sel).includes(enemy)) { await doAttack(sel, enemy); return; }
        openUnitMenu(sel, false);
        return;
      }
      select(enemy);
      return;
    }
    if (unit === sel) { openUnitMenu(sel, true); return; }
    if (!sel.hasMoved && ui.reach && ui.reach.has(`${x},${y}`) && !unit) {
      game.moveUnit(sel, x, y);
      await renderer.idle();
      if (!sel.isAlive()) { resetUI(); refresh(); return; }
      openUnitMenu(sel, false);
      return;
    }
  }
  select(unit || bld || null);
}

function onCancel() {
  if (!game) return;
  if (ui.phase === "target" || ui.phase === "place") {
    ui.phase = "menu"; ui.action = null; ui.buildChoice = null;
    hud.renderForecast(null, null, null, null, null);
    refresh(); return;
  }
  if (ui.phase === "menu") {
    if (ui.sub) { ui.sub = null; refresh(); return; }
    regresar();
    return;
  }
  if (ui.phase === "bmenu") { resetUI(); refresh(); return; }
  resetUI();
  refresh();
}

/** Deshace el movimiento y vuelve a mostrar el alcance */
function regresar() {
  const s = ui.sel;
  if (s && s.kind === "unit" && s.hasMoved && !s.hasActed && isHumanTurn()) {
    if (!game.undoMove(s)) { hud.toast("No se puede regresar: la unidad recogió algo al moverse."); return; }
  }
  const keep = s;
  resetUI();
  if (keep && keep.isAlive()) select(keep);
  refresh();
}

function onHover(t) {
  ui.hover = t;
  ui.teclado = false;
  if (t) ui.cur = { x: t.x, y: t.y };
  hud.renderTileInfo(game, t, viewer());
  updateOverlay();
  const s = ui.sel;
  const clear = () => hud.renderForecast(null, null, null, null, null);
  if (!t || !ownActive(s)) return clear();
  // pronóstico: en modo objetivo de ataque, o como atajo desde el alcance
  const u = visibleUnitAt(t.x, t.y);
  const b = visibleBuildingAt(t.x, t.y);
  const enemy = (u && u.ownerId !== s.ownerId) ? u : (b && b.ownerId !== s.ownerId && !u) ? b : null;
  if (!enemy) return clear();
  let origin = null, result = null;
  if (ui.phase === "target" && ui.action.kind === "attack") {
    if (!ui.action.targets.includes(enemy)) return clear();
    origin = { x: s.x, y: s.y }; result = game.predictAttack(s, enemy);
  } else if (ui.phase === "idle") {
    if (game.getTargets(s).includes(enemy)) { origin = { x: s.x, y: s.y }; result = game.predictAttack(s, enemy); }
    else { const o = bestOrigin(s, enemy); if (o) { origin = o; result = o.result; } }
    if (origin && (origin.x !== s.x || origin.y !== s.y)) renderer.setOverlay({ ...renderer.overlay, path: game.grid.pathTo(ui.reach, origin.x, origin.y) });
  } else return clear();
  if (!result) return clear();
  const scr = renderer.worldToScreen((t.x + 0.5) * 64, (t.y + 0.5) * 64);
  hud.renderForecast(game, s, enemy, origin, result, scr);
}

/**
 * Traduce lo que pasa en la partida a sonido. Se llama con todos los eventos
 * del motor; los que no tienen sonido asignado simplemente se ignoran.
 */
function sonarEvento(type, data) {
  switch (type) {
    case "attack":
      sfx.play(sfx.sonidoDeAtaque(data.attacker?.template));
      break;
    case "shoot":
      sfx.play("flecha");
      break;
    case "damage":
      sfx.play("impacto");
      break;
    case "death":
      if (data.silent) break;
      sfx.play(data.entity?.kind === "building" ? "derrumbe" : "muerte");
      break;
    case "move":
      sfx.play(sfx.sonidoDeMovimiento(data.unit?.template));
      break;
    case "build":
      sfx.play("construir");
      break;
    case "spawn":
      if (!data.silent) sfx.play("reclutar");
      break;
    case "capture":
      sfx.play("captura");
      break;
    case "era":
      sfx.play("era");
      break;
    case "heal":
      sfx.play("curar");
      break;
    case "power":
      sfx.play("poder");
      break;
    case "pickup":
      sfx.play("reliquia");
      break;
    case "turnStart":
      // solo cuando te toca a ti: si sonara en cada turno de la IA, cansaría
      if (data.player?.control === "human") sfx.play("turno");
      break;
    case "gameOver":
      // el final lo canta showGameOver, que sabe si ganaste tú
      break;
  }
}

function updateOverlay() {
  if (!game) return;
  const o = {};
  const s = ui.sel;
  if (s) o.selected = { x: s.x, y: s.y };
  const cuadro = ui.hover || (ui.teclado ? ui.cur : null);
  if (cuadro) o.hover = cuadro;
  if (s && s.kind === "unit") {
    const mine = s.ownerId === game.current.id && isHumanTurn();
    if (ui.phase === "place") {
      o.build = game.buildOptions(s).filter(b => b.building.id === ui.buildChoice.id);
    } else if (ui.phase === "target") {
      if (["heal", "inspire", "offer", "repair"].includes(ui.action.kind)) o.support = ui.action.targets;
      else o.targets = ui.action.targets;
    } else if (ui.phase === "menu") {
      // en el menú se ve a quién se puede atacar desde aquí
      o.threatSoft = game.getTargets(s);
    } else if (mine && !s.hasActed && !s.hasMoved && ui.reach) {
      o.reach = [...ui.reach.values()];
      const threat = game.getThreatTiles(s, ui.reach);
      o.threat = [...threat.values()].filter(t => {
        if (ui.reach.has(`${t.x},${t.y}`)) return false;
        const u = game.unitAt(t.x, t.y), b = game.buildingAt(t.x, t.y);
        return !(u && u.ownerId === s.ownerId) && !(b && b.ownerId === s.ownerId);
      });
      const tg = new Set();
      for (const t of threat.values()) {
        const e = visibleUnitAt(t.x, t.y) || visibleBuildingAt(t.x, t.y);
        if (e && e.ownerId !== s.ownerId && (!s.template.abilities?.includes("buildingsOnly") || e.kind === "building")) tg.add(e);
      }
      o.targets = [...tg];
      if (ui.hover && ui.reach.has(`${ui.hover.x},${ui.hover.y}`)) o.path = game.grid.pathTo(ui.reach, ui.hover.x, ui.hover.y);
      // casillas a su alcance donde se curaría al empezar tu próximo turno
      if (s.currentHp < s.maxHp) {
        const cura = [];
        for (const t of ui.reach.values()) if (game.healingAt(t.x, t.y, s.ownerId)) cura.push(t);
        if (cura.length) o.heal = cura;
      }
    } else if (!mine && ui.reach) {
      o.enemyReach = [...ui.reach.values()];
    }
  }
  renderer.setOverlay(o);
}

// ======================================================================
// Menú de acciones de unidad
// ======================================================================
function openUnitMenu(u, stayed) {
  sfx.play("menuAbrir");
  ui.sel = u;
  ui.phase = "menu";
  ui.stayed = stayed;
  ui.sub = null;
  ui.reach = null;
  refresh();
}

/** Construye la lista de órdenes disponibles para la unidad */
function unitMenuItems(u) {
  const items = [];
  const targets = game.getTargets(u);
  if (targets.length) items.push({ label: "Atacar", icono: "atacar", note: `${targets.length} objetivo${targets.length > 1 ? "s" : ""}`, kind: "primary", run: () => startTarget({ kind: "attack", label: "Atacar", targets }) });

  for (const p of game.heroActions(u)) {
    items.push({
      label: p.power.name, icono: "poder", note: "poder", kind: "primary", title: p.power.effect,
      run: () => p.targets ? startTarget({ kind: "power", label: p.power.name, targets: p.targets, power: p.power }) : runAction({ kind: "power", power: p.power }, null)
    });
  }
  const horse = game.horseTargets(u);
  if (horse.length) items.push({ label: "Abrir el caballo", icono: "caballo", kind: "primary", run: () => startTarget({ kind: "horse", label: "Abrir el caballo", targets: horse }) });

  const temples = game.relicTemples(u);
  if (temples.length) items.push({ label: "Ofrendar reliquia", icono: "ofrendar", note: "+25 bronce/turno", kind: "primary", run: () => startTarget({ kind: "offer", label: "Ofrendar", targets: temples }) });

  const support = game.supportTargets(u);
  const hurt = support.filter(x => x.currentHp < x.maxHp);
  if (hurt.length) items.push({ label: "Curar", icono: "curar", note: "+30 HP", run: () => startTarget({ kind: "heal", label: "Curar", targets: hurt }) });
  const fresh = support.filter(x => !x.hasActed && x.template.attack > 0);
  if (fresh.length) items.push({ label: "Inspirar", icono: "inspirar", note: "+25% ataque", run: () => startTarget({ kind: "inspire", label: "Inspirar", targets: fresh }) });
  const conv = game.convertTargets(u);
  if (conv.length) {
    const best = Math.max(...conv.map(t => game.convertChance(u, t)));
    items.push({ label: "Convertir", icono: "convertir", note: `hasta ${Math.round(best * 100)}%`, run: () => startTarget({ kind: "convert", label: "Convertir", targets: conv }) });
  }

  // --- máquinas de asedio que se montan
  if (game.canDeploy(u)) {
    items.push({
      icono: "montar", label: u.deployed ? "Desmontar" : "Montar la máquina",
      note: u.deployed ? "para poder moverla" : "para poder disparar",
      kind: u.deployed ? "" : "primary",
      title: u.deployed ? "Desmontada se mueve pero no dispara." : "Montada dispara a su alcance, pero no se mueve.",
      run: () => { game.toggleDeploy(u); renderer.idle().then(() => { resetUI(); nextHint(); refresh(); }); }
    });
  }

  const build = game.buildOptions(u);
  if (build.length) items.push({ label: "Construir", icono: "construir", note: "▸", run: () => { ui.sub = "build"; refresh(); } });
  const rep = game.repairTargets(u).filter(b => b.currentHp < b.maxHp);
  if (rep.length) {
    const c = game.repairCost(rep[0]);
    items.push({
      label: "Reparar", icono: "reparar",
      note: rep.length === 1 ? `${c.grain}/${c.bronze}` : "deja el edificio entero",
      disabled: rep.length === 1 && !game.canAfford(u.ownerId, c),
      run: () => startTarget({ kind: "repair", label: "Reparar", targets: rep })
    });
  }

  items.push({ label: ui.stayed ? "Esperar aquí" : "Esperar", icono: "esperar", note: "fin", run: () => { game.waitUnit(u); resetUI(); nextHint(); refresh(); } });
  if (!ui.stayed && u.hasMoved) items.push({ label: "Regresar", icono: "regresar", note: "Esc", kind: "ghost", run: regresar, disabled: !!u.pickedThisMove, title: u.pickedThisMove ? "Recogió algo al moverse" : "" });
  else items.push({ label: "Cancelar", icono: "regresar", note: "Esc", kind: "ghost", run: () => { const keep = u; resetUI(); select(keep); } });
  return items;
}

function buildMenuItems(u) {
  const opts = game.buildOptions(u);
  const seen = new Map();
  for (const b of opts) if (!seen.has(b.building.id)) seen.set(b.building.id, b);
  const items = [...seen.values()].map(o => ({
    label: o.building.name,
    icon: buildingSprite(o.building, u.ownerId, 64),
    cost: o.cost,
    title: o.building.description,
    disabled: !game.canAfford(u.ownerId, o.cost),
    run: () => {
      const valid = opts.filter(b => b.building.id === o.building.id);
      if (valid.length === 1) { game.build(u, valid[0].x, valid[0].y, o.building.id); renderer.idle().then(() => { resetUI(); nextHint(); refresh(); }); return; }
      ui.phase = "place"; ui.buildChoice = o.building; refresh();
    }
  }));
  items.push({ label: "Atrás", kind: "ghost", note: "Esc", run: () => { ui.sub = null; refresh(); } });
  return items;
}

function startTarget(action) {
  // con un solo objetivo no hace falta elegir, salvo para atacar (ver pronóstico)
  if (action.targets.length === 1 && action.kind !== "attack" && action.kind !== "convert") { runAction(action, action.targets[0]); return; }
  ui.phase = "target";
  ui.action = action;
  refresh();
}

async function runAction(action, target) {
  const u = ui.sel;
  hud.renderForecast(null, null, null, null, null);
  switch (action.kind) {
    case "attack": await doAttack(u, target); return;
    case "power": game.usePower(u, action.power.id, target); break;
    case "heal": game.healUnit(u, target); break;
    case "inspire": game.inspireUnit(u, target); break;
    case "convert": game.convertUnit(u, target); break;
    case "repair": game.repair(u, target); break;
    case "offer": game.offerRelic(u, target); break;
    case "horse": game.infiltrate(u, target); break;
  }
  await renderer.idle();
  // un poder no gasta el turno de la unidad: vuelve a su menú
  if (u.isAlive() && !u.hasActed) { openUnitMenu(u, ui.stayed); return; }
  resetUI();
  nextHint();
  refresh();
}

async function doAttack(u, target) {
  hud.renderForecast(null, null, null, null, null);
  closeMenu();
  game.attack(u, target);
  await renderer.idle();
  resetUI();
  nextHint();
  refresh();
}

// ======================================================================
// Menú de edificio
// ======================================================================
function buildingMenuItems(b) {
  const items = [];
  const p = game.players[b.ownerId];
  if (b.template.produces) {
    const pop = game.unitsOf(b.ownerId).length >= game.popCap(b.ownerId);
    for (const o of game.recruitOptions(b)) {
      const t = o.template;
      items.push({
        label: t.name + (o.hero ? " (volver)" : ""),
        icon: unitSprite(t, b.ownerId, 64),
        cost: o.cost,
        detail: o.hero && !o.ready ? `listo en ${o.readyIn} turno(s)` : `ATQ ${t.attack} · DEF ${t.defense} · MOV ${t.move}${t.range > 1 ? ` · ALC ${t.range}` : ""}`,
        disabled: pop || (o.hero && !o.ready) || !game.canAfford(b.ownerId, o.cost),
        title: pop ? "Has llegado al límite de población: sube tus ingresos con granjas y minas." : "",
        run: () => { const u = game.recruit(b, o.unitId); if (u) renderer.idle().then(() => { resetUI(); refresh(); }); }
      });
    }
  }
  if (b.template.isCapital) {
    const prog = game.eraProgress(b.ownerId);
    const next = ERAS[p.era + 1];
    items.push({ label: "Tecnologías y eras", note: next ? `${prog.have}/${prog.need} para era ${p.era + 1}` : "", kind: "primary", run: () => { resetUI(); openTechs(); } });
    items.push({ label: "Mercado", note: "cambiar recursos", run: () => { resetUI(); openMarket(); } });
    if (p.era >= 2) {
      items.push({
        label: "Mercenarios", icon: unitSprite(UNITS.mercenary, b.ownerId, 64),
        detail: "tres distintos cada día",
        disabled: !game.mercenaryOffer(b.ownerId).length,
        run: () => { openMarket(); }
      });
    }
  }
  items.push({ label: "Cerrar", kind: "ghost", note: "Esc", run: () => { resetUI(); refresh(); } });
  return items;
}

function buildingMenuHint(b) {
  if (b.underConstruction) return b.buildTurnsLeft > 1 ? `En obra: faltan ${b.buildTurnsLeft} turnos.` : "En obra: listo el próximo turno.";
  if (b.producedThisTurn) return "Ya ha entrenado una unidad este turno.";
  if (b.template.produces && !game.recruitOptions(b).length) return "Nada que entrenar todavía: avanza de era.";
  if (b.template.id === "wonder") {
    const w = game.players[b.ownerId].wonder;
    return w ? `Resiste ${w.left} turnos más y ganas.` : "";
  }
  return "";
}

// ======================================================================
// Pintado del menú flotante
// ======================================================================
const menuEl = $("action-menu");

function closeMenu() { if (!menuEl.hidden) sfx.play("menuCerrar"); menuEl.hidden = true; menuEl.innerHTML = ""; menuEl.dataset.for = ""; menuEl._items = null; menuEl._foco = null; menuEl._sig = null; }

function renderMenu() {
  const s = ui.sel;
  let items = null, title = "", hint = "";
  if (ui.phase === "menu" && s) {
    items = ui.sub === "build" ? buildMenuItems(s) : unitMenuItems(s);
    title = ui.sub === "build" ? "Construir" : s.name;
    if (ui.sub === "build") hint = "Se construye en la casilla donde está parado el colono. Los edificios de ciudad van pegados al campamento y las torres en sus esquinas; el molino sobre un trigal y las granjas al lado del molino.";
  } else if (ui.phase === "target" && s) {
    items = [{ label: "Volver al menú", kind: "ghost", note: "Esc", run: onCancel }];
    title = ui.action.label;
    hint = ui.action.kind === "attack" ? "Toca un enemigo en rojo. Pasa el cursor para ver el pronóstico."
      : ui.action.kind === "convert" ? `Probabilidad: ${ui.action.targets.map(t => `${t.name} ${Math.round(game.convertChance(s, t) * 100)}%`).join(", ")}`
        : "Toca uno de los objetivos resaltados.";
  } else if (ui.phase === "place" && s) {
    items = [{ label: "Volver al menú", kind: "ghost", note: "Esc", run: onCancel }];
    title = ui.buildChoice.name;
    hint = "Toca una casilla dorada.";
  } else if (ui.phase === "bmenu" && s && s.isAlive()) {
    items = buildingMenuItems(s);
    title = s.name;
    hint = buildingMenuHint(s);
  }
  if (!items) { closeMenu(); return; }

  menuEl.innerHTML = "";
  const h = document.createElement("div");
  h.className = "am-head";
  h.textContent = title;
  menuEl.appendChild(h);
  if (hint) { const p = document.createElement("p"); p.className = "am-hint"; p.textContent = hint; menuEl.appendChild(p); }
  // las órdenes de una unidad van en rejilla de iconos, como en consola;
  // las listas de reclutar o construir siguen en filas, que llevan coste
  const rejilla = items.some(it => it.icono);
  if (rejilla) {
    const grid = document.createElement("div");
    grid.className = "am-grid";
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `am-tile ${it.kind || ""}`;
      b.disabled = !!it.disabled;
      if (it.title) b.title = it.title;
      const cv = document.createElement("canvas");
      cv.width = 48; cv.height = 48; cv.className = "am-tile-icon";
      cv.getContext("2d").drawImage(actionIcon(it.icono || "", 48), 0, 0);
      b.appendChild(cv);
      const lab = document.createElement("span");
      lab.className = "am-tile-label";
      lab.textContent = it.label;
      b.appendChild(lab);
      if (it.note) { const nt = document.createElement("span"); nt.className = "am-tile-note"; nt.textContent = it.note; b.appendChild(nt); }
      if (i < 9) { const kb = document.createElement("kbd"); kb.textContent = String(i + 1); b.appendChild(kb); }
      b.addEventListener("click", e => { e.stopPropagation(); if (!it.disabled) it.run(); });
      grid.appendChild(b);
    });
    menuEl.appendChild(grid);
    menuEl._items = items;
    menuEl.hidden = false;
    menuEl.dataset.for = s.instanceId;
    positionMenu();
    sincronizarFoco(items, `${ui.phase}/${ui.sub}/${s.instanceId}/${items.length}`);
    return;
  }

  const list = document.createElement("div");
  list.className = "am-list";
  items.forEach((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `am-item ${it.kind || ""}`;
    b.disabled = !!it.disabled;
    if (it.title) b.title = it.title;
    const key = i < 9 ? `<kbd>${i + 1}</kbd>` : "";
    let right = it.note ? `<span class="am-note">${hud.esc(it.note)}</span>` : "";
    if (it.cost) right = hud.costHtml(game, s.ownerId, it.cost);
    b.innerHTML = `${key}<span class="am-label">${hud.esc(it.label)}${it.detail ? `<small>${hud.esc(it.detail)}</small>` : ""}</span>${right}`;
    if (it.icon) {
      const cv = document.createElement("canvas");
      cv.width = 64; cv.height = 64; cv.className = "am-icon";
      cv.getContext("2d").drawImage(it.icon, 0, 0);
      b.insertBefore(cv, b.querySelector(".am-label"));
    }
    b.addEventListener("click", e => { e.stopPropagation(); if (!it.disabled) it.run(); });
    list.appendChild(b);
  });
  menuEl.appendChild(list);
  menuEl._items = items;
  menuEl.hidden = false;
  menuEl.dataset.for = s.instanceId;
  positionMenu();
  sincronizarFoco(items, `${ui.phase}/${ui.sub}/${s.instanceId}/${items.length}`);
}

/** Mantiene el resaltado del teclado entre repintados, y lo reinicia al cambiar de menú */
function sincronizarFoco(items, firma) {
  if (menuEl._sig !== firma) { menuEl._sig = firma; menuEl._foco = null; }
  if (menuEl._foco == null || items[menuEl._foco]?.disabled) {
    const i = items.findIndex(it => !it.disabled);
    menuEl._foco = i < 0 ? null : i;
  }
  pintarFoco();
}

/** Coloca el menú junto a la entidad, sin salirse del mapa */
function positionMenu() {
  if (menuEl.hidden || !ui.sel || !game) return;
  const wrap = menuEl.parentElement.getBoundingClientRect();
  const s = ui.sel;
  const z = renderer.cam.zoom;

  // eligiendo objetivo o casilla: el menú se retira a una esquina libre para
  // no taparte justo al enemigo o al hueco que tienes que tocar
  if (ui.phase === "target" || ui.phase === "place") {
    const w0 = menuEl.offsetWidth, h0 = menuEl.offsetHeight, t0 = 64 * z, m = 10;
    const marcas = (ui.phase === "target" ? ui.action.targets : game.buildOptions(s))
      .concat([{ x: s.x, y: s.y }])
      .map(t => renderer.worldToScreen(t.x * 64, t.y * 64));
    const esquinas = [
      { x: m, y: wrap.height - h0 - m },
      { x: wrap.width - w0 - m, y: wrap.height - h0 - m },
      { x: m, y: m },
      { x: wrap.width - w0 - m, y: m }
    ];
    const tapa = c => marcas.some(p => p.x + t0 > c.x && p.x < c.x + w0 && p.y + t0 > c.y && p.y < c.y + h0);
    const libre = esquinas.find(c => !tapa(c)) || esquinas[0];
    menuEl.style.left = `${Math.round(libre.x)}px`;
    menuEl.style.top = `${Math.round(libre.y)}px`;
    return;
  }
  const p = renderer.worldToScreen(s.x * 64, s.y * 64);
  const tile = 64 * z;
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  let x = p.x + tile + 10;
  if (x + w > wrap.width - 8) x = p.x - w - 10;
  if (x < 8) x = Math.max(8, Math.min(wrap.width - w - 8, p.x + tile / 2 - w / 2));
  let y = p.y + tile / 2 - Math.min(h / 2, 60);
  y = Math.max(8, Math.min(y, wrap.height - h - 8));
  menuEl.style.left = `${Math.round(x)}px`;
  menuEl.style.top = `${Math.round(y)}px`;
}
(function followMenu() { positionMenu(); requestAnimationFrame(followMenu); })();

// ======================================================================
// Refresco de paneles
// ======================================================================
let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; refresh(); });
}

function refresh() {
  if (!game) return;
  if (ui.sel && !ui.sel.isAlive()) resetUI();
  if (ui.sel && ui.sel.kind === "unit" && ui.sel.hasActed && ui.phase !== "idle") { ui.phase = "idle"; ui.action = null; }
  const v = viewer() || game.current.id;
  hud.renderTopbar(game, v);
  hud.renderObjectives(game, v);
  hud.renderSelection(game, ui.sel, v);
  if (renderer.busy && ui.phase !== "bmenu") closeMenu(); else renderMenu();
  updateOverlay();
  const human = isHumanTurn();
  $("btn-end").disabled = !human;
  $("btn-market").disabled = !human;
}

function nextHint() {
  if (!isHumanTurn()) return;
  const idle = game.unitsOf(game.current.id).filter(u => !u.hasActed);
  if (!idle.length) hud.toast("Todas tus unidades han actuado. Pulsa Fin de turno.", 2000);
}

function selectNextIdle() {
  if (!isHumanTurn() || ui.phase === "menu" || ui.phase === "target" || ui.phase === "place") return;
  const idle = game.unitsOf(game.current.id).filter(u => !u.hasActed);
  if (!idle.length) { hud.toast("No quedan unidades libres."); return; }
  const i = ui.sel ? (idle.indexOf(ui.sel) + 1) % idle.length : 0;
  const u = idle[i < 0 ? 0 : i];
  select(u);
  renderer.centerOn(u.x, u.y);
}

// ======================================================================
// Modales
// ======================================================================
function openTechs() {
  const v = viewer() || game.current.id;
  const draw = () => hud.renderTechs(game, v, isHumanTurn() && v === game.current.id,
    id => { if (game.research(v, id)) sfx.play("investigar"); draw(); refresh(); },
    () => { game.advanceEra(v); draw(); refresh(); });
  draw();
  $("techs").showModal();
}

function openMarket() {
  if (!isHumanTurn()) return;
  const id = game.current.id;
  const draw = () => hud.renderMarket(game, id, isHumanTurn(), from => { if (game.trade(id, from)) sfx.play("moneda"); draw(); refresh(); },
    unitId => { if (game.hireMercenary(id, unitId)) { sfx.play("reclutar"); $("market").close(); renderer.idle().then(refresh); } });
  draw();
  $("market").showModal();
}

// ======================================================================
// Campaña
// ======================================================================
let campaignPick = 0;

function openCampaign() {
  const prog = loadProgress();
  campaignPick = Math.min(prog.chapter, CAMPAIGN.length - 1);
  drawCampaign();
  $("campaign").showModal();
}

function drawCampaign() {
  const prog = loadProgress();
  const list = $("chapter-list");
  list.innerHTML = "";
  CAMPAIGN.forEach((c, i) => {
    const locked = i > prog.chapter;
    const done = (prog.done || []).includes(c.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chapter${locked ? " locked" : ""}${done ? " done" : ""}`;
    b.disabled = locked;
    b.setAttribute("aria-pressed", String(i === campaignPick));
    b.innerHTML = `<span class="t">${hud.esc(c.name)}${done ? " ✓" : locked ? " 🔒" : ""}</span><span class="s">${hud.esc(c.subtitle)}</span>`;
    b.addEventListener("click", () => { campaignPick = i; drawCampaign(); });
    list.appendChild(b);
  });
  const c = CAMPAIGN[campaignPick];
  $("briefing").innerHTML = `<h3>${hud.esc(c.name)}</h3><p class="muted small">${hud.esc(c.subtitle)}</p>`
    + c.briefing.map(p => `<p>${hud.esc(p)}</p>`).join("")
    + `<p class="goal-line"><b>Tu objetivo:</b> ${hud.esc(c.goals.greek.text)}</p>`
    + `<p class="goal-line foe"><b>El rival busca:</b> ${hud.esc(c.goals.trojan.text)}</p>`;
  $("btn-chapter").textContent = `Jugar ${c.name.split("·")[0].trim()}`;
}

function startChapter(i) {
  const c = CAMPAIGN[i];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LAST_KEY) || "{}"); } catch { saved = {}; }
  $("campaign").close();
  startGame({
    chapterIndex: i, scenario: c.scenario, size: c.size, seed: c.seed,
    faction: "greek", house: saved.house || "mirmidones", mode: c.difficulty || "normal",
    fog: true, fast: !!saved.fast
  });
  hud.toast(c.goals.greek.text, 4200);
}

function showGameOver({ winner, message }) {
  const humans = game.order.filter(id => game.players[id].control === "human");
  const won = humans.includes(winner);
  const title = humans.length === 1 ? (won ? "¡Victoria!" : "Derrota") : `Ganan los ${FACTIONS[winner].name}`;
  const stat = id => {
    const p = game.players[id];
    const fila = (q, v) => `<span><i>${hud.esc(q)}</i><b>${hud.esc(String(v))}</b></span>`;
    return `<div class="${id}"><b class="go-name">${hud.esc(p.name)}</b>
      ${fila("Era", p.era)}${fila("Tecnologías", p.techs.size)}
      ${fila("Bajas causadas", p.stats.kills)}${fila("Unidades perdidas", p.stats.lost)}
      ${fila("Edificios", p.stats.built)}</div>`;
  };
  const ch = settings?.chapterIndex != null ? CAMPAIGN[settings.chapterIndex] : null;
  let extra = "";
  if (ch) {
    const prog = loadProgress();
    if (won) {
      prog.done = prog.done || [];
      if (!prog.done.includes(ch.id)) prog.done.push(ch.id);
      prog.chapter = Math.max(prog.chapter, Math.min(CAMPAIGN.length - 1, settings.chapterIndex + 1));
      prog.heroes = prog.heroes || {};
      for (const u of game.unitsOf("greek")) {
        if (u.isHero()) prog.heroes[u.templateId] = { ribbons: u.ribbons, battles: u.battlesFought };
      }
      saveProgress(prog);
      const vets = Object.entries(prog.heroes).filter(([, h]) => h.ribbons > 0)
        .map(([id, h]) => `${id} ${"★".repeat(h.ribbons)}`).join(" · ");
      extra = `<p class="muted small">Capítulo superado.${vets ? ` Tus veteranos pasan al siguiente: ${hud.esc(vets)}` : ""}</p>`;
    } else {
      extra = `<p class="muted small">Puedes repetir el capítulo las veces que haga falta.</p>`;
    }
  }
  sfx.play(won ? "victoria" : "derrota");
  musica.poner("final");
  $("gameover").classList.toggle("won", !!won);
  $("gameover").classList.toggle("lost", !won);
  $("gameover-body").innerHTML = `<span class="brand-mark big" aria-hidden="true">Ω</span><h2>${title}</h2>${ch ? `<p class="chapter-tag">${hud.esc(ch.name)}</p>` : ""}<p class="muted">${hud.esc(message)}</p>${extra}<p class="muted small">Turno ${game.round} · ${hud.esc(game.scenario.name)} · semilla ${hud.esc(game.map.seed)}</p><div class="go-stats">${stat("greek")}${stat("trojan")}</div>`;
  $("btn-next").hidden = !(ch && won && settings.chapterIndex < CAMPAIGN.length - 1);
  resetUI();
  $("gameover").showModal();
  refresh();
}

// ======================================================================
// Eventos de la interfaz
// ======================================================================
renderer.onTileClick = (x, y) => { onTileClick(x, y); };
renderer.onTileHover = onHover;
renderer.onCancel = onCancel;

const cerrarPausa = () => { const d = $("pause"); if (d.open) d.close(); };
$("btn-pause").addEventListener("click", openPause);
$("btn-end").addEventListener("click", () => { cerrarPausa(); endTurn(); });
$("btn-map").addEventListener("click", () => { cerrarPausa(); openMap(); });
$("btn-techs").addEventListener("click", () => { cerrarPausa(); if (game) openTechs(); });
$("btn-market").addEventListener("click", () => { cerrarPausa(); openMarket(); });
$("btn-help").addEventListener("click", () => { cerrarPausa(); $("help").showModal(); });
$("btn-howto").addEventListener("click", () => $("help").showModal());
$("btn-menu").addEventListener("click", () => { cerrarPausa(); musica.poner("menu"); buildSetup(); $("setup").showModal(); });
document.querySelectorAll("input[name=controls-live]").forEach(i => i.addEventListener("change", () => aplicarControles(i.value)));

// ---- mesa de mezclas del Menú del día ----
function pintarMezcla() {
  for (const cual of ["maestro", "efectos", "musica"]) {
    const s = $(`snd-${cual}`), n = $(`snd-n-${cual}`);
    if (!s) continue;
    s.value = sfx.vol[cual];
    s.disabled = sfx.vol.mudo;
    n.textContent = `${Math.round(sfx.vol[cual] * 100)}%`;
  }
  const m = $("snd-mudo");
  if (m) m.checked = sfx.vol.mudo;
}
for (const cual of ["maestro", "efectos", "musica"]) {
  $(`snd-${cual}`)?.addEventListener("input", e => {
    sfx.setVolumen(cual, Number(e.target.value));
    $(`snd-n-${cual}`).textContent = `${Math.round(e.target.value * 100)}%`;
  });
  // al soltar el deslizador suena algo, para oír dónde lo dejaste
  $(`snd-${cual}`)?.addEventListener("change", () => sfx.play(cual === "musica" ? "obraLista" : "espada"));
}
$("snd-mudo")?.addEventListener("change", e => { sfx.setMudo(e.target.checked); pintarMezcla(); });
$("btn-campaign").addEventListener("click", () => { $("setup").close(); openCampaign(); });
$("btn-chapter").addEventListener("click", () => startChapter(campaignPick));
$("btn-campaign-reset").addEventListener("click", () => { resetProgress(); campaignPick = 0; drawCampaign(); });
$("btn-next").addEventListener("click", () => { $("gameover").close(); startChapter(settings.chapterIndex + 1); });
$("btn-speed").addEventListener("click", () => { fastForward = true; renderer.speed = 4; });
$("btn-handoff").addEventListener("click", () => {
  $("handoff").hidden = true;
  ui.cur = cursorInicial();
  refresh();
});
$("btn-view").addEventListener("click", () => $("gameover").close());
$("btn-rematch").addEventListener("click", () => { $("gameover").close(); startGame(settings); });
$("btn-new").addEventListener("click", () => { $("gameover").close(); buildSetup(); $("setup").showModal(); });
document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
// un clic en cualquier botón del juego hace clic de verdad
document.addEventListener("pointerdown", e => {
  const b = e.target.closest?.("button");
  if (b && !b.disabled && !b.closest("#action-menu")) sfx.play("boton");
}, true);
document.querySelectorAll("dialog").forEach(d => d.addEventListener("close", () => sfx.play("menuCerrar")));
document.querySelectorAll("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d && d.id !== "setup") d.close(); }));

$("setup-form").addEventListener("submit", e => {
  e.preventDefault();
  const s = readSetup();
  $("setup").close();
  startGame(s);
});
$("setup").addEventListener("cancel", e => { if (!game) e.preventDefault(); });

// ======================================================================
// Juego con teclado: un cuadro que se mueve por el tablero
// ======================================================================
/** Casilla desde la que arranca el cuadro cuando aún no hay ninguno */
function cursorInicial() {
  if (ui.sel) return { x: ui.sel.x, y: ui.sel.y };
  if (game) {
    const libre = game.unitsOf(game.current.id).find(u => !u.hasActed);
    if (libre) return { x: libre.x, y: libre.y };
    const cap = game.capitals(game.current.id)[0];
    if (cap) return { x: cap.x, y: cap.y };
  }
  return { x: 0, y: 0 };
}

function moverCursor(dx, dy) {
  if (!game) return;
  const c = ui.cur || cursorInicial();
  const x = Math.min(game.grid.width - 1, Math.max(0, c.x + dx));
  const y = Math.min(game.grid.height - 1, Math.max(0, c.y + dy));
  renderer.ensureVisible(x, y);
  sfx.play("cursor");
  onHover({ x, y });
  ui.teclado = true;   // onHover lo apaga: aquí mandamos nosotros
  updateOverlay();
}

/** Mueve el resaltado dentro del menú flotante */
function moverFoco(paso) {
  const items = menuEl._items;
  if (!items || !items.length) return false;
  const vivos = items.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0);
  if (!vivos.length) return false;
  const actual = vivos.indexOf(menuEl._foco ?? -1);
  const i = actual < 0 ? (paso > 0 ? 0 : vivos.length - 1) : (actual + paso + vivos.length) % vivos.length;
  menuEl._foco = vivos[i];
  pintarFoco();
  return true;
}

function pintarFoco() {
  const botones = menuEl.querySelectorAll(".am-tile, .am-item");
  botones.forEach((b, i) => b.classList.toggle("foco", i === menuEl._foco));
  const b = botones[menuEl._foco];
  if (b) b.scrollIntoView({ block: "nearest" });
}

/** Qué significa "aceptar" según en qué estamos */
function aceptar() {
  if (!game) return;
  if (!menuEl.hidden && menuEl._items) {
    const it = menuEl._items[menuEl._foco ?? -1];
    if (it && !it.disabled) { it.run(); return; }
  }
  const c = ui.cur || cursorInicial();
  ui.cur = c;
  onTileClick(c.x, c.y);
}

function openMap() {
  if (!game) return;
  const d = $("map");
  if (d.open) { d.close(); return; }
  d.showModal();
}

// ======================================================================
// Menú del día
// ======================================================================
function openPause() {
  if (!game) return;
  const d = $("pause");
  if (d.open) { d.close(); return; }
  const v = viewer() || game.current.id;
  hud.renderObjectives(game, v);
  $("pause-sub").textContent = `${FACTIONS[game.current.id].name} · Día ${game.round}${isHumanTurn() ? "" : " · le toca al ordenador"}`;
  aplicarControles(esquema, { guardar: false });
  pintarMezcla();
  $("btn-end").disabled = !isHumanTurn();
  $("btn-market").disabled = !isHumanTurn();
  // la cuenta de unidades libres se dice donde se toma la decisión, no frenándote
  const libres = isHumanTurn()
    ? game.unitsOf(game.current.id).filter(u => !u.hasActed && (u.template.attack > 0 || u.templateId === "villager")).length
    : 0;
  $("btn-end").querySelector("small").textContent = libres
    ? `Te quedan ${libres} unidad${libres > 1 ? "es" : ""} por mover`
    : "Pasa el turno al rival";
  $("btn-end").classList.toggle("aviso", libres > 0);
  sfx.play("menuAbrir");
  d.showModal();
  d.querySelector(".pause-btn:not([disabled])")?.focus();
}

window.addEventListener("keydown", e => {
  if (e.target.closest?.("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  const E = ESQUEMAS[esquema];
  const abierto = document.querySelector("dialog[open]");

  // --- relevo entre dos jugadores: solo vale aceptar, para no espiar el tablero
  if (!$("handoff").hidden) {
    e.preventDefault();
    if (esTecla(k, E.aceptar) || esTecla(k, E.menu)) $("btn-handoff").click();
    return;
  }

  // --- dentro de un diálogo: las mismas teclas sirven para navegarlo
  if (abierto) {
    if (abierto.id === "setup" && !game) return;
    const foco = [...abierto.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (esTecla(k, E.abajo) || esTecla(k, E.der)) { e.preventDefault(); foco[(foco.indexOf(document.activeElement) + 1) % foco.length]?.focus(); }
    else if (esTecla(k, E.arriba) || esTecla(k, E.izq)) { e.preventDefault(); foco[(foco.indexOf(document.activeElement) - 1 + foco.length) % foco.length]?.focus(); }
    else if (esTecla(k, E.aceptar)) { e.preventDefault(); (document.activeElement?.click ? document.activeElement : foco[0])?.click(); }
    else if (esTecla(k, E.cancelar) || esTecla(k, E.menu) || (abierto.id === "map" && esTecla(k, E.mapa))) { e.preventDefault(); if (abierto.id !== "setup") abierto.close(); }
    return;
  }

  // --- menú del día y mapa
  if (esTecla(k, E.menu)) { e.preventDefault(); openPause(); return; }
  if (esTecla(k, E.mapa)) { e.preventDefault(); openMap(); return; }

  // --- atajos numéricos del menú flotante
  if (!menuEl.hidden && /^[1-9]$/.test(k)) {
    const it = menuEl._items?.[Number(k) - 1];
    if (it && !it.disabled) { e.preventDefault(); it.run(); }
    return;
  }

  // --- movimiento: por el menú si está abierto, por el tablero si no
  const dir = esTecla(k, E.arriba) ? [0, -1] : esTecla(k, E.abajo) ? [0, 1]
    : esTecla(k, E.izq) ? [-1, 0] : esTecla(k, E.der) ? [1, 0] : null;
  if (dir) {
    e.preventDefault();
    if (!menuEl.hidden && menuEl._items && menuEl._items.length > 1 && ui.phase !== "target" && ui.phase !== "place") {
      moverFoco(dir[1] !== 0 ? dir[1] : dir[0]);
    } else moverCursor(dir[0], dir[1]);
    return;
  }

  if (esTecla(k, E.aceptar)) { e.preventDefault(); aceptar(); return; }
  if (esTecla(k, E.cancelar)) { e.preventDefault(); onCancel(); return; }

  // --- atajos de siempre, que siguen valiendo
  if (k === "e") endTurn();
  else if (k === "n" || k === "tab") { e.preventDefault(); selectNextIdle(); }
  else if (k === "t" && game) openTechs();
  else if (k === " " && ownActive(ui.sel) && ui.phase !== "target" && ui.phase !== "place") { e.preventDefault(); game.waitUnit(ui.sel); resetUI(); nextHint(); refresh(); }
});

// acceso para depurar desde la consola del navegador
window.troya = { get game() { return game; }, renderer, ui, sfx, musica, muestras };

sfx.init();
sfx.alDespertar(() => muestras.cargar());
musica.poner("menu");
cargarControles();
aplicarControles(esquema, { guardar: false });
buildSetup();
$("setup").showModal();
