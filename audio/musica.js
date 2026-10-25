/**
 * musica.js — la música del juego, tocada en vivo por el navegador.
 * -----------------------------------------------------------------------
 * No hay ningún archivo de audio: hay un reloj que va programando notas unos
 * milisegundos por delante del presente, y tres instrumentos sintetizados que
 * las tocan. Como la melodía se compone sobre la marcha, el bucle no se nota:
 * nunca vuelve exactamente al mismo sitio.
 *
 * Los instrumentos:
 *   lira    cuerda pulsada, con el método de Karplus-Strong (un chasquido de
 *           ruido metido en un retardo que se realimenta y se va apagando)
 *   aulos   la caña doble griega: diente de sierra filtrado, con vibrato
 *   tambor  parche grave con un golpe de ruido encima
 *   bordón  la nota tenida de debajo, que sostiene todo
 *
 * La escala es FRIGIA, que es el modo que el oído reconoce como griego antiguo:
 * como una menor pero con el segundo grado bajado, que es lo que le da ese
 * aire antiguo y un poco triste.
 */
import * as sfx from "./sfx.js";

// ======================================================================
// Pistas grabadas (dominio público). Es lo que suena por defecto; el
// compositor de más abajo se queda de reserva por si falta un archivo.
// ======================================================================
const RUTA = new URL("./musica/", import.meta.url).href;

/**
 * `g` iguala cada pista con el resto de la mezcla: vienen masterizadas mucho
 * más fuerte que los efectos y, sin esto, un espadazo no se oiría.
 */
const PISTAS = {
  menu: [{ f: "legend.mp3", g: 0.30 }],
  // "field" es una pieza muy suave y "town" bastante más llena: cada una
  // necesita su ajuste para que las dos se oigan igual de presentes
  partida: [{ f: "field.mp3", g: 1.15 }, { f: "town.mp3", g: 0.42 }],  // se turnan
  final: [{ f: "pursuit.wav", g: 0.30 }]
};

let usarArchivos = true;
let elemento = null, fuente = null, volArchivo = null;
let pistaIdx = 0;

/** Desvanece y suelta la pista que esté sonando */
function soltarArchivo({ seg = 0.8 } = {}) {
  if (!elemento) return;
  const el = elemento, v = volArchivo, f = fuente;
  elemento = null; volArchivo = null; fuente = null;
  try {
    const t = ctx.currentTime;
    v.gain.cancelScheduledValues(t);
    v.gain.setValueAtTime(v.gain.value, t);
    v.gain.linearRampToValueAtTime(0.0001, t + seg);
  } catch { /* da igual */ }
  setTimeout(() => {
    try { el.pause(); el.src = ""; } catch { /* ya */ }
    try { f.disconnect(); v.disconnect(); } catch { /* ya */ }
  }, seg * 1000 + 120);
}

/**
 * Pone una pista de archivo. Devuelve false si no hay archivo para esa pieza,
 * y entonces se encarga el compositor.
 */
function ponerArchivo(cual) {
  const lista = PISTAS[cual];
  if (!usarArchivos || !lista || !lista.length || !ctx) return false;

  soltarArchivo();
  const pista = lista[pistaIdx++ % lista.length];
  const el = new Audio(RUTA + pista.f);
  el.loop = true;
  el.preload = "auto";
  el.crossOrigin = "anonymous";

  try {
    const f = ctx.createMediaElementSource(el);
    const v = ctx.createGain();
    v.gain.setValueAtTime(0.0001, ctx.currentTime);
    v.gain.linearRampToValueAtTime(pista.g, ctx.currentTime + 1.6);   // entra suave
    f.connect(v);
    v.connect(bus);
    elemento = el; fuente = f; volArchivo = v;
  } catch {
    return false;
  }
  el.play().catch(() => { /* si el navegador lo frena, se queda esperando */ });
  return true;
}

export function usarGrabada(si) {
  usarArchivos = !!si;
  const actual = pieza || pendiente;
  if (actual) { parar(); poner(actual); }
}

export function esGrabada() { return !!elemento; }
export function pistaSonando() { return elemento ? elemento.src.split("/").pop() : null; }

// ------------------------------------------------------------------ teoría
const FRIGIA = [0, 1, 3, 5, 7, 8, 10];        // semitonos del modo
const LA2 = 110;                               // la nota de abajo del todo
const nota = (grado, octava = 0) => {
  const i = ((grado % 7) + 7) % 7;
  const salto = Math.floor(grado / 7) + octava;
  return LA2 * Math.pow(2, (FRIGIA[i] + salto * 12) / 12);
};

// ------------------------------------------------------------------ estado
let ctx = null, bus = null, salida = null;
let reloj = null;
let paso = 0, siguiente = 0;
let pieza = null, pendiente = null;
let vivos = [];                                // nodos que hay que limpiar

const MIRA = 0.25;                             // cuánto se programa por delante
const TICK = 60;                               // cada cuánto mira el reloj (ms)

