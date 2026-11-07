// A phone-style demo app for the HAINIVA App channel, plus the tiny backend every
// partner runs. The backend is the only place the channel secret lives: the page
// asks it for a signed assertion, exactly as a real app asks its own server.
//
//   npm install
//   export HAINIVA_TENANT_ID=… HAINIVA_CHANNEL_ID=…   # Admin → Channels → Mobile App → Integration
//   read -s HAINIVA_APP_SECRET && export HAINIVA_APP_SECRET
//   node server.mjs            → open http://localhost:5174
//
// Optional: HAINIVA_BASE_URL (default https://channel.hainiva.com),
// DEMO_PRESET=gov|retail|office, DEMO_APP_NAME, PORT, HOST.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRESETS } from "./presets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
for (const k of ["HAINIVA_TENANT_ID", "HAINIVA_CHANNEL_ID", "HAINIVA_APP_SECRET"]) {
  if (!env[k]) { console.error(`Set ${k} first (Admin → Channels → Mobile App → your app).`); process.exit(1); }
}
const preset = PRESETS[env.DEMO_PRESET ?? "gov"];
if (!preset) { console.error(`DEMO_PRESET must be one of: ${Object.keys(PRESETS).join(", ")}`); process.exit(1); }
const CONFIG = {
  baseUrl: env.HAINIVA_BASE_URL ?? "https://channel.hainiva.com",
  tenantId: env.HAINIVA_TENANT_ID,
  channelId: env.HAINIVA_CHANNEL_ID,
  ...preset,
  appName: env.DEMO_APP_NAME ?? preset.appName,
};
const SECRET = env.HAINIVA_APP_SECRET;
const PORT = Number(env.PORT ?? 5174);
const HOST = env.HOST ?? "127.0.0.1";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
// A 2-minute, single-use assertion. A real backend signs only the user IT has
// signed in, from its own session; this demo trusts what the page sends.
function assertion({ name, phone }) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const body = b64u({
    iss: CONFIG.channelId,
    sub: `demo-${digits || "guest"}`,          // your own stable user id
    name: String(name ?? "").slice(0, 80),
    phone: digits || undefined,
    phone_verified: false,                      // this demo does not OTP-check phones
    iat: now, exp: now + 120, jti: randomUUID(),
  });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

const FILES = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/sdk.js": ["node_modules/@hainiva/app-sdk/dist/esm/index.js", "text/javascript; charset=utf-8"],
  "/livekit.js": ["node_modules/livekit-client/dist/livekit-client.umd.js", "text/javascript; charset=utf-8"],
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/config") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(CONFIG));
      return;
    }
    if (req.method === "POST" && url.pathname === "/assertion") {
      let raw = ""; for await (const c of req) raw += c;
      const user = JSON.parse(raw || "{}");
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ assertion: assertion(user) }));
      return;
    }
    const f = FILES[url.pathname];
    if (req.method === "GET" && f) {
      res.writeHead(200, { "content-type": f[1], "cache-control": "no-store" }).end(await readFile(join(here, f[0])));
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: String(err?.message ?? err) }));
  }
}).listen(PORT, HOST, () => {
  console.log(`${CONFIG.appName} demo: http://localhost:${PORT}   (channel ${CONFIG.channelId} on ${CONFIG.baseUrl})`);
});
