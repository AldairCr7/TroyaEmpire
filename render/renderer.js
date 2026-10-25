/**
 * renderer.js
 * -----------------------------------------------------------------------
 * Dibuja la partida en un <canvas>:
 *   - Capa de terreno pre-renderizada (se rehace solo si cambia el mapa:
 *     una muralla que cae, un edificio nuevo…).
 *   - Agua animada, edificios, unidades, superposiciones de movimiento y
 *     ataque, niebla de guerra y efectos (flechas, piedras, números).
 *   - Cámara con arrastre, rueda para zoom, flechas/WASD y minimapa.
 *
 * Escucha los eventos de engine/game.js y los reproduce en cola, uno tras
 * otro, para que se entienda qué ha pasado (clave en el turno de la IA).
 * -----------------------------------------------------------------------
 */

import { getTerrain } from "../data/terrain.js";
import { tileHash } from "../engine/rng.js";
import { unitSprite, buildingSprite, drawWallTile, PALETTE, roundRect } from "./sprites.js";

const T = 64; // px por casilla en coordenadas de mundo

export class Renderer {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minimap = minimap;
    this.mctx = minimap?.getContext("2d");
    this.game = null;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.overlay = {};
    this.queue = [];
    this.active = null;
    this.effects = [];
    this.ghosts = new Map();
    this.displayPos = new Map();
    this.displayHp = new Map();
    this.hidden = new Set();
    this.idleWaiters = [];
    this.banner = null;
    this.speed = 1;
    this.follow = false;
    this.onTileClick = () => {};
    this.onTileHover = () => {};
    this.onCancel = () => {};
    this.viewerId = () => null;
    this._keys = new Set();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    requestAnimationFrame(t => this._frame(t));
    // con la pestaña oculta el navegador congela requestAnimationFrame: se
    // vacía la cola sin animar para que el turno de la IA no se quede parado
    setInterval(() => { if (document.hidden) this._flushQueue(); }, 150);
  }

  // ------------------------------------------------------------------ partida
  setGame(game) {
    this.game = game;
    this.queue = []; this.active = null; this.effects = [];
    this.ghosts.clear(); this.displayPos.clear(); this.displayHp.clear(); this.hidden.clear();
    this.overlay = {};
    this._buildTerrain();
    game.on((type, data) => this._onEvent(type, data));
    const cap = game.capitals(this.viewerId() || game.current.id)[0] || { x: game.grid.width / 2, y: game.grid.height / 2 };
    this.fitZoom();
    this.centerOn(cap.x, cap.y, true);
  }

  fitZoom() {
    const g = this.game.grid;
    const zx = this.vw / (g.width * T), zy = this.vh / (g.height * T);
    // el mapa entero si cabe a buen tamaño; si no, lo bastante cerca para leer las unidades
    this.cam.zoom = clamp(Math.max(Math.min(zx, zy), this.vw < 700 ? 0.7 : 0.9), 0.45, 1.25);
  }

  centerOn(x, y, instant = false) {
    const tx = (x + 0.5) * T, ty = (y + 0.5) * T;
    if (instant) { this.cam.x = tx; this.cam.y = ty; this._clampCam(); this.camTarget = null; }
    else this.camTarget = { x: tx, y: ty };
  }

  setOverlay(o) { this.overlay = o || {}; }

  /**
   * Acerca la cámara solo si la casilla se sale (o roza el borde) de la vista.
   * Así el tablero no da un salto en cada flechazo.
   */
  ensureVisible(x, y, margen = 1.2) {
    const z = this.cam.zoom;
    const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
    const mw = this.vw / 2 / z - T * margen, mh = this.vh / 2 / z - T * margen;
    let nx = this.cam.x, ny = this.cam.y;
    if (cx < this.cam.x - mw) nx = cx + mw;
    else if (cx > this.cam.x + mw) nx = cx - mw;
    if (cy < this.cam.y - mh) ny = cy + mh;
    else if (cy > this.cam.y + mh) ny = cy - mh;
    if (nx === this.cam.x && ny === this.cam.y) return;
    this.cam.x = nx; this.cam.y = ny;
    this.camTarget = null;
    this._clampCam();
  }

  /** Promesa que se resuelve cuando no queden animaciones pendientes */
  idle() {
    if (!this.active && !this.queue.length) return Promise.resolve();
    return new Promise(r => this.idleWaiters.push(r));
  }
  get busy() { return !!this.active || this.queue.length > 0; }

  // ------------------------------------------------------------------ eventos
  _onEvent(type, d) {
    const g = this.game;
    switch (type) {
      case "move": {
        if (d.path.length < 2) break;
        const id = d.unit.instanceId;
        if (!this.displayPos.has(id)) this.displayPos.set(id, { ...d.path[0] });
        this._push({ kind: "move", unit: d.unit, path: d.path, dur: 70 + 85 * (d.path.length - 1) });
        break;
      }
      case "teleport": this.displayPos.delete(d.unit.instanceId); break;
      case "attack": {
        const r = d.result;
        const hp0a = r.attacker.currentHp + r.attackerDamageTaken, hp0t = r.target.currentHp + r.targetDamageTaken;
        this.displayHp.set(r.attacker.instanceId, this.displayHp.get(r.attacker.instanceId) ?? hp0a);
        this.displayHp.set(r.target.instanceId, this.displayHp.get(r.target.instanceId) ?? hp0t);
        for (const s of r.splash) this.displayHp.set(s.unit.instanceId, this.displayHp.get(s.unit.instanceId) ?? s.unit.currentHp + s.damage);
        this._push({ kind: "attack", r, dur: 0 });
        break;
      }
      case "shoot": {
        const hp0 = d.target.currentHp + d.amount;
        this.displayHp.set(d.target.instanceId, this.displayHp.get(d.target.instanceId) ?? hp0);
        this._push({ kind: "shoot", from: d.from, target: d.target, amount: d.amount, dur: 420 });
        break;
      }
      case "damage": {
        if (!this.displayHp.has(d.entity.instanceId)) this.displayHp.set(d.entity.instanceId, d.entity.currentHp + d.amount);
        this._push({ kind: "hit", entity: d.entity, amount: d.amount, dur: 220 });
        break;
      }
      case "heal": this._push({ kind: "heal", entity: d.entity, amount: d.amount, dur: 120 }); break;
      case "death": {
        const e = d.entity;
        const pos = this.displayPos.get(e.instanceId) || { x: e.x, y: e.y };
        this.ghosts.set(e.instanceId, { entity: e, x: pos.x, y: pos.y, alpha: 1, silent: d.silent });
        this._push({ kind: "death", entity: e, dur: d.silent ? 50 : 420 });
        break;
      }
      case "spawn":
        this.hidden.add(d.unit.instanceId);
        this._push({ kind: "spawn", unit: d.unit, dur: 260 });
        break;
      case "build": this._push({ kind: "dust", x: d.building.x, y: d.building.y, dur: 200 }); break;
      case "pickup": this._push({ kind: "power", hero: d.unit, dur: 300 }); break;
      case "power": this._push({ kind: "power", hero: d.hero, dur: 380 }); break;
      case "buff": this._push({ kind: "power", hero: d.entity, dur: 250 }); break;
      case "terrain": this._buildTerrain(); break;
      case "turnStart": {
        const p = d.player;
        this._push({ kind: "banner", text: `Turno ${g.round} · ${p.name}`, sub: p.control === "ai" ? "Mueve el ordenador" : "Tu turno", owner: p.id, show: 1100 });
        break;
      }
      case "era": this._push({ kind: "banner", text: `Era ${d.player.era}`, sub: `${d.player.name} avanza de era`, owner: d.player.id, show: 1400 }); break;
    }
  }

  _push(item) { this.queue.push(item); }

  _startNext(now) {
    const item = this.queue.shift();
    if (!item) return;
    item.t0 = now;
    item.dur = (item.dur || 0) / this.speed;
    this.active = item;
    const view = this.viewerId();
    const g = this.game;
    const seen = (x, y) => !g.fog || !view || g.isVisible(view, x, y);
    switch (item.kind) {
      case "move": {
        const end = item.path[item.path.length - 1];
        if (!seen(end.x, end.y) && !seen(item.path[0].x, item.path[0].y)) { item.dur = 0; break; }
        if (this.follow) this.centerOn(end.x, end.y);
        break;
      }
      case "attack": {
        const r = item.r;
        const a = r.attacker, t = r.target;
        if (!seen(a.x, a.y) && !seen(t.x, t.y)) { this._applyAttackInstant(r); item.dur = 0; break; }
        if (this.follow) this.centerOn(t.x, t.y);
        // coreografía: embestida/proyectil → número → contraataque
        const ranged = (Math.abs(a.x - t.x) + Math.abs(a.y - t.y)) > 1;
        let tt = 0;
        const shotDur = 300 / this.speed, hitGap = 260 / this.speed;
        for (const s of r.steps) {
          const src = s.from === "attacker" ? a : t, dst = s.from === "attacker" ? t : a;
          const isRanged = ranged || (src.template.range || 1) > 1;
          this.effects.push({ type: isRanged ? "projectile" : "lunge", t0: now + tt, dur: shotDur, src, dst, stone: src.template.category === "siege" || src.template.category === "skirmish" });
          const at = now + tt + shotDur;
          this.effects.push({ type: "number", t0: at, dur: 900, x: dst.x, y: dst.y, text: `−${s.damage}`, color: "#ffdf8a", apply: () => this.displayHp.set(dst.instanceId, (this.displayHp.get(dst.instanceId) ?? dst.currentHp) - s.damage) });
          this.effects.push({ type: "flash", t0: at, dur: 180, x: dst.x, y: dst.y });
          if (s.damage >= 45) this.effects.push({ type: "shake", t0: at, dur: 220, mag: 5 });
          tt += shotDur + hitGap;
        }
        for (const sp of r.splash) {
          this.effects.push({ type: "number", t0: now + shotDur + 80, dur: 800, x: sp.unit.x, y: sp.unit.y, text: `−${sp.damage}`, color: "#ffc070", apply: () => this.displayHp.set(sp.unit.instanceId, (this.displayHp.get(sp.unit.instanceId) ?? sp.unit.currentHp) - sp.damage) });
        }
        item.dur = tt + 120 / this.speed;
        item.finish = () => this._applyAttackInstant(r);
        break;
      }
      case "shoot": {
        if (!seen(item.target.x, item.target.y)) { item.dur = 0; item.finish = () => this.displayHp.delete(item.target.instanceId); break; }
        this.effects.push({ type: "projectile", t0: now, dur: 300 / this.speed, src: item.from, dst: item.target });
        this.effects.push({ type: "number", t0: now + 300 / this.speed, dur: 900, x: item.target.x, y: item.target.y, text: `−${item.amount}`, color: "#ffdf8a" });
        item.finish = () => this.displayHp.delete(item.target.instanceId);
        break;
      }
      case "hit":
        this.effects.push({ type: "number", t0: now, dur: 900, x: item.entity.x, y: item.entity.y, text: `−${item.amount}`, color: "#ffb070" });
        this.effects.push({ type: "flash", t0: now, dur: 180, x: item.entity.x, y: item.entity.y });
        item.finish = () => this.displayHp.delete(item.entity.instanceId);
        break;
      case "heal":
        if (seen(item.entity.x, item.entity.y)) this.effects.push({ type: "number", t0: now, dur: 900, x: item.entity.x, y: item.entity.y, text: `+${item.amount}`, color: "#8ff08f" });
        break;
      case "spawn":
        this.hidden.delete(item.unit.instanceId);
        this.effects.push({ type: "ring", t0: now, dur: 500, x: item.unit.x, y: item.unit.y, color: "#ffe9a8" });
        break;
      case "dust":
        this.effects.push({ type: "ring", t0: now, dur: 450, x: item.x, y: item.y, color: "#e8d7b0" });
        break;
      case "power":
        this.effects.push({ type: "ring", t0: now, dur: 600, x: item.hero.x, y: item.hero.y, color: "#ffd86b", big: true });
        break;
      case "banner":
        // el cartel se ve encima pero no bloquea la cola ni los botones
        this.banner = { ...item, t0: now, dur: item.show / this.speed };
        item.dur = 0;
        break;
    }
  }

  _applyAttackInstant(r) {
    this.displayHp.delete(r.attacker.instanceId);
    this.displayHp.delete(r.target.instanceId);
    for (const s of r.splash) this.displayHp.delete(s.unit.instanceId);
  }

  _finishActive() {
    const it = this.active;
    if (!it) return;
    if (it.kind === "move") this.displayPos.delete(it.unit.instanceId);
    if (it.kind === "death") this.ghosts.delete(it.entity.instanceId);
    it.finish?.();
    this.active = null;
    if (!this.queue.length) {
      const w = this.idleWaiters; this.idleWaiters = [];
      w.forEach(fn => fn());
    }
  }

  _flushQueue() {
    const now = performance.now();
    for (let guard = 0; guard < 500 && (this.active || this.queue.length); guard++) {
      if (!this.active) this._startNext(now);
      if (this.active) { this.active.dur = 0; this._finishActive(); }
    }
    for (const e of this.effects) if (e.apply && !e.applied) { e.apply(); e.applied = true; }
    this.effects = [];
  }

  // ------------------------------------------------------------------ bucle
  _frame(now) {
    requestAnimationFrame(t => this._frame(t));
    this.now = now;
    // procesar cola
    let guard = 0;
    while (guard++ < 50) {
      if (!this.active) { if (!this.queue.length) break; this._startNext(now); }
      const it = this.active;
      const p = it.dur > 0 ? (now - it.t0) / it.dur : 1;
      if (it.kind === "move") {
        const k = clamp(p, 0, 1) * (it.path.length - 1);
        const i = Math.min(it.path.length - 2, Math.floor(k));
        const f = k - i;
        const a = it.path[i], b = it.path[i + 1];
        this.displayPos.set(it.unit.instanceId, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dir: Math.sign(b.x - a.x) });
      }
      if (it.kind === "death") {
        const gh = this.ghosts.get(it.entity.instanceId);
        if (gh) gh.alpha = 1 - clamp(p, 0, 1);
      }
      if (p >= 1) this._finishActive(); else break;
    }
    this._updateCamera();
    if (!this.game) return;
    this._draw(now);
    if (!this._mmT || now - this._mmT > 200) { this._mmT = now; this._drawMinimap(); }
  }

  _updateCamera() {
    const pan = 14 / this.cam.zoom;
    if (this._keys.has("ArrowLeft") || this._keys.has("a")) { this.cam.x -= pan; this.camTarget = null; }
    if (this._keys.has("ArrowRight") || this._keys.has("d")) { this.cam.x += pan; this.camTarget = null; }
    if (this._keys.has("ArrowUp") || this._keys.has("w")) { this.cam.y -= pan; this.camTarget = null; }
    if (this._keys.has("ArrowDown") || this._keys.has("s")) { this.cam.y += pan; this.camTarget = null; }
    if (this.camTarget) {
      this.cam.x += (this.camTarget.x - this.cam.x) * 0.14;
      this.cam.y += (this.camTarget.y - this.cam.y) * 0.14;
      if (Math.hypot(this.camTarget.x - this.cam.x, this.camTarget.y - this.cam.y) < 1) this.camTarget = null;
    }
    this._clampCam();
  }

  _clampCam() {
    if (!this.game) return;
    const g = this.game.grid, z = this.cam.zoom;
    const W = g.width * T, H = g.height * T;
    const hw = this.vw / 2 / z, hh = this.vh / 2 / z;
    this.cam.x = W <= hw * 2 ? W / 2 : clamp(this.cam.x, hw - T * 0.5, W - hw + T * 0.5);
    this.cam.y = H <= hh * 2 ? H / 2 : clamp(this.cam.y, hh - T * 0.5, H - hh + T * 0.5);
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.vw / 2, y: (wy - this.cam.y) * this.cam.zoom + this.vh / 2 };
  }
  screenToTile(sx, sy) {
    const wx = (sx - this.vw / 2) / this.cam.zoom + this.cam.x;
    const wy = (sy - this.vh / 2) / this.cam.zoom + this.cam.y;
    return { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  }

  // ------------------------------------------------------------------ dibujo principal
  _draw(now) {
    const ctx = this.ctx, g = this.game;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1a2f3d";
    ctx.fillRect(0, 0, this.vw, this.vh);

    let shakeX = 0, shakeY = 0;
    for (const e of this.effects) {
      if (e.type === "shake" && now >= e.t0 && now < e.t0 + e.dur) {
        const k = 1 - (now - e.t0) / e.dur;
        shakeX += (Math.random() - 0.5) * e.mag * k; shakeY += (Math.random() - 0.5) * e.mag * k;
      }
    }
    const z = this.cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.vw / 2 - this.cam.x * z + shakeX), dpr * (this.vh / 2 - this.cam.y * z + shakeY));

    // visible range of tiles
    const tl = this.screenToTile(0, 0), br = this.screenToTile(this.vw, this.vh);
    const x0 = Math.max(0, tl.x - 1), y0 = Math.max(0, tl.y - 1);
    const x1 = Math.min(g.grid.width - 1, br.x + 1), y1 = Math.min(g.grid.height - 1, br.y + 1);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrainLayer, 0, 0);
    this._drawWater(ctx, now, x0, y0, x1, y1);
    this._drawOverlays(ctx, now);

    const view = this.viewerId();
    const fogOn = g.fog && !!view;
    const visible = (x, y) => !fogOn || g.isVisible(view, x, y);
    const explored = (x, y) => !fogOn || g.isExplored(view, x, y);

    // edificios y unidades ordenados por fila para que se solapen bien
    const drawables = [];
    for (const b of g.buildings.values()) {
      if (!b.isAlive() || b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
      if (!explored(b.x, b.y)) continue;
      drawables.push({ y: b.y, z: 0, draw: () => this._drawBuilding(ctx, b, now) });
    }
    for (const u of g.units.values()) {
      if (!u.isAlive() || this.hidden.has(u.instanceId)) continue;
      const p = this.displayPos.get(u.instanceId) || u;
      if (p.x < x0 - 1 || p.x > x1 + 1 || p.y < y0 - 1 || p.y > y1 + 1) continue;
      if (u.ownerId !== view && !visible(Math.round(p.x), Math.round(p.y))) continue;
      drawables.push({ y: p.y, z: 1, draw: () => this._drawUnit(ctx, u, p, now, 1) });
    }
    for (const gh of this.ghosts.values()) {
      if (gh.silent || !visible(gh.x, gh.y)) continue;
      if (gh.entity.kind === "unit") drawables.push({ y: gh.y, z: 1, draw: () => this._drawUnit(ctx, gh.entity, gh, now, gh.alpha, true) });
      else drawables.push({ y: gh.y, z: 0, draw: () => { ctx.globalAlpha = gh.alpha; this._drawBuilding(ctx, gh.entity, now, true); ctx.globalAlpha = 1; } });
    }
    drawables.sort((a, b) => a.y - b.y || a.z - b.z);
    for (const d of drawables) d.draw();

    this._drawHealMarks(ctx, now);
    this._drawCursor(ctx, now);
    if (fogOn) this._drawFog(ctx, view, x0, y0, x1, y1);
    this._drawEffects(ctx, now);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawBanner(ctx, now);
  }

  _drawWater(ctx, now, x0, y0, x1, y1) {
    const g = this.game.grid;
    ctx.save();
    ctx.lineCap = "round";
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = g.tiles[y][x].terrain;
      if (t !== "water" && t !== "river" && t !== "bridge") continue;
      const h = tileHash(x, y, 7);
      const speed = t === "water" ? 0.0006 : 0.0012;
      for (let i = 0; i < 2; i++) {
        const ph = (now * speed + h * 6 + i * 0.5) % 1;
        const px = x * T + ((h * 97 + i * 31) % 1) * T * 0.7 + 8;
        const py = y * T + ph * T;
        ctx.strokeStyle = `rgba(220,240,250,${0.18 * Math.sin(ph * Math.PI)})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 8, py - 3, px + 16, py); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Cruces verdes sobre las casillas donde una unidad tuya se curaría sola */
  _drawHealMarks(ctx, now) {
    const tiles = this.overlay.heal;
    if (!tiles || !tiles.length) return;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    ctx.save();
    for (const t of tiles) {
      const cx = t.x * T + T - 14, cy = t.y * T + 14, r = 9 + pulse;
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 5;
      ctx.fillStyle = `rgba(42,122,62,${0.85 + pulse * 0.1})`;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(190,255,200,${0.75 + pulse * 0.25})`; ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "rgba(240,255,243,0.98)";
      ctx.fillRect(cx - 1.8, cy - 5.5, 3.6, 11);
      ctx.fillRect(cx - 5.5, cy - 1.8, 11, 3.6);
    }
    ctx.restore();
  }

  _drawOverlays(ctx, now) {
    const o = this.overlay;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const fillTiles = (tiles, fill, stroke) => {
      if (!tiles) return;
      ctx.fillStyle = fill;
      for (const t of tiles) ctx.fillRect(t.x * T + 2, t.y * T + 2, T - 4, T - 4);
      if (stroke) {
        ctx.strokeStyle = stroke; ctx.lineWidth = 2;
        for (const t of tiles) ctx.strokeRect(t.x * T + 3, t.y * T + 3, T - 6, T - 6);
      }
    };
    if (o.enemyReach) fillTiles(o.enemyReach, "rgba(230,120,40,0.22)", "rgba(230,120,40,0.45)");
    if (o.threat) fillTiles(o.threat, "rgba(200,40,40,0.16)");
    if (o.reach) fillTiles(o.reach, `rgba(90,170,255,${0.17 + pulse * 0.07})`, "rgba(150,210,255,0.5)");
    if (o.build) fillTiles(o.build, `rgba(255,210,90,${0.3 + pulse * 0.15})`, "rgba(255,230,150,0.9)");
    if (o.support) fillTiles(o.support, `rgba(120,230,140,${0.28 + pulse * 0.12})`, "rgba(170,250,180,0.9)");
    if (o.threatSoft) {
      ctx.strokeStyle = `rgba(255,120,100,${0.5 + pulse * 0.3})`; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      for (const t of o.threatSoft) ctx.strokeRect(t.x * T + 4, t.y * T + 4, T - 8, T - 8);
      ctx.setLineDash([]);
    }
    if (o.targets) {
      for (const t of o.targets) {
        ctx.fillStyle = `rgba(230,50,40,${0.3 + pulse * 0.2})`;
        ctx.fillRect(t.x * T + 2, t.y * T + 2, T - 4, T - 4);
        ctx.strokeStyle = "#ff8a7a"; ctx.lineWidth = 2.5;
        ctx.strokeRect(t.x * T + 3, t.y * T + 3, T - 6, T - 6);
      }
    }
    if (o.path && o.path.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      o.path.forEach((p, i) => { const cx = p.x * T + T / 2, cy = p.y * T + T / 2; i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); });
      ctx.stroke();
      const e = o.path[o.path.length - 1], pr = o.path[o.path.length - 2];
      const ang = Math.atan2(e.y - pr.y, e.x - pr.x);
      ctx.fillStyle = "white";
      ctx.save(); ctx.translate(e.x * T + T / 2, e.y * T + T / 2); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  _drawCursor(ctx, now) {
    const o = this.overlay;
    const drawCorners = (x, y, color, grow) => {
      const s = 10, px = x * T - grow, py = y * T - grow, w = T + grow * 2;
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(px, py + s); ctx.lineTo(px, py); ctx.lineTo(px + s, py);
      ctx.moveTo(px + w - s, py); ctx.lineTo(px + w, py); ctx.lineTo(px + w, py + s);
      ctx.moveTo(px + w, py + w - s); ctx.lineTo(px + w, py + w); ctx.lineTo(px + w - s, py + w);
      ctx.moveTo(px + s, py + w); ctx.lineTo(px, py + w); ctx.lineTo(px, py + w - s);
      ctx.stroke();
    };
    if (o.hover) drawCorners(o.hover.x, o.hover.y, "rgba(255,255,255,0.8)", 0);
    if (o.selected) drawCorners(o.selected.x, o.selected.y, "#ffd86b", 2 + Math.sin(now / 200) * 2);
  }

  _drawUnit(ctx, u, p, now, alpha = 1, ghost = false) {
    const g = this.game;
    const px = p.x * T, py = p.y * T;
    const moving = this.displayPos.has(u.instanceId);
    const current = g.current.id === u.ownerId && !g.winner;
    const done = current && u.hasActed && !moving && !ghost;
    const bob = moving ? Math.abs(Math.sin(now / 60)) * 3 : 0;
    ctx.save();
    ctx.globalAlpha = alpha;

    // embestida del atacante
    let lx = 0, ly = 0;
    for (const e of this.effects) {
      if (e.type === "lunge" && e.src === u && now >= e.t0 && now < e.t0 + e.dur) {
        const k = Math.sin(((now - e.t0) / e.dur) * Math.PI);
        lx = (e.dst.x - u.x) * 18 * k; ly = (e.dst.y - u.y) * 18 * k;
      }
    }
    const pal = PALETTE[u.ownerId];
    // peana con el color del bando
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(px + T / 2 + lx, py + T * 0.86 + ly, T * 0.34, T * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.main;
    ctx.beginPath(); ctx.ellipse(px + T / 2 + lx, py + T * 0.84 + ly, T * 0.31, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = u.isHero() ? "#ffd86b" : pal.light; ctx.lineWidth = 2;
    ctx.stroke();

    const dir = p.dir ?? (u.ownerId === "trojan" ? -1 : 1);
    const spr = unitSprite(u.template, u.ownerId, 128, dir < 0);
    if (done) ctx.filter = "grayscale(0.75) brightness(0.8)";
    ctx.drawImage(spr, px + 2 + lx, py - 4 - bob + ly, T - 4, T - 4);
    ctx.filter = "none";

    // barra de vida + número
    const hp = Math.max(0, Math.round(this.displayHp.get(u.instanceId) ?? u.currentHp));
    const ratio = hp / u.maxHp;
    if (ratio < 1 || u.isHero()) {
      const bw = T * 0.62, bx = px + (T - bw) / 2, by = py + T - 7;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; roundRect(ctx, bx - 1, by - 1, bw + 2, 6, 3); ctx.fill();
      ctx.fillStyle = ratio > 0.6 ? "#7ed36b" : ratio > 0.3 ? "#f0c24a" : "#e85a3c";
      roundRect(ctx, bx, by, Math.max(2, bw * ratio), 4, 2); ctx.fill();
    }
    ctx.font = "bold 13px Figtree, system-ui, sans-serif";
    ctx.textAlign = "right";
    const label = String(hp);
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(label, px + T - 3, py + T - 9);
    ctx.fillStyle = "#fff"; ctx.fillText(label, px + T - 3, py + T - 9);

    // cintas de veteranía
    for (let i = 0; i < u.ribbons; i++) {
      ctx.fillStyle = "#ffd86b";
      ctx.beginPath();
      const rx = px + 5 + i * 7, ry = py + 6;
      ctx.moveTo(rx, ry); ctx.lineTo(rx + 5, ry); ctx.lineTo(rx + 5, ry + 8); ctx.lineTo(rx + 2.5, ry + 6); ctx.lineTo(rx, ry + 8); ctx.closePath(); ctx.fill();
    }
    if (u.relic) drawRelic(ctx, px + T - 10, py + 14, 0.55);
    // indicador de buff temporal
    if (u.tempAttackMod > 0) {
      ctx.fillStyle = "#ffb347";
      ctx.beginPath(); ctx.arc(px + T - 8, py + 8, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawBuilding(ctx, b, now, ghost = false) {
    const px = b.x * T, py = b.y * T;
    const pal = PALETTE[b.ownerId];
    if (b.template.isWall) {
      const conn = {};
      for (const [k, dx, dy] of [["n", 0, -1], ["s", 0, 1], ["w", -1, 0], ["e", 1, 0]]) {
        const o = this.game.buildingAt(b.x + dx, b.y + dy);
        conn[k] = !!(o && o.template.isWall);
      }
      ctx.save(); ctx.translate(px, py);
      drawWallTile(ctx, T, conn, b.template.isGate, b.currentHp / b.maxHp, pal);
      ctx.restore();
    } else {
      // base del color del bando
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(px + 3, py + 3, T - 6, T - 6);
      ctx.strokeStyle = pal.main; ctx.globalAlpha *= 0.8; ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, T - 6, T - 6);
      ctx.globalAlpha = ghost ? ctx.globalAlpha : 1;
      const spr = buildingSprite(b.template, b.ownerId, 128, (b.x + b.y) % 2);
      if (b.underConstruction) ctx.globalAlpha = 0.55;
      ctx.drawImage(spr, px, py, T, T);
      ctx.globalAlpha = 1;
      if (b.underConstruction) {
        ctx.strokeStyle = "#caa46a"; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + 8 + i * 14, py + T - 6); ctx.lineTo(px + 8 + i * 14, py + 14); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(px + 6, py + 24); ctx.lineTo(px + T - 6, py + 24); ctx.moveTo(px + 6, py + 42); ctx.lineTo(px + T - 6, py + 42); ctx.stroke();
      }
    }
    const hp = Math.round(this.displayHp.get(b.instanceId) ?? b.currentHp);
    if (hp < b.maxHp && !b.underConstruction) {
      const bw = T * 0.7, bx = px + (T - bw) / 2, by = py + 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; roundRect(ctx, bx - 1, by - 1, bw + 2, 6, 3); ctx.fill();
      const r = hp / b.maxHp;
      ctx.fillStyle = r > 0.6 ? "#7ed36b" : r > 0.3 ? "#f0c24a" : "#e85a3c";
      roundRect(ctx, bx, by, Math.max(2, bw * r), 4, 2); ctx.fill();
    }
  }

  _drawFog(ctx, view, x0, y0, x1, y1) {
    const g = this.game;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (g.isVisible(view, x, y)) continue;
      const explored = g.isExplored(view, x, y);
      ctx.fillStyle = explored ? "rgba(12,16,24,0.42)" : "rgba(10,12,18,0.93)";
      ctx.fillRect(x * T, y * T, T, T);
      if (!explored) {
        // nubes suaves para que no sea un cuadrado negro
        const h = tileHash(x, y, 3);
        ctx.fillStyle = "rgba(60,70,90,0.18)";
        ctx.beginPath(); ctx.arc(x * T + h * T, y * T + (1 - h) * T, T * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawEffects(ctx, now) {
    const keep = [];
    for (const e of this.effects) {
      if (now < e.t0) { keep.push(e); continue; }
      const p = (now - e.t0) / e.dur;
      if (e.apply && !e.applied) { e.apply(); e.applied = true; }
      if (p >= 1) continue;
      keep.push(e);
      if (e.type === "projectile") {
        const sx = e.src.x * T + T / 2, sy = e.src.y * T + T / 3, dx = e.dst.x * T + T / 2, dy = e.dst.y * T + T / 2;
        const x = sx + (dx - sx) * p, y = sy + (dy - sy) * p - Math.sin(p * Math.PI) * T * 0.9;
        const ang = Math.atan2((dy - sy) - Math.cos(p * Math.PI) * T * 0.9 * Math.PI, dx - sx);
        ctx.save(); ctx.translate(x, y);
        if (e.stone) {
          ctx.fillStyle = "#5c5a55"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.rotate(ang);
          ctx.strokeStyle = "#e8dcc0"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
          ctx.fillStyle = "#ccc"; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      } else if (e.type === "number") {
        const x = e.x * T + T / 2, y = e.y * T + T * 0.3 - p * 26;
        ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
        ctx.font = "800 22px Figtree, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,10,5,0.9)";
        ctx.strokeText(e.text, x, y); ctx.fillStyle = e.color; ctx.fillText(e.text, x, y);
        ctx.globalAlpha = 1;
      } else if (e.type === "flash") {
        ctx.fillStyle = `rgba(255,240,200,${0.55 * (1 - p)})`;
        ctx.fillRect(e.x * T, e.y * T, T, T);
      } else if (e.type === "ring") {
        ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x * T + T / 2, e.y * T + T / 2, T * (0.2 + p * (e.big ? 0.9 : 0.5)), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    this.effects = keep;
  }

  _drawBanner(ctx, now) {
    const b = this.banner;
    if (!b) return;
    const p = (now - b.t0) / (b.dur || 1);
    if (p >= 1.2) { this.banner = null; return; }
    const a = p < 0.15 ? p / 0.15 : p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.35) : 1;
    const pal = PALETTE[b.owner] || PALETTE.neutral;
    const w = Math.min(this.vw - 32, 520), h = 84, x = (this.vw - w) / 2, y = this.vh * 0.36;
    ctx.globalAlpha = a;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(0.15, pal.dark); grad.addColorStop(0.85, pal.dark); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#f3e3b0"; ctx.fillRect(x + w * 0.15, y, w * 0.7, 2); ctx.fillRect(x + w * 0.15, y + h - 2, w * 0.7, 2);
    ctx.textAlign = "center";
    ctx.font = "italic 400 34px 'Cormorant Garamond', Georgia, serif"; ctx.fillStyle = "#fbf1d6";
    ctx.fillText(b.text, this.vw / 2, y + 44);
    ctx.font = "600 13px Figtree, system-ui, sans-serif"; ctx.fillStyle = "#e9d9b0";
    ctx.fillText(b.sub.toUpperCase(), this.vw / 2, y + 68);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ terreno pre-renderizado
  _buildTerrain() {
    const g = this.game.grid;
    const c = this.terrainLayer || document.createElement("canvas");
    c.width = g.width * T; c.height = g.height * T;
    const ctx = c.getContext("2d");
    this.terrainLayer = c;
    const at = (x, y) => g.inBounds(x, y) ? g.tiles[y][x].terrain : null;

    // 1. color base con textura
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const tt = getTerrain(at(x, y));
      const baseId = tt.isRoad && tt.id !== "cityFloor" && tt.id !== "bridge" ? (tt.id === "desertRoad" ? "desert" : "plains") : tt.id;
      const base = getTerrain(baseId);
      ctx.fillStyle = base.color;
      ctx.fillRect(x * T, y * T, T, T);
      for (let i = 0; i < 14; i++) {
        const h1 = tileHash(x, y, i), h2 = tileHash(x, y, i + 50);
        ctx.fillStyle = i % 3 === 0 ? base.accent : i % 3 === 1 ? shade(base.color, -12) : shade(base.color, 8);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x * T + h1 * (T - 6), y * T + h2 * (T - 6), 3 + (i % 4), 2 + (i % 3));
      }
      ctx.globalAlpha = 1;
    }
    // 2. transiciones suaves entre terrenos distintos
    const soft = { beach: 3, desert: 2, plains: 1, hill: 1, swamp: 1, forest: 1, mountain: 1, rubble: 1, cityFloor: 0 };
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const a = baseOf(at(x, y));
      if (a === "water" || a === "river") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const b = baseOf(at(x + dx, y + dy));
        if (!b || b === a || b === "water" || b === "river") continue;
        if ((soft[a] || 0) <= (soft[b] || 0)) continue;
        const col = getTerrain(a).color;
        const gx0 = dx > 0 ? (x + 1) * T : dx < 0 ? x * T : x * T;
        const gy0 = dy > 0 ? (y + 1) * T : dy < 0 ? y * T : y * T;
        const grd = ctx.createLinearGradient(gx0, gy0, gx0 + dx * 16, gy0 + dy * 16);
        grd.addColorStop(0, col); grd.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = grd;
        if (dx) ctx.fillRect(dx > 0 ? gx0 : gx0 - 16, y * T, 16, T); else ctx.fillRect(x * T, dy > 0 ? gy0 : gy0 - 16, T, 16);
      }
    }
    // 3. agua: orilla con espuma
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const t = at(x, y);
      if (t !== "water" && t !== "river" && t !== "bridge") continue;
      const px = x * T, py = y * T;
      const grad = ctx.createRadialGradient(px + T / 2, py + T / 2, 4, px + T / 2, py + T / 2, T * 0.8);
      const base = getTerrain(t === "bridge" ? "river" : t);
      grad.addColorStop(0, shade(base.color, 6)); grad.addColorStop(1, shade(base.color, -8));
      ctx.fillStyle = grad; ctx.fillRect(px, py, T, T);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = at(x + dx, y + dy);
        if (!n || ["water", "river", "bridge"].includes(n)) continue;
        ctx.strokeStyle = "rgba(240,248,250,0.55)"; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
        ctx.beginPath();
        if (dx === 1) { ctx.moveTo(px + T - 3, py + 2); ctx.lineTo(px + T - 3, py + T - 2); }
        if (dx === -1) { ctx.moveTo(px + 3, py + 2); ctx.lineTo(px + 3, py + T - 2); }
        if (dy === 1) { ctx.moveTo(px + 2, py + T - 3); ctx.lineTo(px + T - 2, py + T - 3); }
        if (dy === -1) { ctx.moveTo(px + 2, py + 3); ctx.lineTo(px + T - 2, py + 3); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // 4. caminos y puentes: primero todos los bordes, luego todo el relleno (sin cortes entre casillas)
    const isRoadT = t => t && getTerrain(t).isRoad;
    const roads = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const t = at(x, y);
      if (!isRoadT(t) || t === "cityFloor") continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isRoadT(at(x + dx, y + dy)));
      roads.push({ x, y, t, dirs, cx: x * T + T / 2, cy: y * T + T / 2, bridge: t === "bridge" });
    }
    ctx.lineCap = "round";
    for (const pass of [0, 1]) {
      for (const r of roads) {
        ctx.strokeStyle = r.bridge ? (pass ? "#a57447" : "#4f3219") : (pass ? (r.t === "desertRoad" ? "#e9d3a0" : "#cdb27a") : "#8c7650");
        ctx.lineWidth = pass ? (r.bridge ? 20 : 14) : (r.bridge ? 26 : 19);
        ctx.beginPath();
        if (!r.dirs.length) { ctx.moveTo(r.cx - 1, r.cy); ctx.lineTo(r.cx + 1, r.cy); }
        for (const [dx, dy] of r.dirs) { ctx.moveTo(r.cx, r.cy); ctx.lineTo(r.cx + dx * T / 2, r.cy + dy * T / 2); }
        ctx.stroke();
      }
    }
    for (const r of roads) {
      const { cx, cy, x, y } = r;
      if (r.bridge) {
        ctx.strokeStyle = "#4f3219"; ctx.lineWidth = 1.5;
        const horiz = r.dirs.some(([dx]) => dx !== 0);
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          if (horiz) { ctx.moveTo(cx + i * 8, cy - 10); ctx.lineTo(cx + i * 8, cy + 10); }
          else { ctx.moveTo(cx - 10, cy + i * 8); ctx.lineTo(cx + 10, cy + i * 8); }
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = "rgba(120,95,60,0.5)";
          ctx.fillRect(cx - 8 + tileHash(x, y, i + 90) * 16, cy - 8 + tileHash(x, y, i + 95) * 16, 2, 2);
        }
      }
    }
    // 4b. relieve: cada terreno tiene una altura, y la luz viene de arriba a
    //     la izquierda. Lo alto se ilumina por ese lado y proyecta sombra
    //     sobre el vecino de abajo-derecha. Es lo que le da bulto al mapa.
    const ALTURA = {
      water: 0, river: 0, bridge: 0.15, beach: 0.25, swamp: 0.3,
      plains: 0.5, plainsRoad: 0.5, road: 0.5, desert: 0.5, desertRoad: 0.5, cityFloor: 0.55,
      rubble: 0.7, forest: 1.05, hill: 1.9, mountain: 3.2
    };
    const alt = (x, y) => { const t = at(x, y); return t == null ? null : (ALTURA[t] ?? 0.5); };
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const h = alt(x, y);
      const px = x * T, py = y * T;
      // sombra proyectada sobre el vecino de la derecha y el de abajo
      const der = alt(x + 1, y), aba = alt(x, y + 1);
      if (der != null && h > der) {
        const w = Math.min(T * 0.5, 5 + (h - der) * 9);
        const gr = ctx.createLinearGradient(px + T, 0, px + T + w, 0);
        gr.addColorStop(0, `rgba(24,18,10,${Math.min(0.42, 0.12 + (h - der) * 0.12)})`);
        gr.addColorStop(1, "rgba(24,18,10,0)");
        ctx.fillStyle = gr; ctx.fillRect(px + T, py, w, T);
      }
      if (aba != null && h > aba) {
        const w = Math.min(T * 0.5, 5 + (h - aba) * 9);
        const gr = ctx.createLinearGradient(0, py + T, 0, py + T + w);
        gr.addColorStop(0, `rgba(24,18,10,${Math.min(0.42, 0.12 + (h - aba) * 0.12)})`);
        gr.addColorStop(1, "rgba(24,18,10,0)");
        ctx.fillStyle = gr; ctx.fillRect(px, py + T, T, w);
      }
      // filo iluminado por el lado de la luz
      const izq = alt(x - 1, y), arr = alt(x, y - 1);
      if (izq != null && h > izq) {
        const gr = ctx.createLinearGradient(px, 0, px + 7, 0);
        gr.addColorStop(0, `rgba(255,248,220,${Math.min(0.3, 0.08 + (h - izq) * 0.1)})`);
        gr.addColorStop(1, "rgba(255,248,220,0)");
        ctx.fillStyle = gr; ctx.fillRect(px, py, 7, T);
      }
      if (arr != null && h > arr) {
        const gr = ctx.createLinearGradient(0, py, 0, py + 7);
        gr.addColorStop(0, `rgba(255,248,220,${Math.min(0.3, 0.08 + (h - arr) * 0.1)})`);
        gr.addColorStop(1, "rgba(255,248,220,0)");
        ctx.fillStyle = gr; ctx.fillRect(px, py, T, 7);
      }
    }

    // 5. rasgos: calles, pantano, desierto, colinas, montañas, bosques (por filas)
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const t = at(x, y), px = x * T, py = y * T;
      if (t === "cityFloor") drawPaving(ctx, px, py, x, y);
      else if (t === "swamp") drawSwamp(ctx, px, py, x, y);
      else if (t === "desert") drawDunes(ctx, px, py, x, y);
      else if (t === "beach") drawBeach(ctx, px, py, x, y);
      else if (t === "rubble") drawRubble(ctx, px, py, x, y);
      else if (t === "plains" && tileHash(x, y, 11) < 0.35) drawGrassTufts(ctx, px, py, x, y);
    }
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const t = at(x, y), px = x * T, py = y * T;
      if (t === "hill") drawHill(ctx, px, py, x, y);
      else if (t === "mountain") drawMountain(ctx, px, py, x, y);
      else if (t === "forest") drawForest(ctx, px, py, x, y);
    }
    // 6. yacimientos de bronce, tesoros y ruinas de campamentos caídos
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      const tile = g.tiles[y][x];
      if (tile.deposit === "wheat") drawWheat(ctx, x * T, y * T, x, y);
      else if (tile.deposit) drawDeposit(ctx, x * T, y * T);
      if (tile.campRuins) drawCampRuins(ctx, x * T, y * T);
      if (tile.pickup === "goats") drawGoats(ctx, x * T, y * T, x, y);
      if (tile.pickup === "bag") drawBag(ctx, x * T, y * T);
      if (tile.pickup === "ruins") drawRuins(ctx, x * T, y * T);
      if (tile.pickup === "relic") drawRelic(ctx, x * T + T / 2, y * T + T * 0.55, 1);
    }
    // 7. rejilla sutil
    ctx.strokeStyle = "rgba(20,15,10,0.12)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= g.width; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, g.height * T); }
    for (let y = 0; y <= g.height; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(g.width * T, y * T + 0.5); }
    ctx.stroke();
  }

  // ------------------------------------------------------------------ minimapa
  _drawMinimap() {
    if (!this.mctx || !this.game) return;
    const g = this.game, grid = g.grid, m = this.minimap, ctx = this.mctx;
    const s = Math.min(m.width / grid.width, m.height / grid.height);
    const ox = (m.width - grid.width * s) / 2, oy = (m.height - grid.height * s) / 2;
    this._mm = { s, ox, oy };
    ctx.fillStyle = "#101820"; ctx.fillRect(0, 0, m.width, m.height);
    const view = this.viewerId();
    const fogOn = g.fog && !!view;
    for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
      if (fogOn && !g.isExplored(view, x, y)) continue;
      const t = getTerrain(grid.tiles[y][x].terrain);
      ctx.fillStyle = t.isRoad && t.id !== "bridge" ? "#cdb27a" : t.color;
      ctx.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      if (fogOn && !g.isVisible(view, x, y)) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s)); }
    }
    for (const b of g.buildings.values()) {
      if (!b.isAlive() || (fogOn && !g.isExplored(view, b.x, b.y))) continue;
      ctx.fillStyle = b.template.isWall ? "#cbbd9f" : PALETTE[b.ownerId].light;
      ctx.fillRect(ox + b.x * s + 0.5, oy + b.y * s + 0.5, s - 1, s - 1);
    }
    for (const u of g.units.values()) {
      if (!u.isAlive() || (fogOn && u.ownerId !== view && !g.isVisible(view, u.x, u.y))) continue;
      ctx.fillStyle = PALETTE[u.ownerId].main;
      ctx.beginPath(); ctx.arc(ox + (u.x + 0.5) * s, oy + (u.y + 0.5) * s, Math.max(1.8, s * 0.32), 0, Math.PI * 2); ctx.fill();
      if (u.isHero()) { ctx.strokeStyle = "#ffd86b"; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    // rectángulo de la vista
    const z = this.cam.zoom;
    const vx = (this.cam.x - this.vw / 2 / z) / T, vy = (this.cam.y - this.vh / 2 / z) / T;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
    ctx.strokeRect(ox + vx * s, oy + vy * s, (this.vw / z / T) * s, (this.vh / z / T) * s);
  }

  // ------------------------------------------------------------------ entrada
  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = Math.max(200, r.width); this.vh = Math.max(200, r.height);
    this.canvas.width = this.vw * this.dpr; this.canvas.height = this.vh * this.dpr;
    this.canvas.style.width = this.vw + "px"; this.canvas.style.height = this.vh + "px";
    this._clampCam();
  }

  _bindInput() {
    const c = this.canvas;
    let down = null, dragged = false, pinch = null;
    const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener("contextmenu", e => e.preventDefault());
    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      down = { ...pos(e), cx: this.cam.x, cy: this.cam.y, button: e.button };
      dragged = false;
    });
    c.addEventListener("pointermove", e => {
      const p = pos(e);
      if (down && !pinch) {
        const dx = p.x - down.x, dy = p.y - down.y;
        if (Math.hypot(dx, dy) > 7) dragged = true;
        if (dragged) {
          this.cam.x = down.cx - dx / this.cam.zoom; this.cam.y = down.cy - dy / this.cam.zoom;
          this.camTarget = null; this._clampCam();
        }
      }
      if (!this.game) return;
      const t = this.screenToTile(p.x, p.y);
      const inside = this.game.grid.inBounds(t.x, t.y);
      if (!this._hover || this._hover.x !== t.x || this._hover.y !== t.y) {
        this._hover = inside ? t : null;
        this.onTileHover(this._hover);
      }
    });
    c.addEventListener("pointerup", e => {
      if (!down) return;
      const p = pos(e);
      const wasDrag = dragged;
      const button = down.button;
      down = null;
      if (wasDrag || !this.game) return;
      if (button === 2) { this.onCancel(); return; }
      const t = this.screenToTile(p.x, p.y);
      if (this.game.grid.inBounds(t.x, t.y)) this.onTileClick(t.x, t.y);
    });
    c.addEventListener("pointerleave", () => { this._hover = null; this.onTileHover(null); });
    c.addEventListener("wheel", e => {
      e.preventDefault();
      const p = pos(e);
      const before = { x: (p.x - this.vw / 2) / this.cam.zoom + this.cam.x, y: (p.y - this.vh / 2) / this.cam.zoom + this.cam.y };
      this.cam.zoom = clamp(this.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.35, 1.8);
      this.cam.x = before.x - (p.x - this.vw / 2) / this.cam.zoom;
      this.cam.y = before.y - (p.y - this.vh / 2) / this.cam.zoom;
      this.camTarget = null;
      this._clampCam();
    }, { passive: false });
    // pellizco en pantallas táctiles
    const touches = new Map();
    c.addEventListener("touchstart", e => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: this.cam.zoom }; } }, { passive: true });
    c.addEventListener("touchmove", e => {
      for (const t of e.changedTouches) touches.set(t.identifier, t);
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        this.cam.zoom = clamp(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, 0.35, 1.8);
        this._clampCam(); dragged = true;
      }
    }, { passive: true });
    c.addEventListener("touchend", e => { for (const t of e.changedTouches) touches.delete(t.identifier); if (touches.size < 2) pinch = null; }, { passive: true });

    window.addEventListener("keydown", e => {
      if (e.target.closest?.("input, textarea, select")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) { this._keys.add(k); if (k.startsWith("Arrow")) e.preventDefault(); }
    });
    window.addEventListener("keyup", e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this._keys.delete(k);
    });
    window.addEventListener("blur", () => this._keys.clear());

    if (this.minimap) {
      const mm = e => {
        if (!this._mm || !this.game) return;
        const r = this.minimap.getBoundingClientRect();
        const sx = (e.clientX - r.left) * (this.minimap.width / r.width), sy = (e.clientY - r.top) * (this.minimap.height / r.height);
        const { s, ox, oy } = this._mm;
        this.centerOn((sx - ox) / s - 0.5, (sy - oy) / s - 0.5, true);
      };
      let mdown = false;
      this.minimap.addEventListener("pointerdown", e => { mdown = true; mm(e); });
      this.minimap.addEventListener("pointermove", e => { if (mdown) mm(e); });
      window.addEventListener("pointerup", () => { mdown = false; });
    }
  }
}