/** Compases de cada pieza: tempo, densidad y carácter */
const PIEZAS = {
  menu: { bpm: 66, volumen: 1.0, tambor: [0, 6], densidadLira: 0.85, aulos: 0.5 },
  partida: { bpm: 52, volumen: 0.52, tambor: [0], densidadLira: 0.4, aulos: 0.14 },
  final: { bpm: 60, volumen: 0.85, tambor: [0, 4, 6], densidadLira: 0.7, aulos: 0.6 }
};

// progresión de ocho compases: los grados sobre los que se apoya cada uno
const PROGRESION = [0, 0, 5, 5, 3, 3, 1, 0];

const azar = (a, b) => a + Math.random() * (b - a);
const dado = p => Math.random() < p;
const elige = lista => lista[Math.floor(Math.random() * lista.length)];

// ------------------------------------------------------------- instrumentos
/**
 * Cuerda pulsada. Un chasquido de ruido entra en una línea de retardo cuya
 * longitud es un periodo de la nota; al realimentarse filtrada, el ruido se
 * convierte en una cuerda que suena y se apaga sola.
 */
function lira(f, t, dur = 1.6, g = 0.18) {
  const periodo = 1 / f;
  const retardo = ctx.createDelay(0.1);
  retardo.delayTime.value = periodo;

  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = Math.min(7000, f * 9);

  const realim = ctx.createGain();
  realim.gain.setValueAtTime(0.96, t);
  realim.gain.exponentialRampToValueAtTime(0.0001, t + dur);   // así se apaga sola

  const vol = ctx.createGain();
  vol.gain.value = g;

  retardo.connect(filtro);
  filtro.connect(realim);
  realim.connect(retardo);
  retardo.connect(vol);
  vol.connect(salida);

  // la púa: un chasquido muy corto de ruido
  const pua = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * periodo), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  pua.buffer = buf;
  pua.connect(retardo);
  pua.start(t);

  limpiar([retardo, filtro, realim, vol, pua], t + dur + 0.4);
}

/** La caña: diente de sierra filtrado, entra despacio y con vibrato */
function aulos(f, t, dur = 1.2, g = 0.09) {
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  const filtro = ctx.createBiquadFilter();
  const vol = ctx.createGain();

  o.type = "sawtooth";
  o.frequency.setValueAtTime(f, t);
  lfo.type = "sine";
  lfo.frequency.value = azar(4.5, 5.8);
  lfoG.gain.value = f * 0.012;                 // vibrato suave
  lfo.connect(lfoG); lfoG.connect(o.frequency);

  filtro.type = "lowpass";
  filtro.frequency.setValueAtTime(f * 2, t);
  filtro.frequency.linearRampToValueAtTime(f * 5, t + dur * 0.35);
  filtro.Q.value = 2;

  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(g, t + dur * 0.28);
  vol.gain.setValueAtTime(g, t + dur * 0.62);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(filtro); filtro.connect(vol); vol.connect(salida);
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  limpiar([o, lfo, lfoG, filtro, vol], t + dur + 0.2);
}

/** Parche grave con un golpe de piel encima */
function tambor(t, g = 0.22) {
  const o = ctx.createOscillator();
  const vo = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(96, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.18);
  vo.gain.setValueAtTime(0.0001, t);
  vo.gain.exponentialRampToValueAtTime(g, t + 0.006);
  vo.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(vo); vo.connect(salida);
  o.start(t); o.stop(t + 0.35);

  const n = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 1400;
  const vn = ctx.createGain(); vn.gain.value = g * 0.4;
  n.connect(f); f.connect(vn); vn.connect(salida);
  n.start(t);

  limpiar([o, vo, n, f, vn], t + 0.5);
}

/** La nota tenida de abajo. Se queda sonando hasta que se para la pieza. */
let bordonNodos = null;
function ponerBordon(f) {
  quitarBordon();
  const t = ctx.currentTime;
  const nodos = [];
  const vol = ctx.createGain();
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(0.06, t + 2.5);
  vol.connect(salida);
  nodos.push(vol);
  // la fundamental y su quinta, un poco desafinadas entre sí para que respire
  for (const [mult, det] of [[1, 0], [1.5, 1.6], [2, -2.1]]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f * mult;
    o.detune.value = det;
    const g = ctx.createGain();
    g.gain.value = mult === 1 ? 1 : 0.4;
    o.connect(g); g.connect(vol);
    o.start(t);
    nodos.push(o, g);
  }
  bordonNodos = { nodos, vol };
}

function quitarBordon() {
  if (!bordonNodos) return;
  const { nodos, vol } = bordonNodos;
  bordonNodos = null;
  const t = ctx.currentTime;
  try { vol.gain.cancelScheduledValues(t); vol.gain.setValueAtTime(vol.gain.value, t); vol.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); } catch { /* ya estaba */ }
  limpiar(nodos, t + 1.5, true);
}

