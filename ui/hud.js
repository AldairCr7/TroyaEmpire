/**
 * hud.js
 * -----------------------------------------------------------------------
 * Paneles HTML alrededor del mapa: barra de recursos, ficha de la
 * selección, lista de acciones, pronóstico de combate, crónica,
 * tecnologías y mercado. Solo pinta; las decisiones las toma main.js.
 * -----------------------------------------------------------------------
 */

import { portrait, unitSprite, buildingSprite } from "../render/sprites.js";
import { getTerrain } from "../data/terrain.js";
import { ERAS, FACTIONS, POWER_COOLDOWN } from "../engine/game.js";
import { TECHNOLOGIES } from "../data/technologies.js";
import { BUILDINGS } from "../data/buildings.js";
import { HOUSES } from "../data/houses.js";

const $ = id => document.getElementById(id);

const CATEGORY = {
  infantry: "Infantería", spear: "Lanceros", ranged: "A distancia", skirmish: "Hostigador",
  chariot: "Carro", siege: "Asedio", support: "Apoyo", special: "Especial"
};

const ABILITY = {
  antiChariot: "Antícarro: +83% y golpea primero contra carros",
  desertCharge: "Carga en desierto: +33% de ataque al atacar desde arena o camino de desierto",
  scaresHorses: "Espanta caballos: los carros enemigos pegan un 25% menos contra ella",
  unitsOnly: "Solo tropa: no le hace nada a los edificios",
  improvedHeal: "Curación mejorada: devuelve 45 de vida en vez de 30",
  causeFear: "Causa miedo: todo el que la tenga delante pega un 20% menos",
  zeal: "Celo: recupera 15 de vida tras cada combate contra tropa",
  rapidFire: "Fuego rápido: dispara el doble, así que su ataque cuenta doble",
  noScare: "Mole: a este no lo espantan los camellos",
  firstStrike: "Primer golpe: golpea primero aunque la ataquen, de cerca y de lejos",
  volley: "Andanada: +40% de ataque mientras le quede más de la mitad de la vida",
  woodsman: "Leñador: +33% de ataque dentro del bosque",
  skirmish: "Hostigador: golpea primero si lo atacan cuerpo a cuerpo",
  noMoveAndAttack: "No puede moverse y atacar en el mismo turno",
  scout: "Explorador: el terreno difícil le cuesta como máximo 2",
  plainsCharge: "Carga: +33% de ataque desde llanura",
  buildingsOnly: "Solo ataca edificios y murallas (×3 de daño)",
  noCounter: "No contraataca",
  splashDamage: "Salpica 50% a los enemigos pegados al objetivo",
  transportInfantry: "Tu infantería puede subir a la muralla pegada a ella",
  convert: "Convierte: puede pasar a tu bando a un enemigo vecino",
  carryRelic: "Porta reliquias hasta un Templo",
  mercenary: "Mercenario: se contrata en el mercado, solo con bronce",
  build: "Construye y repara edificios adyacentes",
  gather: "",
  heal: "Cura 30 HP a un aliado vecino",
  inspire: "Inspira: +25% ataque a un aliado vecino este turno",
  firstStrike: "Golpea primero cuando lo atacan",
  trojanHorseInfiltration: "Pegado a la muralla, suelta 3 guerreros dentro",
  transport: "Transporte: carga tropa y la desembarca en la costa",
  deploy: "Se monta para disparar y se desmonta para moverse",
  seasonedVeteran: "Veterano: gana cintas cada 2 combates",
  frenzy: "No pierde fuerza al estar herido",
  heroPowers: ""
};

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function costHtml(game, ownerId, cost) {
  const p = game.players[ownerId];
  const g = cost.grain || 0, b = cost.bronze || 0;
  return `<span class="cost">${g ? `<span class="${p.grain >= g ? "g" : "no"}">${g} grano</span>` : ""}${b ? `<span class="${p.bronze >= b ? "b" : "no"}">${b} bronce</span>` : ""}${!g && !b ? `<span class="g">Gratis</span>` : ""}</span>`;
}

