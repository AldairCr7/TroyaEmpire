/**
 * sim.mjs — banco de pruebas sin navegador para Guerra de Troya.
 *
 *   node sim.mjs casas  [partidas]   → victorias de cada casa contra cada rival
 *   node sim.mjs zoc    [partidas]   → la zona de control, encendida y apagada
 *
 * Juegan dos IA en el mismo escenario y semilla, para que lo único que cambie
 * sea lo que estamos midiendo.
 */
import { generateMap } from "../engine/mapgen.js";
import { Game } from "../engine/game.js";
import { runAITurn } from "../engine/ai.js";
import { HOUSES, housesOf } from "../data/houses.js";

const MAX_TURNOS = 70;

const sinEsperas = () => Promise.resolve();

async function partida({ seed, scenario = "llanura", size = "medium", casaG, casaT, zoc = true, mods = {}, primero = "greek" }) {
  const map = generateMap({ scenario, size, seed });
  const players = {
    greek: { control: "ai", difficulty: "normal", house: casaG },
    trojan: { control: "ai", difficulty: "normal", house: casaT }
  };
  const game = new Game(map, { players, fog: false, mods, firstPlayer: primero });
  if (zoc === false || zoc === "off") game.inZoneOfControl = () => false;
  else if (zoc === "dura") {
    const orig = game.inZoneOfControl.bind(game);
    game.inZoneOfControl = (x, y, unit) => {
      if (orig(x, y, unit)) return true;
      if (unit.template.abilities?.includes("scout")) return false;
      for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
        const e = game.unitAt(x + dx, y + dy);
        if (!e || e.ownerId === unit.ownerId || !(e.template.attack > 0)) continue;
        return true;
      }
      return false;
    };
  } else if (zoc === "blanda") {
    game.inZoneOfControl = (x, y, unit) => {
      if (unit.template.abilities?.includes("scout")) return false;
      for (const n of game.grid.getOrthogonalNeighbors(x, y)) {
        const e = game.unitAt(n.x, n.y);
        if (!e || e.ownerId === unit.ownerId || !(e.template.attack > 0)) continue;
        if ((e.template.range || 1) > 1) continue;   // los de lejos no frenan
        const eN = !!e.template.abilities?.includes("naval"), uN = !!unit.template.abilities?.includes("naval");
        if (eN !== uN) continue;
        return true;
      }
      return false;
    };
  }

  let vueltas = 0;
  while (!game.winner && game.round <= MAX_TURNOS && vueltas < MAX_TURNOS * 2 + 10) {
    vueltas++;
    try { await runAITurn(game, sinEsperas); } catch { /* la IA se atasca: pasa */ }
    if (game.winner) break;
    game.endTurn();
  }
  const g = game.players.greek, t = game.players.trojan;
  return {
    winner: game.winner || null,
    turnos: game.round,
    bajas: g.stats.kills + t.stats.kills,
    perdidasG: g.stats.lost, perdidasT: t.stats.lost
  };
}

function pct(a, b) { return b ? `${Math.round(a / b * 100)}%` : "—"; }

// ------------------------------------------------------------------ casas
async function casas(n) {
  const gs = housesOf("greek").map(h => h.id), ts = housesOf("trojan").map(h => h.id);
  const marcador = {};
  for (const id of [...gs, ...ts]) marcador[id] = { jugadas: 0, ganadas: 0, turnos: 0 };
  let tablas = 0, total = 0, turnosTot = 0;

  for (let i = 0; i < n; i++) {
    const cg = gs[i % gs.length], ct = ts[Math.floor(i / gs.length) % ts.length];
    const r = await partida({ seed: `bal-${i}`, casaG: cg, casaT: ct });
    total++; turnosTot += r.turnos;
    marcador[cg].jugadas++; marcador[ct].jugadas++;
    marcador[cg].turnos += r.turnos; marcador[ct].turnos += r.turnos;
    if (r.winner === "greek") marcador[cg].ganadas++;
    else if (r.winner === "trojan") marcador[ct].ganadas++;
    else tablas++;
  }

  console.log(`\n=== CASAS · ${total} partidas · ${tablas} sin ganador · ${Math.round(turnosTot / total)} turnos de media\n`);
  for (const lado of [["Aqueos", gs], ["Troyanos", ts]]) {
    console.log(lado[0]);
    for (const id of lado[1]) {
      const m = marcador[id];
      console.log(`  ${HOUSES[id].name.padEnd(12)} ${String(m.ganadas).padStart(3)}/${String(m.jugadas).padEnd(3)}  ${pct(m.ganadas, m.jugadas).padStart(5)}   ${Math.round(m.turnos / m.jugadas)} turnos`);
    }
  }
}

