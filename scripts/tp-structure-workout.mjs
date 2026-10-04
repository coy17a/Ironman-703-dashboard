import { getToken, getAthleteId } from "./tp-auth.mjs";
import fs from "node:fs";

/**
 * Add a structured power workout to an existing planned TrainingPeaks workout.
 *
 * Takes the simplified structure format and converts it to TrainingPeaks'
 * wire format (block offsets, polyline), replicating the community
 * trainingpeaks-mcp-server conversion. The structure is sent as a
 * JSON-encoded STRING, which is what the API expects.
 *
 * Usage:
 *   node tp-structure-workout.mjs --id 3985416224 --json '<simplified-structure>'
 *
 * Simplified format:
 * {
 *   "primaryIntensityMetric": "percentOfFtp",
 *   "steps": [
 *     {"name": "Warm Up", "duration_seconds": 600, "intensity_min": 50,
 *      "intensity_max": 60, "intensityClass": "warmUp"},
 *     {"type": "repetition", "name": "Intervals", "reps": 4, "steps": [
 *       {"name": "Hard", "duration_seconds": 360, "intensity_min": 76,
 *        "intensity_max": 82, "intensityClass": "active",
 *        "cadence_min": 55, "cadence_max": 65},
 *       {"name": "Easy", "duration_seconds": 240, "intensity_min": 50,
 *        "intensity_max": 50, "intensityClass": "rest"}
 *     ]},
 *     {"name": "Cool Down", "duration_seconds": 600, "intensity_min": 50,
 *      "intensity_max": 50, "intensityClass": "coolDown"}
 *   ]
 * }
 */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function buildStep(step, innerStep = false) {
  const targets = [];
  if (step.intensity_min !== undefined && step.intensity_max !== undefined) {
    targets.push({ minValue: step.intensity_min, maxValue: step.intensity_max });
  }
  if (step.cadence_min !== undefined && step.cadence_max !== undefined) {
    targets.push({
      minValue: step.cadence_min,
      maxValue: step.cadence_max,
      unit: "roundOrStridePerMinute",
    });
  }
  const cls = step.intensityClass ?? "active";
  const result = {
    name: step.name,
    length: { value: step.duration_seconds ?? 0, unit: "second" },
    targets,
    intensityClass: cls === "recovery" ? "rest" : cls,
    openDuration: false,
  };
  if (innerStep) result.type = "step";
  return result;
}

function buildPolyline(blocks) {
  const totalDuration = blocks.length > 0 ? blocks[blocks.length - 1].end : 0;
  if (totalDuration === 0) return [];
  let maxIntensity = 0;
  for (const block of blocks) {
    for (const step of block.steps) {
      const primary = step.targets.find((t) => !t.unit);
      if (primary && primary.maxValue > maxIntensity) maxIntensity = primary.maxValue;
    }
  }
  if (maxIntensity === 0) return [];
  const r = (n) => Math.round(n * 1000) / 1000;
  const points = [[0, 0]];
  let cursor = 0;
  for (const block of blocks) {
    const reps = block.type === "repetition" ? block.length.value : 1;
    for (let rep = 0; rep < reps; rep++) {
      for (const step of block.steps) {
        const dur = step.length.value;
        const primary = step.targets.find((t) => !t.unit);
        const y = primary ? r(primary.maxValue / maxIntensity) : 0;
        points.push([r(cursor / totalDuration), y]);
        points.push([r((cursor + dur) / totalDuration), y]);
        points.push([r((cursor + dur) / totalDuration), 0]);
        cursor += dur;
      }
    }
  }
  return points;
}

function buildWorkoutStructure(input) {
  const blocks = input.steps.map((step) => {
    if (step.type === "repetition") {
      return {
        type: "repetition",
        length: { value: step.reps ?? 1, unit: "repetition" },
        steps: (step.steps ?? []).map((s) => buildStep(s, true)),
        begin: 0,
        end: 0,
      };
    }
    return {
      type: "step",
      length: { value: 1, unit: "repetition" },
      steps: [buildStep(step, false)],
      begin: 0,
      end: 0,
    };
  });

  // compute begin/end offsets
  let cursor = 0;
  const withOffsets = blocks.map((block) => {
    const begin = cursor;
    const reps = block.type === "repetition" ? block.length.value : 1;
    const innerTotal = block.steps.reduce((s, st) => s + st.length.value, 0);
    cursor += reps * innerTotal;
    return { ...block, begin, end: cursor };
  });

  return JSON.stringify({
    structure: withOffsets,
    polyline: buildPolyline(withOffsets),
    primaryLengthMetric: "duration",
    primaryIntensityMetric: input.primaryIntensityMetric ?? "percentOfFtp",
    primaryIntensityTargetOrRange: "range",
  });
}

const workoutId = arg("id");
const rawJson = arg("json-file")
  ? fs.readFileSync(arg("json-file"), "utf-8")
  : arg("json");
if (!workoutId || !rawJson) {
  console.error(
    "Usage: node tp-structure-workout.mjs --id WORKOUT_ID (--json '<structure>' | --json-file path)"
  );
  process.exit(1);
}

const structureString = buildWorkoutStructure(JSON.parse(rawJson));

const token = await getToken();
const athleteId = await getAthleteId(token);
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

// GET the existing workout so the PUT preserves its fields
const getRes = await fetch(
  `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`,
  { headers }
);
if (!getRes.ok) throw new Error(`fetch workout failed: ${getRes.status}`);
const existing = await getRes.json();

const putRes = await fetch(
  `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`,
  {
    method: "PUT",
    headers,
    body: JSON.stringify({ ...existing, structure: structureString }),
  }
);
const body = await putRes.text();
if (!putRes.ok) {
  console.error(`update failed (${putRes.status}): ${body.slice(0, 400)}`);
  process.exit(1);
}
console.log(`structured: ${existing.title} (${workoutId})`);
