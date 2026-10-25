/**
 * heroes.js
 * -----------------------------------------------------------------------
 * Héroes jugables. Cada uno tiene stats base muy por encima de una unidad
 * normal (igual que en AoK DS) y 4 poderes únicos ("heroPowers") que
 * combat.js / turnManager.js consultan por condición y efecto.
 *
 * powerType:
 *   "aura"       -> afecta a aliados dentro de un radio mientras dure la condición
 *   "onTownCenter" (aquí: "onCamp") -> solo activo si el héroe está sobre un
 *                   Campamento Base propio
 *   "instant"    -> efecto puntual al activarse (una vez por turno)
 *   "debuff"     -> afecta a enemigos dentro de un radio
 * -----------------------------------------------------------------------
 */

export const HEROES = {

  achilles: {
    id: "achilles", name: "Aquiles", faction: "greek", category: "infantry",
    hp: 100, move: 7, attack: 220, defense: 320, sight: 7, range: 1,
    attackBonus: { siege: 1.33, building: 1.33 },
    abilities: ["heroPowers"],
    heroPowers: [
      {
        id: "wrathOfAchilles", name: "Ira de Aquiles",
        type: "instant", condition: "always",
        effect: "Aquiles inflige 30 de daño a un enemigo adyacente o diagonal, una vez por turno."
      },
      {
        id: "swiftFooted", name: "El de los Pies Ligeros",
        type: "aura", condition: "adjacent",
        effect: "Las unidades aliadas adyacentes a Aquiles ganan +2 movimiento."
      },
      {
        id: "invulnerableRage", name: "Furia Invulnerable",
        type: "aura", condition: "sight",
        effect: "Las unidades aliadas cuerpo a cuerpo a la vista de Aquiles ganan +33% ataque mientras Aquiles tenga más del 50% de HP."
      },
      {
        id: "champCall", name: "Llamada del Campeón",
        type: "onCamp", condition: "onCamp",
        effect: "Si Aquiles está sobre el Campamento Base, las unidades cuestan -20 grano/-20 bronce ese turno."
      }
    ]
  },

  hector: {
    id: "hector", name: "Héctor", faction: "trojan", category: "infantry",
    hp: 100, move: 7, attack: 190, defense: 330, sight: 7, range: 1,
    attackBonus: { siege: 1.33, building: 1.33 },
    abilities: ["heroPowers"],
    heroPowers: [
      {
        id: "defenderOfTroy", name: "Defensor de Troya",
        type: "aura", condition: "sight",
        effect: "Las unidades aliadas a la vista de Héctor ganan +20% defensa."
      },
      {
        id: "royalCommand", name: "Mando Real",
        type: "aura", condition: "adjacent",
        effect: "Las unidades aliadas adyacentes a Héctor ganan +25% ataque."
      },
      {
        id: "rallyTheWalls", name: "Reunión en las Murallas",
        type: "instant", condition: "always",
        effect: "Héctor y las unidades adyacentes recuperan 15 HP. Recarga: 3 turnos."
      },
      {
        id: "princesLevy", name: "Leva del Príncipe",
        type: "onCamp", condition: "onCamp",
        effect: "Si Héctor está sobre el Campamento Base, hoy la investigación cuesta -50 grano/-50 bronce."
      }
    ]
  },

  odysseus: {
    id: "odysseus", name: "Odiseo", faction: "greek", category: "ranged",
    hp: 100, move: 7, attack: 150, defense: 260, sight: 9, range: 2,
    attackBonus: { building: 0.5 },
    abilities: ["heroPowers", "firstStrike"],
    heroPowers: [
      {
        id: "trojanHorseGambit", name: "Estratagema del Caballo",
        type: "onCamp", condition: "onCamp",
        effect: "Añade 100 bronce al tesoro. Solo activable sobre el Campamento Base. Recarga: 3 turnos."
      },
      {
        id: "cunning", name: "Astucia",
        type: "debuff", condition: "sight",
        effect: "Las unidades enemigas a la vista de Odiseo sufren -15% defensa."
      },
      {
        id: "silverTongue", name: "Lengua de Plata",
        type: "aura", condition: "adjacent",
        effect: "Las unidades aliadas adyacentes ganan +2 visión."
      },
      {
        id: "tacticalWithdrawal", name: "Retirada Táctica",
        type: "aura", condition: "adjacent",
        effect: "Las unidades aliadas adyacentes ganan +2 movimiento y +25% ataque a distancia."
      }
    ]
  },

  paris: {
    id: "paris", name: "Paris", faction: "trojan", category: "ranged",
    hp: 100, move: 7, attack: 170, defense: 245, sight: 8, range: 3,
    attackBonus: { building: 0.5 },
    abilities: ["heroPowers"],
    heroPowers: [
      {
        id: "achillesHeelShot", name: "Flecha del Talón",
        type: "instant", condition: "always",
        effect: "Paris inflige 25 de daño a un héroe enemigo dentro de su alcance. Recarga: 2 turnos."
      },
      {
        id: "favorOfAphrodite", name: "Favor de Afrodita",
        type: "aura", condition: "sight",
        effect: "Las unidades aliadas a distancia a la vista de Paris ganan +33% ataque."
      },
      {
        id: "princelyGuard", name: "Guardia Principesca",
        type: "aura", condition: "adjacent",
        effect: "Las unidades aliadas adyacentes ganan +33% defensa."
      },
      {
        id: "royalRansom", name: "Rescate Real",
        type: "onCamp", condition: "onCamp",
        effect: "Si Paris está sobre el Campamento Base, las unidades cuestan -20 grano/-20 bronce ese turno."
      }
    ]
  }
};

export function getHero(id) {
  return HEROES[id] || null;
}

export function getHeroesByFaction(faction) {
  return Object.values(HEROES).filter(h => h.faction === faction);
}
