/**
 * grid.js
 * -----------------------------------------------------------------------
 * Motor de cuadrícula. Responsable de:
 *   - Representar el mapa (terreno + unidad + edificio + yacimiento)
 *   - Rango de movimiento alcanzable (Dijkstra por coste, tipo Advance Wars)
 *   - Caminos para animar el movimiento paso a paso
 *   - Adyacencia (SOLO ortogonal para moverse y atacar en melé, como el original)
 *   - Alcance de ataque y visión en distancia Manhattan
 *
 * No depende de la UI ni de las reglas: quién bloquea el paso y cuánto
 * cuesta cada casilla lo decide quien llama (engine/game.js) mediante
 * `stepCost(x, y)` y `canStop(x, y)`.
 * -----------------------------------------------------------------------
 */

import { getTerrain } from "../data/terrain.js";

const key = (x, y) => `${x},${y}`;

/** Cola de prioridad binaria mínima (sustituye al sort de cada iteración) */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class Grid {
  /**
   * @param {number} width
   * @param {number} height
   * @param {string[][]} terrainMap - matriz [y][x] de ids de terreno
   */
  constructor(width, height, terrainMap) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push({ x, y, terrain: terrainMap?.[y]?.[x] || "plains", unit: null, building: null, deposit: null });
      }
      this.tiles.push(row);
    }
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getTile(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : null;
  }

  terrainAt(x, y) {
    const t = this.getTile(x, y);
    return t ? getTerrain(t.terrain) : null;
  }

  setUnit(x, y, unitId) { const t = this.getTile(x, y); if (t) t.unit = unitId; }
  clearUnit(x, y) { const t = this.getTile(x, y); if (t) t.unit = null; }
  isOccupied(x, y) { const t = this.getTile(x, y); return !!(t && t.unit); }

  /** Vecinos ortogonales (arriba/abajo/izq/der). El original NO permite diagonales. */
  getOrthogonalNeighbors(x, y) {
    return [
      { x, y: y - 1 }, { x, y: y + 1 }, { x: x - 1, y }, { x: x + 1, y }
    ].filter(c => this.inBounds(c.x, c.y));
  }

  /** Las 8 casillas alrededor (para efectos "adyacente o diagonal" de héroes) */
  getAllNeighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && this.inBounds(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy });
      }
    }
    return out;
  }

  manhattanDistance(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  /**
   * Casillas alcanzables con un presupuesto de movimiento.
   * @param {(x:number,y:number)=>number} stepCost - coste de ENTRAR en la casilla (Infinity = bloqueada)
   * @param {(x:number,y:number)=>boolean} canStop - si se puede terminar el movimiento ahí
   * @param {(x:number,y:number)=>boolean} stopsHere - zona de control: al entrar
   *        en esa casilla el movimiento termina (no se sigue avanzando desde ella)
   * @returns Map<"x,y", {x, y, cost, prev}>
   */
  getReachableTiles(startX, startY, moveRange, stepCost, canStop = () => true, stopsHere = () => false) {
    const best = new Map();
    best.set(key(startX, startY), { x: startX, y: startY, cost: 0, prev: null });
    const heap = new MinHeap();
    heap.push({ x: startX, y: startY, cost: 0 });

    while (heap.size) {
      const cur = heap.pop();
      const curBest = best.get(key(cur.x, cur.y));
      if (curBest && cur.cost > curBest.cost) continue;
      // al entrar en la zona de control de un enemigo hay que detenerse
      if (!(cur.x === startX && cur.y === startY) && stopsHere(cur.x, cur.y)) continue;

      for (const n of this.getOrthogonalNeighbors(cur.x, cur.y)) {
        const c = stepCost(n.x, n.y);
        if (!isFinite(c)) continue;
        const total = cur.cost + c;
        if (total > moveRange) continue;
        const k = key(n.x, n.y);
        const prev = best.get(k);
        if (!prev || total < prev.cost) {
          best.set(k, { x: n.x, y: n.y, cost: total, prev: key(cur.x, cur.y) });
          heap.push({ x: n.x, y: n.y, cost: total });
        }
      }
    }

    // se puede pasar por casillas de aliados, pero no terminar en ellas
    const result = new Map();
    for (const [k, v] of best) {
      if ((v.x === startX && v.y === startY) || canStop(v.x, v.y)) result.set(k, v);
    }
    result.all = best; // para reconstruir caminos que atraviesan aliados
    return result;
  }

  /** Reconstruye el camino hasta (x,y) a partir de un resultado de getReachableTiles */
  pathTo(reachable, x, y) {
    const all = reachable.all || reachable;
    let node = all.get(key(x, y));
    if (!node) return null;
    const path = [];
    while (node) {
      path.unshift({ x: node.x, y: node.y });
      node = node.prev ? all.get(node.prev) : null;
    }
    return path;
  }

  /**
   * Distancias de coste desde un origen a todo el mapa, sin límite. La IA
   * lo usa como "mapa de flujo" para acercarse a objetivos lejanos.
   */
  costField(startX, startY, stepCost) {
    const dist = new Float32Array(this.width * this.height).fill(Infinity);
    dist[startY * this.width + startX] = 0;
    const heap = new MinHeap();
    heap.push({ x: startX, y: startY, cost: 0 });
    while (heap.size) {
      const cur = heap.pop();
      if (cur.cost > dist[cur.y * this.width + cur.x]) continue;
      for (const n of this.getOrthogonalNeighbors(cur.x, cur.y)) {
        const c = stepCost(n.x, n.y);
        if (!isFinite(c)) continue;
        const total = cur.cost + c;
        const i = n.y * this.width + n.x;
        if (total < dist[i]) { dist[i] = total; heap.push({ x: n.x, y: n.y, cost: total }); }
      }
    }
    return dist;
  }

  /** Casillas dentro de un radio Manhattan [minRange, maxRange] */
  tilesInRange(x, y, maxRange, minRange = 1) {
    const out = [];
    for (let dy = -maxRange; dy <= maxRange; dy++) {
      for (let dx = -maxRange; dx <= maxRange; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < minRange || d > maxRange) continue;
        if (this.inBounds(x + dx, y + dy)) out.push({ x: x + dx, y: y + dy, dist: d });
      }
    }
    return out;
  }

  /** Alcance de ataque ajustado por el terreno del atacante (colinas +1, bosque -1) */
  effectiveRange(x, y, baseRange) {
    if (baseRange <= 1) return baseRange;
    return Math.max(1, baseRange + this.terrainAt(x, y).rangeMod);
  }

  /** Visión: radio Manhattan, las colinas y montañas dan +1 */
  getVisibleTiles(x, y, sight) {
    const t = this.terrainAt(x, y);
    const bonus = t && (t.id === "hill" || t.id === "mountain") ? 1 : 0;
    return this.tilesInRange(x, y, sight + bonus, 0);
  }
}

export { key as tileKey };
