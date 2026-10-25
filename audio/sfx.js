/**
 * sfx.js — el sonido del juego, fabricado a mano con osciladores y ruido.
 * -----------------------------------------------------------------------
 * No se descarga ni un solo archivo: cada golpe, cada flecha y cada paso se
 * sintetiza aquí en el momento. Eso significa que suena a consola y no a
 * grabación, que es justo lo que queremos para un juego al estilo de la DS.
 *
 * Cómo está montado:
 *
 *   AudioContext ─┬─ bus de efectos ─┐
 *                 └─ bus de música ──┴─ maestro ─ altavoces
 *
 * El navegador no deja sonar nada hasta que el usuario toca algo, así que el
 * contexto se crea perezosamente en el primer clic o tecla (ver `despertar`).
 *
 * Uso:
 *   import * as sfx from "./audio/sfx.js";
 *   sfx.init();            // engancha el desbloqueo y lee los volúmenes
 *   sfx.play("espada");    // dispara un sonido
 *   sfx.setVolumen("efectos", 0.5);
 */

const CLAVE = "troya:audio";

let ctx = null;
let maestro = null, busEfectos = null, busMusica = null;
let ruidoBuffer = null;
let listo = false;

/** Volúmenes guardados entre partidas */
export const vol = { maestro: 0.7, efectos: 0.85, musica: 0.5, mudo: false };

/** Última vez que sonó cada efecto, para no apelmazarlos */
const ultimaVez = new Map();

// ======================================================================
// Arranque
// ======================================================================
function cargarAjustes() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || "{}");
    for (const k of ["maestro", "efectos", "musica"]) {
      if (typeof g[k] === "number") vol[k] = Math.min(1, Math.max(0, g[k]));
    }
    if (typeof g.mudo === "boolean") vol.mudo = g.mudo;
  } catch { /* sin almacenamiento */ }
}

function guardarAjustes() {
  try { localStorage.setItem(CLAVE, JSON.stringify(vol)); } catch { /* sin almacenamiento */ }
}

/** Crea el contexto. Solo funciona dentro de un gesto del usuario. */
function despertar() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  maestro = ctx.createGain();
  maestro.gain.value = vol.mudo ? 0 : vol.maestro;
  // un compresor suave al final evita que dos explosiones juntas saturen
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  maestro.connect(comp);
  comp.connect(ctx.destination);

  busEfectos = ctx.createGain();
  busEfectos.gain.value = vol.efectos;
  busEfectos.connect(maestro);

  busMusica = ctx.createGain();
  busMusica.gain.value = vol.musica;
  busMusica.connect(maestro);

  // un segundo de ruido blanco que reutilizan todos los efectos
  ruidoBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = ruidoBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  return ctx;
}

/** Quién quiere enterarse de que el audio ya está en marcha */
const alDespertarCb = [];
/** Quién quiere enterarse de cada efecto que suena (lo usa la música para agacharse) */
let duckCb = null;

export function alDespertar(cb) {
  if (ctx) { cb(); return; }
  alDespertarCb.push(cb);
}

export function setDucker(cb) { duckCb = cb; }

/** Las muestras grabadas se ponen delante del sintetizador (ver muestras.js) */
let muestrasFn = null;
export function setMuestras(fn) { muestrasFn = fn; }
export function canalEfectos() { return busEfectos; }

export function init() {
  if (listo) return;
  listo = true;
  cargarAjustes();
  const arrancar = () => {
    const nuevo = !ctx;
    despertar();
    if (nuevo && ctx) { while (alDespertarCb.length) alDespertarCb.shift()(); }
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(ev, arrancar, { once: false, passive: true });
  }
}

export function setVolumen(cual, valor) {
  const v = Math.min(1, Math.max(0, valor));
  vol[cual] = v;
  if (ctx) {
    if (cual === "maestro") maestro.gain.value = vol.mudo ? 0 : v;
    if (cual === "efectos") busEfectos.gain.value = v;
    if (cual === "musica") busMusica.gain.value = v;
  }
  guardarAjustes();
}