// ======================================================================
// decoración de terreno
// ======================================================================

function baseOf(t) {
  if (!t) return null;
  if (t === "plainsRoad" || t === "road") return "plains";
  if (t === "desertRoad") return "desert";
  if (t === "bridge") return "river";
  return t;
}

function drawTree(ctx, x, y, s, h) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(x + 2, y + s * 0.5, s * 0.55, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#5a3b22"; ctx.fillRect(x - 1.5, y, 3, s * 0.45);
  const cypress = h > 0.72;
  if (cypress) {
    ctx.fillStyle = "#2f4a26";
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.3, s * 0.28, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3f5f30";
    ctx.beginPath(); ctx.ellipse(x - s * 0.08, y - s * 0.45, s * 0.14, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = "#35512a"; ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#46682f"; ctx.beginPath(); ctx.arc(x - s * 0.15, y - s * 0.3, s * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5d8038"; ctx.beginPath(); ctx.arc(x - s * 0.22, y - s * 0.38, s * 0.16, 0, Math.PI * 2); ctx.fill();
  }
}

function drawForest(ctx, px, py, x, y) {
  const n = 4 + Math.floor(tileHash(x, y, 1) * 2);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: px + 10 + tileHash(x, y, i + 3) * (T - 20), y: py + 16 + tileHash(x, y, i + 9) * (T - 22), h: tileHash(x, y, i + 21) });
  pts.sort((a, b) => a.y - b.y);
  for (const p of pts) drawTree(ctx, p.x, p.y, 17 + p.h * 6, p.h);
}

