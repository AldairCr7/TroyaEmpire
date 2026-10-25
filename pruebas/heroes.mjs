import { generateMap } from "../engine/mapgen.js";
import { Game } from "../engine/game.js";
const map = generateMap({ scenario: "llanura", size: "medium", seed: "h1" });
const g = new Game(map, { players: { greek:{control:"ai",house:"esparta"}, trojan:{control:"ai",house:"licios"} }, fog:false });
const aq = g.unitsOf("greek").find(u => u.templateId === "achilles");
const pos = { x: aq.x, y: aq.y };
console.log("era  Aquiles atq/def   mejor de línea de esa era");
const linea = { 1:["Recluta",100,100], 2:["Hoplita",150,150], 3:["Hoplita de Élite",200,200], 4:["Campeón",250,250] };
for (let era = 1; era <= 4; era++) {
  g.players.greek.era = era;
  const a = Math.round(aq.getEffectiveAttack(g.attackModifier(aq, pos, { kind:"unit", template:{ category:"infantry" } })));
  const d = Math.round(aq.getEffectiveDefense(g.defenseModifier(aq, pos, null)));
  const [n, la, ld] = linea[era];
  console.log(`  ${era}    ${String(a).padStart(3)} / ${String(d).padStart(3)}        ${n} ${la}/${ld}`);
}
