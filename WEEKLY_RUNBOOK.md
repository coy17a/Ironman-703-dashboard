# Weekly Training Loop — Runbook

Repeat every weekend for the Ironman 70.3 Cap Cana build. Standing rule:
**draft the week, Alejandro approves the specific plan, then push.**
Calendar writes never happen without his sign-off.

## 0. Environment prep

- TrainingPeaks auth lives in `~/.trainingpeaks-mcp/auth.json` (token + long-lived
  cookie, chmod 600). Scripts auto-refresh the token from the cookie.
- If the cookie expired (error says so), re-run one-time login:
  `TP_PROXY_URL=http://127.0.0.1:8899 node scripts/tp-login.mjs`
  with `username\npassword\n` on stdin (transient, never stored).
- The proxy relay (`scripts/proxy-relay.mjs`) is only needed in this sandbox:
  `HTTPS_PROXY=... node scripts/proxy-relay.mjs &` then `TP_PROXY_URL=http://127.0.0.1:8899`.
  On his PC it's not needed.

## 1. Pull fresh data

```bash
# TrainingPeaks: 90d fitness + 60d workouts (uses cached token)
cd ~/workspace/integrations/trainingpeaks-mcp
node /path/to/tp-pull.mjs /tmp/tp-data.json   # or inline equivalent

# Apple Health (weight, body fat, nutrition via Lose It, sleep, resting HR)
health-cli query metrics --provider healthkit --start-date <monday-4-weeks-ago> \
  --interval daily \
  --fields body_mass_average,body_fat_percentage,dietary_energy_sum,dietary_protein_sum,dietary_carbs_sum,dietary_fat_sum,resting_hr_average_bpm
health-cli query sessions --provider healthkit --category sleep --start-date <monday-2-weeks-ago>
```

## 2. Assess (Friel lens)

- CTL/ATL/TSB trend: is base building? TSB positive = fresh, negative = fatigued.
- Last week compliance: planned vs completed (TP `assess_compliance` or manual).
- Context: weight trend, protein vs 150 g target, sleep, GLP-1 dose day
  (weekly, day 1 was 2026-09-28 — avoid the hardest session on dose day if nausea-prone).
- Current phase: **Base 1** (aerobic endurance + muscular force + skills, no anaerobic
  work). Mesocycle: 3 build weeks + 1 recovery week. Reassess phase as race nears.

## 3. Draft the week

Template (adjust to his life that week):
- Mon / Wed / Fri: Strength - Full Body (55 min, plan-8 week targets from lift tracker)
- Tue: Bike intervals, power-based %FTP (TrainerRoad/Zwift style)
- Thu: Run aerobic + strides
- Sat: Bike aerobic endurance (longer)
- Sun: rest

Constraints:
- Bike intervals in **%FTP, never absolute watts** (his standing preference).
- Cardio TSS ~150–200/week while in GLP-1 calorie deficit; scale with CTL.
- Swim only if he confirms pool access that week (none since 2023–2026 gap).
- Strength targets come from the lift-target tracker, not invented.

## 4. Present the plan, get approval

Show the sessions (day, sport, title, duration, TSS, key targets). Ask about
pool access and any schedule conflicts. **Do not push until he approves.**

## 5. Push to TrainingPeaks

```bash
cd ~/workspace/repo-staging/ironman-703-dashboard/scripts
node tp-plan-workout.mjs --date YYYY-MM-DD --sport Bike|Run|Swim|Strength \
  --title "..." --minutes N [--tss N] [--km N] [--description "..."]
# note the returned workout ids
```

## 6. Structure the bike workouts (%FTP power targets)

```bash
# build simplified JSON, then:
node tp-structure-workout.mjs --id <workoutId> --json-file /tmp/struct.json
# simplified format: {"primaryIntensityMetric":"percentOfFtp","steps":[
#   {"name":"Warm Up","duration_seconds":600,"intensity_min":50,"intensity_max":60,"intensityClass":"warmUp"},
#   {"type":"repetition","name":"X","reps":N,"steps":[
#     {"name":"Hard","duration_seconds":S,"intensity_min":a,"intensity_max":b,"intensityClass":"active","cadence_min":x,"cadence_max":y},
#     {"name":"Easy","duration_seconds":S,"intensity_min":c,"intensity_max":d,"intensityClass":"rest"}]},
#   {"name":"Cool Down","duration_seconds":600,"intensity_min":50,"intensity_max":50,"intensityClass":"coolDown"}]}
```

## 7. Generate .zwo files (direct training-app import)

```bash
node scripts/build-zwo.mjs workouts/
# add the new workout definitions to the workouts[] array in build-zwo.mjs first
# attach the .zwo files in chat for MyWhoosh/Zwift import
```

## 8. Refresh the dashboard

- Rebuild `dashboard/data-YYYY-MM-DD.json` from the fresh pulls.
- `artifact.edit` on slug `ironman-70-3-dashboard` with the new data + same layout spec.
- Present the updated card.

## 9. Commit

```bash
cd ~/workspace/repo-staging/ironman-703-dashboard && git add -A && git commit -m "..."
# push to his GitHub once connected
```

## Reference

- Goal: `goal_d9521cb243a3` · workspace `workspace/goals/ironman-70-3-cap-cana-dominican-republic/`
- Dashboard artifact slug: `ironman-70-3-dashboard`
- First week pushed: 2026-10-05..11 (ids 3985416224, 3985416236, 3985416274 + 3 strength)
