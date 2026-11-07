import { describe, it, expect, vi } from "vitest";
import { HainivaApp, backoffDelay, HainivaError } from "./index.js";

const future = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const session = (n = 1) => ({ accessToken: `acc${n}`, accessExpiresAt: future(900), refreshToken: `apr_${n}`, refreshExpiresAt: future(86400), contactId: "c1", wsUrl: "ws://x/app/v1/ws" });

/** A fake server: records calls, answers by route. */
function fakeFetch(routes: Record<string, (body: Record<string, unknown> | undefined, headers: Record<string, string>) => [number, unknown]>) {
  const calls: { method: string; path: string; body?: Record<string, unknown>; auth?: string }[] = [];
  const f = vi.fn(async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const path = url.replace(/^.*\/app\/v1/, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body, ...(init.headers["authorization"] ? { auth: init.headers["authorization"] } : {}) });
    const h = routes[`${init.method} ${path.split("?")[0]}`];
    const [status, data] = h ? h(body, init.headers) : [404, { error: "not_found" }];
    return { status, ok: status < 300, json: async () => data } as Response;
  });
  return { f: f as unknown as typeof fetch, calls };
}

/** A fake socket the test drives. */
class FakeWS {
  static all: FakeWS[] = [];
  sent: Record<string, unknown>[] = [];
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: (e: { code: number }) => void; onerror?: () => void;
  constructor(public url: string) { FakeWS.all.push(this); setTimeout(() => this.onopen?.(), 0); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close(code = 1000) { this.onclose?.({ code }); }
  push(f: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(f) }); }
}
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("session", () => {
  it("signs in with the partner's assertion and keeps the session", async () => {
    const { f, calls } = fakeFetch({ "POST /sessions": () => [201, session()] });
    const saved: string[] = [];
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => "ASSERT", fetch: f,
      store: { get: () => null, set: (v) => { saved.push(v); }, remove: () => {} } });
    const s = await hv.signIn();
    expect(s.accessToken).toBe("acc1");
    expect(calls[0]).toMatchObject({ method: "POST", path: "/sessions", body: { tenantId: "t", channelId: "ch", assertion: "ASSERT" } });
    expect(JSON.parse(saved[0]!).refreshToken).toBe("apr_1");
  });

  it("a refused token is refreshed once and the call retried", async () => {
    let n = 0;
    const { f, calls } = fakeFetch({
      "POST /sessions": () => [201, session(1)],
      "POST /sessions/refresh": () => [200, session(2)],
      "GET /destinations": (_b, h) => (h["authorization"] === "Bearer acc2" ? [200, { total: 0, groups: [], items: [] }] : (n++, [401, { error: "token_expired" }])),
    });
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => "A", fetch: f });
    await hv.signIn();
    const r = await hv.destinations();
    expect(r.total).toBe(0);
    expect(n).toBe(1);
    expect(calls.map((c) => c.path)).toEqual(["/sessions", "/destinations", "/sessions/refresh", "/destinations"]);
  });

  it("a refused refresh signs in again with a new assertion", async () => {
    let assertions = 0;
    const { f } = fakeFetch({
      "POST /sessions": () => [201, session(assertions)],
      "POST /sessions/refresh": () => [401, { error: "refresh_invalid" }],
    });
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => `A${++assertions}`, fetch: f,
      store: { get: () => JSON.stringify({ ...session(9), accessExpiresAt: future(-10) }), set: () => {}, remove: () => {} } });
    const s = await hv.signIn();
    expect(assertions).toBe(1);
    expect(s.accessToken).toBe("acc1");
  });

  it("errors carry the server's code", async () => {
    const { f } = fakeFetch({ "POST /sessions": () => [401, { error: "assertion_replayed" }] });
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => "A", fetch: f });
    await expect(hv.signIn()).rejects.toMatchObject({ status: 401, code: "assertion_replayed" });
    expect(new HainivaError(409, "destination_closed")).toBeInstanceOf(Error);
  });
});

describe("socket", () => {
  it("authenticates in the first frame, resumes every subscription from its last message, drops duplicates", async () => {
    FakeWS.all = [];
    const { f } = fakeFetch({ "POST /sessions": () => [201, session()] });
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => "A", fetch: f,
      WebSocket: FakeWS as unknown as typeof WebSocket, backoff: { initial: 1, max: 2 } });
    await hv.signIn();
    const got: string[] = [];
    hv.subscribe("conv-1", { message: (m) => got.push(m.id) });
    await tick();
    const ws1 = FakeWS.all[0]!;
    expect(ws1.url).toBe("ws://x/app/v1/ws");
    expect(ws1.sent[0]).toMatchObject({ type: "auth", token: "acc1" });
    ws1.push({ type: "ready", seq: 1 });
    expect(ws1.sent[1]).toMatchObject({ type: "subscribe", conversationId: "conv-1" });
    ws1.push({ type: "message.new", seq: 2, conversationId: "conv-1", message: { id: "m1", from: "agent", text: "chào" } });
    ws1.push({ type: "message.new", seq: 3, conversationId: "conv-1", message: { id: "m1", from: "agent", text: "chào" } });
    expect(got).toEqual(["m1"]);

    ws1.close(1006);                       // the network drops
    await tick(20);
    const ws2 = FakeWS.all[1]!;
    expect(ws2).toBeDefined();
    ws2.push({ type: "ready", seq: 1 });
    expect(ws2.sent.find((x) => x["type"] === "subscribe")).toMatchObject({ conversationId: "conv-1", after: "m1" });
    hv.disconnect();
  });

  it("send goes over the socket when open and returns the acked id", async () => {
    FakeWS.all = [];
    const { f } = fakeFetch({ "POST /sessions": () => [201, session()] });
    const hv = new HainivaApp({ tenantId: "t", channelId: "ch", baseUrl: "https://gw", getAssertion: async () => "A", fetch: f, WebSocket: FakeWS as unknown as typeof WebSocket });
    await hv.signIn();
    hv.connect(); await tick();
    const ws = FakeWS.all[0]!; ws.push({ type: "ready" });
    const p = hv.send("conv-1", "xin chào", "client-0001");
    const frame = ws.sent.find((x) => x["type"] === "message.send")!;
    expect(frame).toMatchObject({ conversationId: "conv-1", text: "xin chào", clientId: "client-0001" });
    ws.push({ type: "ack", id: frame["id"], ok: true, messageId: "m9" });
    await expect(p).resolves.toEqual({ id: "m9", duplicate: false });
    hv.disconnect();
  });
});

describe("backoff", () => {
  it("grows exponentially, is jittered, and is capped", () => {
    expect(backoffDelay(0, 1000, 30000, () => 0)).toBe(500);
    expect(backoffDelay(0, 1000, 30000, () => 1)).toBe(1000);
    expect(backoffDelay(3, 1000, 30000, () => 1)).toBe(8000);
    expect(backoffDelay(20, 1000, 30000, () => 1)).toBe(30000);
  });
});
