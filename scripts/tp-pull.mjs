import { createClient } from "trainingpeaks-mcp";

/**
 * Pull TrainingPeaks fitness + workout data to JSON.
 *
 * Setup:
 *   1. npm i trainingpeaks-mcp   (then apply ../patches/auth-proxy.patch if
 *      your environment needs an egress proxy for the login browser)
 *   2. One-time login to cache the auth token:
 *        TP_USERNAME=<you> TP_PASSWORD=<you> node -e "
 *          import('trainingpeaks-mcp').then(async ({createClient}) => {
 *            const c = createClient({username: process.env.TP_USERNAME, password: process.env.TP_PASSWORD});
 *            await c.getUser(); await c.close(); console.log('token cached');
 *          })"
 *      The password is used once and never stored; the token is cached at
 *      ~/.trainingpeaks-mcp/auth-token.json (chmod 600).
 *   3. node tp-pull.mjs [output.json]
 *
 * Afterwards this script runs on the cached token — no credentials needed.
 */
const outPath = process.argv[2] || "tp-data.json";
const client = createClient({ username: "token", password: "cached" });

try {
  const end = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => {
    const d = new Date(end);
    d.setDate(d.getDate() - n);
    return fmt(d);
  };

  const [fitness, workouts, current] = await Promise.all([
    client.getFitnessData(daysAgo(90), fmt(end)),
    client.getWorkouts(daysAgo(60), fmt(end)),
    client.getCurrentFitness(),
  ]);

  const slimWorkouts = workouts
    .filter((w) => w.completedDate)
    .map((w) => ({
      date: (w.completedDate || w.workoutDay || "").slice(0, 10),
      title: w.title || "",
      sport: w.workoutType || "",
      durationMin: w.totalTime != null ? Math.round(w.totalTime * 60) : null,
      tss: w.tssActual ?? null,
      distanceKm:
        w.totalDistance != null ? Math.round(w.totalDistance / 100) / 10 : null,
      kcal: w.energy != null ? Math.round(w.energy) : null,
    }));

  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        current,
        fitnessDaily: fitness.map((f) => ({
          date: (f.date || "").slice(0, 10),
          ctl: f.ctl,
          atl: f.atl,
          tsb: f.tsb,
          tss: f.dailyTss ?? null,
        })),
        workouts: slimWorkouts,
      },
      null,
      1
    )
  );
  console.log(
    `wrote ${slimWorkouts.length} workouts, ${fitness.length} fitness days -> ${outPath}`
  );
} finally {
  await client.close();
}
