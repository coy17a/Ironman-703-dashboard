import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Shared auth: returns a valid Bearer token, minting a fresh one from the
 * long-lived cookie when the cached token is stale (>50 min old).
 * Only re-runs the password login when the cookie itself expires (weeks).
 */
const AUTH_PATH = path.join(os.homedir(), ".trainingpeaks-mcp", "auth.json");
const TOKEN_TTL_MS = 50 * 60 * 1000;

function readAuth() {
  return JSON.parse(fs.readFileSync(AUTH_PATH, "utf-8"));
}

function writeAuth(auth) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 1));
  fs.chmodSync(AUTH_PATH, 0o600);
}

export async function getToken() {
  const auth = readAuth();
  const age = Date.now() - (auth.tokenObtainedAt || 0);
  if (auth.token && age < TOKEN_TTL_MS) return auth.token;

  // Mint a fresh token from the cookie: GET /users/v3/token with Cookie header
  const res = await fetch("https://tpapi.trainingpeaks.com/users/v3/token", {
    headers: {
      Cookie: `Production_tpAuth=${auth.cookie}`,
      Accept: "application/json",
    },
  });
  if (res.status === 401) {
    throw new Error(
      "cookie expired — re-run tp-login.mjs with your TrainingPeaks password"
    );
  }
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const data = await res.json();
  if (!data.success || !data.token) throw new Error("bad token response");

  auth.token = data.token;
  auth.tokenObtainedAt = Date.now();
  writeAuth(auth);
  // keep legacy file in sync
  const legacy = path.join(os.homedir(), ".trainingpeaks-mcp", "auth-token.json");
  fs.writeFileSync(legacy, JSON.stringify({ token: data.token }));
  fs.chmodSync(legacy, 0o600);
  return data.token;
}

export async function getAthleteId(token) {
  const res = await fetch("https://tpapi.trainingpeaks.com/users/v3/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`athlete lookup failed: ${res.status}`);
  const user = await res.json();
  return user?.user?.athletes?.[0]?.athleteId ?? user?.user?.userId;
}