// ------------------------------------------------------------------ barra superior
export function renderTopbar(game, viewer) {
  const cur = game.current;
  const me = game.players[viewer] || cur;
  $("scenario-name").textContent = `${game.scenario.name} · ${game.map.width}×${game.map.height} · semilla ${game.map.seed}`;
  const chip = $("turn-chip");
  chip.textContent = game.winner ? "Partida terminada" : `Turno ${game.round} · ${cur.name}${cur.control === "ai" ? " (IA)" : ""}`;
  chip.className = `turn-chip ${game.winner ? "" : cur.id}`;
  $("era-chip").textContent = `Era ${me.era} · ${ERAS[me.era].name}`;
  const hc = $("house-chip");
  const house = HOUSES[me.house];
  if (house) { hc.hidden = false; hc.textContent = house.name; hc.title = `${house.blurb} ${house.bonusText}.`; }
  else hc.hidden = true;
  const lim = $("limit-chip");
  const wonders = game.order.map(id => game.players[id]).filter(p => p.wonder);
  if (wonders.length) { lim.hidden = false; lim.textContent = wonders.map(p => `Maravilla ${p.name}: ${p.wonder.left}`).join(" · "); }
  else lim.hidden = true;
  const inc = game.income(me.id);
  $("res-grain").textContent = me.grain;
  $("res-bronze").textContent = me.bronze;
  $("inc-grain").textContent = `+${inc.grain}`;
  $("inc-bronze").textContent = `+${inc.bronze}`;
  $("res-pop").textContent = game.unitsOf(me.id).length;
  $("pop-cap").textContent = `/${game.popCap(me.id)}`;
}

// ------------------------------------------------------------------ objetivos
export function renderObjectives(game, viewer) {
  const el = $("objectives");
  if (!el) return;
  const rows = game.order.map(id => {
    const g = game.goalProgress(id);
    if (!g) return "";
    const pct = g.need ? Math.min(100, Math.round((g.now / g.need) * 100)) : 0;
    const mine = id === viewer;
    return `<li class="${id}${g.done ? " done" : ""}">
      <span class="who">${esc(game.players[id].name)}${mine ? " · tú" : ""}</span>
      <span class="txt">${esc(g.text)}</span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="num">${g.need > 1 ? `${g.now}/${g.need}` : (g.done ? "✓" : "—")}</span>
    </li>`;
  }).join("");
  el.innerHTML = `<h3>Objetivos</h3><ul class="goals">${rows}</ul>`;
}

