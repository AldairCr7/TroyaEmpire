/**
 * mapgen.js
 * -----------------------------------------------------------------------
 * Generador de escenarios. Antes el juego usaba siempre el mismo mapa de
 * 12×10 escrito a mano; ahora cada partida sale de una plantilla + semilla:
 *
 *   playa       Playa de Desembarco: el mar al oeste, las naves aqueas en la
 *               arena y los troyanos esperando tierra adentro.
 *   escamandro  Llanura del Escamandro: un río parte el mapa, pocos puentes.
 *   ida         Laderas del Monte Ida: cordillera central con pasos estrechos.
 *   asedio      Asedio de Troya: la ciudad amurallada con su Ciudadela; los
 *               aqueos tienen que abrir brecha antes de que se acabe el tiempo.
 *   aleatorio   Mezcla de rasgos al azar.
 *
 * Devuelve datos planos; engine/game.js construye el estado a partir de ellos.
 * -----------------------------------------------------------------------
 */

import { RNG, ValueNoise } from "./rng.js";

export const SCENARIOS = {
  playa: {
    id: "playa", name: "Playa de Desembarco",
    description: "Las naves aqueas varan en la arena. Destruye el Campamento Base enemigo.",
    mountain: 0.86, hill: 0.72, forest: 0.64, desert: 0.0, swamp: 0.9
  },
  escamandro: {
    id: "escamandro", name: "Llanura del Escamandro",
    description: "Un río parte la llanura y solo unos pocos puentes lo cruzan.",
    mountain: 0.9, hill: 0.76, forest: 0.6, desert: 0.0, swamp: 0.78
  },
  ida: {
    id: "ida", name: "Laderas del Monte Ida",
    description: "Una cordillera divide el mapa. Controla los pasos.",
    mountain: 0.74, hill: 0.6, forest: 0.58, desert: 0.0, swamp: 0.95
  },
  asedio: {
    id: "asedio", name: "Asedio de Troya",
    description: "Aqueos: derribad la Ciudadela. Troyanos: romped el cerco y arrasad su campamento.",
    mountain: 0.9, hill: 0.74, forest: 0.66, desert: 0.0, swamp: 0.9
  },
  aleatorio: {
    id: "aleatorio", name: "Tierras de Anatolia",
    description: "Terreno al azar: puede tocarte desierto, río, costa o montaña.",
    mountain: 0.84, hill: 0.7, forest: 0.62, desert: 0.35, swamp: 0.85
  }
};

