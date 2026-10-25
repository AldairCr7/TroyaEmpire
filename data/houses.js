/**
 * houses.js
 * -----------------------------------------------------------------------
 * Casas (pueblos) dentro de cada bando, al estilo de las civilizaciones de
 * AoK DS: cada una da UN bono pasivo y desbloquea UNA unidad única que solo
 * ella puede entrenar. No cambian el resto del árbol tecnológico.
 *
 * bonus.type lo consume engine/game.js:
 *   income          multiplica un recurso (value = +%)
 *   attack/defense  +% a unas categorías de unidad
 *   move            +N de movimiento a unas categorías
 *   heroMove        +N de movimiento a los héroes
 *   buildingDefense +% de defensa a todos tus edificios
 *   buildCost       -% al coste de los edificios (value negativo)
 * -----------------------------------------------------------------------
 */

export const HOUSES = {
  // ------------------------------------------------ aqueos
  micenas: {
    id: "micenas", name: "Micenas", side: "greek",
    blurb: "La rica en oro, la casa de Agamenón.",
    bonus: { type: "income", resource: "bronze", value: 0.20 },
    bonusText: "+20% de ingresos de bronce",
    unique: "royalGuard"
  },
  esparta: {
    id: "esparta", name: "Esparta", side: "greek",
    blurb: "Los hombres de Menelao: el muro de escudos.",
    bonus: { type: "defense", target: ["infantry", "spear"], value: 0.10 },
    bonusText: "+10% de defensa en infantería y lanceros",
    unique: "spartan"
  },
  mirmidones: {
    id: "mirmidones", name: "Ftía", side: "greek",
    blurb: "La tierra de Aquiles y sus mirmidones.",
    bonus: { type: "heroMove", value: 2 },
    bonusText: "+2 de movimiento a tus héroes",
    unique: "myrmidon"
  },

  // ------------------------------------------------ troyanos
  dardanos: {
    id: "dardanos", name: "Dardania", side: "trojan",
    blurb: "La casa de Eneas, criadores de los mejores caballos.",
    bonus: { type: "income", resource: "grain", value: 0.20 },
    bonusText: "+20% de ingresos de grano",
    unique: "dardanRider"
  },
  licios: {
    id: "licios", name: "Licia", side: "trojan",
    blurb: "Los aliados de Sarpedón, arqueros sin rival.",
    bonus: { type: "attack", target: ["ranged", "skirmish"], value: 0.25 },
    bonusText: "+25% de ataque a distancia",
    unique: "lycianArcher"
  },
  amazonas: {
    id: "amazonas", name: "Amazonas", side: "trojan",
    blurb: "Pentesilea y sus guerreras, llegadas del Termodonte.",
    bonus: { type: "buildingDefense", value: 0.0, extraMove: 0 },
    bonusText: "Tus murallas y edificios aguantan un 15% más",
    unique: "amazon"
  }
};

// la de las amazonas se define aparte para dejar clara su cifra
HOUSES.amazonas.bonus = { type: "buildingDefense", value: 0.15 };

export function housesOf(side) {
  return Object.values(HOUSES).filter(h => h.side === side);
}

export function getHouse(id) {
  return HOUSES[id] || null;
}