// ------------------------------------------------------------------ selección
export function renderSelection(game, entity, viewer) {
  const el = $("selection");
  if (!entity) {
    const cur = game.current;
    const idle = game.unitsOf(cur.id).filter(u => !u.hasActed).length;
    el.innerHTML = `<h3>${esc(cur.name)}</h3><p class="empty">${cur.control === "human"
      ? `Toca una unidad o un edificio tuyo. Te quedan <b>${idle}</b> unidades por mover.`
      : "El ordenador está pensando su turno."}</p>`;
    return;
  }
  const t = entity.template;
  const owner = entity.ownerId;
  const isB = entity.kind === "building";
  const ratio = entity.currentHp / entity.maxHp;
  const hpCls = ratio > 0.6 ? "" : ratio > 0.3 ? "mid" : "low";
  const terrain = getTerrain(game.grid.getTile(entity.x, entity.y).terrain);
  let body = "";
  if (!isB) {
    const pos = { x: entity.x, y: entity.y };
    const aMod = game.attackModifier(entity, pos, { kind: "unit", template: { category: "infantry" } });
    const dMod = game.defenseModifier(entity, pos, null);
    const atk = Math.round(entity.getEffectiveAttack(aMod));
    const def = Math.round(entity.getEffectiveDefense(dMod));
    const mv = entity.getEffectiveMove(game.moveBonus(entity));
    const pct = v => v > 0.001 ? `<span class="up">+${Math.round(v * 100)}%</span>` : v < -0.001 ? `<span class="down">${Math.round(v * 100)}%</span>` : "";
    body += `<dl class="stats">
      <div class="stat"><dt>Ataque</dt><dd>${atk} ${pct(aMod + entity.tempAttackMod)}</dd></div>
      <div class="stat"><dt>Defensa</dt><dd>${def} ${pct(dMod)}</dd></div>
      <div class="stat"><dt>Mover</dt><dd>${mv}</dd></div>
      ${t.range > 1 ? `<div class="stat"><dt>Alcance</dt><dd>${t.range}${terrain.rangeMod ? ` <span class="${terrain.rangeMod > 0 ? "up" : "down"}">${terrain.rangeMod > 0 ? "+1" : "−1"}</span>` : ""}</dd></div>` : ""}
      <div class="stat"><dt>Visión</dt><dd>${game.sightOf(entity)}</dd></div>
      ${entity.ribbons || entity.battlesFought ? `<div class="stat"><dt>Cintas</dt><dd>${"★".repeat(entity.ribbons) || "—"} <span class="muted" style="font-size:11px">${entity.battlesFought | 0} comb.</span></dd></div>` : ""}
    </dl>`;
    const tags = (t.abilities || []).filter(a => ABILITY[a]).map(a => `<span class="tag" title="${esc(ABILITY[a])}">${esc(ABILITY[a].split(":")[0])}</span>`);
    if (t.attackBonus) for (const [k, v] of Object.entries(t.attackBonus)) if (v > 1) tags.push(`<span class="tag gold">×${v} vs ${k === "building" ? "edificios" : (CATEGORY[k] || k).toLowerCase()}</span>`);
    if (tags.length) body += `<div class="tags">${tags.join("")}</div>`;
    const cura = game.healingAt(entity.x, entity.y, owner);
    if (cura) {
      body += `<p class="terrain-line heal-line">Se cura <b>+${cura.amount} HP</b> al empezar tu turno · ${esc(cura.source)}</p>`;
    } else if (ratio < 1 && owner === viewer) {
      body += `<p class="terrain-line muted">Herida. Se cura sola si la paras <b>encima de cualquier edificio tuyo</b> — hasta una granja — o pegada en cruz a un Templo.</p>`;
    }
    if (entity.isHero()) {
      body += `<ul class="powers">${t.heroPowers.map(p => {
        const cd = (entity.cooldowns?.[p.id] || 0) - game.round;
        const status = POWER_COOLDOWN[p.id] ? (cd > 0 ? ` · <span class="muted">listo en ${cd}</span>` : entity.powerUsed ? "" : ` · <span style="color:var(--good)">listo</span>`) : "";
        return `<li><b>${esc(p.name)}</b>${status}<br>${esc(p.effect)}</li>`;
      }).join("")}</ul>`;
    }
    if (entity.relic) body += `<p class="terrain-line" style="color:var(--bronze-l)">Lleva una reliquia: ofréndala junto a un Templo tuyo.</p>`;
    if (t.abilities?.includes("deploy")) {
      body += `<p class="terrain-line" style="color:${entity.deployed ? "var(--good)" : "var(--bronze-l)"}">${entity.deployed ? "Montada: dispara, pero no puede moverse." : "Desmontada: se mueve, pero no puede disparar."}</p>`;
    }
    if (owner === game.current.id && game.current.control === "human") {
      body += `<p class="terrain-line">${entity.hasActed ? "Ya ha actuado este turno." : entity.hasMoved ? "Se ha movido; elige una orden en su menú." : "Toca una casilla azul para moverla, o tócala otra vez para abrir su menú."}</p>`;
    }
  } else {
    const bits = [];
    if (t.income) bits.push(`Produce ${[t.income.grain ? `${t.income.grain} de grano` : "", t.income.bronze ? `${t.income.bronze} de bronce` : ""].filter(Boolean).join(" y ")} por turno`);
    if (t.attack) bits.push(`Dispara (ataque ${t.attack}, alcance ${t.range})`);
    body += `<dl class="stats">
      <div class="stat"><dt>Vida</dt><dd>${entity.currentHp}/${entity.maxHp}</dd></div>
      <div class="stat"><dt>Defensa</dt><dd>${Math.round(t.defense * (1 + game.defenseModifier(entity, entity)))}</dd></div>
      <div class="stat"><dt>Visión</dt><dd>${game.sightOf(entity)}</dd></div>
    </dl>
    <p class="desc">${esc(t.description || "")}${bits.length ? " " + esc(bits.join(". ")) + "." : ""}</p>`;
    if (t.healAura) body += `<p class="terrain-line heal-line">Cura <b>+${t.healAura} HP</b> por turno a tus unidades pegadas en cruz (sus 4 lados).</p>`;
    if (!t.isWall) body += `<p class="terrain-line heal-line">Tus unidades paradas <b>encima</b> se curan <b>+${t.isCapital ? 20 : t.healAura || 15} HP</b> por turno.</p>`;
    // un edificio a media vida produce a medias: hay que verlo
    if (t.income && entity.currentHp < entity.maxHp) {
      const pct = Math.round(entity.currentHp / entity.maxHp * 100);
      body += `<p class="terrain-line" style="color:#e0a05a">Dañado: produce al <b>${pct}%</b>. Repararlo lo deja entero de golpe.</p>`;
    }
    if (entity.underConstruction) body += `<p class="terrain-line">En obra: ${entity.buildTurnsLeft > 1 ? `faltan ${entity.buildTurnsLeft} turnos` : "listo el próximo turno"}.</p>`;
    if (entity.relics) body += `<p class="terrain-line" style="color:var(--bronze-l)">Guarda ${entity.relics} reliquia(s): +${entity.relics * 25} de bronce por turno.</p>`;
    const w = game.players[owner].wonder;
    if (t.id === "wonder" && w && w.id === entity.instanceId) body += `<p class="terrain-line" style="color:var(--bronze-l)">Si resiste ${w.left} turnos más, ${esc(FACTIONS[owner].name)} ganan.</p>`;
  }
  // caja del terreno donde está parada la unidad, con sus efectos
  const efectos = [];
  if (terrain.defenseMod) efectos.push(`defensa ${terrain.defenseMod > 0 ? "+" : ""}${Math.round(terrain.defenseMod * 100)}%`);
  if (terrain.rangeMod) efectos.push(`alcance ${terrain.rangeMod > 0 ? "+1" : "−1"}`);
  if (terrain.chariotChargeBonus) efectos.push("carga de carros");
  body += `<div class="terrain-box">
      <span class="tb-chip" style="background:linear-gradient(135deg, ${terrain.accent}, ${terrain.color})"></span>
      <span class="tb-txt"><b>${esc(terrain.name)}</b>${efectos.length ? `<small>${esc(efectos.join(" · "))}</small>` : ""}</span>
      <span class="tb-move"><i>mov</i>${isFinite(terrain.moveCost) ? terrain.moveCost : "—"}</span>
    </div>`;

  el.innerHTML = `
    <div class="sel-head ${owner}">
      <canvas width="144" height="144"></canvas>
      <div>
        <p class="sel-name">${esc(t.name)}</p>
        <p class="sel-sub">${esc(FACTIONS[owner].name)} · ${isB ? "Edificio" : esc(CATEGORY[t.category] || "")}${!isB && t.era ? ` · era ${t.era}` : ""}</p>
        <div class="hpbar ${hpCls}"><i style="width:${Math.round(ratio * 100)}%"></i></div>
        <p class="sel-sub">${entity.currentHp} / ${entity.maxHp} HP</p>
      </div>
    </div>${body}`;
  const cv = el.querySelector("canvas");
  cv.getContext("2d").drawImage(portrait(t, owner, 144, isB), 0, 0);
}

