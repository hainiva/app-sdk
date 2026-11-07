// A terminal "app": sign in, pick a destination, chat. Node 22+ (global WebSocket).
//   HAINIVA_BASE=https://channel.stg.hainiva.com HAINIVA_TENANT=… HAINIVA_CHANNEL_ID=… HAINIVA_APP_SECRET=… \
//     node node-client.mjs "vinh loc"
import { createInterface } from "node:readline/promises";
import { HainivaApp } from "../dist/index.js";
import { hainivaAssertion } from "./partner-backend.mjs";

const hv = new HainivaApp({
  baseUrl: process.env.HAINIVA_BASE, tenantId: process.env.HAINIVA_TENANT, channelId: process.env.HAINIVA_CHANNEL_ID,
  platform: "other", appVersion: "node-client",
  // In a real app this is an HTTPS call to YOUR backend; here we sign locally.
  getAssertion: async () => hainivaAssertion({ id: "node-client", fullName: "Node client", phone: "0900000000" }),
  log: (e, d) => console.error(`· ${e}`, d ?? ""),
});

await hv.signIn();
const { items } = await hv.destinations({ q: process.argv[2] ?? "" });
if (!items.length) { console.log("no destination matches"); process.exit(1); }
items.slice(0, 10).forEach((d, i) => console.log(`${i + 1}. ${d.name} (${d.group ?? ""}) ${d.open === false ? "— đang đóng" : ""}`));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const pick = items[Number(await rl.question("Chọn: ")) - 1] ?? items[0];
const conv = await hv.start({ destination: pick.code, text: await rl.question("Tin nhắn đầu tiên: ") });
hv.onConnection((s) => console.error(`· socket ${s}`));
hv.subscribe(conv.conversationId, {
  message: (m) => m.from !== "me" && console.log(`\n[${m.senderName ?? m.from}] ${m.text ?? `(${m.type})`}`),
  state: (s) => console.error(`· ${s.status}${s.queuePosition ? ` — thứ tự ${s.queuePosition}` : ""}${s.agent ? ` — ${s.agent.name}` : ""}`),
});
for (;;) { const t = await rl.question(""); if (t === "/q") break; if (t.trim()) await hv.send(conv.conversationId, t); }
await hv.close(conv.conversationId); hv.disconnect(); rl.close();