export const MAP_SIZES = {
  small: { id: "small", name: "Pequeño", width: 18, height: 13 },
  medium: { id: "medium", name: "Mediano", width: 24, height: 17 },
  large: { id: "large", name: "Grande", width: 32, height: 22 }
};

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export function generateMap({ scenario = "playa", size = "medium", seed = "troya", villages = null, villagesFar = false } = {}) {
  const rng = new RNG(`${seed}:${scenario}:${size}`);
  let sc = SCENARIOS[scenario] || SCENARIOS.playa;
  const { width: W, height: H } = MAP_SIZES[size] || MAP_SIZES.medium;

  // el aleatorio elige qué rasgos lleva
  // en los mapas de estrecho el único mar es el canal central: así las naves
  // siempre pueden ir de una orilla a la otra (un mar al oeste quedaría aislado)
  const features = {
    sea: sc.id === "playa" || sc.id === "asedio",
    river: sc.id === "escamandro",
    ridge: sc.id === "ida",
    walls: sc.id === "asedio",
    desert: sc.desert
  };
  if (sc.id === "aleatorio") {
    features.sea = rng.chance(0.45);
    features.river = rng.chance(0.55);
    features.ridge = !features.river && rng.chance(0.5);
    features.desert = rng.range(0.2, 0.5);
    sc = { ...sc, forest: rng.range(0.56, 0.68), hill: rng.range(0.66, 0.74) };
  }

  const elev = new ValueNoise(rng);
  const moist = new ValueNoise(rng);
  const dry = new ValueNoise(rng);

  const T = Array.from({ length: H }, () => Array(W).fill("plains"));
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) T[y][x] = t; };
  const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? T[y][x] : null;

  // ---------- 1. terreno base por ruido ----------
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let e = elev.get(x, y, 3, 0.17);
      const m = moist.get(x, y, 3, 0.2);
      const d = dry.get(x, y, 2, 0.1);
      if (features.ridge) {
        // cordillera en el centro, con forma ondulada
        const cx = W / 2 + Math.sin(y * 0.55 + rng.next() * 0.2) * 1.4;
        e += Math.max(0, 0.42 - Math.abs(x - cx) * 0.13);
      }
      let t = "plains";
      if (e > sc.mountain) t = "mountain";
      else if (e > sc.hill) t = "hill";
      else if (m > sc.forest) t = "forest";
      else if (m < 0.3 && e < 0.42 && d < sc.swamp - 0.55) t = "swamp";
      if (t === "plains" && features.desert && d < features.desert) t = "desert";
      T[y][x] = t;
    }
  }

  // pasos en la cordillera: dos o tres cortes transitables
  if (features.ridge) {
    const passes = W >= 24 ? 3 : 2;
    for (let p = 0; p < passes; p++) {
      const py = Math.round((H / (passes + 1)) * (p + 1) + rng.range(-1, 1));
      for (let x = 0; x < W; x++) {
        for (const yy of [py, py + (rng.chance(0.5) ? 1 : 0)]) {
          if (get(x, yy) === "mountain") set(x, yy, rng.chance(0.5) ? "hill" : "plains");
        }
      }
    }
  }

  // ---------- 2. mar en la costa oeste ----------
  const coast = [];
  if (features.sea) {
    const coastNoise = new ValueNoise(rng);
    const base = sc.id === "asedio" ? 2 : Math.max(2, Math.round(W * 0.12));
    for (let y = 0; y < H; y++) {
      const c = base + Math.round((coastNoise.get(0, y, 2, 0.35) - 0.5) * 3);
      coast[y] = Math.max(1, c);
      for (let x = 0; x < W; x++) {
        if (x < coast[y]) set(x, y, "water");
        else if (x < coast[y] + 2) set(x, y, "beach");
      }
    }
  }

  // ---------- 3. río ----------
  let riverTiles = [];
  if (features.river) {
    // de norte a sur por el centro, serpenteando
    let x = Math.round(W / 2 + rng.range(-1.5, 1.5));
    for (let y = 0; y < H; y++) {
      set(x, y, "river");
      riverTiles.push({ x, y });
      const drift = rng.next();
      if (drift < 0.25 && x > W / 2 - 3) { x--; set(x, y, "river"); riverTiles.push({ x, y }); }
      else if (drift > 0.75 && x < W / 2 + 3) { x++; set(x, y, "river"); riverTiles.push({ x, y }); }
    }
    // riberas: pantano y bosque de galería
    for (const r of riverTiles) {
      for (const [dx, dy] of DIRS) {
        const t = get(r.x + dx, r.y + dy);
        if (t === "plains" || t === "desert") {
          if (rng.chance(0.18)) set(r.x + dx, r.y + dy, "swamp");
          else if (rng.chance(0.2)) set(r.x + dx, r.y + dy, "forest");
        }
      }
    }
  } else if (features.sea && !features.walls && rng.chance(0.7)) {
    // un río pequeño que desemboca en el mar
    let y = rng.int(2, H - 3), x = W - 1;
    const len = Math.round(W * 0.55);
    for (let i = 0; i < len && x > coast[y]; i++) {
      set(x, y, "river");
      riverTiles.push({ x, y });
      x--;
      if (rng.chance(0.3)) { y = Math.min(H - 2, Math.max(1, y + (rng.chance(0.5) ? 1 : -1))); set(x + 1, y, "river"); riverTiles.push({ x: x + 1, y }); }
    }
  }

  // ---------- 4. Troya amurallada ----------
  const walls = [];
  let citadel = null;
  const trojanBuildings = [];
  if (features.walls) {
    const cw = Math.max(7, Math.round(W * 0.34)), ch = Math.max(7, Math.round(H * 0.6));
    const x1 = W - cw - 1, y1 = Math.round((H - ch) / 2), x2 = W - 2, y2 = y1 + ch - 1;
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const edge = x === x1 || x === x2 || y === y1 || y === y2;
        set(x, y, edge ? "cityFloor" : "cityFloor");
        if (edge) walls.push({ x, y, type: "wall" });
      }
    }
    // la colina de Pérgamo detrás de la muralla
    for (let x = x2 + 1; x < W; x++) for (let y = 0; y < H; y++) set(x, y, rng.chance(0.5) ? "hill" : "plains");
    // puertas: la Escea (oeste) y otra al norte o sur
    const gy = Math.round((y1 + y2) / 2);
    const gates = [{ x: x1, y: gy }];
    if (W >= 24) gates.push({ x: x1, y: gy + (rng.chance(0.5) ? 3 : -3) });
    gates.push({ x: Math.round((x1 + x2) / 2), y: rng.chance(0.5) ? y1 : y2 });
    for (const g of gates) {
      const w = walls.find(w => w.x === g.x && w.y === g.y);
      if (w) w.type = "gate";
    }
    citadel = { x: Math.round((x1 + x2) / 2) + 1, y: gy };
    // calles hacia las puertas
    for (const g of gates) {
      let cx = citadel.x, cy = citadel.y;
      while (cx !== g.x || cy !== g.y) {
        if (cx !== g.x) cx += Math.sign(g.x - cx); else cy += Math.sign(g.y - cy);
        if (!(cx === g.x && cy === g.y)) set(cx, cy, "cityFloor");
      }
    }
    trojanBuildings.push({ type: "barracks", x: citadel.x - 2, y: citadel.y - 2 });
    trojanBuildings.push({ type: "archeryRange", x: citadel.x - 2, y: citadel.y + 2 });
    trojanBuildings.push({ type: "watchtower", x: x1 + 1, y: y1 + 1 });
    trojanBuildings.push({ type: "watchtower", x: x1 + 1, y: y2 - 1 });
    trojanBuildings.push({ type: "mill", x: citadel.x + 1, y: citadel.y - 2 });
    trojanBuildings.push({ type: "farm", x: citadel.x + 1, y: citadel.y - 1 });
    trojanBuildings.push({ type: "farm", x: citadel.x + 2, y: citadel.y - 2 });
    // foso seco / llanura despejada frente a la muralla
    for (let y = y1 - 1; y <= y2 + 1; y++) for (let x = x1 - 2; x < x1; x++) {
      const t = get(x, y);
      if (t && t !== "water" && t !== "beach") set(x, y, "plains");
    }
  }

  // ---------- 5. posiciones de salida ----------
  const midY = Math.floor(H / 2);
  // Margen mínimo a los bordes: un campamento pegado al borde pierde media
  // corona de casillas y con ella la mitad de sus granjas y de su ciudad.
  const margen = 4;
  const pickStart = (xMin, xMax) => {
    let best = null;
    for (let tries = 0; tries < 60; tries++) {
      const x = rng.int(Math.max(margen, xMin), Math.min(W - 1 - margen, xMax));
      const y = rng.int(Math.max(margen, midY - 3), Math.min(H - 1 - margen, midY + 3));
      const t = get(x, y);
      if (["water", "river", "mountain", "cityFloor"].includes(t)) continue;
      if (walls.some(w => Math.abs(w.x - x) + Math.abs(w.y - y) < 4)) continue;
      best = { x, y };
      break;
    }
    return best || {
      x: Math.min(W - 1 - margen, Math.max(margen, Math.round((xMin + xMax) / 2))),
      y: midY
    };
  };
  const leftMin = features.sea ? (coast[midY] || 2) + 2 : 2; // tras la franja de playa
  const greekCamp = pickStart(leftMin, leftMin + 2);
  // el troyano se coloca en espejo del aqueo, a la misma distancia de su borde
  const trojanCamp = citadel ? { ...citadel } : pickStart(W - 1 - leftMin - 2, W - 1 - leftMin);

  // los campamentos nunca pueden quedar a tiro de un solo turno: si el sorteo
  // los dejó cerca, el troyano se va a la casilla válida más lejana del este
  if (!citadel) {
    const minSep = Math.round((W + H) * 0.45);
    if (Math.abs(greekCamp.x - trojanCamp.x) + Math.abs(greekCamp.y - trojanCamp.y) < minSep) {
      let best = null, bd = -1;
      for (let y = margen; y <= H - 1 - margen; y++) {
        for (let x = Math.floor(W * 0.58); x <= W - 1 - margen; x++) {
          if (["water", "river", "mountain", "cityFloor"].includes(get(x, y))) continue;
          const d = Math.abs(x - greekCamp.x) + Math.abs(y - greekCamp.y);
          if (d > bd) { bd = d; best = { x, y }; }
        }
      }
      if (best) { trojanCamp.x = best.x; trojanCamp.y = best.y; }
    }
  }

  // despejar alrededor de los campamentos
  const clear = (c, r) => {
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
      const t = get(x, y);
      if (!t || walls.some(w => w.x === x && w.y === y)) continue;
      if (["mountain", "forest", "swamp", "river", "water"].includes(t)) set(x, y, "plains");
    }
  };
  clear(greekCamp, 2);
  if (!citadel) clear(trojanCamp, 2);

  // ---------- 5b. mismo sitio para construir en los dos campamentos ----------
  // El oeste del mapa sale llano y el este, quebrado. Medido sobre 40 mapas, el
  // campamento aqueo tenía 64 casillas edificables contra 40 del troyano: el
  // doble de granjas y de edificios de ciudad, y con eso la partida se decidía
  // en los primeros turnos. Se le abre claro al que salga corto hasta igualar.
  const APTO_OBRA = ["plains", "plainsRoad", "desert", "desertRoad", "beach", "hill", "cityFloor"];
  const llanoDe = (c, r = 4) => {
    let n = 0;
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
      if (APTO_OBRA.includes(get(x, y))) n++;
    }
    return n;
  };
  const allanar = (c, objetivo, r = 4) => {
    const puntos = [];
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
      if (["forest", "swamp"].includes(get(x, y))) puntos.push({ x, y, d: Math.abs(x - c.x) + Math.abs(y - c.y) });
    }
    puntos.sort((a, b) => a.d - b.d);   // se despeja de dentro hacia fuera
    for (const p of puntos) {
      if (llanoDe(c, r) >= objetivo) break;
      if (walls.some(w => w.x === p.x && w.y === p.y)) continue;
      set(p.x, p.y, "plains");
    }
  };
  if (!citadel) {
    const objetivoLlano = Math.max(llanoDe(greekCamp), llanoDe(trojanCamp));
    allanar(greekCamp, objetivoLlano);
    allanar(trojanCamp, objetivoLlano);
  }

  // ---------- 6. caminos ----------
  const roadCost = (x, y) => {
    const t = get(x, y);
    if (walls.some(w => w.x === x && w.y === y && w.type === "wall")) return Infinity;
    return { plains: 1, desert: 1.2, beach: 1.5, hill: 3, forest: 3.5, swamp: 6, mountain: 9, river: 5, water: Infinity, cityFloor: 0.8 }[t] ?? 2;
  };
  const carveRoad = (a, b) => {
    const path = cheapestPath(W, H, a, b, roadCost);
    if (!path) return;
    for (const p of path) {
      const t = get(p.x, p.y);
      if (t === "river") set(p.x, p.y, "bridge");
      else if (t === "desert") set(p.x, p.y, "desertRoad");
      else if (t === "plains") set(p.x, p.y, "plainsRoad");
      else if (t === "cityFloor" || t === "bridge" || t === "desertRoad" || t === "plainsRoad") { /* ya es camino */ }
      else if (t !== "water") set(p.x, p.y, "road");
    }
  };
  const gateList = walls.filter(w => w.type === "gate");
  if (citadel) {
    const westGate = gateList.reduce((a, b) => (b.x < a.x ? b : a), gateList[0]);
    carveRoad(greekCamp, { x: westGate.x - 1, y: westGate.y });
  } else {
    carveRoad(greekCamp, trojanCamp);
  }
  // río del Escamandro: asegurar 2-3 puentes
  if (features.river) {
    const want = H >= 17 ? 3 : 2;
    const have = () => { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x] === "bridge") n++; return n; };
    for (let i = 0; have() < want && i < 8; i++) {
      const y = Math.round((H / (want + 1)) * (i % want + 1) + rng.range(-1, 1));
      const rx = T[y]?.findIndex(t => t === "river");
      if (rx > 0) carveRoad({ x: Math.max(0, rx - 3), y }, { x: Math.min(W - 1, rx + 3), y });
    }
  }

  // ---------- 7. yacimientos: bronce en las alturas, trigales en la llanura ----------
  // Como en el original: el metal siempre está en colina o montaña, y el trigo
  // en llanura abierta con sitio alrededor para las cuatro granjas del molino.
  const deposits = [];
  const libreYac = (x, y) => !deposits.some(d => Math.abs(d.x - x) + Math.abs(d.y - y) < 3)
    && !(x === greekCamp.x && y === greekCamp.y) && !(x === trojanCamp.x && y === trojanCamp.y)
    && !trojanBuildings.some(b => b.x === x && b.y === y)
    && !walls.some(w => w.x === x && w.y === y);
  const okBronze = (x, y) => ["hill", "mountain"].includes(get(x, y)) && libreYac(x, y);
  const okWheat = (x, y) => {
    if (!["plains", "desert"].includes(get(x, y)) || !libreYac(x, y)) return false;
    // que quepan al menos dos granjas alrededor; lo ideal son las cuatro
    const sitio = DIRS.filter(([dx, dy]) => ["plains", "desert", "hill", "beach"].includes(get(x + dx, y + dy))).length;
    return sitio >= 2;
  };
  const placeNear = (c, n, rMin, rMax, ok, type, sideFilter = () => true) => {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < n; tries++) {
      const x = c.x + rng.int(-rMax, rMax), y = c.y + rng.int(-rMax, rMax);
      const d = Math.abs(x - c.x) + Math.abs(y - c.y);
      if (d < rMin || d > rMax || !sideFilter(x, y)) continue;
      if (ok(x, y)) { deposits.push({ x, y, type }); placed++; }
    }
  };
  const mid = { x: Math.round(W / 2), y: midY };
  // cada bando arranca con trigo y metal a mano
  for (const c of [greekCamp, citadel ? { x: citadel.x - 4, y: citadel.y } : trojanCamp]) {
    placeNear(c, 2, 2, 5, okWheat, "wheat");
    placeNear(c, 2, 2, 5, okBronze, "bronze");
  }
  // Y lo de en medio es lo que hay que pelear. Se reparte a medias a propósito:
  // el este del mapa tiene más bosque y monte, así que al tirarlos al azar el
  // trigo caía casi siempre del lado aqueo y su economía se disparaba sola.
  const dCampo = (x, y, c) => Math.abs(x - c.x) + Math.abs(y - c.y);
  const ladoAqueo = (x, y) => dCampo(x, y, greekCamp) < dCampo(x, y, trojanCamp);
  const ladoTroyano = (x, y) => dCampo(x, y, trojanCamp) < dCampo(x, y, greekCamp);
  const rMid = Math.round(H / 2);
  const enMedio = W >= 24 ? 3 : 2;
  for (const [type, ok] of [["wheat", okWheat], ["bronze", okBronze]]) {
    placeNear(mid, 1, 0, rMid, ok, type, ladoAqueo);
    placeNear(mid, 1, 0, rMid, ok, type, ladoTroyano);
    if (enMedio > 2) placeNear(mid, enMedio - 2, 0, rMid, ok, type);
  }
  /**
   * Remate: garantiza un mínimo de yacimientos de cada tipo alrededor de un
   * punto. Si el terreno no acompaña, lo moldea — levanta una loma para el
   * bronce o despeja un claro para el trigo — antes que dejar a alguien sin
   * economía por mala suerte del ruido.
   */
  const asegurar = (c, type, minimo, rMax) => {
    const cuenta = () => deposits.filter(d => d.type === type && Math.abs(d.x - c.x) + Math.abs(d.y - c.y) <= rMax).length;
    const ok = type === "wheat" ? okWheat : okBronze;
    for (let intento = 0; intento < 500 && cuenta() < minimo; intento++) {
      const x = c.x + rng.int(-rMax, rMax), y = c.y + rng.int(-rMax, rMax);
      const d = Math.abs(x - c.x) + Math.abs(y - c.y);
      const t = get(x, y);
      if (d < 2 || d > rMax || !t || !libreYac(x, y)) continue;
      if (ok(x, y)) { deposits.push({ x, y, type }); continue; }
      if (intento < 250) continue; // primero se intenta con el terreno tal cual
      if (type === "bronze" && ["plains", "desert", "beach"].includes(t)) { set(x, y, "hill"); deposits.push({ x, y, type }); }
      else if (type === "wheat" && ["forest", "swamp", "hill"].includes(t)) {
        set(x, y, "plains");
        for (const [dx, dy] of DIRS) if (["forest", "swamp"].includes(get(x + dx, y + dy))) set(x + dx, y + dy, "plains");
        deposits.push({ x, y, type });
      }
    }
  };
  for (const c of [greekCamp, citadel || trojanCamp]) {
    asegurar(c, "wheat", 2, 7);
    asegurar(c, "bronze", 2, 8);
  }
  asegurar(mid, "wheat", W >= 24 ? 3 : 2, Math.round(H / 2) + 2);
  asegurar(mid, "bronze", W >= 24 ? 3 : 2, Math.round(H / 2) + 2);

  // ---------- 7b. tesoros: cabras, bolsas de bronce, ruinas y reliquias ----------
  // Como en AoK DS: cualquier unidad que pise cabras o una bolsa las recoge;
  // las ruinas esconden una sorpresa; las reliquias solo las carga un sacerdote.
  const pickups = [];
  const freeFor = (x, y) => {
    const t = get(x, y);
    if (!t || ["water", "river", "mountain", "bridge", "swamp"].includes(t)) return false;
    if (deposits.some(d => d.x === x && d.y === y) || walls.some(w => w.x === x && w.y === y)) return false;
    if (trojanBuildings.some(b => b.x === x && b.y === y)) return false;
    if (Math.abs(x - greekCamp.x) + Math.abs(y - greekCamp.y) < 3) return false;
    if (Math.abs(x - trojanCamp.x) + Math.abs(y - trojanCamp.y) < 3) return false;
    if (citadel && walls.length && x >= Math.min(...walls.map(w => w.x)) && y >= Math.min(...walls.map(w => w.y)) && y <= Math.max(...walls.map(w => w.y))) return false;
    return !pickups.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 2);
  };
  const scatter = (type, n, xMin, xMax) => {
    for (let tries = 0, placed = 0; tries < 400 && placed < n; tries++) {
      const x = rng.int(xMin, xMax), y = rng.int(0, H - 1);
      if (freeFor(x, y)) { pickups.push({ x, y, type }); placed++; }
    }
  };
  const big = W >= 24 ? 1 : 0, huge = W >= 32 ? 1 : 0;
  // reparto simétrico por mitades para que ningún bando salga favorecido
  for (const [xMin, xMax] of [[1, Math.floor(W / 2) - 1], [Math.ceil(W / 2), W - 2]]) {
    scatter("goats", 2 + big, xMin, xMax);
    scatter("bag", 1 + big, xMin, xMax);
  }
  scatter("ruins", 2 + big + huge, Math.floor(W * 0.3), Math.ceil(W * 0.7));
  scatter("relic", 1 + big + huge, Math.floor(W * 0.35), Math.ceil(W * 0.65));

  // ---------- 7c. aldeas de la Tróade (neutrales, se capturan pisándolas) ----------
  const villageList = [];
  const wantVillages = villages == null ? (W >= 32 ? 5 : W >= 24 ? 4 : 3) : villages;
  // Las aldeas se reparten a propósito: una para cada lado por turnos, y si
  // son impares, la que sobra queda en el centro. Antes salían al azar, y como
  // el este del mapa tiene más bosque y monte, casi siempre caían dos o tres
  // del lado aqueo: una ventaja de ingresos que decidía la partida sola.
  const ladosAldea = [];
  for (let i = 0; i < wantVillages; i++) ladosAldea.push(i % 2 === 0 ? "greek" : "trojan");
  if (wantVillages % 2 === 1) ladosAldea[wantVillages - 1] = "centro";
  const margenCentro = Math.max(2, Math.round((W + H) * 0.08));

  const okVillage = (x, y, lado) => {
    const t = get(x, y);
    if (!["plains", "plainsRoad", "road", "hill", "desert", "desertRoad", "beach"].includes(t)) return false;
    if (deposits.some(d => d.x === x && d.y === y) || pickups.some(p => p.x === x && p.y === y)) return false;
    if (walls.some(w => w.x === x && w.y === y) || trojanBuildings.some(b => b.x === x && b.y === y)) return false;
    const dG = Math.abs(x - greekCamp.x) + Math.abs(y - greekCamp.y);
    const dT = Math.abs(x - trojanCamp.x) + Math.abs(y - trojanCamp.y);
    if (dG < 4 || dT < 4) return false;
    if (!villagesFar && lado) {
      if (lado === "greek" && dG >= dT) return false;
      if (lado === "trojan" && dT >= dG) return false;
      if (lado === "centro" && Math.abs(dG - dT) > margenCentro) return false;
    }
    // en los capítulos donde las aldeas son el objetivo, están del lado troyano:
    // hay que cruzar el mapa y pelear por ellas, no recogerlas de paso
    if (villagesFar && (dG < Math.round((W + H) * 0.32) || dG < dT)) return false;
    if (citadel && Math.abs(x - citadel.x) + Math.abs(y - citadel.y) < 5) return false;
    return !villageList.some(v => Math.abs(v.x - x) + Math.abs(v.y - y) < 4);
  };
  for (const lado of ladosAldea) {
    let puesta = false;
    for (let tries = 0; tries < 400 && !puesta; tries++) {
      const x = rng.int(1, W - 2), y = rng.int(1, H - 2);
      if (okVillage(x, y, lado)) { villageList.push({ x, y }); puesta = true; }
    }
    // si ese lado no tenía sitio, vale cualquiera antes que quedarse sin aldea
    for (let tries = 0; tries < 300 && !puesta; tries++) {
      const x = rng.int(1, W - 2), y = rng.int(1, H - 2);
      if (okVillage(x, y, null)) { villageList.push({ x, y }); puesta = true; }
    }
  }
  // en las aldeas hay un camino que lleva a ellas
  for (const v of villageList) {
    const near = [greekCamp, trojanCamp].sort((a, b) => (Math.abs(a.x - v.x) + Math.abs(a.y - v.y)) - (Math.abs(b.x - v.x) + Math.abs(b.y - v.y)))[0];
    if (Math.abs(near.x - v.x) + Math.abs(near.y - v.y) <= Math.round(W * 0.4)) carveRoad(near, v);
  }

  // ---------- 8. espejo aleatorio para que el norte y el sur varíen ----------
  const flipY = rng.chance(0.5);
  const fy = y => flipY ? H - 1 - y : y;
  const mapPoint = p => ({ ...p, y: fy(p.y) });
  const terrain = flipY ? T.slice().reverse() : T;

  // Sin límite de turnos en ningún escenario: cada quien se toma el tiempo que
  // quiera. Quien defiende gana derribando el campamento del otro, no esperando.
  const turnLimit = null;
  return {
    width: W, height: H, seed, scenario: sc,
    terrain,
    deposits: deposits.map(mapPoint),
    pickups: pickups.map(mapPoint),
    walls: walls.map(mapPoint),
    villages: villageList.map(mapPoint),
    citadel: citadel ? mapPoint(citadel) : null,
    starts: {
      greek: { camp: mapPoint(greekCamp) },
      trojan: { camp: mapPoint(trojanCamp), buildings: trojanBuildings.map(mapPoint) }
    },
    turnLimit,
    goals: {
      greek: { type: "destroyCapitals", text: features.walls ? "Derriba la Ciudadela de Troya" : "Destruye los campamentos troyanos" },
      trojan: { type: "destroyCapitals", text: features.walls ? "Rompe el cerco: arrasa su campamento" : "Destruye los campamentos aqueos" }
    }
  };
}

/** Camino más barato entre a y b (Dijkstra sencillo, mapas pequeños) */
function cheapestPath(W, H, a, b, costFn) {
  const N = W * H;
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const idx = (x, y) => y * W + x;
  dist[idx(a.x, a.y)] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) return null;
    if (u === idx(b.x, b.y)) break;
    done[u] = 1;
    const ux = u % W, uy = (u / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = ux + dx, ny = uy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const c = costFn(nx, ny);
      if (!isFinite(c)) continue;
      const v = idx(nx, ny);
      if (dist[u] + c < dist[v]) { dist[v] = dist[u] + c; prev[v] = u; }
    }
  }
  const path = [];
  for (let v = idx(b.x, b.y); v !== -1; v = prev[v]) path.unshift({ x: v % W, y: (v / W) | 0 });
  return path;
}
