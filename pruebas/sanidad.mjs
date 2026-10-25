import { generateMap, SCENARIOS } from "../engine/mapgen.js";
import { Game } from "../engine/game.js";
import { CAMPAIGN } from "../data/campaign.js";

let fallos = 0;
const revisa = (etiqueta, opts) => {
  try {
    const m = generateMap(opts);
    const g = new Game(m, { players: { greek: { control: "ai", house: "esparta" }, trojan: { control: "ai", house: "licios" } }, fog: false, mods: opts.mods || {} });
    const dentro = p => p.x >= 0 && p.y >= 0 && p.x < m.width && p.y < m.height;
    const cg = g.capitals("greek")[0], ct = g.capitals("trojan")[0];
    if (!cg || !ct) throw new Error("falta un campamento");
    if (!dentro(cg) || !dentro(ct)) throw new Error("campamento fuera del mapa");
    if (g.unitsOf("greek").length < 5 || g.unitsOf("trojan").length < 5) throw new Error("ejército incompleto");
    const sep = Math.abs(cg.x - ct.x) + Math.abs(cg.y - ct.y);
    if (sep < 8) throw new Error("campamentos demasiado juntos: " + sep);
    return `ok  ${String(m.width)}x${m.height} sep ${sep}  aldeas ${(m.villages || []).length}  yac ${m.deposits.length}`;
  } catch (e) { fallos++; return "FALLA " + e.message; }
};

for (const sc of Object.keys(SCENARIOS)) {
  for (const size of ["small", "medium", "large"]) {
    for (let s = 0; s < 4; s++) {
      const r = revisa("", { scenario: sc, size, seed: `san-${s}` });
      if (r.startsWith("FALLA") || s === 0) console.log(`${sc.padEnd(10)} ${size.padEnd(7)} ${r}`);
    }
  }
}
console.log("--- capítulos de campaña ---");
for (const c of CAMPAIGN) {
  const r = revisa("", { scenario: c.scenario, size: c.size, seed: c.seed, villages: c.mods?.villages ?? null, navy: !!c.mods?.navy, villagesFar: !!c.mods?.villagesFar, mods: c.mods });
  console.log(`${c.id.padEnd(12)} ${r}`);
}
console.log(fallos ? `\n${fallos} FALLOS` : "\nsin fallos");