function drawHill(ctx, px, py, x, y) {
  const h = tileHash(x, y, 2);
  for (const [ox, oy, w, hh] of [[0.3, 0.7, 0.38, 0.28], [0.66, 0.62, 0.34, 0.24]]) {
    const cx = px + T * (ox + (h - 0.5) * 0.1), cy = py + T * oy;
    const g = ctx.createLinearGradient(cx - T * w, cy - T * hh, cx + T * w, cy);
    g.addColorStop(0, "#c9b57a"); g.addColorStop(1, "#7d6a3e");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, T * w, T * hh, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(80,60,30,0.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, T * w, T * hh, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  }
}

function drawMountain(ctx, px, py, x, y) {
  const h = tileHash(x, y, 4);
  const peaks = [[0.34 + h * 0.08, 0.12, 0.36], [0.7 - h * 0.06, 0.26, 0.3]];
  for (const [ox, top, w] of peaks) {
    const cx = px + T * ox, ty = py + T * top, by = py + T * 0.9;
    ctx.fillStyle = "#8a8174";
    ctx.beginPath(); ctx.moveTo(cx - T * w, by); ctx.lineTo(cx, ty); ctx.lineTo(cx + T * w, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6a6258";
    ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx + T * w, by); ctx.lineTo(cx + T * w * 0.15, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f2f0ea";
    ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx - T * w * 0.3, ty + T * 0.2); ctx.lineTo(cx - T * w * 0.08, ty + T * 0.16); ctx.lineTo(cx + T * w * 0.05, ty + T * 0.22); ctx.lineTo(cx + T * w * 0.28, ty + T * 0.18); ctx.closePath(); ctx.fill();
  }
}

function drawSwamp(ctx, px, py, x, y) {
  for (let i = 0; i < 3; i++) {
    const cx = px + 12 + tileHash(x, y, i + 30) * (T - 24), cy = py + 14 + tileHash(x, y, i + 33) * (T - 26);
    ctx.fillStyle = "rgba(60,95,100,0.75)";
    ctx.beginPath(); ctx.ellipse(cx, cy, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#8a9a55"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const cx = px + 6 + tileHash(x, y, i + 40) * (T - 12), cy = py + 20 + tileHash(x, y, i + 46) * (T - 26);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 2, cy - 10); ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy - 8); ctx.stroke();
  }
}

function drawDunes(ctx, px, py, x, y) {
  ctx.strokeStyle = "rgba(170,130,70,0.45)"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const cy = py + 14 + i * 17 + tileHash(x, y, i + 60) * 6;
    ctx.beginPath(); ctx.moveTo(px + 6, cy); ctx.quadraticCurveTo(px + T / 2, cy - 8, px + T - 6, cy); ctx.stroke();
  }
}

function drawBeach(ctx, px, py, x, y) {
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#f7efd8" : "#c9b58a";
    ctx.beginPath(); ctx.arc(px + 8 + tileHash(x, y, i + 70) * (T - 16), py + 8 + tileHash(x, y, i + 74) * (T - 16), 1.8, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrassTufts(ctx, px, py, x, y) {
  ctx.strokeStyle = "rgba(70,95,40,0.55)"; ctx.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    const cx = px + 8 + tileHash(x, y, i + 80) * (T - 16), cy = py + 12 + tileHash(x, y, i + 84) * (T - 18);
    ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx - 1, cy - 6); ctx.moveTo(cx, cy); ctx.lineTo(cx + 1, cy - 7); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 4, cy - 5); ctx.stroke();
  }
  if (tileHash(x, y, 88) < 0.3) {
    ctx.fillStyle = tileHash(x, y, 89) < 0.5 ? "#e9d56a" : "#e88a8a";
    ctx.beginPath(); ctx.arc(px + tileHash(x, y, 90) * T, py + tileHash(x, y, 91) * T, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPaving(ctx, px, py, x, y) {
  ctx.strokeStyle = "rgba(110,90,60,0.35)"; ctx.lineWidth = 1;
  for (let r = 0; r < 4; r++) {
    const yy = py + r * 16;
    ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + T, yy); ctx.stroke();
    for (let c = 0; c < 4; c++) {
      const xx = px + c * 16 + (r % 2 ? 8 : 0);
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 16); ctx.stroke();
    }
  }
}

function drawRubble(ctx, px, py, x, y) {
  for (let i = 0; i < 8; i++) {
    const cx = px + 6 + tileHash(x, y, i + 100) * (T - 12), cy = py + 10 + tileHash(x, y, i + 110) * (T - 16);
    ctx.fillStyle = i % 2 ? "#b3a58c" : "#7d715d";
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx + 2, cy + 5); ctx.lineTo(cx - 5, cy + 3); ctx.closePath(); ctx.fill();
  }
}

