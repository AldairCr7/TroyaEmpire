/**
 * sprites.js
 * -----------------------------------------------------------------------
 * Arte procedural en canvas: miniaturas de soldados (hoplitas con aspis y
 * yelmo con cresta), carros, máquinas de asedio y edificios. Todo se dibuja
 * una vez a un canvas fuera de pantalla y se reutiliza (caché por tipo,
 * bando y tamaño), así que dibujar 60 unidades por frame es barato.
 * -----------------------------------------------------------------------
 */

export const PALETTE = {
  greek: { main: "#2f6f8f", dark: "#1d4a61", light: "#7fc3dd", crest: "#e8e1c8", emblem: "#f3e3b0" },
  trojan: { main: "#a8442a", dark: "#6e2a19", light: "#f09a74", crest: "#e9c46a", emblem: "#2b1b12" },
  neutral: { main: "#8a7a64", dark: "#5a4c3c", light: "#c9b99b", crest: "#ddd", emblem: "#333" }
};
const SKIN = "#c98b62", SKIN_D = "#a86c49";
const BRONZE = "#c89a45", BRONZE_D = "#8d6526", BRONZE_L = "#f0cf85";
const WOOD = "#7a5230", WOOD_D = "#4f3219", WOOD_L = "#a57447";
const STONE = "#b3a58c", STONE_D = "#7d715d", STONE_L = "#d8ccb3";

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// ======================================================================
// Capa de volumen
// ----------------------------------------------------------------------
// Todo el juego se ilumina desde el mismo sitio (arriba a la izquierda) y
// todos los sprites llevan el mismo contorno y la misma sombra de contacto.
// En vez de repintar cada dibujo, el arte plano pasa por aquí: así basta
// con tocar estos números para cambiar el acabado del juego entero.
// ======================================================================

export const ACABADO = {
  activo: true,
  luz: "rgba(255,246,214,0.26)",   // claro del lado iluminado
  sombra: "rgba(26,16,8,0.34)",    // oscuro del lado contrario
  contorno: "rgba(18,12,6,0.55)",
  grosor: 1.15,                    // px de contorno a tamaño 64
  contacto: 0.34,                  // opacidad de la sombra del suelo
  borde: 1.1,                      // grosor del filo iluminado
  luzBorde: "rgba(255,246,216,0.5)",
  sombraBorde: "rgba(40,24,10,0.38)"
};

/** Silueta engrosada del dibujo, para el contorno */
function silueta(src, size, grosor, color) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const d = Math.max(1, grosor);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.drawImage(src, dx * d, dy * d);
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Pasa el arte plano por la capa de acabado.
 * @param src canvas con el dibujo ya hecho
 * @param opts.suelo y (0-1) donde apoya la figura; null = sin sombra de contacto
 * @param opts.ancho anchura de la sombra de contacto (0-1)
 */
