/**
 * terrain.js
 * -----------------------------------------------------------------------
 * Tipos de terreno y sus modificadores, fieles al original:
 *   - Los caminos son el terreno óptimo (coste de movimiento 1).
 *   - Bosques/pantanos/río: -1 alcance a unidades a distancia situadas ahí.
 *   - Colinas/montañas: +1 alcance y +defensa.
 *   - El agua bloquea el paso.
 *   - Las murallas son edificios (data/buildings.js); al caer dejan escombros.
 *
 * color / accent los usa render/renderer.js para pintar la casilla.
 * -----------------------------------------------------------------------
 */

export const TERRAIN = {
  plains: {
    id: "plains", name: "Llanura", moveCost: 1, defenseMod: 0, rangeMod: 0,
    passable: true, chariotChargeBonus: true, buildable: true,
    color: "#9fae5c", accent: "#b7c26d"
  },
  road: {
    id: "road", name: "Camino", moveCost: 1, defenseMod: 0, rangeMod: 0,
    passable: true, chariotChargeBonus: false, buildable: true, isRoad: true,
    color: "#9fae5c", accent: "#b7c26d"
  },
  plainsRoad: {
    id: "plainsRoad", name: "Camino de Llanura", moveCost: 1, defenseMod: 0, rangeMod: 0,
    passable: true, chariotChargeBonus: true, buildable: true, isRoad: true,
    color: "#9fae5c", accent: "#b7c26d"
  },
  forest: {
    id: "forest", name: "Bosque", moveCost: 2, defenseMod: 0.10, rangeMod: -1,
    passable: true, chariotChargeBonus: false, buildable: false,
    color: "#5d7a3a", accent: "#6f8c45"
  },
  hill: {
    id: "hill", name: "Colina", moveCost: 2, defenseMod: 0.20, rangeMod: 1,
    passable: true, chariotChargeBonus: false, buildable: true,
    color: "#a39158", accent: "#b9a567"
  },
  mountain: {
    id: "mountain", name: "Montaña", moveCost: 3, defenseMod: 0.30, rangeMod: 1,
    passable: true, chariotChargeBonus: false, buildable: false,
    color: "#8c8374", accent: "#a39a8a"
  },
  swamp: {
    id: "swamp", name: "Pantano", moveCost: 3, defenseMod: -0.10, rangeMod: -1,
    passable: true, chariotChargeBonus: false, buildable: false,
    color: "#5f6e4a", accent: "#6d7d55"
  },
  desert: {
    id: "desert", name: "Desierto", moveCost: 1, defenseMod: -0.05, rangeMod: 0,
    passable: true, chariotChargeBonus: false, desertChargeBonus: true, buildable: true,
    color: "#d8bd7c", accent: "#e4cc90"
  },
  desertRoad: {
    id: "desertRoad", name: "Camino de Desierto", moveCost: 1, defenseMod: 0, rangeMod: 0,
    passable: true, chariotChargeBonus: false, desertChargeBonus: true, buildable: true, isRoad: true,
    color: "#d8bd7c", accent: "#e4cc90"
  },
  beach: {
    id: "beach", name: "Playa", moveCost: 1, defenseMod: -0.10, rangeMod: 0,
    passable: true, chariotChargeBonus: false, buildable: true,
    color: "#e2d3a0", accent: "#ecdfb2"
  },
  river: {
    id: "river", name: "Río", moveCost: 4, defenseMod: -0.20, rangeMod: -1,
    passable: true, chariotChargeBonus: false, buildable: false, isWater: true,
    color: "#3f7690", accent: "#5b93aa"
  },
  bridge: {
    id: "bridge", name: "Puente", moveCost: 1, defenseMod: -0.10, rangeMod: 0,
    passable: true, chariotChargeBonus: false, buildable: false, isRoad: true, isBridge: true,
    color: "#3f7690", accent: "#5b93aa"
  },
  water: {
    id: "water", name: "Mar Egeo", moveCost: Infinity, defenseMod: 0, rangeMod: 0,
    passable: false, chariotChargeBonus: false, buildable: false, isWater: true,
    color: "#2c5873", accent: "#3a6d8a"
  },
  rubble: {
    id: "rubble", name: "Escombros", moveCost: 2, defenseMod: 0.10, rangeMod: 0,
    passable: true, chariotChargeBonus: false, buildable: false,
    color: "#8a7a64", accent: "#9b8b73"
  },
  cityFloor: {
    id: "cityFloor", name: "Calles de Troya", moveCost: 1, defenseMod: 0.05, rangeMod: 0,
    passable: true, chariotChargeBonus: false, buildable: true, isRoad: true,
    color: "#b8a17a", accent: "#c7b08a"
  }
};

export function getTerrain(id) {
  return TERRAIN[id] || TERRAIN.plains;
}