// ------------------------------------------------------------------ acciones
/**
 * @param items lista de { label, onClick, disabled, title, kind:"primary"|"danger" }
 * @param extra HTML adicional (listas de reclutamiento/construcción)
 */
export function renderActions(hint, items = [], extraNodes = []) {
  const el = $("actions");
  if (!hint && !items.length && !extraNodes.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = "";
  if (hint) { const p = document.createElement("p"); p.className = "hint"; p.innerHTML = hint; el.appendChild(p); }
  if (items.length) {
    const row = document.createElement("div");
    row.className = "action-row";
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `btn ${it.kind || ""}`;
      b.textContent = it.label;
      if (it.title) b.title = it.title;
      b.disabled = !!it.disabled;
      b.addEventListener("click", it.onClick);
      row.appendChild(b);
    }
    el.appendChild(row);
  }
  for (const n of extraNodes) el.appendChild(n);
}

/** Lista de opciones con miniatura (reclutar / construir) */
export function optionList(options, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "recruit-list";
  for (const o of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opt";
    b.disabled = !!o.disabled;
    if (o.title) b.title = o.title;
    const cv = document.createElement("canvas");
    cv.width = 88; cv.height = 88;
    const spr = o.building ? buildingSprite(o.template, o.owner, 88) : unitSprite(o.template, o.owner, 88);
    cv.getContext("2d").drawImage(spr, 0, 0);
    const txt = document.createElement("span");
    txt.innerHTML = `<span class="n">${esc(o.name)}</span><span class="d">${o.detail || ""}</span>`;
    const cost = document.createElement("span");
    cost.innerHTML = o.costHtml || "";
    b.append(cv, txt, cost);
    b.addEventListener("click", () => onPick(o));
    wrap.appendChild(b);
  }
  return wrap;
}