export function aplicarVolumen(src, size, opts = {}) {
  if (!ACABADO.activo) return src;
  const k = size / 64;
  const out = makeCanvas(size, size);
  const ctx = out.getContext("2d");

  // 1. sombra de contacto, debajo de todo
  const suelo = opts.suelo ?? 0.92;
  if (suelo != null) {
    const ancho = opts.ancho ?? 0.34;
    const g = ctx.createRadialGradient(size / 2, size * suelo, 1, size / 2, size * suelo, size * ancho);
    g.addColorStop(0, `rgba(12,8,4,${ACABADO.contacto})`);
    g.addColorStop(1, "rgba(12,8,4,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(size / 2, size * suelo);
    ctx.scale(1, 0.34);
    ctx.translate(-size / 2, -size * suelo);
    ctx.beginPath();
    ctx.arc(size / 2, size * suelo, size * ancho, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. contorno
  ctx.drawImage(silueta(src, size, ACABADO.grosor * k, ACABADO.contorno), 0, 0);

  // 3. el dibujo, con la luz encima y recortada a su propia silueta
  const lit = makeCanvas(size, size);
  const lc = lit.getContext("2d");
  lc.drawImage(src, 0, 0);
  lc.globalCompositeOperation = "source-atop";
  const luz = lc.createLinearGradient(0, 0, size * 0.85, size);
  luz.addColorStop(0, ACABADO.luz);
  luz.addColorStop(0.42, "rgba(255,255,255,0)");
  luz.addColorStop(0.62, "rgba(255,255,255,0)");
  luz.addColorStop(1, ACABADO.sombra);
  lc.fillStyle = luz;
  lc.fillRect(0, 0, size, size);

  // 4. borde iluminado arriba-izquierda y oscurecido abajo-derecha.
  //    Es el truco que hace que un dibujo plano parezca tener bulto: se
  //    recorta la franja de un lado de cada forma y se pinta con luz.
  const d = Math.max(1, Math.round(ACABADO.borde * k));
  lc.globalCompositeOperation = "source-over";
  lc.drawImage(filo(src, size, d, d, ACABADO.luzBorde), 0, 0);
  lc.drawImage(filo(src, size, -d, -d, ACABADO.sombraBorde), 0, 0);

  ctx.drawImage(lit, 0, 0);

  return out;
}

/**
 * Franja de borde de cada forma: la silueta menos ella misma desplazada.
 * Con desplazamiento positivo sale el filo de arriba-izquierda (la luz);
 * con negativo, el de abajo-derecha (la sombra propia).
 */
function filo(src, size, dx, dy, color) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(src, dx, dy);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Devuelve (cacheado) el sprite de una unidad. size en px del lado */
export function unitSprite(template, owner, size, flip = false) {
  const k = `u:${template.id}:${owner}:${size}:${flip}`;
  if (cache.has(k)) return cache.get(k);
  const plano = makeCanvas(size, size);
  const ctx = plano.getContext("2d");
  ctx.save();
  if (flip) { ctx.translate(size, 0); ctx.scale(-1, 1); }
  ctx.scale(size / 64, size / 64);
  drawUnit(ctx, template, PALETTE[owner] || PALETTE.neutral);
  ctx.restore();
  const naval = template.category === "naval";
  const c = aplicarVolumen(plano, size, {
    suelo: naval ? null : 0.9,
    ancho: template.category === "chariot" || template.category === "siege" ? 0.4 : 0.3
  });
  cache.set(k, c);
  return c;
}

export function buildingSprite(template, owner, size, variant = 0) {
  const k = `b:${template.id}:${owner}:${size}:${variant}`;
  if (cache.has(k)) return cache.get(k);
  const plano = makeCanvas(size, size);
  const ctx = plano.getContext("2d");
  ctx.scale(size / 64, size / 64);
  drawBuilding(ctx, template, PALETTE[owner] || PALETTE.neutral, variant);
  const c = aplicarVolumen(plano, size, { suelo: 0.93, ancho: 0.42 });
  cache.set(k, c);
  return c;
}

// ======================================================================
// Iconos de las órdenes
// ----------------------------------------------------------------------
// Símbolos sencillos para la rejilla de órdenes, al estilo de los menús de
// consola: una figura clara sobre un disco, legible a 40 px.
// ======================================================================

export function actionIcon(nombre, size = 48) {
  const k = `i:${nombre}:${size}`;
  if (cache.has(k)) return cache.get(k);
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  ctx.scale(size / 48, size / 48);
  dibujarIcono(ctx, nombre);
  cache.set(k, c);
  return c;
}

function dibujarIcono(ctx, n) {
  const tinta = "#f3e8cf", metal = "#dfe3e6", metalD = "#8b9499";
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  const asta = (x1, y1, x2, y2, w = 3, col = WOOD) => {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };

  switch (n) {
    case "atacar": { // espada cruzada con lanza
      asta(12, 38, 34, 14, 3.4);
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.moveTo(34, 12); ctx.lineTo(38, 16); ctx.lineTo(33, 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = metal; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(36, 38); ctx.lineTo(16, 16); ctx.stroke();
      ctx.strokeStyle = metalD; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(36, 38); ctx.lineTo(16, 16); ctx.stroke();
      ctx.strokeStyle = BRONZE; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(31, 39); ctx.lineTo(39, 33); ctx.stroke();
      break;
    }
    case "poder": { // estrella de héroe
      drawStar(ctx, 24, 24, 13, "#ffd86b", "#9a6a12");
      break;
    }
    case "construir": { // martillo y escuadra
      asta(14, 36, 30, 18, 3.4);
      ctx.fillStyle = metalD;
      roundRect(ctx, 26, 10, 14, 9, 2); ctx.fill();
      ctx.fillStyle = metal;
      roundRect(ctx, 27, 11, 12, 5, 2); ctx.fill();
      break;
    }
    case "reparar": { // llave y tablón
      ctx.fillStyle = WOOD; roundRect(ctx, 10, 28, 28, 7, 2); ctx.fill();
      ctx.fillStyle = WOOD_D; ctx.fillRect(18, 28, 2, 7); ctx.fillRect(29, 28, 2, 7);
      ctx.strokeStyle = metal; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(16, 22); ctx.lineTo(32, 10); ctx.stroke();
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(14, 24, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a4347"; ctx.beginPath(); ctx.arc(14, 24, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "curar": { // copa con vendas
      ctx.fillStyle = BRONZE;
      ctx.beginPath(); ctx.moveTo(16, 14); ctx.lineTo(32, 14); ctx.quadraticCurveTo(30, 28, 24, 29); ctx.quadraticCurveTo(18, 28, 16, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = BRONZE_D; ctx.fillRect(21, 29, 6, 7); ctx.fillRect(16, 35, 16, 3.5);
      ctx.fillStyle = "#7ed36b"; ctx.fillRect(21.5, 8, 5, 12); ctx.fillRect(18, 11.5, 12, 5);
      break;
    }
    case "inspirar": { // llama
      const g = ctx.createLinearGradient(24, 10, 24, 38);
      g.addColorStop(0, "#ffe9a8"); g.addColorStop(0.5, "#f0a53a"); g.addColorStop(1, "#d8542a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(24, 8); ctx.quadraticCurveTo(36, 22, 30, 32); ctx.quadraticCurveTo(28, 38, 24, 38);
      ctx.quadraticCurveTo(20, 38, 18, 32); ctx.quadraticCurveTo(12, 22, 24, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3c2";
      ctx.beginPath(); ctx.ellipse(24, 30, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "convertir": { // manos y aura
      ctx.strokeStyle = "#cbb7f0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(24, 24, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = tinta;
      ctx.beginPath(); ctx.arc(18, 20, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(30, 28, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = tinta; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(20, 24); ctx.lineTo(28, 24); ctx.stroke();
      break;
    }
    case "ofrendar": { // reliquia en su arqueta
      ctx.fillStyle = "#8a6414";
      roundRect(ctx, 12, 20, 24, 16, 2); ctx.fill();
      const g2 = ctx.createLinearGradient(12, 20, 36, 36);
      g2.addColorStop(0, "#ffe9a8"); g2.addColorStop(1, "#c79a2e");
      ctx.fillStyle = g2;
      roundRect(ctx, 13.5, 21.5, 21, 13, 2); ctx.fill();
      ctx.fillStyle = "#8a6414"; ctx.fillRect(22.5, 21.5, 3, 13);
      ctx.fillStyle = "#fff3c2";
      ctx.beginPath(); ctx.moveTo(24, 6); ctx.lineTo(27, 15); ctx.lineTo(24, 19); ctx.lineTo(21, 15); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(34, 18); ctx.lineTo(24, 16); ctx.lineTo(14, 18); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "embarcar": { // ancla
      ctx.strokeStyle = metal; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(24, 12); ctx.lineTo(24, 36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 18); ctx.lineTo(32, 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(24, 30, 10, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(24, 11, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a2731"; ctx.beginPath(); ctx.arc(24, 11, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "desembarcar": { // proa y flecha a tierra
      ctx.fillStyle = WOOD;
      ctx.beginPath(); ctx.moveTo(8, 18); ctx.quadraticCurveTo(10, 28, 22, 28); ctx.lineTo(26, 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#7ed36b"; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(32, 14); ctx.lineTo(32, 32); ctx.stroke();
      ctx.fillStyle = "#7ed36b";
      ctx.beginPath(); ctx.moveTo(32, 38); ctx.lineTo(26, 29); ctx.lineTo(38, 29); ctx.closePath(); ctx.fill();
      break;
    }
    case "montar": { // engranaje de asedio
      ctx.fillStyle = WOOD_D;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save(); ctx.translate(24, 24); ctx.rotate(a);
        roundRect(ctx, -3, -16, 6, 7, 1.5); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = WOOD; ctx.beginPath(); ctx.arc(24, 24, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BRONZE_D; ctx.beginPath(); ctx.arc(24, 24, 4.5, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case "esperar": { // reloj de arena
      ctx.fillStyle = WOOD; ctx.fillRect(14, 10, 20, 3.5); ctx.fillRect(14, 34.5, 20, 3.5);
      ctx.fillStyle = "#cfd6da";
      ctx.beginPath(); ctx.moveTo(17, 13.5); ctx.lineTo(31, 13.5); ctx.lineTo(25, 24); ctx.lineTo(31, 34.5); ctx.lineTo(17, 34.5); ctx.lineTo(23, 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e0b04a";
      ctx.beginPath(); ctx.moveTo(19, 32.5); ctx.lineTo(29, 32.5); ctx.lineTo(24, 26); ctx.closePath(); ctx.fill();
      break;
    }
    case "regresar": { // flecha de vuelta
      ctx.strokeStyle = tinta; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(24, 26, 11, Math.PI * 1.05, Math.PI * 0.1); ctx.stroke();
      ctx.fillStyle = tinta;
      ctx.beginPath(); ctx.moveTo(10, 24); ctx.lineTo(19, 21); ctx.lineTo(16, 31); ctx.closePath(); ctx.fill();
      break;
    }
    case "caballo": {
      ctx.save(); ctx.translate(-8, 2); ctx.scale(0.8, 0.8); drawTrojanHorse(ctx); ctx.restore();
      break;
    }
    default: {
      ctx.fillStyle = tinta;
      ctx.beginPath(); ctx.arc(24, 24, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ======================================================================
// Unidades
// ======================================================================

/**
 * Rasgos propios de cada unidad única y de cada héroe. Todas usan el mismo
 * muñeco base, pero cambian lo que se reconoce de lejos: la cresta, la capa,
 * el gorro, el arma o el escudo.
 */
const LOOK = {
  myrmidon: { cresta: "#23232a", capa: "#23232a" },
  spartan: { cresta: "#8c1f1f", transversal: true, escudo: 13.5 },
  royalGuard: { cresta: "#f0cf85", mascara: true },
  lycianArcher: { gorro: "#8a3f6d", arcoCurvo: true },
  elitePriest: { gorro: "#d8c38a", capa: "#e8dcc0" },
  woadRaider: { gorro: null, melena: "#b8552a", piel: "#5aa0c8" },
  eliteWoadRaider: { gorro: null, melena: "#b8552a", piel: "#5aa0c8", capa: "#2f6f8f" },
  berserker: { gorro: null, melena: "#c8a33f", barba: true },
  eliteBerserker: { gorro: null, melena: "#c8a33f", barba: true, capa: "#7a4e2c" },
  janissary: { gorro: "#e8e2d2", turbante: true },
  eliteJanissary: { gorro: "#e8e2d2", turbante: true, capa: "#8a1f3f" },
  chuKoNu: { gorro: "#b8873f", conico: true },
  eliteChuKoNu: { gorro: "#b8873f", conico: true, capa: "#8c1f1f" },
  handCannoneer: { gorro: "#4a4a52" },
  amazon: { gorro: null, melena: "#2a1a10", labrys: true },
  dardanRider: {},
  achilles: { cresta: "#ffd86b", capa: "#1c1c22" },
  hector: { cresta: "#e9c46a", capa: "#6e2a19", escudo: 13 },
  odysseus: { pilos: true },
  paris: { gorro: "#a8446f", arcoCurvo: true }
};

function drawUnit(ctx, t, pal) {
  const cat = t.category;
  const ab = t.abilities || [];
  const hero = ab.includes("heroPowers");
  const look = LOOK[t.id] || {};
  if (t.id === "trojanHorse") return drawTrojanHorse(ctx);
  if (cat === "naval") return drawShip(ctx, pal, t);
  if (t.id === "batteringRam" || t.id === "siegeRam") return drawRam(ctx, pal, t.id === "siegeRam");
  if (t.id === "siegeTower") return drawSiegeTower(ctx, pal);
  if (t.id === "scorpion" || t.id === "heavyScorpion") return drawScorpion(ctx, pal, t.id === "heavyScorpion");
  if (t.id === "trebuchet") return drawTrebuchet(ctx, pal);
  if (t.id === "bombardCannon" || t.id === "monsMeg") return drawCannon(ctx, pal, t.id === "monsMeg");
  if (cat === "siege") return drawCatapult(ctx, pal, t.id === "heavyCatapult");
  if (t.id === "warElephant" || t.id === "eliteWarElephant") return drawElephant(ctx, pal, t.id === "eliteWarElephant");
  if (t.id === "templar" || t.id === "eliteTemplar") return drawTemplar(ctx, pal, t.id === "eliteTemplar");
  if (t.id === "camel" || t.id === "heavyCamel") return drawCamel(ctx, pal, t.id === "heavyCamel");
  if (t.id === "horseArcher" || t.id === "heavyHorseArcher") return drawHorseArcher(ctx, pal, t.id === "heavyHorseArcher");
  if (cat === "chariot") return drawChariot(ctx, pal, t);

  const tier = t.era || 3;
  const scale = hero ? 1.12 : 1;
  ctx.save();
  ctx.translate(32, 60);
  ctx.scale(scale, scale);
  ctx.translate(-32, -60);

  if (hero || look.capa) drawCape(ctx, pal, look.capa);
  // piernas y grebas
  ctx.fillStyle = SKIN_D;
  roundRect(ctx, 25, 44, 5, 14, 2); ctx.fill();
  roundRect(ctx, 34, 44, 5, 14, 2); ctx.fill();
  if (tier >= 2 || hero) {
    ctx.fillStyle = BRONZE;
    roundRect(ctx, 24.5, 49, 6, 8, 2); ctx.fill();
    roundRect(ctx, 33.5, 49, 6, 8, 2); ctx.fill();
  }
  // sandalias
  ctx.fillStyle = WOOD_D;
  ctx.fillRect(23.5, 57, 8, 2.5); ctx.fillRect(32.5, 57, 8, 2.5);

  // túnica
  const robe = cat === "support";
  ctx.fillStyle = robe ? (t.id === "priest" ? "#efe6d2" : "#b89a6a") : pal.main;
  ctx.beginPath();
  if (robe) { ctx.moveTo(22, 28); ctx.lineTo(42, 28); ctx.lineTo(46, 57); ctx.lineTo(18, 57); }
  else { ctx.moveTo(22, 27); ctx.lineTo(42, 27); ctx.lineTo(44, 47); ctx.lineTo(20, 47); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(32, 27, 12, robe ? 30 : 20);
  // coraza
  if (!robe && (tier >= 2 || hero)) {
    const g = ctx.createLinearGradient(22, 26, 42, 40);
    g.addColorStop(0, BRONZE_L); g.addColorStop(1, BRONZE_D);
    ctx.fillStyle = g;
    roundRect(ctx, 22.5, 26, 19, 15, 4); ctx.fill();
    ctx.strokeStyle = "rgba(60,35,10,0.5)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(32, 28); ctx.lineTo(32, 40); ctx.stroke();
    // pteruges
    ctx.fillStyle = "#efe1c0";
    for (let i = 0; i < 5; i++) ctx.fillRect(22 + i * 4, 41, 3, 6);
  } else if (!robe) {
    ctx.fillStyle = "#d9c79c"; ctx.fillRect(21, 36, 22, 3); // cinturón
  }

  // brazo trasero
  ctx.fillStyle = SKIN;
  roundRect(ctx, 18, 28, 5, 13, 2.5); ctx.fill();

  // cabeza
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(32, 20, 7, 0, Math.PI * 2); ctx.fill();

  // casco / cabello
  if (cat === "support") {
    ctx.fillStyle = "#2b1f16";
    ctx.beginPath(); ctx.arc(32, 18, 7.2, Math.PI, 0); ctx.fill();
    if (t.id === "priest") {
      ctx.strokeStyle = "#6fa05a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(32, 17, 7.5, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    } else {
      ctx.fillStyle = "#c9a26a"; // sombrero de paja
      ctx.beginPath(); ctx.ellipse(32, 14, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(32, 13, 5.5, Math.PI, 0); ctx.fill();
    }
  } else if (cat === "ranged" || cat === "skirmish") {
    if (look.melena) {
      // melena larga de amazona, recogida con una cinta
      ctx.fillStyle = look.melena;
      ctx.beginPath(); ctx.arc(32, 18, 7.6, Math.PI, 0); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(25, 18); ctx.quadraticCurveTo(20, 30, 23, 40); ctx.lineTo(28, 38); ctx.quadraticCurveTo(26, 28, 29, 20);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.crest; ctx.fillRect(24.5, 24, 5, 2);
    } else if (look.pilos) {
      // pilos: gorro cónico de fieltro, el de Odiseo
      ctx.fillStyle = "#d8cdb4";
      ctx.beginPath(); ctx.moveTo(24.5, 19); ctx.quadraticCurveTo(32, 5, 39.5, 19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.beginPath(); ctx.moveTo(32, 7); ctx.quadraticCurveTo(39.5, 19, 32, 19); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = BRONZE; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(24.5, 18.5); ctx.lineTo(39.5, 18.5); ctx.stroke();
    } else {
      // gorro frigio / pétaso ligero
      ctx.fillStyle = look.gorro || (cat === "skirmish" ? "#7c6a4f" : pal.dark);
      ctx.beginPath();
      ctx.moveTo(24.5, 20); ctx.quadraticCurveTo(25, 9, 34, 10); ctx.quadraticCurveTo(41, 11, 40, 20);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(34, 10); ctx.quadraticCurveTo(40, 8, 41, 13); ctx.lineTo(37, 13); ctx.fill();
    }
  } else {
    drawHelmet(ctx, pal, hero, tier, look);
  }

  // arma y escudo según tipo
  if (cat === "ranged") {
    if (t.id === "chuKoNu" || t.id === "eliteChuKoNu") drawRepeatingCrossbow(ctx);
    else if (t.id === "handCannoneer") drawHandCannon(ctx);
    else if (t.id.toLowerCase().includes("javelin")) drawJavelins(ctx);
    else drawBow(ctx, look.arcoCurvo);
    // aljaba
    ctx.fillStyle = WOOD; roundRect(ctx, 19, 22, 5, 14, 2); ctx.fill();
  } else if (cat === "skirmish") {
    if (look.labrys) { drawLabrys(ctx); drawShield(ctx, pal, 21.5, 38, 10, false, "luna"); }
    else drawSling(ctx);
  } else if (cat === "support") {
    if (t.id === "priest" || t.id === "elitePriest") drawStaff(ctx); else drawHammer(ctx);
  } else if (cat === "spear") {
    drawSpear(ctx, 46);
    drawShield(ctx, pal, 22, 38, look.escudo || 11.5, hero);
  } else {
    // infantería: espada o lanza corta según era
    if (tier <= 1 && !hero) drawClub(ctx); else drawSword(ctx, hero);
    drawShield(ctx, pal, 21.5, 38, look.escudo || (hero ? 12 : 11), hero);
  }
  ctx.restore();

  if (hero) {
    // estrella dorada de héroe
    drawStar(ctx, 52, 11, 6, "#ffd86b", "#9a6a12");
  }
}

function drawCape(ctx, pal, color) {
  ctx.fillStyle = color || pal.dark;
  ctx.beginPath();
  ctx.moveTo(23, 26); ctx.quadraticCurveTo(14, 44, 16, 58); ctx.lineTo(28, 56); ctx.lineTo(30, 28);
  ctx.closePath(); ctx.fill();
}

function drawHelmet(ctx, pal, hero, tier, look = {}) {
  // Tocados de los mercenarios: cada pueblo trae el suyo y no lleva yelmo
  // corintio, que es lo que los hace reconocibles de un vistazo.
  if (look.turbante) {
    ctx.fillStyle = look.gorro || "#e8e2d2";
    ctx.beginPath(); ctx.ellipse(32, 17, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    for (const dy of [-2, 1]) {
      ctx.beginPath(); ctx.moveTo(24.5, 17 + dy); ctx.quadraticCurveTo(32, 14 + dy, 39.5, 17 + dy); ctx.stroke();
    }
    ctx.fillStyle = BRONZE; ctx.beginPath(); ctx.arc(32, 12, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.skin || "#d9a977";
    ctx.beginPath(); ctx.ellipse(32.5, 23, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (look.conico) {
    ctx.fillStyle = pal.skin || "#d9a977";
    ctx.beginPath(); ctx.ellipse(32.5, 21, 5.2, 5.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.gorro || "#b8873f";
    ctx.beginPath(); ctx.moveTo(23, 17); ctx.lineTo(32, 7); ctx.lineTo(41, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath(); ctx.moveTo(32, 7); ctx.lineTo(41, 17); ctx.lineTo(32, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#6e5126"; ctx.fillRect(23, 16.5, 18, 2.2);
    return;
  }
  if (look.melena && !look.labrys) {
    // celta y vikingo: a pelo, con melena y a veces barba
    ctx.fillStyle = look.melena;
    ctx.beginPath(); ctx.ellipse(32, 17, 8, 8.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.skin || "#d9a977";
    ctx.beginPath(); ctx.ellipse(33, 20, 5.4, 6, 0, 0, Math.PI * 2); ctx.fill();
    if (look.barba) {
      ctx.fillStyle = look.melena;
      ctx.beginPath(); ctx.moveTo(28, 21); ctx.quadraticCurveTo(33, 33, 38, 21); ctx.closePath(); ctx.fill();
    }
    if (look.piel) {
      // pintura de guerra azul en la cara
      ctx.fillStyle = look.piel;
      ctx.fillRect(29.5, 18, 7, 1.8);
      ctx.fillRect(31.5, 21, 1.6, 3);
    }
    ctx.fillStyle = "#2a1a0c";
    ctx.fillRect(34.5, 18.6, 1.6, 1.4);
    return;
  }
  // yelmo corintio
  const g = ctx.createLinearGradient(25, 10, 39, 26);
  g.addColorStop(0, BRONZE_L); g.addColorStop(1, BRONZE_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(24.5, 23); ctx.quadraticCurveTo(23.5, 11, 32, 11); ctx.quadraticCurveTo(40.5, 11, 40, 23);
  ctx.lineTo(37.5, 26); ctx.lineTo(36, 20); ctx.lineTo(33, 21); ctx.lineTo(33, 26); ctx.lineTo(31, 26); ctx.lineTo(28.5, 20);
  ctx.closePath(); ctx.fill();
  // ranura de ojos
  ctx.fillStyle = "#2a1a0c";
  ctx.fillRect(33.5, 17, 5, 1.8);
  // máscara funeraria de oro micénica
  if (look.mascara) {
    // fondo oscuro para que el oro no se confunda con el bronce del yelmo
    ctx.fillStyle = "#3a2a08";
    ctx.beginPath(); ctx.ellipse(32.3, 19.4, 7, 8.4, 0, 0, Math.PI * 2); ctx.fill();
    const m = ctx.createLinearGradient(26, 12, 39, 27);
    m.addColorStop(0, "#fff3c2"); m.addColorStop(0.5, "#f0cf72"); m.addColorStop(1, "#b07f14");
    ctx.fillStyle = m;
    ctx.beginPath(); ctx.ellipse(32.3, 19.2, 6.2, 7.6, 0, 0, Math.PI * 2); ctx.fill();
    // barba larga, lo que de verdad identifica a la máscara
    ctx.beginPath();
    ctx.moveTo(28.4, 22); ctx.quadraticCurveTo(32.3, 32, 36.2, 22);
    ctx.quadraticCurveTo(32.3, 25, 28.4, 22);
    ctx.closePath(); ctx.fill();
    // rasgos marcados
    ctx.fillStyle = "#4a3406";
    ctx.beginPath(); ctx.ellipse(30.1, 17.6, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(34.5, 17.6, 1.5, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(30, 15.4, 2.2, 0.8); ctx.fillRect(32.6, 15.4, 2.2, 0.8);
    ctx.beginPath(); ctx.moveTo(32.3, 17.8); ctx.lineTo(33.4, 21.2); ctx.lineTo(31.2, 21.2); ctx.closePath(); ctx.fill();
    ctx.fillRect(30.6, 22.6, 3.4, 0.9);
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(32.3, 19.2, 5.4, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
  }
  // cresta transversal (de oreja a oreja), la de los espartanos
  if (look.transversal) {
    ctx.fillStyle = look.cresta || pal.crest;
    ctx.beginPath(); ctx.ellipse(32, 9.5, 9.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(23, 9.5, 18, 1);
    ctx.strokeStyle = BRONZE_D; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(32, 11.5); ctx.lineTo(32, 9); ctx.stroke();
    return;
  }
  // cresta
  if (tier >= 2 || hero || look.cresta) {
    ctx.fillStyle = look.cresta || (hero ? "#ffd86b" : pal.crest);
    ctx.beginPath();
    ctx.moveTo(22, 12); ctx.quadraticCurveTo(30, 0, 42, 7); ctx.quadraticCurveTo(34, 5, 31, 11.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(25 + i * 3, 9 - i * 0.6); ctx.lineTo(27 + i * 3, 11); ctx.stroke(); }
  }
}

function drawShield(ctx, pal, cx, cy, r, hero, emblema) {
  // aspis redondo con emblema
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath(); ctx.arc(cx + 1, cy + 1.2, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 1, cx, cy, r);
  g.addColorStop(0, pal.light); g.addColorStop(1, pal.main);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hero ? "#ffd86b" : BRONZE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = pal.emblem;
  if (emblema === "luna") {
    // pelta con media luna, el escudo de las amazonas
    ctx.fillStyle = "#efe6d2";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, Math.PI * 0.75, Math.PI * 2.25); ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy, r * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    return;
  }
  if (pal === PALETTE.greek) {
    // lambda / alfa estilizada
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 4.5); ctx.lineTo(cx, cy - 5); ctx.lineTo(cx + 4, cy + 4.5);
    ctx.lineTo(cx + 2.2, cy + 4.5); ctx.lineTo(cx, cy - 1); ctx.lineTo(cx - 2.2, cy + 4.5); ctx.closePath(); ctx.fill();
  } else {
    // caballo / sol troyano
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 5.5, cy + Math.sin(a) * 5.5);
      ctx.lineTo(cx + Math.cos(a + 0.3) * 3, cy + Math.sin(a + 0.3) * 3); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fillStyle = BRONZE_L; ctx.fill();
  }
}

function drawSpear(ctx, len) {
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(43, 58); ctx.lineTo(43, 58 - len); ctx.stroke();
  ctx.fillStyle = "#d9d9d2";
  ctx.beginPath(); ctx.moveTo(43, 58 - len - 8); ctx.lineTo(45.5, 58 - len + 1); ctx.lineTo(40.5, 58 - len + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(43, 34, 3, 0, Math.PI * 2); ctx.fill();
}

function drawSword(ctx, hero) {
  ctx.save();
  ctx.translate(43, 34); ctx.rotate(-0.55);
  ctx.fillStyle = hero ? "#f2f2ea" : "#d9d9d2";
  ctx.beginPath(); ctx.moveTo(-1.8, 0); ctx.lineTo(-2.4, -15); ctx.lineTo(0, -20); ctx.lineTo(2.4, -15); ctx.lineTo(1.8, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = BRONZE; ctx.fillRect(-4.5, -1, 9, 2.5);
  ctx.fillStyle = WOOD_D; ctx.fillRect(-1.2, 1.5, 2.4, 5);
  ctx.restore();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(43, 35, 3, 0, Math.PI * 2); ctx.fill();
}

function drawClub(ctx) {
  ctx.save(); ctx.translate(43, 35); ctx.rotate(-0.4);
  ctx.fillStyle = WOOD; roundRect(ctx, -2, -18, 4.5, 20, 2); ctx.fill();
  ctx.fillStyle = WOOD_L; ctx.beginPath(); ctx.arc(0.2, -17, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(43, 35, 3, 0, Math.PI * 2); ctx.fill();
}

/** Arcabuz: tubo corto con su mecha humeante */
function drawHandCannon(ctx) {
  ctx.save(); ctx.translate(22, 30); ctx.rotate(-0.35);
  ctx.strokeStyle = WOOD; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(10, 0); ctx.stroke();
  ctx.fillStyle = '#4e4a44'; roundRect(ctx, 8, -3, 16, 6, 2); ctx.fill();
  ctx.fillStyle = '#2a2118'; ctx.beginPath(); ctx.ellipse(24, 0, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8cbb0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, -3); ctx.quadraticCurveTo(8, -9, 11, -13); ctx.stroke();
  ctx.fillStyle = '#ff9b2e'; ctx.beginPath(); ctx.arc(11, -14, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBow(ctx, curvo = false) {
  if (curvo) {
    // arco compuesto de doble curva (licios y Paris). Va separado del
    // cuerpo para que no se enrede con el brazo, y con la cuerda tensada.
    ctx.strokeStyle = "#efe6d2"; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(49, 14); ctx.lineTo(49, 48); ctx.stroke();
    ctx.strokeStyle = "#5c3a1c"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(49, 14);
    ctx.quadraticCurveTo(58, 19, 53, 27);
    ctx.quadraticCurveTo(50, 31, 53, 35);
    ctx.quadraticCurveTo(58, 43, 49, 48);
    ctx.stroke();
    // refuerzos de asta y empuñadura
    ctx.strokeStyle = BRONZE; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(51.4, 24); ctx.lineTo(52.6, 26.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(51.4, 38); ctx.lineTo(52.6, 35.5); ctx.stroke();
    ctx.fillStyle = "#3f2810";
    roundRect(ctx, 50, 28.5, 3.2, 5, 1.4); ctx.fill();
    // mano que lo sujeta, por delante del arco
    ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(51.5, 31, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.arc(51.5, 32.6, 1.6, 0, Math.PI * 2); ctx.fill();
    // brazo que llega hasta el arco
    ctx.strokeStyle = SKIN; ctx.lineWidth = 4.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(42, 31); ctx.lineTo(50, 31); ctx.stroke();
    return;
  }
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(38, 32, 13, -1.25, 1.25); ctx.stroke();
  ctx.strokeStyle = "#eee"; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(38 + Math.cos(-1.25) * 13, 32 + Math.sin(-1.25) * 13); ctx.lineTo(38 + Math.cos(1.25) * 13, 32 + Math.sin(1.25) * 13); ctx.stroke();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(50.5, 32, 2.8, 0, Math.PI * 2); ctx.fill();
}

function drawJavelins(ctx) {
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  for (const dx of [0, 3]) {
    ctx.beginPath(); ctx.moveTo(40 + dx, 52); ctx.lineTo(49 + dx, 14); ctx.stroke();
    ctx.fillStyle = "#d9d9d2";
    ctx.beginPath(); ctx.moveTo(50 + dx, 9); ctx.lineTo(51 + dx, 16); ctx.lineTo(47.5 + dx, 15); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(45, 32, 3, 0, Math.PI * 2); ctx.fill();
}

/** Labrys: el hacha doble de las amazonas */
function drawLabrys(ctx) {
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(44, 50); ctx.lineTo(44, 14); ctx.stroke();
  const g = ctx.createLinearGradient(38, 10, 50, 22);
  g.addColorStop(0, "#e8e6df"); g.addColorStop(1, "#9aa0a2");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(44, 10); ctx.quadraticCurveTo(36, 13, 38, 20); ctx.quadraticCurveTo(41, 17, 44, 17);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(44, 10); ctx.quadraticCurveTo(52, 13, 50, 20); ctx.quadraticCurveTo(47, 17, 44, 17);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = BRONZE; ctx.fillRect(42.6, 16, 3, 3.5);
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(44, 34, 3, 0, Math.PI * 2); ctx.fill();
}

function drawSling(ctx) {
  ctx.strokeStyle = "#d8c7a2"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(43, 32); ctx.quadraticCurveTo(54, 16, 47, 8); ctx.stroke();
  ctx.fillStyle = "#8d8778"; ctx.beginPath(); ctx.arc(47, 8, 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(43, 33, 3, 0, Math.PI * 2); ctx.fill();
  // zurrón de piedras
  ctx.fillStyle = "#8a6b45"; ctx.beginPath(); ctx.ellipse(24, 44, 4, 5, 0.2, 0, Math.PI * 2); ctx.fill();
}

function drawStaff(ctx) {
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(44, 58); ctx.lineTo(44, 12); ctx.stroke();
  ctx.fillStyle = "#ffd86b";
  ctx.beginPath(); ctx.arc(44, 11, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,216,107,0.35)";
  ctx.beginPath(); ctx.arc(44, 11, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(44, 33, 3, 0, Math.PI * 2); ctx.fill();
}

function drawHammer(ctx) {
  ctx.save(); ctx.translate(44, 36); ctx.rotate(-0.5);
  ctx.fillStyle = WOOD_L; ctx.fillRect(-1.2, -16, 2.4, 18);
  ctx.fillStyle = "#8c8c86"; ctx.fillRect(-5, -19, 10, 5);
  ctx.restore();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(44, 36, 3, 0, Math.PI * 2); ctx.fill();
  // cesto a la espalda
  ctx.fillStyle = "#b08a52"; roundRect(ctx, 16, 28, 7, 10, 2); ctx.fill();
}

function drawChariot(ctx, pal, t) {
  const heavy = t.era >= 3;
  const dardano = t.id === "dardanRider";
  drawHorse(ctx, pal, { oscuro: heavy || dardano, barda: heavy || dardano, penacho: dardano });
  // caja del carro
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(6, 30); ctx.lineTo(24, 30); ctx.lineTo(26, 46); ctx.lineTo(8, 46); ctx.closePath(); ctx.fill();
  ctx.fillStyle = BRONZE; ctx.fillRect(6, 29, 19, 2.5);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(24, 42); ctx.lineTo(34, 40); ctx.stroke();
  // rueda
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(15, 48, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(15, 48); ctx.lineTo(15 + Math.cos(a) * 9, 48 + Math.sin(a) * 9); ctx.stroke(); }
  // auriga
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(16, 20, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.dark; ctx.fillRect(11, 24, 10, 8);
  drawMiniHelmet(ctx, 16, 19, pal, t.era >= 2);
  ctx.strokeStyle = WOOD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(21, 20); ctx.lineTo(30, 4); ctx.stroke(); // lanza
}

/**
 * Caballo de tiro visto de perfil, mirando a la derecha. Cuerpo, cuello,
 * cabeza con hocico, crin, cola y cuatro patas con corvejón.
 */
function drawHorse(ctx, pal, { oscuro = false, barda = false, penacho = false } = {}) {
  const pelo = oscuro ? "#5b3b28" : "#9a6840";
  const peloOsc = oscuro ? "#402718" : "#7a4e2c";
  const crin = oscuro ? "#231408" : "#3a2412";

  // patas traseras (detrás del cuerpo)
  ctx.strokeStyle = peloOsc; ctx.lineWidth = 3.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(31, 42); ctx.lineTo(28, 49); ctx.lineTo(30, 56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(45, 42); ctx.lineTo(46, 49); ctx.lineTo(45, 56); ctx.stroke();

  // cola
  ctx.strokeStyle = crin; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(28, 35); ctx.quadraticCurveTo(22, 40, 23, 50); ctx.stroke();

  // cuerpo
  ctx.fillStyle = pelo;
  ctx.beginPath();
  ctx.moveTo(29, 36);
  ctx.quadraticCurveTo(32, 30, 42, 31);
  ctx.quadraticCurveTo(50, 32, 51, 38);
  ctx.quadraticCurveTo(50, 45, 40, 45);
  ctx.quadraticCurveTo(30, 45, 29, 36);
  ctx.closePath(); ctx.fill();

  // grupa y pecho con un tono más claro
  ctx.fillStyle = oscuro ? "#6d4931" : "#b07b4e";
  ctx.beginPath(); ctx.ellipse(33, 36, 6, 5.5, 0, 0, Math.PI * 2); ctx.fill();

  // cuello
  ctx.fillStyle = pelo;
  ctx.beginPath();
  ctx.moveTo(46, 34);
  ctx.quadraticCurveTo(52, 30, 55, 23);
  ctx.lineTo(60, 25);
  ctx.quadraticCurveTo(57, 33, 52, 39);
  ctx.closePath(); ctx.fill();

  // cabeza y hocico
  ctx.beginPath();
  ctx.moveTo(55, 24);
  ctx.quadraticCurveTo(58, 17, 62, 17);
  ctx.quadraticCurveTo(63.5, 19, 62, 22);
  ctx.quadraticCurveTo(61, 26, 59.5, 27);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = peloOsc;
  ctx.beginPath(); ctx.ellipse(61.5, 19.5, 2, 1.6, 0.5, 0, Math.PI * 2); ctx.fill();
  // ojo
  ctx.fillStyle = "#17100a";
  ctx.beginPath(); ctx.arc(58.6, 21.5, 0.9, 0, Math.PI * 2); ctx.fill();
  // orejas
  ctx.fillStyle = pelo;
  ctx.beginPath(); ctx.moveTo(55.5, 20); ctx.lineTo(55, 15.5); ctx.lineTo(57.8, 18.5); ctx.closePath(); ctx.fill();

  // crin
  ctx.fillStyle = crin;
  ctx.beginPath();
  ctx.moveTo(54, 21);
  ctx.quadraticCurveTo(50, 27, 46, 33);
  ctx.lineTo(50, 34);
  ctx.quadraticCurveTo(53, 28, 57, 23);
  ctx.closePath(); ctx.fill();

  // patas delanteras
  ctx.strokeStyle = pelo; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(35, 43); ctx.lineTo(34, 50); ctx.lineTo(36, 56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, 43); ctx.lineTo(50, 50); ctx.lineTo(49, 56); ctx.stroke();
  // cascos
  ctx.strokeStyle = "#241508"; ctx.lineWidth = 3.6;
  for (const [x, y] of [[30, 56], [45, 56], [36, 56], [49, 56]]) { ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x, y + 0.6); ctx.stroke(); }

  // barda y penacho
  if (barda) {
    ctx.fillStyle = pal.main;
    ctx.beginPath(); ctx.moveTo(32, 31); ctx.lineTo(46, 32); ctx.lineTo(45, 39); ctx.lineTo(33, 38); ctx.closePath(); ctx.fill();
    ctx.fillStyle = BRONZE; ctx.fillRect(33, 31.5, 12, 1.6);
  }
  if (penacho) {
    ctx.fillStyle = pal.crest;
    ctx.beginPath(); ctx.moveTo(56, 18); ctx.quadraticCurveTo(54, 11, 58, 9); ctx.quadraticCurveTo(58, 14, 59, 18); ctx.closePath(); ctx.fill();
  }
  // riendas
  ctx.strokeStyle = "#4a3320"; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(57, 25); ctx.lineTo(26, 33); ctx.stroke();
}

function drawMiniHelmet(ctx, cx, cy, pal, crest) {
  ctx.fillStyle = BRONZE;
  ctx.beginPath(); ctx.arc(cx, cy - 1, 5.8, Math.PI, 0); ctx.fill();
  if (crest) { ctx.fillStyle = pal.crest; ctx.beginPath(); ctx.ellipse(cx - 1, cy - 7, 6, 2.2, -0.2, 0, Math.PI * 2); ctx.fill(); }
}

function drawRam(ctx, pal, pesado = false) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 55, 26, 5, 0, 0, Math.PI * 2); ctx.fill();
  // techo de pieles
  ctx.fillStyle = "#8b6a45";
  ctx.beginPath(); ctx.moveTo(6, 40); ctx.lineTo(32, 16); ctx.lineTo(58, 40); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < 5; i++) ctx.fillRect(12 + i * 9, 24 + Math.abs(2 - i) * 3, 2, 14 - Math.abs(2 - i) * 3);
  ctx.fillStyle = WOOD; ctx.fillRect(6, 40, 52, 6);
  // tronco con cabeza de bronce
  ctx.fillStyle = WOOD_L; roundRect(ctx, 2, 33, 56, 7, 3.5); ctx.fill();
  ctx.fillStyle = BRONZE; ctx.beginPath(); ctx.moveTo(56, 30); ctx.lineTo(64, 36.5); ctx.lineTo(56, 43); ctx.closePath(); ctx.fill();
  // ruedas
  ctx.fillStyle = WOOD_D;
  for (const x of [14, 32, 50]) { ctx.beginPath(); ctx.arc(x, 50, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = pal.main; ctx.fillRect(28, 12, 8, 6);
  if (pesado) {
    // techo de tablas y cabeza de hierro: el ariete de asedio
    ctx.fillStyle = WOOD_D;
    ctx.beginPath(); ctx.moveTo(8, 34); ctx.lineTo(32, 22); ctx.lineTo(56, 34); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(8 + k * 12, 34); ctx.lineTo(20 + k * 6, 25); ctx.stroke(); }
    ctx.fillStyle = '#6d6d68'; ctx.beginPath(); ctx.arc(10, 44, 6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSiegeTower(ctx, pal) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 58, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD; ctx.beginPath(); ctx.moveTo(18, 56); ctx.lineTo(22, 6); ctx.lineTo(44, 6); ctx.lineTo(48, 56); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.5;
  for (let y = 14; y < 56; y += 10) { ctx.beginPath(); ctx.moveTo(19, y); ctx.lineTo(47, y); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(20, 16); ctx.lineTo(46, 54); ctx.moveTo(46, 16); ctx.lineTo(20, 54); ctx.stroke();
  ctx.fillStyle = "#8b6a45"; ctx.fillRect(20, 2, 26, 6);
  ctx.fillStyle = pal.main; ctx.fillRect(31, -4, 2, 8); ctx.fillRect(33, -4, 8, 5);
  ctx.fillStyle = WOOD_D; for (const x of [22, 44]) { ctx.beginPath(); ctx.arc(x, 57, 4, 0, Math.PI * 2); ctx.fill(); }
}

function drawCatapult(ctx, pal, heavy) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 56, 24, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD; ctx.fillRect(8, 44, 48, 6);
  ctx.beginPath(); ctx.moveTo(20, 44); ctx.lineTo(30, 22); ctx.lineTo(34, 22); ctx.lineTo(28, 44); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(44, 44); ctx.lineTo(34, 22); ctx.lineTo(30, 22); ctx.lineTo(36, 44); ctx.closePath(); ctx.fill();
  // brazo
  ctx.save(); ctx.translate(32, 26); ctx.rotate(-0.9);
  ctx.fillStyle = WOOD_L; roundRect(ctx, -2, -26, 4.5, 34, 2); ctx.fill();
  ctx.fillStyle = WOOD_D; ctx.beginPath(); ctx.arc(0, -26, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8d8778"; ctx.beginPath(); ctx.arc(0, -27, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (heavy) { ctx.fillStyle = "#6d6d68"; roundRect(ctx, 38, 34, 12, 10, 2); ctx.fill(); }
  ctx.fillStyle = WOOD_D; for (const x of [14, 50]) { ctx.beginPath(); ctx.arc(x, 51, 5.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = pal.main; ctx.fillRect(10, 40, 12, 4);
}

function drawTrojanHorse(ctx) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 59, 24, 4, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, 10, 0, 50);
  g.addColorStop(0, "#c49a64"); g.addColorStop(1, "#8a6238");
  ctx.fillStyle = g;
  ctx.beginPath(); roundRect(ctx, 10, 28, 36, 16, 6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(38, 30); ctx.lineTo(46, 8); ctx.lineTo(54, 6); ctx.lineTo(58, 12); ctx.lineTo(50, 16); ctx.lineTo(46, 32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#6e4b2a"; ctx.beginPath(); ctx.moveTo(44, 12); ctx.lineTo(48, 4); ctx.lineTo(50, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(53, 10, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8a6238";
  for (const x of [14, 20, 36, 42]) ctx.fillRect(x, 42, 4, 10);
  ctx.fillStyle = WOOD_D; ctx.fillRect(8, 51, 44, 4);
  for (const x of [12, 28, 46]) { ctx.beginPath(); ctx.arc(x, 56, 3.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = "rgba(60,35,10,0.45)"; ctx.lineWidth = 1;
  for (let x = 14; x < 46; x += 5) { ctx.beginPath(); ctx.moveTo(x, 29); ctx.lineTo(x, 43); ctx.stroke(); }
}

/** Nave aquea: casco negro, ojo en la proa, remos y vela con el color del bando */
function drawShip(ctx, pal, t) {
  const war = t.id !== "transportShip";
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath(); ctx.ellipse(32, 52, 26, 5, 0, 0, Math.PI * 2); ctx.fill();

  // remos
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 9;
    ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x - 4, 51); ctx.stroke();
  }

  // casco
  const g = ctx.createLinearGradient(0, 30, 0, 50);
  g.addColorStop(0, WOOD_L); g.addColorStop(1, WOOD_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(6, 34);
  ctx.quadraticCurveTo(8, 48, 24, 48);
  ctx.lineTo(44, 48);
  ctx.quadraticCurveTo(58, 47, 58, 32);
  ctx.lineTo(54, 36);
  ctx.quadraticCurveTo(50, 42, 40, 42);
  ctx.lineTo(22, 42);
  ctx.quadraticCurveTo(12, 42, 10, 33);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(40,22,8,0.6)"; ctx.lineWidth = 1; ctx.stroke();

  // franja y ojo apotropaico en la proa
  ctx.fillStyle = pal.main; ctx.fillRect(12, 43, 40, 2.5);
  ctx.fillStyle = "#f3eadb"; ctx.beginPath(); ctx.ellipse(50, 39, 4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#1b1b1b"; ctx.beginPath(); ctx.arc(50.5, 39, 1.3, 0, Math.PI * 2); ctx.fill();

  // espolón de bronce en las naves de guerra
  if (war) {
    ctx.fillStyle = BRONZE;
    ctx.beginPath(); ctx.moveTo(57, 40); ctx.lineTo(63, 44); ctx.lineTo(56, 45); ctx.closePath(); ctx.fill();
  }

  // mástil y vela
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(30, 42); ctx.lineTo(30, 8); ctx.stroke();
  const sg = ctx.createLinearGradient(14, 0, 46, 0);
  sg.addColorStop(0, pal.light); sg.addColorStop(1, pal.main);
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(30, 10); ctx.lineTo(50, 14); ctx.quadraticCurveTo(52, 26, 48, 36); ctx.lineTo(30, 34);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(30, 20, 19, 3);
  ctx.strokeStyle = pal.dark; ctx.lineWidth = 1; ctx.stroke();
  // gallardete
  ctx.fillStyle = pal.crest;
  ctx.beginPath(); ctx.moveTo(30, 8); ctx.lineTo(22, 11); ctx.lineTo(30, 14); ctx.closePath(); ctx.fill();

  // escudos colgados del costado (solo las de guerra)
  if (war) {
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 9;
      ctx.fillStyle = BRONZE_D; ctx.beginPath(); ctx.arc(x, 44, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal.main; ctx.beginPath(); ctx.arc(x, 44, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Camello: joroba, cuello largo y jinete con lanza corta */
function drawCamel(ctx, pal, pesado) {
  const pelo = pesado ? "#c2a06a" : "#d4b57f", osc = pesado ? "#8e734a" : "#a88a5c";
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(36, 57, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = osc; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(30, 42); ctx.lineTo(27, 50); ctx.lineTo(29, 57); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(46, 42); ctx.lineTo(47, 50); ctx.lineTo(46, 57); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(35, 43); ctx.lineTo(34, 51); ctx.lineTo(36, 57); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(28, 36); ctx.quadraticCurveTo(23, 40, 25, 47); ctx.stroke();
  ctx.fillStyle = pelo;
  ctx.beginPath();
  ctx.moveTo(28, 38);
  ctx.quadraticCurveTo(31, 33, 40, 33);
  ctx.quadraticCurveTo(49, 33, 50, 39);
  ctx.quadraticCurveTo(48, 45, 38, 45);
  ctx.quadraticCurveTo(29, 45, 28, 38);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(32, 34); ctx.quadraticCurveTo(38, 22, 45, 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = osc;
  ctx.beginPath(); ctx.moveTo(41, 27); ctx.quadraticCurveTo(45, 29, 45, 34); ctx.lineTo(41, 34); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = pelo; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(48, 37); ctx.quadraticCurveTo(55, 30, 55, 21); ctx.stroke();
  ctx.fillStyle = pelo;
  ctx.beginPath(); ctx.ellipse(56, 19, 5, 3.6, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#3b2a18"; ctx.beginPath(); ctx.arc(57, 18, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(31, 36); ctx.lineTo(43, 36); ctx.lineTo(41, 45); ctx.lineTo(31, 44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.skin || "#d9a977";
  ctx.beginPath(); ctx.ellipse(37, 22, 4.2, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; roundRect(ctx, 33, 24, 9, 10, 3); ctx.fill();
  drawMiniHelmet(ctx, 37, 17, pal, pesado);
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, 40); ctx.lineTo(24, 12); ctx.stroke();
  ctx.fillStyle = BRONZE_L;
  ctx.beginPath(); ctx.moveTo(24, 12); ctx.lineTo(22, 6); ctx.lineTo(26.5, 10); ctx.closePath(); ctx.fill();
}

/** Arquero a caballo: el caballo de siempre con un arco corto encima */
function drawHorseArcher(ctx, pal, pesado) {
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(36, 57, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  drawHorse(ctx, pal, { oscuro: pesado, barda: pesado });
  ctx.fillStyle = pal.skin || "#d9a977";
  ctx.beginPath(); ctx.ellipse(36, 21, 4.2, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; roundRect(ctx, 32, 23, 9, 11, 3); ctx.fill();
  if (pesado) { ctx.fillStyle = BRONZE_D; roundRect(ctx, 32, 23, 9, 5, 2); ctx.fill(); }
  drawMiniHelmet(ctx, 36, 16, pal, pesado);
  ctx.save(); ctx.translate(26, 26); ctx.rotate(0.15); ctx.scale(0.8, 0.8);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(-8, 0, 0, 11); ctx.stroke();
  ctx.strokeStyle = "#e9e2cf"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(3, 0); ctx.lineTo(0, 11); ctx.stroke();
  ctx.strokeStyle = WOOD; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(14, 0); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = WOOD_D; roundRect(ctx, 41, 26, 5, 10, 2); ctx.fill();
  ctx.strokeStyle = "#e9e2cf"; ctx.lineWidth = 1;
  for (const dx of [0, 2.5]) { ctx.beginPath(); ctx.moveTo(42.5 + dx, 26); ctx.lineTo(42.5 + dx, 21); ctx.stroke(); }
}

/** Escorpion: ballesta grande sobre caballete, solo dispara a tropa */
function drawScorpion(ctx, pal, pesado) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 56, 20, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 3.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(20, 55); ctx.lineTo(30, 38); ctx.moveTo(44, 55); ctx.lineTo(34, 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(24, 47); ctx.lineTo(40, 47); ctx.stroke();
  ctx.fillStyle = WOOD; roundRect(ctx, 16, 32, 36, 7, 2); ctx.fill();
  ctx.fillStyle = WOOD_L; ctx.fillRect(18, 34, 32, 2);
  ctx.strokeStyle = pesado ? "#6d6d68" : "#8a6a42"; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(48, 22); ctx.quadraticCurveTo(54, 35, 48, 48); ctx.stroke();
  ctx.strokeStyle = "#e9e2cf"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(48, 22); ctx.lineTo(42, 35); ctx.lineTo(48, 48); ctx.stroke();
  ctx.strokeStyle = BRONZE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(20, 35); ctx.lineTo(50, 35); ctx.stroke();
  ctx.fillStyle = BRONZE_L;
  ctx.beginPath(); ctx.moveTo(56, 35); ctx.lineTo(49, 32); ctx.lineTo(49, 38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = WOOD_D; ctx.beginPath(); ctx.arc(16, 35, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; ctx.fillRect(26, 43, 10, 4);
  if (pesado) { ctx.fillStyle = "#6d6d68"; roundRect(ctx, 22, 28, 12, 5, 2); ctx.fill(); }
}

/** Trebuchet: la torre con el contrapeso colgando */
function drawTrebuchet(ctx, pal) {
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 57, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD; ctx.fillRect(10, 48, 44, 6);
  ctx.fillStyle = WOOD_D;
  for (const x of [16, 48]) { ctx.beginPath(); ctx.arc(x, 55, 4.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(20, 48); ctx.lineTo(32, 14); ctx.lineTo(44, 48); ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(25, 32); ctx.lineTo(39, 32); ctx.stroke();
  ctx.save(); ctx.translate(32, 16); ctx.rotate(-0.55);
  ctx.fillStyle = WOOD_L; roundRect(ctx, -2, -4, 4, 38, 2); ctx.fill();
  ctx.translate(0, -4);
  ctx.fillStyle = "#6f6a60"; roundRect(ctx, -6, -14, 12, 11, 2); ctx.fill();
  ctx.fillStyle = "#565149"; ctx.fillRect(-6, -9, 12, 2);
  ctx.strokeStyle = BRONZE_D; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(6, -14); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#cfc6ae"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(49, 34); ctx.quadraticCurveTo(54, 42, 50, 48); ctx.stroke();
  ctx.fillStyle = "#8d8778"; ctx.beginPath(); ctx.arc(50, 49, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; ctx.fillRect(12, 44, 10, 4);
}

/** Canon de bombarda: tubo de bronce sobre cureña */
function drawCannon(ctx, pal, grande) {
  const L = grande ? 40 : 32;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(32, 56, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WOOD;
  ctx.beginPath(); ctx.moveTo(10, 50); ctx.lineTo(52, 50); ctx.lineTo(48, 42); ctx.lineTo(16, 42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = WOOD_D; ctx.fillRect(10, 48, 42, 3);
  for (const x of [18, 44]) {
    ctx.fillStyle = WOOD_D; ctx.beginPath(); ctx.arc(x, 52, grande ? 6 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = WOOD_L; ctx.beginPath(); ctx.arc(x, 52, 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(22, 40); ctx.rotate(-0.22);
  const g = ctx.createLinearGradient(0, -5, 0, 5);
  g.addColorStop(0, BRONZE_L); g.addColorStop(0.5, BRONZE); g.addColorStop(1, BRONZE_D);
  ctx.fillStyle = g; roundRect(ctx, 0, -5, L, 10, 4); ctx.fill();
  ctx.fillStyle = BRONZE_D;
  for (let i = 1; i <= 3; i++) ctx.fillRect(i * (L / 4), -5.5, 2.5, 11);
  ctx.fillStyle = "#2a2118"; ctx.beginPath(); ctx.ellipse(L, 0, 2.2, 4.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#d8cbb0"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(22, 38); ctx.quadraticCurveTo(18, 32, 20, 27); ctx.stroke();
  ctx.fillStyle = "#ff9b2e"; ctx.beginPath(); ctx.arc(20, 26, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; ctx.fillRect(12, 44, 9, 4);
}

/** Elefante de guerra: mole gris con torreta y arquero encima */
function drawElephant(ctx, pal, elite) {
  const piel = elite ? "#8a8278" : "#9b948a", osc = elite ? "#625c54" : "#746d64";
  ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(32, 57, 23, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  // patas, gruesas como columnas
  ctx.fillStyle = osc;
  for (const x of [20, 30, 40, 48]) roundRect(ctx, x, 42, 7, 15, 2), ctx.fill();
  // cuerpo
  ctx.fillStyle = piel;
  ctx.beginPath();
  ctx.moveTo(16, 40);
  ctx.quadraticCurveTo(18, 28, 34, 28);
  ctx.quadraticCurveTo(50, 28, 52, 38);
  ctx.quadraticCurveTo(52, 47, 34, 47);
  ctx.quadraticCurveTo(17, 47, 16, 40);
  ctx.closePath(); ctx.fill();
  // cabeza y oreja
  ctx.fillStyle = piel;
  ctx.beginPath(); ctx.ellipse(54, 36, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = osc;
  ctx.beginPath(); ctx.ellipse(50, 34, 6.5, 8, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a2118"; ctx.beginPath(); ctx.arc(57, 33, 1.3, 0, Math.PI * 2); ctx.fill();
  // trompa
  ctx.strokeStyle = piel; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(58, 40); ctx.quadraticCurveTo(62, 48, 57, 53); ctx.stroke();
  // colmillos
  ctx.strokeStyle = "#efe7d2"; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(57, 42); ctx.quadraticCurveTo(62, 45, 63, 41); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(52, 43); ctx.quadraticCurveTo(56, 47, 58, 44); ctx.stroke();
  // manta y torreta
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(18, 34); ctx.lineTo(44, 34); ctx.lineTo(42, 46); ctx.lineTo(18, 45); ctx.closePath(); ctx.fill();
  ctx.fillStyle = WOOD; roundRect(ctx, 22, 20, 20, 10, 2); ctx.fill();
  ctx.fillStyle = WOOD_D;
  for (const x of [24, 30, 36]) ctx.fillRect(x, 17, 4, 4);
  // arquero asomado
  ctx.fillStyle = pal.skin || "#d9a977";
  ctx.beginPath(); ctx.ellipse(32, 14, 3.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  drawMiniHelmet(ctx, 32, 10, pal, elite);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(40, 20); ctx.quadraticCurveTo(45, 13, 40, 6); ctx.stroke();
}

/** Templario: jinete con sobreveste y cruz, sobre caballo oscuro */
function drawTemplar(ctx, pal, elite) {
  ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(36, 57, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  drawHorse(ctx, pal, { oscuro: true, barda: true, penacho: elite });
  // sobreveste blanca
  ctx.fillStyle = "#ece6d8"; roundRect(ctx, 31, 22, 11, 14, 3); ctx.fill();
  ctx.fillStyle = "#a3202a";
  ctx.fillRect(35.5, 24, 2.5, 10);
  ctx.fillRect(32.5, 27, 8.5, 2.5);
  // cabeza con yelmo cerrado
  ctx.fillStyle = pal.skin || "#d9a977";
  ctx.beginPath(); ctx.ellipse(36, 19, 4, 4.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = elite ? "#d9d4c6" : "#b9b2a4";
  roundRect(ctx, 32, 13, 8, 9, 3); ctx.fill();
  ctx.fillStyle = "#2a2118"; ctx.fillRect(32.5, 17, 7, 1.6);
  // lanza con banderín
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(28, 42); ctx.lineTo(24, 8); ctx.stroke();
  ctx.fillStyle = BRONZE_L;
  ctx.beginPath(); ctx.moveTo(24, 8); ctx.lineTo(22, 2); ctx.lineTo(26.5, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ece6d8";
  ctx.beginPath(); ctx.moveTo(24.5, 10); ctx.lineTo(34, 13); ctx.lineTo(24.5, 17); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#a3202a"; ctx.fillRect(26, 12, 1.6, 4); ctx.fillRect(25, 13.4, 4, 1.6);
}

/** Ballesta de repetición: el cargador encima es lo que la distingue */
function drawRepeatingCrossbow(ctx) {
  ctx.save(); ctx.translate(21, 29); ctx.rotate(-0.2);
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(10, -7); ctx.quadraticCurveTo(14, 0, 10, 7); ctx.stroke();
  ctx.strokeStyle = "#e9e2cf"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, -7); ctx.lineTo(4, 0); ctx.lineTo(10, 7); ctx.stroke();
  ctx.fillStyle = WOOD; roundRect(ctx, -6, -1.6, 20, 3.4, 1); ctx.fill();
  // el cargador de virotes
  ctx.fillStyle = WOOD_L; roundRect(ctx, 1, -7, 8, 5.5, 1); ctx.fill();
  ctx.strokeStyle = BRONZE_D; ctx.lineWidth = 0.9;
  for (const dx of [2.5, 5, 7.5]) { ctx.beginPath(); ctx.moveTo(dx, -7); ctx.lineTo(dx, -2); ctx.stroke(); }
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}

// ======================================================================
// Edificios
// ======================================================================

function drawBuilding(ctx, t, pal, variant) {
  switch (t.id) {
    case "camp": return drawCamp(ctx, pal);
    case "citadel": return drawCitadel(ctx, pal);
    case "farm": return drawFarm(ctx, variant);
    case "mine": return drawMine(ctx);
    case "barracks": return drawBarracks(ctx, pal);
    case "archeryRange": return drawRange(ctx, pal);
    case "stable": return drawStable(ctx, pal);
    case "siegeWorkshop": return drawWorkshop(ctx, pal);
    case "temple": return drawTemple(ctx, pal);
    case "watchtower": return drawTower(ctx, pal);
    case "blacksmith": return drawForge(ctx, pal);
    case "university": return drawUniversity(ctx, pal);
    case "castle": return drawCastle(ctx, pal);
    case "wonder": return drawWonder(ctx, pal);
    case "mill": return drawMill(ctx, pal);
    case "dock": return drawDock(ctx, pal);
    case "village": return drawVillage(ctx, pal);
    default: return drawBarracks(ctx, pal);
  }
}

/** Molino: torre de piedra con aspas y gavillas de trigo a los pies */
function drawMill(ctx, pal) {
  shadow(ctx, 32, 54, 20, 5);
  // gavillas
  ctx.strokeStyle = "#c8a447"; ctx.lineWidth = 1.4;
  for (const gx of [12, 50]) {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(gx, 53); ctx.lineTo(gx + i * 2.2, 43); ctx.stroke();
    }
    ctx.fillStyle = "#8d6526"; ctx.fillRect(gx - 4, 47, 8, 2);
  }
  // torre
  const g = ctx.createLinearGradient(20, 0, 44, 0);
  g.addColorStop(0, STONE_L); g.addColorStop(0.55, STONE); g.addColorStop(1, STONE_D);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(23, 52); ctx.lineTo(26, 22); ctx.lineTo(38, 22); ctx.lineTo(41, 52);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(60,50,35,0.45)"; ctx.lineWidth = 0.8;
  for (const y of [30, 38, 46]) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(40, y); ctx.stroke(); }
  // puerta y ventana
  ctx.fillStyle = WOOD_D; roundRect(ctx, 29, 42, 6, 10, 1); ctx.fill();
  ctx.fillStyle = "#3a3024"; roundRect(ctx, 30, 30, 4, 5, 1); ctx.fill();
  // techo cónico
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(23, 23); ctx.lineTo(32, 12); ctx.lineTo(41, 23); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(41, 23); ctx.lineTo(32, 23); ctx.closePath(); ctx.fill();
  // aspas
  ctx.save();
  ctx.translate(32, 20);
  ctx.rotate(0.35);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = WOOD;
    roundRect(ctx, 2, -1.6, 19, 3.2, 1); ctx.fill();
    ctx.fillStyle = "#efe6d0";
    roundRect(ctx, 6, -1.1, 13, 2.2, 1); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = BRONZE_D;
  ctx.beginPath(); ctx.arc(32, 20, 2.4, 0, Math.PI * 2); ctx.fill();
}

/** Puerto: embarcadero de tablones con su grúa y una barca amarrada */
function drawDock(ctx, pal) {
  shadow(ctx, 32, 54, 24, 5);
  // pasarela
  ctx.fillStyle = WOOD;
  ctx.fillRect(8, 36, 48, 12);
  ctx.fillStyle = WOOD_D;
  for (let x = 10; x < 56; x += 7) ctx.fillRect(x, 36, 2, 12);
  ctx.fillStyle = WOOD_L; ctx.fillRect(8, 35, 48, 2);
  // pilotes
  ctx.fillStyle = WOOD_D;
  for (const x of [12, 28, 46]) ctx.fillRect(x, 48, 3.5, 9);
  // caseta
  ctx.fillStyle = STONE; roundRect(ctx, 10, 18, 20, 18, 2); ctx.fill();
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(8, 19); ctx.lineTo(20, 10); ctx.lineTo(32, 19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = WOOD_D; ctx.fillRect(17, 27, 6, 9);
  // grúa de carga
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(44, 36); ctx.lineTo(44, 14); ctx.lineTo(56, 18); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(55, 18); ctx.lineTo(55, 26); ctx.stroke();
  ctx.fillStyle = BRONZE_D; roundRect(ctx, 52, 26, 6, 5, 1); ctx.fill();
  // ánforas
  ctx.fillStyle = "#a9653c";
  for (const x of [34, 39]) { ctx.beginPath(); ctx.ellipse(x, 32, 2.4, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  flag(ctx, 12, 10, pal, 14);
}

/** Aldea neutral: dos chozas de adobe con techo de paja y su cercado */
function drawVillage(ctx, pal) {
  shadow(ctx, 32, 53, 22, 5);
  const hut = (x, y, w, h) => {
    ctx.fillStyle = "#c8b08a"; roundRect(ctx, x, y, w, h, 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(x + w * 0.6, y, w * 0.4, h);
    ctx.fillStyle = "#b98c4a";
    ctx.beginPath(); ctx.moveTo(x - 3, y + 1); ctx.lineTo(x + w / 2, y - h * 0.65); ctx.lineTo(x + w + 3, y + 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,60,20,0.45)"; ctx.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 3 + i * (w + 6) / 4, y + 1); ctx.lineTo(x + w / 2, y - h * 0.65); ctx.stroke(); }
    ctx.fillStyle = "#6b4a2a"; ctx.fillRect(x + w / 2 - 2.5, y + h - 7, 5, 7);
  };
  hut(12, 28, 20, 18);
  hut(36, 32, 16, 14);
  // cercado y pozo
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(6, 50); ctx.lineTo(58, 50); ctx.stroke();
  for (let x = 8; x < 58; x += 8) { ctx.beginPath(); ctx.moveTo(x, 46); ctx.lineTo(x, 53); ctx.stroke(); }
  ctx.fillStyle = STONE_D; ctx.beginPath(); ctx.ellipse(33, 24, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  // estandarte del dueño (gris si es neutral)
  flag(ctx, 50, 14, pal, 16);
}

/** Herrería: cobertizo abierto con el fuego de la fragua y el yunque */
function drawForge(ctx, pal) {
  shadow(ctx, 32, 56, 26, 6);
  // cuerpo de adobe
  ctx.fillStyle = "#9d7d55"; ctx.fillRect(8, 30, 48, 24);
  ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(34, 30, 22, 24);
  // techo a un agua, de tablas
  ctx.fillStyle = WOOD_D;
  ctx.beginPath(); ctx.moveTo(4, 32); ctx.lineTo(30, 16); ctx.lineTo(60, 26); ctx.lineTo(56, 32); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(4 + i * 11, 32 - i * 1.2); ctx.lineTo(10 + i * 10, 18 + i * 2); ctx.stroke();
  }
  // la boca de la fragua, encendida
  const fuego = ctx.createRadialGradient(20, 44, 1, 20, 44, 11);
  fuego.addColorStop(0, "#ffe9a8"); fuego.addColorStop(0.4, "#ff9b2e"); fuego.addColorStop(1, "rgba(180,60,10,0)");
  ctx.fillStyle = fuego; ctx.beginPath(); ctx.arc(20, 44, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a1a10"; roundRect(ctx, 13, 38, 14, 14, 2); ctx.fill();
  ctx.fillStyle = "#ff8c21"; roundRect(ctx, 15, 42, 10, 9, 2); ctx.fill();
  // yunque
  ctx.fillStyle = "#4c4a46";
  ctx.beginPath();
  ctx.moveTo(38, 48); ctx.lineTo(52, 48); ctx.lineTo(50, 44); ctx.lineTo(56, 42);
  ctx.lineTo(50, 40); ctx.lineTo(40, 40); ctx.lineTo(40, 44); ctx.lineTo(36, 46);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#6a665f"; ctx.fillRect(40, 48, 10, 5);
  // martillo apoyado
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(45, 40); ctx.lineTo(49, 28); ctx.stroke();
  ctx.fillStyle = BRONZE_D; ctx.fillRect(45, 24, 9, 5);
  // humo
  ctx.strokeStyle = "rgba(220,215,210,0.5)"; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(20, 34); ctx.quadraticCurveTo(16, 26, 21, 20); ctx.quadraticCurveTo(26, 14, 22, 8);
  ctx.stroke();
}

/** Universidad: pórtico de columnas con pergaminos y un astrolabio */
function drawUniversity(ctx, pal) {
  shadow(ctx, 32, 56, 28, 6);
  // basamento
  ctx.fillStyle = "#cfc3a6"; ctx.fillRect(6, 48, 52, 7);
  ctx.fillStyle = "#b8ab8c"; ctx.fillRect(6, 52, 52, 3);
  // columnas
  ctx.fillStyle = "#e3d9c0";
  for (const x of [10, 22, 34, 46]) {
    ctx.fillRect(x, 26, 7, 22);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x + 5, 26, 2, 22);
    ctx.fillStyle = "#e3d9c0";
    ctx.fillRect(x - 1, 24, 9, 3);      // capitel
  }
  // frontón
  ctx.fillStyle = "#d8cdb0";
  ctx.beginPath(); ctx.moveTo(2, 25); ctx.lineTo(32, 11); ctx.lineTo(62, 25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath(); ctx.moveTo(32, 11); ctx.lineTo(62, 25); ctx.lineTo(32, 25); ctx.closePath(); ctx.fill();
  // astrolabio en el tímpano
  ctx.strokeStyle = BRONZE; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(32, 20, 4.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(27.5, 20); ctx.lineTo(36.5, 20); ctx.moveTo(32, 15.5); ctx.lineTo(32, 24.5); ctx.stroke();
  // pergaminos apilados al pie
  for (const [x, y] of [[12, 44], [16, 44], [14, 41]]) {
    ctx.fillStyle = "#e8dfc6"; roundRect(ctx, x, y, 7, 3, 1.5); ctx.fill();
    ctx.strokeStyle = "#9c8d6a"; ctx.lineWidth = 0.8; ctx.stroke();
  }
  flag(ctx, 56, 20, pal, 11);
}

/** Castillo: torreón almenado de piedra, con su puerta y su estandarte */
function drawCastle(ctx, pal) {
  shadow(ctx, 32, 57, 28, 6);
  // cuerpo
  ctx.fillStyle = "#b9b2a4"; ctx.fillRect(10, 24, 44, 32);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(36, 24, 18, 32);
  // sillares
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 0.8;
  for (let y = 28; y < 56; y += 7) {
    ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(54, y); ctx.stroke();
  }
  for (let y = 24, f = 0; y < 56; y += 7, f++) {
    for (let x = 10 + (f % 2 ? 7 : 0); x < 54; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + 7, 56)); ctx.stroke();
    }
  }
  // almenas
  ctx.fillStyle = "#c6bfb0";
  for (let x = 8; x < 56; x += 10) ctx.fillRect(x, 18, 6, 7);
  ctx.fillStyle = "#b9b2a4"; ctx.fillRect(8, 24, 48, 3);
  // torrecillas laterales
  for (const x of [4, 52]) {
    ctx.fillStyle = "#c6bfb0"; ctx.fillRect(x, 28, 8, 28);
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(x + 5, 28, 3, 28);
    ctx.fillStyle = "#d2cbbb"; ctx.fillRect(x - 1, 24, 10, 5);
  }
  // puerta en arco
  ctx.fillStyle = "#2f2318";
  ctx.beginPath();
  ctx.moveTo(26, 56); ctx.lineTo(26, 44); ctx.arc(32, 44, 6, Math.PI, 0); ctx.lineTo(38, 56);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = BRONZE_D; ctx.lineWidth = 1.2;
  for (const x of [29, 32, 35]) { ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, 56); ctx.stroke(); }
  // saeteras
  ctx.fillStyle = "#3a3127";
  for (const [x, y] of [[18, 32], [44, 32]]) ctx.fillRect(x, y, 2.5, 7);
  flag(ctx, 32, 12, pal, 13);
}

function shadow(ctx, cx, cy, rx, ry) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}

function flag(ctx, x, y, pal, h = 20) {
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  ctx.fillStyle = pal.main;
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x + 7, y - h - 2, x + 13, y - h + 2); ctx.lineTo(x + 11, y - h + 6); ctx.quadraticCurveTo(x + 6, y - h + 4, x, y - h + 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.light; ctx.fillRect(x + 3, y - h + 2.5, 5, 1.5);
}

function tent(ctx, x, y, w, h, fill, dark) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.62, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2b1b12";
  ctx.beginPath(); ctx.moveTo(x + w / 2, y - h * 0.45); ctx.lineTo(x + w * 0.58, y); ctx.lineTo(x + w * 0.42, y); ctx.closePath(); ctx.fill();
}

function drawCamp(ctx, pal) {
  shadow(ctx, 32, 54, 28, 8);
  // empalizada
  ctx.fillStyle = WOOD;
  for (let x = 4; x < 60; x += 4) { ctx.fillRect(x, 44, 3, 12); ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x + 1.5, 40); ctx.lineTo(x + 3, 44); ctx.fill(); }
  tent(ctx, 6, 46, 24, 22, "#e9dcc0", "#c7b694");
  tent(ctx, 30, 46, 28, 30, "#efe3c8", "#cdbb97");
  ctx.fillStyle = pal.main; ctx.fillRect(40, 20, 8, 3);
  flag(ctx, 44, 18, pal, 14);
  // hoguera
  ctx.fillStyle = "#f2a33a"; ctx.beginPath(); ctx.moveTo(26, 56); ctx.quadraticCurveTo(28, 48, 30, 56); ctx.fill();
}

function drawCitadel(ctx, pal) {
  shadow(ctx, 32, 57, 30, 7);
  const g = ctx.createLinearGradient(0, 12, 0, 58);
  g.addColorStop(0, STONE_L); g.addColorStop(1, STONE_D);
  ctx.fillStyle = g;
  ctx.fillRect(6, 26, 52, 30);
  // torres laterales
  ctx.fillRect(2, 16, 14, 40); ctx.fillRect(48, 16, 14, 40);
  ctx.fillStyle = STONE_D;
  for (const x of [2, 7, 12, 48, 53, 58]) ctx.fillRect(x, 12, 3.5, 5);
  // frontón y columnas
  ctx.fillStyle = "#efe6d0";
  ctx.beginPath(); ctx.moveTo(16, 26); ctx.lineTo(32, 12); ctx.lineTo(48, 26); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(22, 24); ctx.lineTo(32, 16); ctx.lineTo(42, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#efe6d0";
  for (let x = 18; x <= 44; x += 6.5) ctx.fillRect(x, 27, 3.5, 24);
  ctx.fillStyle = "#3a2a1c"; ctx.fillRect(29, 38, 6, 13);
  ctx.fillStyle = BRONZE; ctx.fillRect(16, 51, 32, 3);
  flag(ctx, 9, 14, pal, 12); flag(ctx, 55, 14, pal, 12);
}

function drawFarm(ctx, variant) {
  ctx.fillStyle = "#7e6a3a"; roundRect(ctx, 3, 14, 58, 46, 4); ctx.fill();
  const rows = variant % 2 ? ["#d9b44a", "#caa23c"] : ["#9dbb4f", "#86a441"];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rows[i % 2];
    roundRect(ctx, 6, 18 + i * 7, 52, 4.5, 2); ctx.fill();
  }
  // choza
  ctx.fillStyle = "#c9a26a"; ctx.fillRect(40, 4, 18, 12);
  ctx.fillStyle = "#8e6a3a"; ctx.beginPath(); ctx.moveTo(38, 5); ctx.lineTo(49, -2); ctx.lineTo(60, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a2a1c"; ctx.fillRect(47, 9, 4, 7);
}

function drawMine(ctx) {
  shadow(ctx, 32, 56, 26, 6);
  ctx.fillStyle = "#7d7465";
  ctx.beginPath(); ctx.moveTo(4, 56); ctx.lineTo(16, 22); ctx.lineTo(30, 12); ctx.lineTo(46, 20); ctx.lineTo(60, 56); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#958b7a"; ctx.beginPath(); ctx.moveTo(16, 22); ctx.lineTo(30, 12); ctx.lineTo(34, 30); ctx.closePath(); ctx.fill();
  // boca de la mina
  ctx.fillStyle = "#1c140d"; ctx.beginPath(); ctx.moveTo(22, 56); ctx.lineTo(22, 38); ctx.quadraticCurveTo(32, 28, 42, 38); ctx.lineTo(42, 56); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(21, 56); ctx.lineTo(21, 36); ctx.lineTo(43, 36); ctx.lineTo(43, 56); ctx.stroke();
  // vagoneta de bronce
  ctx.fillStyle = WOOD; ctx.fillRect(44, 46, 14, 8);
  ctx.fillStyle = "#d88a3c";
  for (const [x, y] of [[47, 45], [51, 44], [55, 45]]) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#2a1a10"; for (const x of [47, 55]) { ctx.beginPath(); ctx.arc(x, 55, 2, 0, Math.PI * 2); ctx.fill(); }
}

function drawBarracks(ctx, pal) {
  shadow(ctx, 32, 56, 28, 6);
  ctx.fillStyle = "#b99a6e"; ctx.fillRect(6, 28, 52, 26);
  ctx.fillStyle = "#8e6b42"; ctx.beginPath(); ctx.moveTo(2, 30); ctx.lineTo(32, 14); ctx.lineTo(62, 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(32, 28, 26, 26);
  ctx.fillStyle = "#3a2a1c"; ctx.fillRect(28, 38, 8, 16);
  // escudos colgados
  for (const x of [14, 46]) {
    ctx.fillStyle = pal.main; ctx.beginPath(); ctx.arc(x, 40, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = BRONZE; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // lanzas cruzadas
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(26, 30); ctx.lineTo(38, 18); ctx.moveTo(38, 30); ctx.lineTo(26, 18); ctx.stroke();
  flag(ctx, 56, 22, pal, 12);
}

function drawRange(ctx, pal) {
  ctx.fillStyle = "#a88d5e"; roundRect(ctx, 4, 34, 56, 22, 3); ctx.fill();
  // dianas
  for (const [x, y] of [[16, 26], [34, 22], [50, 28]]) {
    ctx.fillStyle = WOOD_D; ctx.fillRect(x - 1, y, 2, 20);
    for (const [r, c] of [[8, "#efe6d0"], [5.5, pal.main], [3, "#efe6d0"], [1.3, "#b33"]]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = WOOD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(4, 50); ctx.lineTo(60, 50); ctx.stroke();
  ctx.strokeStyle = "#f3f3f3"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 24); ctx.lineTo(36, 22); ctx.stroke();
}

function drawStable(ctx, pal) {
  shadow(ctx, 32, 56, 28, 6);
  ctx.fillStyle = "#a0673d"; ctx.fillRect(6, 26, 52, 28);
  ctx.fillStyle = "#6e4225"; ctx.beginPath(); ctx.moveTo(2, 28); ctx.lineTo(32, 10); ctx.lineTo(62, 28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#3a2414"; ctx.fillRect(22, 34, 20, 20);
  ctx.strokeStyle = "#e8d7b0"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(22, 34); ctx.lineTo(42, 54); ctx.moveTo(42, 34); ctx.lineTo(22, 54); ctx.stroke();
  // heno
  ctx.fillStyle = "#d9b44a"; ctx.beginPath(); ctx.ellipse(12, 52, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal.main; ctx.fillRect(28, 16, 8, 6);
}

function drawWorkshop(ctx, pal) {
  shadow(ctx, 32, 56, 28, 6);
  ctx.fillStyle = "#9c8058"; ctx.fillRect(4, 30, 40, 24);
  ctx.fillStyle = "#6e5434"; ctx.fillRect(2, 26, 44, 5);
  // grúa
  ctx.strokeStyle = WOOD_D; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(50, 56); ctx.lineTo(50, 8); ctx.lineTo(28, 14); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30, 14); ctx.lineTo(30, 30); ctx.stroke();
  ctx.fillStyle = "#8d8778"; ctx.fillRect(26, 30, 8, 6);
  // rueda de madera
  ctx.strokeStyle = WOOD_L; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(54, 48, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = pal.main; ctx.fillRect(10, 36, 10, 10);
}

function drawTemple(ctx, pal) {
  shadow(ctx, 32, 57, 28, 6);
  ctx.fillStyle = "#e9e0cc"; ctx.fillRect(6, 52, 52, 5); ctx.fillRect(9, 48, 46, 5);
  ctx.fillStyle = "#f4ecdb";
  for (let x = 11; x <= 50; x += 7.6) { ctx.fillRect(x, 26, 4, 22); }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let x = 11; x <= 50; x += 7.6) { ctx.fillRect(x + 2.5, 26, 1.5, 22); }
  ctx.fillStyle = "#e9e0cc"; ctx.fillRect(8, 21, 48, 6);
  ctx.beginPath(); ctx.moveTo(6, 21); ctx.lineTo(32, 6); ctx.lineTo(58, 21); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(16, 19); ctx.lineTo(32, 10); ctx.lineTo(48, 19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffd86b"; ctx.beginPath(); ctx.arc(32, 16, 2.4, 0, Math.PI * 2); ctx.fill();
}

function drawTower(ctx, pal) {
  shadow(ctx, 32, 58, 16, 5);
  const g = ctx.createLinearGradient(20, 0, 44, 0);
  g.addColorStop(0, STONE_L); g.addColorStop(1, STONE_D);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(20, 58); ctx.lineTo(23, 14); ctx.lineTo(41, 14); ctx.lineTo(44, 58); ctx.closePath(); ctx.fill();
  ctx.fillStyle = STONE; ctx.fillRect(19, 8, 26, 7);
  ctx.fillStyle = STONE_D; for (const x of [19, 26, 33, 40]) ctx.fillRect(x, 3, 5, 6);
  ctx.fillStyle = "#1c140d"; ctx.fillRect(30, 26, 4, 9); ctx.fillRect(30, 42, 4, 8);
  flag(ctx, 32, 4, pal, 12);
}

function drawWonder(ctx, pal) {
  shadow(ctx, 32, 58, 30, 6);
  // escalinata
  ctx.fillStyle = "#e9e0cc"; ctx.fillRect(2, 54, 60, 5); ctx.fillRect(5, 50, 54, 5); ctx.fillRect(8, 46, 48, 5);
  // columnata doble
  for (let x = 10; x <= 52; x += 6) { ctx.fillStyle = "#f7f0e0"; ctx.fillRect(x, 20, 3.6, 26); ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(x + 2.4, 20, 1.2, 26); }
  ctx.fillStyle = "#e9e0cc"; ctx.fillRect(6, 15, 52, 6);
  ctx.beginPath(); ctx.moveTo(4, 15); ctx.lineTo(32, 1); ctx.lineTo(60, 15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = pal.main; ctx.beginPath(); ctx.moveTo(14, 13); ctx.lineTo(32, 4); ctx.lineTo(50, 13); ctx.closePath(); ctx.fill();
  // estatua dorada de Atenea
  const g = ctx.createLinearGradient(28, 24, 36, 46);
  g.addColorStop(0, "#ffe7a0"); g.addColorStop(1, "#c89a45");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(28, 46); ctx.lineTo(29.5, 30); ctx.lineTo(34.5, 30); ctx.lineTo(36, 46); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(32, 27, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#ffe7a0"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(37, 24); ctx.lineTo(37, 46); ctx.stroke();
  ctx.fillStyle = "rgba(255,216,107,0.35)"; ctx.beginPath(); ctx.arc(32, 32, 12, 0, Math.PI * 2); ctx.fill();
}

/** Tramo de muralla: se dibuja en el renderer según vecinos (conexiones) */
export function drawWallTile(ctx, s, conn, isGate, hpRatio, pal) {
  const k = s / 64;
  ctx.save();
  ctx.scale(k, k);
  const g = ctx.createLinearGradient(0, 10, 0, 60);
  g.addColorStop(0, STONE_L); g.addColorStop(1, STONE_D);
  const seg = (x, y, w, h) => {
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(60,50,35,0.45)"; ctx.lineWidth = 1;
    for (let yy = y + 7; yy < y + h; yy += 7) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    for (let yy = y, r = 0; yy < y + h; yy += 7, r++) {
      for (let xx = x + (r % 2 ? 5 : 0); xx < x + w; xx += 10) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(yy + 7, y + h)); ctx.stroke(); }
    }
  };
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(10, 54, 48, 8);
  seg(16, 14, 32, 44); // torre central
  if (conn.n) seg(20, 0, 24, 20);
  if (conn.s) seg(20, 44, 24, 20);
  if (conn.w) seg(0, 22, 22, 34);
  if (conn.e) seg(42, 22, 22, 34);
  // almenas
  ctx.fillStyle = STONE_L;
  for (let x = 16; x < 48; x += 8) ctx.fillRect(x, 9, 5, 6);
  if (isGate) {
    ctx.fillStyle = "#3e2716";
    ctx.beginPath(); ctx.moveTo(22, 58); ctx.lineTo(22, 34); ctx.quadraticCurveTo(32, 22, 42, 34); ctx.lineTo(42, 58); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = BRONZE; ctx.lineWidth = 1.5;
    for (const x of [27, 32, 37]) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, 58); ctx.stroke(); }
    ctx.fillStyle = pal.main; ctx.fillRect(28, 12, 8, 5);
  }
  // grietas según daño
  if (hpRatio < 0.75) {
    ctx.strokeStyle = "rgba(30,20,10,0.8)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(24, 18); ctx.lineTo(29, 28); ctx.lineTo(25, 36); ctx.lineTo(31, 46); ctx.stroke();
    if (hpRatio < 0.45) { ctx.beginPath(); ctx.moveTo(40, 16); ctx.lineTo(36, 26); ctx.lineTo(42, 34); ctx.lineTo(37, 50); ctx.stroke(); }
  }
  ctx.restore();
}

// ======================================================================
// utilidades
// ======================================================================

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Retrato grande para el panel lateral */
export function portrait(template, owner, size = 96, isBuilding = false) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const pal = PALETTE[owner] || PALETTE.neutral;
  const g = ctx.createRadialGradient(size / 2, size * 0.4, 4, size / 2, size / 2, size * 0.7);
  g.addColorStop(0, pal.light); g.addColorStop(1, pal.dark);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const spr = isBuilding ? buildingSprite(template, owner, size) : unitSprite(template, owner, size);
  ctx.drawImage(spr, 0, 0);
  return c;
}