export function setMudo(m) {
  vol.mudo = !!m;
  if (ctx) maestro.gain.value = vol.mudo ? 0 : vol.maestro;
  guardarAjustes();
}

/** El bus de música, para que lo use la tanda de música */
export function canalMusica() { return busMusica; }
export function contexto() { return ctx; }

// ======================================================================
// Herramientas de síntesis
// ======================================================================
const ahora = () => ctx.currentTime;

/** Envolvente percusiva: sube de golpe y cae exponencial */
function golpe(param, pico, ataque, caida, t = ahora()) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0001, pico), t + ataque);
  param.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
}

/** Un oscilador suelto con su envolvente, conectado al bus de efectos */
function tono({ tipo = "sine", f0, f1, dur, pico = 0.3, ataque = 0.004, destino = null, t = ahora() }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  golpe(g.gain, pico, ataque, dur - ataque, t);
  o.connect(g);
  g.connect(destino || busEfectos);
  o.start(t);
  o.stop(t + dur + 0.05);
  return { o, g };
}

/** Una ráfaga de ruido filtrada: la base de casi todos los golpes */
function ruido({ dur, pico = 0.3, tipo = "bandpass", f0 = 1200, f1 = null, q = 1.2, ataque = 0.002, destino = null, t = ahora() }) {
  const s = ctx.createBufferSource();
  s.buffer = ruidoBuffer;
  s.loop = true;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;

  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) filtro.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  filtro.Q.value = q;

  const g = ctx.createGain();
  golpe(g.gain, pico, ataque, dur - ataque, t);

  s.connect(filtro);
  filtro.connect(g);
  g.connect(destino || busEfectos);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
  return { s, filtro, g };
}

/**
 * Timbre metálico: varias parciales que NO son armónicas entre sí. Es lo que
 * separa un gong o una espada de una nota de flauta.
 */
function metal({ base, dur, pico = 0.18, razones = [1, 1.47, 2.09, 2.76, 3.41], t = ahora() }) {
  for (const r of razones) {
    tono({ tipo: "sine", f0: base * r, dur: dur * (1 - (r - 1) * 0.12), pico: pico / r, ataque: 0.001, t });
  }
}

/**
 * Timbre de campana: parciales armónicas (al revés que `metal`), ataque corto
 * y cola larga. Es lo que usa todo lo bueno: curar, cobrar, subir de era.
 */
function campana({ base, dur, pico = 0.14, t = ahora() }) {
  for (const [r, g] of [[1, 1], [2, 0.5], [3, 0.28], [4.2, 0.14]]) {
    tono({ tipo: "sine", f0: base * r, dur: dur * (1 - (r - 1) * 0.1), pico: pico * g, ataque: 0.004, t });
  }
}

/**
 * Trompa: un diente de sierra filtrado que abre despacio. Para las fanfarrias
 * de era, de victoria y de reclutamiento.
 */
function trompa({ f, dur, pico = 0.16, t = ahora() }) {
  const o = ctx.createOscillator();
  const f1 = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(f, t);
  f1.type = "lowpass";
  f1.frequency.setValueAtTime(f * 2, t);
  f1.frequency.linearRampToValueAtTime(f * 6, t + dur * 0.4);
  f1.Q.value = 1;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(pico, t + 0.05);
  g.gain.setValueAtTime(pico, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f1); f1.connect(g); g.connect(busEfectos);
  o.start(t); o.stop(t + dur + 0.05);
}

/** Notas de la escala frigia sobre La, que es la que suena a griego antiguo */
const FRIGIA = [220, 233.1, 277.2, 311.1, 329.6, 349.2, 415.3, 440];

const azar = (a, b) => a + Math.random() * (b - a);