// ------------------------------------------------------------------ pronóstico
export function renderForecast(game, attacker, target, origin, result, screen) {
  const el = $("forecast");
  if (!result) { el.hidden = true; return; }
  const bar = (before, after, max) => `<div class="fc-bar"><i class="rest" style="width:${after / max * 100}%"></i><i class="lost" style="left:${after / max * 100}%;width:${(before - after) / max * 100}%"></i></div>`;
  const notes = [];
  if (!result.counter) notes.push("Sin contraataque: no está a su alcance.");
  if (result.defenderFirst) notes.push("¡El defensor golpea primero!");
  if (result.targetDies) notes.push("Lo eliminas.");
  if (result.attackerDies) notes.push("Tu unidad caería.");
  if (result.splash.length) notes.push(`Salpica a ${result.splash.length} enemigo(s).`);
  const moved = origin.x !== attacker.x || origin.y !== attacker.y;
  el.innerHTML = `
    <h4>${esc(attacker.name)} ⚔ ${esc(target.name)}</h4>
    <div class="fc-row"><span class="who">${esc(attacker.name)}</span><span class="nums">${attacker.currentHp} → ${result.attackerHp}</span>${bar(attacker.currentHp, result.attackerHp, attacker.maxHp)}</div>
    <div class="fc-row"><span class="who">${esc(target.name)}</span><span class="nums">${target.currentHp} → ${result.targetHp}</span>${bar(target.currentHp, result.targetHp, target.maxHp)}</div>
    ${notes.length ? `<p class="fc-note ${result.attackerDies || result.defenderFirst ? "warn" : ""}">${notes.join(" ")}</p>` : ""}
    ${moved ? `<p class="fc-note">Se moverá antes de atacar.</p>` : ""}`;
  el.hidden = false;
  const wrap = el.parentElement.getBoundingClientRect();
  let x = screen.x + 36, y = screen.y - 20;
  if (x + 280 > wrap.width) x = screen.x - 300;
  x = Math.max(8, x); y = Math.max(8, Math.min(y, wrap.height - el.offsetHeight - 8));
  // no tapar el menú de órdenes: al otro lado, o debajo si no cabe
  const menu = document.getElementById("action-menu");
  if (menu && !menu.hidden) {
    const m = { l: menu.offsetLeft, t: menu.offsetTop, r: menu.offsetLeft + menu.offsetWidth, b: menu.offsetTop + menu.offsetHeight };
    const w = el.offsetWidth, h = el.offsetHeight;
    const hits = (xx, yy) => xx < m.r && xx + w > m.l && yy < m.b && yy + h > m.t;
    if (hits(x, y)) {
      const left = m.l - w - 10, right = m.r + 10;
      if (left >= 8) x = left;
      else if (right + w <= wrap.width - 8) x = right;
      else { y = m.b + 8 + h <= wrap.height ? m.b + 8 : Math.max(8, m.t - h - 8); }
    }
  }
  el.style.left = `${x}px`; el.style.top = `${y}px`;
}