async function zoc(n) {
  const esc = ["llanura", "playa", "ida"];
  const casasG = ["micenas", "esparta", "mirmidones"], casasT = ["dardanos", "licios", "amazonas"];
  console.log("");
  console.log("=== ZONA DE CONTROL · " + n + " partidas por modo");
  console.log("modo        aqueos troyanos  tablas  turnos  bajas");
  for (const modo of ["off", "blanda", true, "dura"]) {
    let g = 0, t = 0, tablas = 0, turnos = 0, bajas = 0;
    for (let i = 0; i < n; i++) {
      const r = await partida({
        seed: "zoc-" + i, scenario: esc[i % esc.length],
        casaG: casasG[i % 3], casaT: casasT[(i + 1) % 3], zoc: modo
      });
      turnos += r.turnos; bajas += r.bajas;
      if (r.winner === "greek") g++; else if (r.winner === "trojan") t++; else tablas++;
    }
    const nombre = modo === true ? "actual" : String(modo);
    console.log(nombre.padEnd(11) + String(g).padStart(5) + String(t).padStart(8) +
      String(tablas).padStart(8) + (turnos / n).toFixed(1).padStart(8) + (bajas / n).toFixed(1).padStart(7));
  }
}

/** Todas las casas contra todas, en los mismos mapas */
async function matriz(k) {
  const gs = housesOf("greek").map(h => h.id), ts = housesOf("trojan").map(h => h.id);
  const esc = ["llanura", "playa", "ida"];
  const fila = {};
  console.log(``);
  console.log(`=== MATRIZ · ${k} partidas por cruce (victorias aqueas)
`);
  console.log("             " + ts.map(t => HOUSES[t].name.padStart(10)).join(""));
  const totG = {}, totT = {};
  for (const cg of gs) {
    const celdas = [];
    for (const ct of ts) {
      let g = 0;
      for (let i = 0; i < k; i++) {
        const r = await partida({ seed: `mx-${cg}-${ct}-${i}`, scenario: esc[i % esc.length], casaG: cg, casaT: ct });
        if (r.winner === "greek") g++;
      }
      celdas.push(`${g}/${k}`.padStart(10));
      totG[cg] = (totG[cg] || 0) + g;
      totT[ct] = (totT[ct] || 0) + (k - g);
    }
    console.log(HOUSES[cg].name.padEnd(13) + celdas.join(""));
  }
  console.log("");
  console.log("Totales");
  for (const id of gs) console.log(`  ${HOUSES[id].name.padEnd(12)} ${pct(totG[id], k * ts.length)}`);
  for (const id of ts) console.log(`  ${HOUSES[id].name.padEnd(12)} ${pct(totT[id], k * gs.length)}`);
}

/** ¿Cuánto pesa mover primero? */
async function primero(n) {
  for (const p of ["greek", "trojan"]) {
    let g = 0, t = 0, x = 0;
    for (let i = 0; i < n; i++) {
      const r = await partida({ seed: `pri-${i}`, casaG: "esparta", casaT: "licios", primero: p });
      if (r.winner === "greek") g++; else if (r.winner === "trojan") t++; else x++;
    }
    console.log(`mueven primero los ${p === "greek" ? "aqueos " : "troyanos"} → aqueos ${String(g).padStart(2)} · troyanos ${String(t).padStart(2)} · tablas ${x}`);
  }
}

/** De dónde sale la ventaja de un bando: con héroes y sin ellos, por escenario */
async function lados(n) {
  for (const [etiqueta, mods] of [["con héroes", {}], ["sin héroes", { heroesOff: { greek: ["achilles", "odysseus"], trojan: ["hector", "paris"] } }]]) {
    for (const scenario of ["llanura", "playa", "ida"]) {
      let g = 0, t = 0, x = 0, turnos = 0;
      for (let i = 0; i < n; i++) {
        const r = await partida({ seed: `lado-${i}`, scenario, mods, casaG: "esparta", casaT: "licios" });
        turnos += r.turnos;
        if (r.winner === "greek") g++; else if (r.winner === "trojan") t++; else x++;
      }
      console.log(`${etiqueta.padEnd(11)} ${scenario.padEnd(9)} aqueos ${String(g).padStart(2)} · troyanos ${String(t).padStart(2)} · tablas ${x}  (${(turnos / n).toFixed(0)} turnos)`);
    }
  }
}

const [modo, nStr] = process.argv.slice(2);
const n = Number(nStr) || 18;
if (modo === "zoc") await zoc(n);
else if (modo === "lados") await lados(n);
else if (modo === "primero") await primero(n);
else if (modo === "matriz") await matriz(n);
else if (modo === "mapa") await mapa(n);
else if (modo === "traza") await traza(n);
else if (modo === "granjas") await granjas(n);
else await casas(n);

