// The partner's backend: the ONLY place the channel secret lives. Your app calls
// this (authenticated with YOUR session) and passes the result to HAINIVA.
//   HAINIVA_CHANNEL_ID=… HAINIVA_APP_SECRET=… node partner-backend.mjs
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** A 2-minute, single-use assertion for the user YOU have signed in. */
export function hainivaAssertion(user, { channelId = process.env.HAINIVA_CHANNEL_ID, secret = process.env.HAINIVA_APP_SECRET } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const body = b64u({
    iss: channelId, sub: String(user.id), name: user.fullName, phone: user.phone,
    phone_verified: user.phoneVerified === true,      // only if YOU verified it (OTP)
    iat: now, exp: now + 120, jti: randomUUID(),
  });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer((req, res) => {
    // Replace with your own auth: look up the signed-in user from your session.
    const user = { id: "demo-user-1", fullName: "Nguyễn Văn A", phone: "0901234567", phoneVerified: false };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ assertion: hainivaAssertion(user) }));
  }).listen(8787, () => console.log("assertion endpoint on http://localhost:8787"));
}