export function renderTileInfo(game, tile, viewer) {
  const el = $("tile-info");
  if (!tile) { el.hidden = true; return; }
  const t = game.grid.getTile(tile.x, tile.y);
  const terrain = getTerrain(t.terrain);
  if (game.fog && viewer && !game.isExplored(viewer, tile.x, tile.y)) { el.innerHTML = "<b>Sin explorar</b>"; el.hidden = false; return; }
  const bits = [`<b>${esc(terrain.name)}</b>`];
  bits.push(`mover ${isFinite(terrain.moveCost) ? terrain.moveCost : "—"}`);
  if (terrain.defenseMod) bits.push(`def ${terrain.defenseMod > 0 ? "+" : ""}${Math.round(terrain.defenseMod * 100)}%`);
  if (terrain.rangeMod) bits.push(`alcance ${terrain.rangeMod > 0 ? "+1" : "−1"}`);
  if (t.deposit && !t.building) bits.push(t.deposit === "wheat" ? "trigal (aquí va un molino)" : "yacimiento de bronce (aquí va una mina)");
  const cura = viewer != null && game.healingAt(tile.x, tile.y, viewer);
  if (cura) bits.push(`<span class="heal-line">cura +${cura.amount}</span>`);
  el.innerHTML = bits.join(" · ");
  el.hidden = false;
}

// ------------------------------------------------------------------ crónica
export function appendLog(entry) {
  const li = document.createElement("li");
  li.className = entry.tone || "";
  li.textContent = entry.text;
  const log = $("log");
  log.prepend(li);
  while (log.children.length > 120) log.lastChild.remove();
}

export function toast(text, ms = 2200) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

// ------------------------------------------------------------------ tecnologías
export function renderTechs(game, ownerId, canAct, onResearch, onAdvance) {
  const p = game.players[ownerId];
  const next = ERAS[p.era + 1];
  const box = $("era-box");
  box.innerHTML = `
    <div>
      <div class="t">Era ${p.era}: ${esc(ERAS[p.era].name)}</div>
      <div class="era-steps">${[1, 2, 3, 4].map(i => `<i class="${i <= p.era ? "on" : ""}"></i>`).join("")}</div>
    </div>
    <div style="margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${next ? `<span>Siguiente: <b>${esc(next.name)}</b></span>${costHtml(game, ownerId, next.cost)}<span class="${game.eraProgress(ownerId).ok ? "done-mark" : "muted"}">Tecnologías de esta era: <b>${game.eraProgress(ownerId).have}/${game.eraProgress(ownerId).need}</b></span>` : `<span class="muted">Has alcanzado la última era.</span>`}
    </div>`;
  if (next) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary";
    b.textContent = p.advancedThisTurn ? "Ya avanzaste este turno" : "Avanzar de era";
    const prog = game.eraProgress(ownerId);
    b.disabled = !canAct || p.advancedThisTurn || !game.canAfford(ownerId, next.cost) || !prog.ok;
    if (!prog.ok) b.title = `Investiga ${prog.need - prog.have} tecnología(s) más de la era ${p.era}`;
    b.addEventListener("click", onAdvance);
    box.lastElementChild.appendChild(b);
  }

  // Las tecnologías van agrupadas POR EDIFICIO, como en el original: así se
  // ve de un vistazo que sin Herrería no hay armas y sin Universidad no hay
  // asedio pesado.
  const list = $("tech-list");
  list.innerHTML = "";
  const arbol = game.techTree(ownerId);
  const porEdificio = new Map();
  for (const o of arbol) {
    const k = o.tech.edificio || "camp";
    if (!porEdificio.has(k)) porEdificio.set(k, []);
    porEdificio.get(k).push(o);
  }
  const orden = ["camp", "blacksmith", "university", "castle", "barracks", "stable",
    "archeryRange", "siegeWorkshop", "temple", "mill", "mine"];
  const claves = [...porEdificio.keys()].sort((a, b) => orden.indexOf(a) - orden.indexOf(b));

  for (const clave of claves) {
    const edif = BUILDINGS[clave];
    const tengo = game.hasBuilding(ownerId, clave);
    const techs = porEdificio.get(clave).sort((a, b) => a.tech.era - b.tech.era);
    const hechas = techs.filter(t => t.hecha).length;

    const sec = document.createElement("section");
    sec.className = `tech-era tech-edificio ${tengo ? "" : "sin-edificio"}`;
    sec.innerHTML = `<h3>${esc(edif?.name || clave)}
      <span class="muted small">${hechas}/${techs.length}</span>
      ${tengo ? "" : `<span class="falta-edificio">te falta construirla</span>`}</h3>`;

    const grid = document.createElement("div");
    grid.className = "tech-grid";
    for (const o of techs) {
      const t = o.tech;
      const card = document.createElement("div");
      card.className = `tech ${o.hecha ? "done" : ""} ${o.bloqueo ? "locked" : ""}`;
      let pie;
      if (o.hecha) pie = `<span class="done-mark">✓ Investigada</span>`;
      else if (o.bloqueo) {
        const b = o.bloqueo;
        const motivo = b.tipo === "era" ? `Hace falta la ${b.texto}`
          : b.tipo === "edificio" ? `Hace falta: ${b.texto}`
            : `Antes: ${b.texto}`;
        pie = `<span class="bloqueo">${esc(motivo)}</span>`;
      } else pie = costHtml(game, ownerId, o.cost);

      card.innerHTML = `<span class="n">${esc(t.name)}<i class="era-pin">era ${t.era}</i></span>
        <span class="d">${esc(t.description)}</span>
        <div class="foot">${pie}</div>`;

      if (!o.hecha && !o.bloqueo) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "btn tiny";
        b.textContent = "Investigar";
        b.disabled = !canAct || p.researchedThisTurn || !game.canAfford(ownerId, o.cost);
        if (p.researchedThisTurn) b.title = "Ya investigaste este turno";
        b.addEventListener("click", () => onResearch(t.id));
        card.querySelector(".foot").appendChild(b);
      }
      grid.appendChild(card);
    }
    sec.appendChild(grid);
    list.appendChild(sec);
  }
}

