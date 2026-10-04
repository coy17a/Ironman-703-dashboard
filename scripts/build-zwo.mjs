import fs from "node:fs";
import path from "node:path";

/**
 * Build Zwift/MyWhoosh .zwo workout files from structured definitions.
 * Power is expressed as fraction of FTP, so the files work regardless of
 * the athlete's current FTP — the app scales them automatically.
 *
 * Usage: node build-zwo.mjs [output-dir]
 */
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stepXml(s) {
  if (s.type === "warmup")
    return `    <Warmup Duration="${s.duration}" PowerLow="${s.powerLow}" PowerHigh="${s.powerHigh}" Cadence="${s.cadence}"/>\n`;
  if (s.type === "cooldown")
    return `    <Cooldown Duration="${s.duration}" PowerLow="${s.powerLow}" PowerHigh="${s.powerHigh}"/>\n`;
  if (s.type === "steady")
    return `    <SteadyState Duration="${s.duration}" Power="${s.power}" Cadence="${s.cadence}"/>\n`;
  if (s.type === "intervals")
    return `    <IntervalsT Repeat="${s.repeat}" OnDuration="${s.onDuration}" OffDuration="${s.offDuration}" OnPower="${s.onPower}" OffPower="${s.offPower}" Cadence="${s.cadence}" CadenceResting="${s.cadenceResting}"/>\n`;
  throw new Error("unknown step type: " + s.type);
}

const workouts = [
  {
    file: "2026-10-06-bike-muscular-force-4x6min.zwo",
    name: "Bike - Muscular Force 4x6min",
    description:
      "Friel Base 1 muscular force. Warm up easy, then 4x6 min big-gear low-cadence intervals seated. Smooth pedal pressure, no bouncing.",
    steps: [
      { type: "warmup", duration: 600, powerLow: 0.5, powerHigh: 0.6, cadence: 90 },
      {
        type: "intervals", repeat: 4,
        onDuration: 360, offDuration: 240,
        onPower: 0.79, offPower: 0.5,
        cadence: 60, cadenceResting: 90,
      },
      { type: "cooldown", duration: 600, powerLow: 0.5, powerHigh: 0.5 },
    ],
  },
  {
    file: "2026-10-10-bike-aerobic-endurance-80min.zwo",
    name: "Bike - Aerobic Endurance 80min",
    description:
      "Friel Base 1 cornerstone: 80 min steady aerobic. Stay in zone, finish feeling like you could keep going.",
    steps: [{ type: "steady", duration: 4800, power: 0.66, cadence: 90 }],
  },
];

const outDir = process.argv[2] || ".";
for (const w of workouts) {
  const xml =
    `<workout_file>\n` +
    `  <author>Robotina</author>\n` +
    `  <name>${esc(w.name)}</name>\n` +
    `  <description>${esc(w.description)}</description>\n` +
    `  <sportType>bike</sportType>\n` +
    `  <tags><tag name="70.3"/></tags>\n` +
    `  <workout>\n` +
    w.steps.map(stepXml).join("") +
    `  </workout>\n` +
    `</workout_file>\n`;
  const p = path.join(outDir, w.file);
  fs.writeFileSync(p, xml);
  console.log("wrote", p);
}