// ======================================================================
// Los sonidos
// ======================================================================
const SONIDOS = {
  // ---------- combate cuerpo a cuerpo ----------
  espada() {
    const t = ahora();
    // el filo: chasquido agudo de ruido
    ruido({ dur: 0.1, pico: 0.42, f0: azar(4200, 6000), f1: 1800, q: 1.4, t });
    // el acero: parciales inarmónicas que resuenan un momento
    metal({ base: azar(950, 1250), dur: 0.42, pico: 0.14, t: t + 0.006 });
    // el cuerpo del impacto
    tono({ tipo: "triangle", f0: azar(150, 190), f1: 70, dur: 0.14, pico: 0.3, t });
  },

  lanza() {
    const t = ahora();
    ruido({ dur: 0.07, pico: 0.3, f0: azar(2600, 3400), f1: 1200, q: 2, t });
    tono({ tipo: "triangle", f0: azar(190, 230), f1: 90, dur: 0.16, pico: 0.34, t });
    metal({ base: azar(700, 820), dur: 0.2, pico: 0.07, t: t + 0.01 });
  },

  // ---------- tiro ----------
  flecha() {
    const t = ahora();
    // la cuerda al soltarse
    tono({ tipo: "sawtooth", f0: 320, f1: 110, dur: 0.07, pico: 0.34, t });
    // el silbido del asta, que se aleja
    ruido({ dur: 0.3, pico: 0.42, f0: 1100, f1: 3600, q: 3.5, ataque: 0.04, t: t + 0.02 });
  },

  honda() {
    const t = ahora();
    // el volteo: el filtro sube y baja como algo que gira
    ruido({ dur: 0.26, pico: 0.5, f0: 500, f1: 2600, q: 5, ataque: 0.1, t });
    tono({ tipo: "sine", f0: 900, f1: 260, dur: 0.12, pico: 0.22, t: t + 0.2 });
  },

  catapulta() {
    const t = ahora();
    // la madera que cruje al tensarse
    tono({ tipo: "sawtooth", f0: 90, f1: 42, dur: 0.3, pico: 0.2, ataque: 0.08, t });
    // el brazo al soltar
    ruido({ dur: 0.18, pico: 0.42, f0: 900, f1: 180, q: 0.8, t: t + 0.22 });
    tono({ tipo: "triangle", f0: 120, f1: 48, dur: 0.34, pico: 0.4, t: t + 0.22 });
  },

  // ---------- carros ----------
  carro() {
    const t = ahora();
    // el traqueteo: golpecitos de madera repetidos
    for (let i = 0; i < 5; i++) {
      ruido({ dur: 0.05, pico: 0.3, f0: azar(700, 1100), q: 3, t: t + i * 0.055 });
    }
    tono({ tipo: "triangle", f0: 70, f1: 55, dur: 0.3, pico: 0.24, ataque: 0.05, t });
  },

  // ---------- recibir daño ----------
  impacto() {
    const t = ahora();
    tono({ tipo: "sine", f0: azar(130, 165), f1: 55, dur: 0.18, pico: 0.38, t });
    ruido({ dur: 0.09, pico: 0.2, tipo: "lowpass", f0: 900, f1: 260, q: 0.7, t });
  },

  muerte() {
    const t = ahora();
    // el desplome: todo cae de tono a la vez
    tono({ tipo: "triangle", f0: 230, f1: 60, dur: 0.5, pico: 0.3, ataque: 0.01, t });
    ruido({ dur: 0.45, pico: 0.22, tipo: "lowpass", f0: 1400, f1: 180, q: 0.6, ataque: 0.01, t });
    metal({ base: 420, dur: 0.3, pico: 0.05, t: t + 0.04 });
  },

  derrumbe() {
    const t = ahora();
    ruido({ dur: 0.8, pico: 0.6, tipo: "lowpass", f0: 1800, f1: 90, q: 0.5, ataque: 0.02, t });
    tono({ tipo: "triangle", f0: 85, f1: 34, dur: 0.75, pico: 0.5, ataque: 0.02, t });
    for (let i = 0; i < 7; i++) {
      ruido({ dur: 0.07, pico: 0.1, f0: azar(400, 1400), q: 2.5, t: t + 0.1 + Math.random() * 0.5 });
    }
  },

  // ---------- movimiento ----------
  paso() {
    const t = ahora();
    ruido({ dur: 0.05, pico: 0.1, tipo: "lowpass", f0: 700, f1: 240, q: 0.8, t });
    tono({ tipo: "sine", f0: azar(95, 125), f1: 60, dur: 0.07, pico: 0.09, t });
  },

  remo() {
    const t = ahora();
    ruido({ dur: 0.24, pico: 0.3, tipo: "lowpass", f0: 900, f1: 300, q: 0.7, ataque: 0.07, t });
    tono({ tipo: "sine", f0: 150, f1: 90, dur: 0.2, pico: 0.18, ataque: 0.05, t });
  },

  // ---------- cursor e interfaz mínima ----------
  cursor() {
    tono({ tipo: "triangle", f0: 1750, dur: 0.035, pico: 0.07, ataque: 0.001 });
  },

  seleccion() {
    const t = ahora();
    tono({ tipo: "triangle", f0: 760, dur: 0.05, pico: 0.14, t });
    tono({ tipo: "triangle", f0: 1140, dur: 0.1, pico: 0.12, t: t + 0.04 });
  },

  negado() {
    const t = ahora();
    tono({ tipo: "square", f0: 190, f1: 130, dur: 0.11, pico: 0.1, t });
  },

  // ---------- construir y producir ----------
  construir() {
    const t = ahora();
    // tres martillazos sobre madera
    for (let i = 0; i < 3; i++) {
      ruido({ dur: 0.06, pico: 0.26, f0: azar(800, 1200), q: 2.5, t: t + i * 0.11 });
      tono({ tipo: "triangle", f0: azar(140, 180), f1: 80, dur: 0.09, pico: 0.2, t: t + i * 0.11 });
    }
  },

  obraLista() {
    const t = ahora();
    campana({ base: FRIGIA[4], dur: 0.5, pico: 0.14, t });
    campana({ base: FRIGIA[7], dur: 0.6, pico: 0.12, t: t + 0.11 });
  },

  reclutar() {
    const t = ahora();
    trompa({ f: FRIGIA[0], dur: 0.2, pico: 0.14, t });
    trompa({ f: FRIGIA[4], dur: 0.3, pico: 0.14, t: t + 0.13 });
  },

  captura() {
    const t = ahora();
    // la trompa que anuncia que la aldea cambia de manos
    trompa({ f: FRIGIA[0], dur: 0.26, pico: 0.17, t });
    trompa({ f: FRIGIA[3], dur: 0.26, pico: 0.16, t: t + 0.16 });
    trompa({ f: FRIGIA[7], dur: 0.42, pico: 0.18, t: t + 0.32 });
    ruido({ dur: 0.2, pico: 0.1, tipo: "lowpass", f0: 600, f1: 200, q: 0.7, t });
  },

  moneda() {
    const t = ahora();
    for (let i = 0; i < 3; i++) {
      metal({ base: azar(2200, 3200), dur: 0.2, pico: 0.07, razones: [1, 1.63, 2.41], t: t + i * 0.055 });
    }
  },

  era() {
    const t = ahora();
    // fanfarria de cuatro notas y un parche grave debajo
    [0, 3, 4, 7].forEach((n, i) => trompa({ f: FRIGIA[n], dur: i === 3 ? 0.75 : 0.26, pico: 0.26, t: t + i * 0.19 }));
    tono({ tipo: "sine", f0: 70, f1: 46, dur: 0.6, pico: 0.42, t });
    ruido({ dur: 0.5, pico: 0.12, tipo: "lowpass", f0: 400, f1: 120, q: 0.6, t });
  },

  investigar() {
    const t = ahora();
    [0, 2, 4].forEach((n, i) => campana({ base: FRIGIA[n] * 2, dur: 0.4, pico: 0.1, t: t + i * 0.085 }));
  },

  // ---------- apoyo ----------
  curar() {
    const t = ahora();
    campana({ base: FRIGIA[4], dur: 0.55, pico: 0.12, t });
    campana({ base: FRIGIA[7], dur: 0.7, pico: 0.1, t: t + 0.09 });
    ruido({ dur: 0.45, pico: 0.05, tipo: "bandpass", f0: 2600, f1: 5200, q: 6, ataque: 0.2, t });
  },

  poder() {
    const t = ahora();
    // un soplo que sube y un golpe seco al final
    ruido({ dur: 0.38, pico: 0.3, f0: 300, f1: 4200, q: 2, ataque: 0.26, t });
    tono({ tipo: "sawtooth", f0: 110, f1: 330, dur: 0.3, pico: 0.14, ataque: 0.2, t });
    tono({ tipo: "triangle", f0: 160, f1: 55, dur: 0.4, pico: 0.38, t: t + 0.32 });
    metal({ base: 620, dur: 0.5, pico: 0.1, t: t + 0.32 });
  },

  convertir() {
    const t = ahora();
    // un glissando raro, de los que dan mal rollo
    tono({ tipo: "sine", f0: 300, f1: 900, dur: 0.5, pico: 0.1, ataque: 0.12, t });
    tono({ tipo: "sine", f0: 317, f1: 880, dur: 0.5, pico: 0.09, ataque: 0.12, t: t + 0.03 });
    campana({ base: FRIGIA[6] * 2, dur: 0.5, pico: 0.08, t: t + 0.4 });
  },

  reliquia() {
    const t = ahora();
    [0, 4, 7, 11].forEach((n, i) => campana({ base: FRIGIA[n % 8] * (n > 7 ? 4 : 2), dur: 0.8, pico: 0.09, t: t + i * 0.07 }));
  },

  // ---------- naves ----------
  embarcar() {
    const t = ahora();
    ruido({ dur: 0.35, pico: 0.3, tipo: "lowpass", f0: 2600, f1: 300, q: 0.8, t });
    tono({ tipo: "sine", f0: 420, f1: 130, dur: 0.22, pico: 0.1, t: t + 0.05 });
  },

  desembarcar() {
    const t = ahora();
    ruido({ dur: 0.3, pico: 0.46, tipo: "lowpass", f0: 900, f1: 2200, q: 0.9, ataque: 0.05, t });
    for (let i = 0; i < 2; i++) {
      ruido({ dur: 0.07, pico: 0.24, tipo: "lowpass", f0: 700, f1: 240, q: 0.8, t: t + 0.22 + i * 0.1 });
    }
  },

  // ---------- interfaz ----------
  menuAbrir() {
    const t = ahora();
    ruido({ dur: 0.05, pico: 0.1, f0: 1400, q: 3, t });
    tono({ tipo: "triangle", f0: 520, f1: 880, dur: 0.1, pico: 0.12, t });
  },

  menuCerrar() {
    const t = ahora();
    tono({ tipo: "triangle", f0: 760, f1: 420, dur: 0.1, pico: 0.1, t });
  },

  boton() {
    const t = ahora();
    ruido({ dur: 0.035, pico: 0.14, f0: 2200, q: 2.5, t });
    tono({ tipo: "triangle", f0: 620, dur: 0.05, pico: 0.1, t });
  },

  // ---------- el día ----------
  turno() {
    const t = ahora();
    campana({ base: FRIGIA[0], dur: 0.9, pico: 0.13, t });
    campana({ base: FRIGIA[4], dur: 0.7, pico: 0.09, t: t + 0.13 });
  },

  finDia() {
    const t = ahora();
    tono({ tipo: "sine", f0: 90, f1: 55, dur: 0.5, pico: 0.3, t });
    ruido({ dur: 0.4, pico: 0.1, tipo: "lowpass", f0: 500, f1: 150, q: 0.6, t });
    trompa({ f: FRIGIA[3], dur: 0.4, pico: 0.1, t: t + 0.1 });
  },

  // ---------- final ----------
  victoria() {
    const t = ahora();
    [0, 4, 7].forEach((n, i) => trompa({ f: FRIGIA[n], dur: 0.9 - i * 0.12, pico: 0.17, t: t + i * 0.17 }));
    trompa({ f: FRIGIA[7] * 2, dur: 1.4, pico: 0.15, t: t + 0.52 });
    campana({ base: FRIGIA[7] * 2, dur: 1.6, pico: 0.1, t: t + 0.52 });
    tono({ tipo: "sine", f0: 73, dur: 1.4, pico: 0.26, ataque: 0.02, t });
  },

  derrota() {
    const t = ahora();
    [7, 4, 3, 0].forEach((n, i) => trompa({ f: FRIGIA[n] / 2, dur: i === 3 ? 1.5 : 0.4, pico: 0.15, t: t + i * 0.28 }));
    tono({ tipo: "sine", f0: 66, f1: 40, dur: 1.6, pico: 0.3, ataque: 0.05, t: t + 0.84 });
    ruido({ dur: 1.2, pico: 0.08, tipo: "lowpass", f0: 600, f1: 90, q: 0.5, ataque: 0.1, t: t + 0.84 });
  }
};