function drawDeposit(ctx, px, py) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.ellipse(px + T / 2, py + T * 0.72, T * 0.3, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  const rocks = [[0.36, 0.6, 11], [0.58, 0.56, 13], [0.5, 0.7, 9]];
  for (const [ox, oy, r] of rocks) {
    const cx = px + T * ox, cy = py + T * oy;
    ctx.fillStyle = "#6f665a";
    ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.5); ctx.lineTo(cx - r * 0.6, cy - r * 0.6); ctx.lineTo(cx + r * 0.4, cy - r * 0.8); ctx.lineTo(cx + r, cy + r * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d88a3c";
    ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffc26b";
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.35, r * 0.15, 0, Math.PI * 2); ctx.fill();
  }
}

/** Trigal: espigas doradas en matas, donde va el molino */
function drawWheat(ctx, px, py, x, y) {
  const h = tileHash(x, y, 7);
  for (let i = 0; i < 9; i++) {
    const a = (i * 97 + h * 31) % 100 / 100, b = (i * 53 + h * 17) % 100 / 100;
    const cx = px + T * (0.18 + a * 0.64), cy = py + T * (0.42 + b * 0.42);
    const alto = T * 0.22;
    ctx.strokeStyle = "#b99433"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (a - 0.5) * 3, cy - alto); ctx.stroke();
    ctx.fillStyle = "#f0cf72";
    ctx.beginPath();
    ctx.ellipse(cx + (a - 0.5) * 3, cy - alto - 2, 2.1, 4.2, (a - 0.5) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8b24f";
    ctx.beginPath(); ctx.ellipse(cx + (a - 0.5) * 3, cy - alto - 1, 1.1, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGoats(ctx, px, py, x, y) {
  for (let i = 0; i < 3; i++) {
    const cx = px + 16 + i * 14 + tileHash(x, y, i + 120) * 4, cy = py + 30 + (i % 2) * 12;
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.ellipse(cx, cy + 7, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = i === 1 ? "#6b5a48" : "#efe9dc";
    ctx.beginPath(); ctx.ellipse(cx, cy, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 8, cy - 4, 3.5, 3, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#5a4c3c"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx + 8, cy - 7); ctx.quadraticCurveTo(cx + 5, cy - 11, cx + 3, cy - 9); ctx.stroke();
    ctx.beginPath(); for (const lx of [-5, -2, 3, 6]) { ctx.moveTo(cx + lx, cy + 4); ctx.lineTo(cx + lx, cy + 8); } ctx.stroke();
  }
}

function drawBag(ctx, px, py) {
  const cx = px + T / 2, cy = py + T * 0.58;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(cx, cy + 12, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9a6a3a";
  ctx.beginPath(); ctx.moveTo(cx - 12, cy + 10); ctx.quadraticCurveTo(cx - 15, cy - 6, cx - 5, cy - 9); ctx.lineTo(cx + 5, cy - 9); ctx.quadraticCurveTo(cx + 15, cy - 6, cx + 12, cy + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#7a4f28"; ctx.fillRect(cx - 6, cy - 12, 12, 4);
  ctx.fillStyle = "#e9a24a";
  for (const [dx, dy] of [[-4, -13], [2, -14], [6, -12]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#ffd27a"; ctx.beginPath(); ctx.arc(cx + 2, cy - 15, 1.2, 0, Math.PI * 2); ctx.fill();
}

function drawRuins(ctx, px, py) {
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(px + 8, py + 44, T - 16, 8);
  ctx.fillStyle = "#cfc4ad";
  ctx.fillRect(px + 12, py + 20, 8, 28); ctx.fillRect(px + 40, py + 28, 8, 20);
  ctx.fillStyle = "#b3a58c"; ctx.fillRect(px + 10, py + 16, 12, 5); ctx.fillRect(px + 26, py + 42, 14, 7);
  ctx.save(); ctx.translate(px + 34, py + 22); ctx.rotate(0.5); ctx.fillStyle = "#cfc4ad"; ctx.fillRect(-4, -8, 8, 18); ctx.restore();
  ctx.fillStyle = "#6f8c45"; ctx.beginPath(); ctx.arc(px + 20, py + 46, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f0cf85"; ctx.font = "700 14px Figtree, sans-serif"; ctx.textAlign = "center"; ctx.fillText("?", px + T / 2, py + 14);
}

function drawRelic(ctx, cx, cy, k) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
  const g = ctx.createRadialGradient(0, -4, 1, 0, -4, 18);
  g.addColorStop(0, "rgba(255,230,140,0.7)"); g.addColorStop(1, "rgba(255,230,140,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -4, 18, 0, Math.PI * 2); ctx.fill();
  // Paladio: pequeña estatua de madera de Atenea
  ctx.fillStyle = "#c89a45";
  ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-4, -6); ctx.lineTo(4, -6); ctx.lineTo(6, 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -10, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8d6526"; ctx.fillRect(-9, 9, 18, 3);
  ctx.strokeStyle = "#f0cf85"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(6, 8); ctx.stroke();
  ctx.restore();
}

function drawCampRuins(ctx, px, py) {
  ctx.fillStyle = "rgba(30,20,12,0.45)"; ctx.beginPath(); ctx.ellipse(px + T / 2, py + T * 0.6, T * 0.4, T * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3a2a1c"; ctx.lineWidth = 3;
  for (const [x1, y1, x2, y2] of [[14, 48, 30, 30], [30, 30, 44, 46], [22, 50, 48, 38]]) { ctx.beginPath(); ctx.moveTo(px + x1, py + y1); ctx.lineTo(px + x2, py + y2); ctx.stroke(); }
  ctx.fillStyle = "rgba(120,110,100,0.5)"; ctx.beginPath(); ctx.arc(px + 36, py + 20, 6, 0, Math.PI * 2); ctx.arc(px + 42, py + 12, 4, 0, Math.PI * 2); ctx.fill();
}

// ======================================================================
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(Math.round(v + (pct / 100) * 255), 0, 255);
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
