/**
 * combat.js
 * -----------------------------------------------------------------------
 * Resolución de combates, fiel al estilo de AoK DS:
 *   - Daño = 40 × (ataque efectivo / defensa efectiva) × bonus por tipo.
 *     Dos unidades iguales a vida completa se quitan 40 HP.
 *   - El ataque es proporcional a la vida: por eso el que golpea primero
 *     suele salir ganando, y el contraataque llega debilitado.
 *   - El defensor contraataca si el atacante está dentro de SU alcance.
 *     Un arquero que dispara a 3 casillas contra infantería no recibe nada.
 *   - "Primer golpe" invierte el orden: Odiseo (firstStrike), lanceros
 *     contra carros (antiChariot) y honderos atacados en melé (skirmish).
 *   - Catapultas: salpican el 50% a enemigos adyacentes al objetivo.
 *   - Es determinista: la predicción que ves antes de atacar es exacta.
 *
 * Todo lo que depende del estado (tecnologías, auras, terreno) lo aporta
 * engine/game.js mediante game.attackModifier / game.defenseModifier.
 * -----------------------------------------------------------------------
 */

export const DAMAGE_BASE = 40;

/** Categoría para buscar bonus: las líneas derivadas heredan de su tipo base */
function bonusFor(attackBonus, target) {
  if (!attackBonus) return 1;
  if (target.kind === "building") return attackBonus.building ?? 1;
  const cat = target.template.category;
  if (attackBonus[cat] != null) return attackBonus[cat];
  if (cat === "spear" && attackBonus.infantry != null) return attackBonus.infantry;
  if (cat === "skirmish" && attackBonus.ranged != null) return attackBonus.ranged;
  return 1;
}

export function attackRangeOf(game, entity, x = entity.x, y = entity.y) {
  const base = entity.template.range || 0;
  if (base <= 0 || !(entity.template.attack > 0)) return { min: 0, max: 0 };
  const max = game.grid.effectiveRange(x, y, base);
  const min = entity.kind !== "building" && entity.template.category === "siege" && base > 1 ? 2 : 1;
  return { min, max };
}

/** ¿Puede `defender` devolver el golpe a un atacante situado a `dist`? */
export function canCounter(game, defender, attacker, dist) {
  if (!defender || defender.currentHp <= 0) return false;
  if (!(defender.template.attack > 0)) return false;
  if (defender.kind !== "building") {
    if (defender.template.abilities?.includes("noCounter")) return false;
    if (defender.template.abilities?.includes("buildingsOnly") && attacker.kind !== "building") return false;
    if (defender.template.abilities?.includes("unitsOnly") && attacker.kind === "building") return false;
  }
  const r = attackRangeOf(game, defender);
  return dist >= r.min && dist <= r.max;
}

function hasFirstStrike(defender, attacker, dist) {
  if (defender.kind === "building" || attacker.kind === "building") return false;
  const ab = defender.template.abilities || [];
  if (ab.includes("firstStrike")) return true;
  if (ab.includes("antiChariot") && attacker.template.category === "chariot") return true;
  if (ab.includes("skirmish") && dist === 1 && (attacker.template.range || 1) <= 1) return true;
  return false;
}

/** Daño de un golpe de `att` (en attPos) sobre `def` (en defPos) con las vidas dadas */
export function strikeDamage(game, att, attPos, attHp, def, defPos) {
  const aMod = game.attackModifier(att, attPos, def);
  const dMod = game.defenseModifier(def, defPos, att);
  let atk;
  if (att.kind === "building") {
    atk = att.template.attack * (attHp / att.maxHp) * (1 + aMod);
  } else {
    const hpRatio = att.template.abilities?.includes("frenzy") ? 1 : attHp / att.maxHp;
    atk = att.template.attack * att.experienceMultiplier * (1 + aMod + att.tempAttackMod) * hpRatio;
  }
  let defense;
  if (def.kind === "building") defense = def.template.defense * (1 + dMod);
  else defense = def.template.defense * def.experienceMultiplier * (1 + dMod + def.tempDefenseMod);
  defense = Math.max(1, defense);

  let mult = bonusFor(att.template.attackBonus, def);
  if (att.kind !== "building" && def.kind === "building" && mult < 1 && game.hasTechEffect(att.ownerId, "removeBuildingPenalty", att)) mult = 1;
  // los arietes solo sirven contra edificios
  if (att.kind !== "building" && att.template.abilities?.includes("buildingsOnly") && def.kind !== "building") return 0;
  // el escorpión y los suyos no le rascan a la piedra
  if (att.kind !== "building" && att.template.abilities?.includes("unitsOnly") && def.kind === "building") return 0;

  if (atk <= 0) return 0;
  return Math.max(1, Math.round(DAMAGE_BASE * (atk / defense) * mult));
}