/** Desconecta nodos cuando ya no suenan, para no dejar basura colgando */
function limpiar(nodos, cuando, parar = false) {
  const espera = Math.max(0, (cuando - ctx.currentTime) * 1000) + 60;
  const id = setTimeout(() => {
    for (const n of nodos) {
      try { if (parar && n.stop) n.stop(); } catch { /* ya parado */ }
      try { n.disconnect(); } catch { /* ya desconectado */ }
    }
    vivos = vivos.filter(x => x !== id);
  }, espera);
  vivos.push(id);
}

// ---------------------------------------------------------------- el reloj
/** Programa un paso de corchea */
function programar(p, t) {
  const cfg = PIEZAS[pieza];
  if (!cfg) return;
  const compas = Math.floor(p / 8) % PROGRESION.length;
  const grado = PROGRESION[compas];
  const enCompas = p % 8;

  if (enCompas === 0 && compas % PROGRESION.length === 0) ponerBordon(nota(0, -1));

  // tambor en los pulsos que marca la pieza
  if (cfg.tambor.includes(enCompas)) tambor(t, enCompas === 0 ? 0.24 : 0.14);

  // la lira desgrana el acorde del compás
  if (dado(cfg.densidadLira)) {
    const opciones = [grado, grado + 2, grado + 4, grado + 7];
    const n = nota(elige(opciones), enCompas > 4 ? 1 : 0);
    lira(n, t, azar(1.3, 2.1), azar(0.12, 0.2) * cfg.volumen);
  }

  // y el aulos canta por encima, pero poco, que si no cansa
  if (enCompas % 2 === 0 && dado(cfg.aulos)) {
    const n = nota(grado + elige([0, 2, 4, 5, 7]), 1);
    aulos(n, t, azar(0.9, 1.8), azar(0.06, 0.1) * cfg.volumen);
  }
}

function tictac() {
  if (!ctx || !pieza) return;
  const cfg = PIEZAS[pieza];
  const corchea = 30 / cfg.bpm;                 // media negra
  while (siguiente < ctx.currentTime + MIRA) {
    try { programar(paso, siguiente); } catch { /* una nota perdida no para la música */ }
    siguiente += corchea;
    paso++;
  }
}

// ------------------------------------------------------------- agacharse
let duckTimer = null;
const FUERTES = new Set(["derrumbe", "victoria", "derrota", "era", "catapulta", "poder", "captura", "muerte"]);

/** Baja la música un momento cuando pasa algo importante */
function agacharse(nombre) {
  if (!bus || !FUERTES.has(nombre)) return;
  const t = ctx.currentTime;
  const normal = sfx.vol.musica;
  try {
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(normal * 0.35, t + 0.08);
  } catch { /* da igual */ }
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    if (!bus) return;
    const t2 = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(t2);
      bus.gain.setValueAtTime(bus.gain.value, t2);
      bus.gain.linearRampToValueAtTime(sfx.vol.musica, t2 + 0.9);
    } catch { /* da igual */ }
  }, 700);
}

// ------------------------------------------------------------------- API
function arrancar() {
  ctx = sfx.contexto();
  bus = sfx.canalMusica();
  if (!ctx || !bus) return false;
  if (!salida) {
    salida = ctx.createGain();
    salida.gain.value = 1;
    // una reverberación de pobre: un retardo corto realimentado, que da sala
    const eco = ctx.createDelay(1);
    eco.delayTime.value = 0.21;
    const ecoG = ctx.createGain();
    ecoG.gain.value = 0.22;
    const ecoF = ctx.createBiquadFilter();
    ecoF.type = "lowpass"; ecoF.frequency.value = 2600;
    salida.connect(eco); eco.connect(ecoF); ecoF.connect(ecoG); ecoG.connect(eco);
    ecoG.connect(bus);
    salida.connect(bus);
  }
  sfx.setDucker(agacharse);
  return true;
}

/**
 * Pone una pieza: "menu", "partida" o "final". Si el audio todavía no ha
 * despertado, se queda apuntada y empieza en cuanto el usuario toque algo.
 */
export function poner(cual) {
  if (!PIEZAS[cual]) return;
  if (pieza === cual && (reloj || elemento)) return;
  pendiente = cual;
  if (!sfx.contexto()) { sfx.alDespertar(() => poner(pendiente)); return; }
  if (!arrancar()) return;
  parar({ suave: true });

  // 1) la pista grabada, que es lo que suena normalmente
  if (ponerArchivo(cual)) { pieza = cual; return; }

  // 2) y si no hay archivo, el compositor de reserva
  pieza = cual;
  paso = 0;
  siguiente = ctx.currentTime + 0.12;
  ponerBordon(nota(0, -1));
  reloj = setInterval(tictac, TICK);
  tictac();
}

export function parar({ suave = true } = {}) {
  soltarArchivo({ seg: suave ? 0.8 : 0.05 });
  clearInterval(reloj);
  reloj = null;
  pieza = null;
  if (ctx) quitarBordon();
  if (!suave) { for (const id of vivos) clearTimeout(id); vivos = []; }
}

export function sonando() { return !!reloj || !!elemento; }
export function piezaActual() { return pieza; }
