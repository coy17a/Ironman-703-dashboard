# Ironman 70.3 Dashboard — data pipeline

One-page dashboard combining **TrainingPeaks** training data, **Apple Health**
(weight, nutrition via Lose It, sleep, resting HR) and the **GLP-1** timeline
for the road to IRONMAN 70.3 Cap Cana (May 2027).

## What's here

| Path | What it is |
|---|---|
| `dashboard/index.html` | Self-contained snapshot of the dashboard (open in any browser) |
| `dashboard/data-YYYY-MM-DD.json` | The dataset behind a snapshot |
| `scripts/tp-pull.mjs` | Pulls TrainingPeaks fitness (CTL/ATL/TSB) + workouts to JSON |
| `scripts/proxy-relay.mjs` | Local proxy relay (only needed in sandboxed environments — see below) |
| `patches/auth-proxy.patch` | Patch for `trainingpeaks-mcp` so its login browser uses `TP_PROXY_URL` |

Built on the community [trainingpeaks-mcp](https://github.com/robertgregorywest/trainingpeaks-mcp)
project (used as a library, not as an MCP server).

## TrainingPeaks setup

```bash
npm i trainingpeaks-mcp
# if your environment blocks the login browser's direct egress:
patch -p1 < patches/auth-proxy.patch   # inside the trainingpeaks-mcp package

# one-time login — captures a token, password is never stored:
TP_USERNAME=<your TP login> TP_PASSWORD=<your TP password> node -e "
import('trainingpeaks-mcp').then(async ({createClient}) => {
  const c = createClient({username: process.env.TP_USERNAME, password: process.env.TP_PASSWORD});
  console.log(await c.getUser()); await c.close();
})"
# token cached at ~/.trainingpeaks-mcp/auth-token.json (chmod 600)

# pull data (no credentials needed anymore):
node scripts/tp-pull.mjs tp-data.json
```

In a sandbox where Playwright's Chromium can't use the authenticated egress
proxy directly, run the relay first and point the patched client at it:

```bash
HTTPS_PROXY=http://user:pass@proxy:3128 node scripts/proxy-relay.mjs &
TP_PROXY_URL=http://127.0.0.1:8899 node scripts/tp-pull.mjs
```

## Apple Health

Pulled with the `health-cli` companion (`--provider healthkit`):
daily body mass, body fat %, dietary energy/protein/carbs/fat (written by
Lose It), sleep sessions, resting HR. See `dashboard/data-*.json` for the shape.

## Notes

- TrainingPeaks logins are cookie/form based and can break if TP changes its site.
- This repo intentionally contains **no credentials** — only the data-pull code
  and snapshot data.