/**
 * Calcula (y si apply=true, aplica) un combate completo.
 * @param attPos posición desde la que se ataca (puede ser el destino de un
 *               movimiento aún no hecho, para la predicción)
 */
export function resolveCombat(game, attacker, target, { attPos = { x: attacker.x, y: attacker.y }, apply = false } = {}) {
  const defPos = { x: target.x, y: target.y };
  const dist = Math.abs(attPos.x - defPos.x) + Math.abs(attPos.y - defPos.y);
  let aHp = attacker.currentHp, dHp = target.currentHp;
  const counter = canCounter(game, target, attacker, dist);
  const defenderFirst = counter && hasFirstStrike(target, attacker, dist);
  const steps = [];

  const hitDefender = () => {
    const dmg = Math.min(dHp, strikeDamage(game, attacker, attPos, aHp, target, defPos));
    dHp -= dmg;
    steps.push({ from: "attacker", damage: dmg });
  };
  const hitAttacker = () => {
    const dmg = Math.min(aHp, strikeDamage(game, target, defPos, dHp, attacker, attPos));
    aHp -= dmg;
    steps.push({ from: "defender", damage: dmg });
  };

  if (defenderFirst) {
    hitAttacker();
    if (aHp > 0) hitDefender();
  } else {
    hitDefender();
    if (dHp > 0 && counter) hitAttacker();
  }

  // salpicadura de catapulta sobre enemigos pegados al objetivo
  const splash = [];
  if (attacker.template.abilities?.includes("splashDamage") && aHp > 0) {
    const first = steps.find(s => s.from === "attacker");
    const base = Math.round((first?.damage || 0) * 0.5);
    if (base > 0) {
      for (const n of game.grid.getOrthogonalNeighbors(defPos.x, defPos.y)) {
        const u = game.unitAt(n.x, n.y);
        if (u && u.ownerId !== attacker.ownerId) splash.push({ unit: u, damage: Math.min(u.currentHp, base) });
      }
    }
  }

  const result = {
    attacker, target, steps, splash, counter, defenderFirst,
    attackerHp: aHp, targetHp: dHp,
    attackerDamageTaken: attacker.currentHp - aHp,
    targetDamageTaken: target.currentHp - dHp,
    attackerDies: aHp <= 0, targetDies: dHp <= 0
  };

  if (apply) {
    attacker.currentHp = aHp;
    target.currentHp = dHp;
    for (const s of splash) s.unit.applyDamage(s.damage);
    // Celo: el templario se cura un poco después de cada pelea contra tropa.
    // No funciona contra asedio ni contra edificios, como en el original.
    const celo = (u, rival) => {
      if (u.currentHp <= 0 || !u.template.abilities?.includes("zeal")) return;
      if (rival.kind === "building" || rival.template.category === "siege") return;
      u.heal(15);
    };
    celo(attacker, target); celo(target, attacker);
    if (attacker.kind !== "building" && target.kind !== "building") {
      result.attackerRibbon = attacker.registerBattle();
      result.targetRibbon = target.registerBattle();
    } else if (attacker.kind !== "building") {
      attacker.battlesFought += 0.5; // tirar edificios curte, pero menos
    }
  }
  return result;
}

/** Valor de un intercambio desde el punto de vista del atacante (para la IA) */
export function tradeValue(game, result) {
  const worth = e => {
    if (e.kind === "building") return (e.template.isCapital ? 900 : 180) / e.maxHp;
    const c = e.template.cost ? (e.template.cost.grain + e.template.cost.bronze * 1.3) : 450;
    return (e.template.abilities?.includes("heroPowers") ? 700 : c) / e.maxHp;
  };
  let v = result.targetDamageTaken * worth(result.target) - result.attackerDamageTaken * worth(result.attacker);
  if (result.targetDies) v += result.target.kind === "building" && result.target.template.isCapital ? 5000 : 120;
  if (result.attackerDies) v -= 160;
  for (const s of result.splash) v += s.damage * worth(s.unit);
  return v;
}