export function renderMarket(game, ownerId, canAct, onTrade, onHire) {
  const r = game.tradeRates(ownerId);
  const p = game.players[ownerId];
  const body = $("market-body");
  body.innerHTML = `<p class="muted small" style="margin:0">Tienes <b style="color:#f6d77a">${p.grain} grano</b> y <b style="color:#ffab6b">${p.bronze} bronce</b>.</p>`;
  for (const [from, label, rate] of [["grain", `100 grano → ${r.grainToBronze} bronce`, r.grainToBronze], ["bronze", `100 bronce → ${r.bronzeToGrain} grano`, r.bronzeToGrain]]) {
    const row = document.createElement("div");
    row.className = "trade";
    row.innerHTML = `<span class="rate">${label}</span>`;
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary";
    b.textContent = "Cambiar";
    b.disabled = !canAct || p[from] < 100;
    b.addEventListener("click", () => onTrade(from));
    row.appendChild(b);
    body.appendChild(row);
  }
  // --- los tres mercenarios del día ---
  const oferta = game.mercenaryOffer(ownerId);
  const titulo = document.createElement("h4");
  titulo.className = "merc-titulo";
  titulo.textContent = p.era < 2 ? "Mercenarios (desde la era 2)" : "Mercenarios de hoy";
  body.appendChild(titulo);

  if (!oferta.length) {
    const vacio = document.createElement("p");
    vacio.className = "muted small";
    vacio.textContent = p.era < 2
      ? "Todavía no llegan forasteros a tu campamento."
      : "Hoy no hay nadie de fiar en el mercado.";
    body.appendChild(vacio);
    return;
  }

  for (const o of oferta) {
    const t = o.template;
    const row = document.createElement("div");
    row.className = "trade merc";
    const hab = (t.abilities || []).map(a => ABILITY[a]).filter(Boolean).map(x => x.split(":")[0]);
    const extra = `ATQ ${t.attack} · DEF ${t.defense}`
      + (t.range > 1 ? ` · alcance ${t.range}` : "")
      + (hab.length ? ` · ${hab.join(", ")}` : "");
    row.innerHTML = `<span><span class="rate">${esc(t.name)}</span><br><span class="muted small">${esc(extra)}</span></span>`;
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn primary";
    b.textContent = `${o.cost.bronze} bronce`;
    b.disabled = !canAct || !game.canHireMercenary(ownerId, o.unitId);
    if (p.mercenaryThisTurn) b.title = "Ya contrataste uno este turno";
    else if (p.bronze < o.cost.bronze) b.title = "No te alcanza el bronce";
    b.addEventListener("click", () => onHire && onHire(o.unitId));
    row.appendChild(b);
    body.appendChild(row);
  }
}
