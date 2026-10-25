/**
 * muestras.js — los sonidos grabados, todos de dominio público.
 * -----------------------------------------------------------------------
 * Para los golpes, los pasos y el agua, una grabación de verdad le gana a
 * cualquier oscilador. Este módulo carga esas muestras y se pone por delante
 * del sintetizador: si un sonido tiene archivo, suena el archivo; si no lo
 * tiene, o si todavía no ha terminado de cargar, suena el sintetizado.
 *
 * Nada de esto es mío ni suyo: todo es CC0 (dominio público), sin obligación
 * de citar a nadie. La procedencia de cada archivo está en CREDITOS.md.
 *
 * Los sonidos musicales (era, victoria, derrota, turno…) NO llevan muestra a
 * propósito: los sintetizados están afinados en el mismo modo frigio que la
 * música, y una fanfarria grabada en otra tonalidad chocaría con ella.
 */
import * as sfx from "./sfx.js";

// relativo a ESTE módulo, no a la página: así vale igual desde el juego
// (que está en la raíz) que desde audio/prueba.html
const RUTA = new URL("./muestras/", import.meta.url).href;

/**
 * Qué archivo suena para cada cosa. Si hay varios, se elige uno al azar cada
 * vez, que es lo que evita que veinte espadazos seguidos suenen clonados.
 * `g` es el volumen con el que se iguala al resto de la mezcla.
 */
export const MAPA = {
  espada:      { g: 1.25,  v: ["espada-1.ogg", "espada-2.ogg", "espada-3.ogg"] },
  lanza:       { g: 1.05, v: ["lanza-1.ogg", "lanza-2.ogg"] },
  flecha:      { g: 0.85,  v: ["flecha-1.wav", "flecha-2.wav", "flecha-3.wav"] },
  honda:       { g: 0.8,  v: ["honda-1.wav", "honda-2.wav", "honda-3.wav"] },
  catapulta:   { g: 1.5,  v: ["catapulta-1.ogg", "catapulta-2.ogg"] },
  impacto:     { g: 0.95,  v: ["impacto-1.ogg", "impacto-2.ogg", "impacto-3.ogg", "impacto-4.ogg"] },
  muerte:      { g: 1.1,  v: ["muerte-1.ogg", "muerte-2.ogg", "muerte-3.ogg"] },
  derrumbe:    { g: 1.6,  v: ["derrumbe-1.ogg", "derrumbe-2.ogg", "derrumbe-3.ogg"] },
  paso:        { g: 0.5, v: ["paso-1.ogg", "paso-2.ogg", "paso-3.ogg", "paso-4.ogg", "paso-5.ogg", "paso-6.ogg"] },
  remo:        { g: 0.5,  v: ["remo-1.ogg", "remo-2.ogg", "remo-3.ogg"] },
  embarcar:    { g: 0.55,  v: ["embarcar-1.ogg", "embarcar-2.ogg", "embarcar-3.ogg"] },
  desembarcar: { g: 0.6,  v: ["desembarcar-1.ogg", "desembarcar-2.ogg", "desembarcar-3.ogg"] },
  construir:   { g: 0.75,  v: ["construir-1.ogg", "construir-2.ogg", "construir-3.ogg"] },
  moneda:      { g: 0.85,  v: ["moneda-1.ogg", "moneda-2.ogg"] },
  cursor:      { g: 0.16, v: ["cursor-1.ogg"] },
  seleccion:   { g: 0.22,  v: ["seleccion-1.ogg"] },
  negado:      { g: 0.28,  v: ["negado-1.ogg"] },
  menuAbrir:   { g: 0.26,  v: ["menuAbrir-1.ogg"] },
  menuCerrar:  { g: 0.26,  v: ["menuCerrar-1.ogg"] },
  boton:       { g: 0.2, v: ["boton-1.ogg"] },
  finDia:      { g: 0.5,  v: ["finDia-1.ogg"] },
  obraLista:   { g: 0.4,  v: ["obraLista-1.ogg"] },
  convertir:   { g: 0.45,  v: ["convertir-1.ogg"] }
};

let ctx = null, bus = null;
const buffers = new Map();        // archivo -> AudioBuffer
let cargando = false;
let usar = true;                  // se puede apagar para oír los sintetizados

/** Carga y descodifica todas las muestras. Lo que falle se queda sin ellas. */
export async function cargar() {
  if (cargando) return;
  cargando = true;
  ctx = sfx.contexto();
  bus = sfx.canalEfectos();
  if (!ctx || !bus) { cargando = false; return; }

  const archivos = [...new Set(Object.values(MAPA).flatMap(m => m.v))];
  await Promise.all(archivos.map(async f => {
    try {
      const r = await fetch(RUTA + f);
      if (!r.ok) return;
      buffers.set(f, await ctx.decodeAudioData(await r.arrayBuffer()));
    } catch { /* si una muestra no carga, ese sonido se queda sintetizado */ }
  }));
  sfx.setMuestras(tocar);
}

/**
 * Intenta tocar un sonido con muestra.
 * @returns {boolean} true si lo tocó; false para que lo coja el sintetizador.
 */
export function tocar(nombre) {
  if (!usar || !ctx || !bus) return false;
  const m = MAPA[nombre];
  if (!m) return false;
  const cargadas = m.v.filter(f => buffers.has(f));
  if (!cargadas.length) return false;

  const src = ctx.createBufferSource();
  src.buffer = buffers.get(cargadas[Math.floor(Math.random() * cargadas.length)]);
  // un pelín de variación de tono: dos golpes nunca son idénticos
  src.playbackRate.value = 0.94 + Math.random() * 0.12;

  const g = ctx.createGain();
  g.gain.value = m.g;
  src.connect(g);
  g.connect(bus);
  src.start();
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* ya */ } };
  return true;
}

/** Para comparar: apaga o enciende las muestras y deja al sintetizador */
export function usarMuestras(si) { usar = !!si; }
export function activas() { return usar; }
export function cuantasCargadas() { return buffers.size; }
export function conMuestra(nombre) { return !!MAPA[nombre] && MAPA[nombre].v.some(f => buffers.has(f)); }
