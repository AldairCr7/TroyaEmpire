import { generateMap } from "../engine/mapgen.js";
const n = 30;
for (const scenario of ["llanura", "playa"]) {
  const h = { greek: {}, trojan: {} };
  for (let i = 0; i < n; i++) {
    const m = generateMap({ scenario, size: "medium", seed: `gr-${i}` });
    for (const lado of ["greek", "trojan"]) {
      const c = m.starts[lado].camp;
      for (let y = c.y - 4; y <= c.y + 4; y++) for (let x = c.x - 4; x <= c.x + 4; x++) {
        const t = (m.terrain[y] && m.terrain[y][x]) || "FUERA";
        h[lado][t] = (h[lado][t] || 0) + 1;
      }
    }
  }
  const f = l => Object.entries(h[l]).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(" · ");
  console.log(`${scenario}\n  AQ ${f("greek")}\n  TR ${f("trojan")}`);
}