/** Cada cuánto, como mucho, puede repetirse un sonido (en ms) */
const ESPERA = {
  cursor: 35, paso: 70, impacto: 40, espada: 50, lanza: 50,
  flecha: 60, honda: 60, carro: 90, remo: 90,
  moneda: 200, curar: 120, construir: 150, boton: 60, reclutar: 150
};

/**
 * Dispara un efecto por su nombre. Si el audio todavía no está despierto o el
 * nombre no existe, no hace nada: nunca debe tirar la partida por un sonido.
 */
export function play(nombre, { fuerza = 1 } = {}) {
  if (!ctx || vol.mudo || !(SONIDOS[nombre] || muestrasFn)) return;
  const espera = ESPERA[nombre];
  if (espera) {
    const t = performance.now();
    if (t - (ultimaVez.get(nombre) || -1e9) < espera) return;
    ultimaVez.set(nombre, t);
  }
  try {
    // si hay grabación para esto, suena la grabación; si no, el sintetizador
    if (!(muestrasFn && muestrasFn(nombre))) {
      const g = busEfectos.gain.value;
      if (fuerza !== 1) busEfectos.gain.value = g * fuerza;
      SONIDOS[nombre]();
      if (fuerza !== 1) busEfectos.gain.value = g;
    }
    if (duckCb) duckCb(nombre);
  } catch { /* un efecto nunca puede romper el juego */ }
}

/** Nombres disponibles, para probarlos desde la consola */
export function lista() { return Object.keys(SONIDOS); }

/**
 * Engancha un analizador a la salida de efectos. Es para comprobar desde la
 * consola que un sonido suena de verdad y a qué nivel, sin tener que oírlo.
 */
export function medidor() {
  if (!ctx) return null;
  const a = ctx.createAnalyser();
  a.fftSize = 2048;
  busEfectos.connect(a);
  return a;
}

/**
 * Qué sonido le toca a una unidad según lo que es. Lo usa main.js al recibir
 * los eventos de combate, para no repartir nombres por todo el código.
 */
export function sonidoDeAtaque(template) {
  if (!template) return "espada";
  const cat = template.category;
  const alcance = template.range || 1;
  if (cat === "siege") return "catapulta";
  if (cat === "chariot") return "carro";
  if (cat === "skirmish") return "honda";
  if (alcance > 1 || cat === "ranged") return "flecha";
  if (cat === "spear") return "lanza";
  return "espada";
}

export function sonidoDeMovimiento(template) {
  if (!template) return "paso";
  if (template.abilities?.includes("naval")) return "remo";
  if (template.category === "chariot") return "carro";
  return "paso";
}
