/**
 * unit.js
 * -----------------------------------------------------------------------
 * Representa una UNIDAD EN EL TABLERO (instancia), a diferencia de
 * data/units.js que solo define la plantilla/base de cada tipo.
 *
 * Responsabilidades:
 *   - Guardar estado runtime: posición, HP actual, dueño, si ya se movió/
 *     actuó este turno, experiencia (cintas), buffs temporales de un turno.
 *   - Calcular stats EFECTIVOS combinando: base de la plantilla + cintas +
 *     modificadores externos ya resueltos (tecnologías, auras de héroe,
 *     terreno), que engine/game.js calcula y pasa como porcentajes.
 *   - Fiel al original: la experiencia sube cada 3 combates (2 para
 *     unidades con la habilidad "seasonedVeteran"), máx. 3 cintas,
 *     cada cinta = +15% ATK y +15% DEF.
 * -----------------------------------------------------------------------
 */

let _nextInstanceId = 1;

export class UnitInstance {
  /**
   * @param {object} template - entrada de UNITS o HEROES (data/units.js / heroes.js)
   * @param {string} ownerId - id del jugador/facción dueña
   */
  constructor(template, ownerId, x, y) {
    this.instanceId = `u${_nextInstanceId++}`;
    this.kind = "unit";
    this.template = template;
    this.templateId = template.id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;

    this.currentHp = template.hp;
    this.maxHp = template.hp;

    this.battlesFought = 0;
    this.ribbons = 0;

    this.hasMoved = false;
    this.hasActed = false;
    this.powerUsed = false; // poder "instant" del héroe, una vez por turno

    this.tempAttackMod = 0;
    this.tempDefenseMod = 0;
    this.tempMoveMod = 0;

    this.deployed = false;  // máquinas de asedio: montada dispara pero no se mueve
  }

  get name() { return this.template.name; }
  get category() { return this.template.category; }

  isAlive() { return this.currentHp > 0; }
  isHero() { return !!this.template.abilities?.includes("heroPowers"); }
  hasAbility(ability) { return !!this.template.abilities?.includes(ability); }
  isDone() { return this.hasActed; }

  /** Llamar al empezar el turno del dueño de esta unidad */
  resetTurnState() {
    this.hasMoved = false;
    this.hasActed = false;
    this.powerUsed = false;
    this.tempAttackMod = 0;
    this.tempDefenseMod = 0;
    this.tempMoveMod = 0;
  }

  /** Suma un combate; devuelve true si ganó una cinta nueva */
  registerBattle() {
    this.battlesFought++;
    const threshold = this.hasAbility("seasonedVeteran") ? 2 : 3;
    const earned = Math.min(3, Math.floor(this.battlesFought / threshold));
    const gained = earned > this.ribbons;
    this.ribbons = earned;
    return gained;
  }

  get experienceMultiplier() {
    return 1 + this.ribbons * 0.15;
  }

  /**
   * Ataque efectivo = base × experiencia × (1 + mods) × HP%.
   * El ataque decae con la vida (en el original, una unidad al 40% pega la
   * mitad que al 80%), salvo con "frenzy".
   */
  getEffectiveAttack(mod = 0) {
    if (!this.isAlive()) return 0;
    const hpRatio = this.hasAbility("frenzy") ? 1 : this.currentHp / this.maxHp;
    const base = this.template.attack * this.experienceMultiplier;
    return Math.max(0, base * (1 + mod + this.tempAttackMod) * hpRatio);
  }

  getEffectiveDefense(mod = 0) {
    const base = this.template.defense * this.experienceMultiplier;
    return Math.max(1, base * (1 + mod + this.tempDefenseMod));
  }

  getEffectiveMove(flatBonus = 0) {
    return Math.max(1, this.template.move + this.tempMoveMod + flatBonus);
  }

  applyDamage(amount) { this.currentHp = Math.max(0, this.currentHp - amount); }
  heal(amount) {
    const before = this.currentHp;
    this.currentHp = Math.min(this.maxHp, this.currentHp + amount);
    return this.currentHp - before;
  }

  /** Aplica un buff temporal (dura hasta resetTurnState). type: attack|defense|move */
  applyTempBuff(type, value) {
    if (type === "attack") this.tempAttackMod += value;
    if (type === "defense") this.tempDefenseMod += value;
    if (type === "move") this.tempMoveMod += value;
  }

  /** Mejora de línea al subir de era: conserva el % de vida y la experiencia */
  upgradeTo(template) {
    const ratio = this.currentHp / this.maxHp;
    this.template = template;
    this.templateId = template.id;
    this.maxHp = template.hp;
    this.currentHp = Math.max(1, Math.round(template.hp * ratio));
  }
}

export function createUnit(template, ownerId, x, y) {
  return new UnitInstance(template, ownerId, x, y);
}
