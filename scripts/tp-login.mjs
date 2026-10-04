import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

/**
 * One-time TrainingPeaks login. Captures BOTH the short-lived Bearer token
 * and the long-lived Production_tpAuth cookie, so later runs can mint fresh
 * tokens without the password.
 *
 * Reads "username\npassword\n" from stdin. Credentials are used once and
 * never stored. Saves ~/.trainingpeaks-mcp/auth.json (chmod 600).
 *
 * Needs TP_PROXY_URL=http://127.0.0.1:8899 in sandboxed environments
 * (see scripts/proxy-relay.mjs).
 */
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
for await (const line of rl) lines.push(line.trim());
const [username, password] = lines;
if (!username || !password) {
  console.error("missing credentials on stdin");
  process.exit(1);
}

const proxyUrl = process.env.TP_PROXY_URL;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext(proxyUrl ? { proxy: { server: proxyUrl } } : {});
const page = await ctx.newPage();

let bearer = null;
page.on("request", (req) => {
  if (req.url().includes("tpapi.trainingpeaks.com")) {
    const h = req.headers()["authorization"];
    if (h?.startsWith("Bearer ")) bearer = h.substring(7);
  }
});

await page.goto("https://home.trainingpeaks.com/login", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('input[name="Username"]', { timeout: 30000 });
try {
  await page.locator("#onetrust-accept-btn-handler").click({ timeout: 5000 });
} catch {}
await page.fill('input[name="Username"]', username);
await page.fill('input[name="Password"]', password);
await Promise.all([
  page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(4000);

if (page.url().includes("login")) {
  const errs = await page
    .locator(".validation-summary-errors")
    .allTextContents()
    .catch(() => []);
  console.error("login failed:", JSON.stringify(errs));
  await browser.close();
  process.exit(1);
}

const cookies = await ctx.cookies();
const authCookie = cookies.find((c) => c.name === "Production_tpAuth");
await browser.close();

if (!authCookie) {
  console.error("login succeeded but no auth cookie captured");
  process.exit(1);
}

const dir = path.join(os.homedir(), ".trainingpeaks-mcp");
fs.mkdirSync(dir, { recursive: true });
const authPath = path.join(dir, "auth.json");
fs.writeFileSync(
  authPath,
  JSON.stringify(
    {
      token: bearer,
      tokenObtainedAt: Date.now(),
      cookie: authCookie.value,
      cookieObtainedAt: Date.now(),
    },
    null,
    1
  )
);
fs.chmodSync(authPath, 0o600);
// legacy single-token file kept for compatibility
fs.writeFileSync(path.join(dir, "auth-token.json"), JSON.stringify({ token: bearer }));
fs.chmodSync(path.join(dir, "auth-token.json"), 0o600);
console.log("auth saved (token + cookie)");