/** ¿Reparte el generador por igual? Yacimientos y terreno junto a cada campamento */
async function mapa(n) {
  const esc = ["llanura", "playa", "ida"];
  for (const scenario of esc) {
    const acc = { greek: { dep: 0, trigo: 0, bosque: 0 }, trojan: { dep: 0, trigo: 0, bosque: 0 } };
    for (let i = 0; i < n; i++) {
      const m = generateMap({ scenario, size: "medium", seed: `mp-${i}` });
      for (const v of m.villages || []) {
        const dg = Math.abs(v.x - m.starts.greek.camp.x) + Math.abs(v.y - m.starts.greek.camp.y);
        const dt = Math.abs(v.x - m.starts.trojan.camp.x) + Math.abs(v.y - m.starts.trojan.camp.y);
        if (dg < dt) acc.greek.bosque++; else if (dt < dg) acc.trojan.bosque++;
      }
      for (const d of m.deposits) {
        const dg = Math.abs(d.x - m.starts.greek.camp.x) + Math.abs(d.y - m.starts.greek.camp.y);
        const dt = Math.abs(d.x - m.starts.trojan.camp.x) + Math.abs(d.y - m.starts.trojan.camp.y);
        const lado = dg < dt ? "greek" : dt < dg ? "trojan" : null;
        if (!lado) continue;
        acc[lado].dep++;
        if (d.type === "wheat") acc[lado].trigo++;
      }
    }
    const f = l => `${(acc[l].dep / n).toFixed(1)} yacim. (${(acc[l].trigo / n).toFixed(1)} trigo) · ${(acc[l].bosque / n).toFixed(1)} aldeas`;
    console.log(`${scenario.padEnd(9)} aqueos ${f("greek")}  ·  troyanos ${f("trojan")}`);
  }
}

/** Sigue una partida por dentro: tropa, vida y economía de cada bando */
async function traza(n) {
  const map = generateMap({ scenario: "llanura", size: "medium", seed: "tz-1" });
  const game = new Game(map, {
    players: { greek: { control: "ai", difficulty: "normal", house: "esparta" }, trojan: { control: "ai", difficulty: "normal", house: "licios" } },
    fog: false
  });
  const foto = id => {
    const us = game.unitsOf(id);
    const inc = game.income(id);
    return `${String(us.length).padStart(2)}u ${String(us.reduce((a, u) => a + u.currentHp, 0)).padStart(4)}hp ` +
      `${String(game.buildingsOf(id).length).padStart(2)}e +${inc.grain}/${inc.bronze} e${game.players[id].era} ` +
      `tec${game.players[id].techs.size}/${JSON.stringify(game.eraProgress(id))} $${game.players[id].grain}/${game.players[id].bronze} ` +
      `opc${game.researchOptions(id).length}`;
  };
  while (!game.winner && game.round <= (n || 20)) {
    await runAITurn(game, sinEsperas);
    if (game.currentIdx === game.order.length - 1) {
      console.log(`turno ${String(game.round).padStart(2)}  AQ ${foto("greek")}   |   TR ${foto("trojan")}`);
    }
    if (game.winner) break;
    game.endTurn();
  }
  console.log("ganador:", game.winner);
}

/** Capacidad económica real: trigales cerca y cuántas granjas caben alrededor */
async function granjas(n) {
  const APTO = ["plains", "plainsRoad", "desert", "desertRoad", "beach", "hill"];
  for (const scenario of ["llanura", "playa", "ida"]) {
    const acc = { greek: { trigo: 0, huecos: 0, llano: 0 }, trojan: { trigo: 0, huecos: 0, llano: 0 } };
    for (let i = 0; i < n; i++) {
      const m = generateMap({ scenario, size: "medium", seed: `gr-${i}` });
      const terr = (x, y) => (m.terrain[y] && m.terrain[y][x]) || null;
      for (const lado of ["greek", "trojan"]) {
        const c = m.starts[lado].camp;
        // terreno llano alrededor del campamento, donde se puede construir
        for (let y = c.y - 4; y <= c.y + 4; y++) for (let x = c.x - 4; x <= c.x + 4; x++) {
          if (APTO.includes(terr(x, y))) acc[lado].llano++;
        }
        for (const d of m.deposits) {
          if (d.type !== "wheat") continue;
          if (Math.abs(d.x - c.x) + Math.abs(d.y - c.y) > 7) continue;
          acc[lado].trigo++;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            if (APTO.includes(terr(d.x + dx, d.y + dy))) acc[lado].huecos++;
          }
        }
      }
    }
    const f = l => `${(acc[l].trigo / n).toFixed(1)} trigales · ${(acc[l].huecos / n).toFixed(1)} huecos de granja · ${(acc[l].llano / n).toFixed(0)} casillas llanas`;
    console.log(`${scenario.padEnd(9)} AQ ${f("greek")}`);
    console.log(`${" ".padEnd(9)} TR ${f("trojan")}`);
  }
}
