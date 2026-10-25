/**
 * rng.js
 * -----------------------------------------------------------------------
 * Generador pseudoaleatorio con semilla (mulberry32) + ruido de valor 2D.
 * Con la misma semilla sale exactamente el mismo mapa, así se puede
 * compartir una partida interesante pasando solo el número.
 * -----------------------------------------------------------------------
 */

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}

export class RNG {
  constructor(seed) {
    this.state = (typeof seed === "string" ? hashString(seed) : seed >>> 0) || 1;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Ruido de valor suave en 2D con varias octavas, resultado en [0,1] */
export class ValueNoise {
  constructor(rng, size = 64) {
    this.size = size;
    this.values = new Float32Array(size * size);
    for (let i = 0; i < this.values.length; i++) this.values[i] = rng.next();
  }
  _v(x, y) {
    const s = this.size;
    return this.values[((y % s + s) % s) * s + ((x % s + s) % s)];
  }
  _smooth(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this._v(x0, y0), b = this._v(x0 + 1, y0);
    const c = this._v(x0, y0 + 1), d = this._v(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  }
  get(x, y, octaves = 3, scale = 0.18) {
    let amp = 1, freq = scale, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this._smooth(x * freq + o * 17.3, y * freq + o * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

/** Hash determinista por casilla, para decorar sin guardar estado */
export function tileHash(x, y, salt = 0) {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 1103515245) >>> 0) / 4294967296;
}
