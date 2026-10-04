import { getToken, getAthleteId } from "./tp-auth.mjs";

/**
 * Push a planned workout to the TrainingPeaks calendar.
 * Token auto-refreshes from the long-lived cookie when stale.
 *
 * Usage:
 *   node tp-plan-workout.mjs --date 2026-10-06 --sport Bike \
 *     --title "Endurance ride" --minutes 60 \
 *     [--description "..."] [--tss 45] [--km 30]
 *
 * Sports: Bike, Run, Swim, Strength, DayOff, Other
 */
const SPORT_TYPE_MAP = {
  Bike: [2, 2],
  Run: [3, 3],
  Swim: [1, 1],
  Strength: [7, 7],
  DayOff: [12, 12],
  Other: [10, 10],
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const date = arg("date");
const sport = arg("sport");
const title = arg("title");
const minutes = Number(arg("minutes"));
const description = arg("description");
const tss = arg("tss") !== undefined ? Number(arg("tss")) : undefined;
const km = arg("km") !== undefined ? Number(arg("km")) : undefined;

if (!date || !sport || !title || !minutes || !SPORT_TYPE_MAP[sport]) {
  console.error(
    'Usage: node tp-plan-workout.mjs --date YYYY-MM-DD --sport Bike|Run|Swim|Strength|DayOff|Other --title "..." --minutes N [--description ...] [--tss N] [--km N]'
  );
  process.exit(1);
}

const token = await getToken();
const athleteId = await getAthleteId(token);
const [familyId, typeId] = SPORT_TYPE_MAP[sport];

const payload = {
  athleteId,
  workoutDay: `${date}T00:00:00`,
  workoutTypeFamilyId: familyId,
  workoutTypeValueId: typeId,
  title,
  totalTimePlanned: minutes / 60,
};
if (description) payload.description = description;
if (km !== undefined) payload.distancePlanned = km;
if (tss !== undefined) payload.tssPlanned = tss;

const res = await fetch(
  `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }
);
const body = await res.text();
if (!res.ok) {
  console.error(`push failed (${res.status}): ${body.slice(0, 300)}`);
  process.exit(1);
}
const created = JSON.parse(body);
console.log(
  `planned: ${created.title} on ${(created.workoutDay || date).slice(0, 10)} (id ${created.workoutId})`
);
