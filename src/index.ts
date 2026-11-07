/**
 * @hainiva/app-sdk — connect a mobile app's users to HAINIVA (App channel).
 *
 * No dependencies: it uses the platform's fetch and WebSocket, so it runs in
 * React Native, browsers and Node 22+. Voice uses your LiveKit SDK of choice —
 * this client hands you the url and token (see `startCall`).
 *
 *   const hv = new HainivaApp({
 *     tenantId, channelId,
 *     baseUrl: "https://channel.hainiva.com",
 *     getAssertion: () => myBackend.post("/hainiva-assertion").then((r) => r.token),
 *   });
 *   await hv.signIn();
 *   const { items } = await hv.destinations({ q: "vinh loc" });
 *   const conv = await hv.start({ destination: items[0].code, text: "Xin chào" });
 *   hv.subscribe(conv.conversationId, {
 *     message: (m) => render(m),
 *     state: (s) => showAgent(s.agent?.name, s.queuePosition),
 *   });
 *   await hv.send(conv.conversationId, "Tôi cần hỏi về hồ sơ");
 *
 * The protocol is documented in full at https://api.hainiva.com/docs/ (tag
 * "App channel"); this client is a convenience over it.
 */

export const PROTOCOL_VERSION = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Session {
  accessToken: string; accessExpiresAt: string;
  refreshToken: string; refreshExpiresAt: string;
  contactId: string; wsUrl: string; phoneVerified?: boolean; channelName?: string;
}
export interface Destination {
  code: string; name: string; group: string | null; description: string | null;
  chat: boolean; voice: boolean; open: boolean | null; nextChangeAt: string | null;
}
export interface Message {
  id: string; interactionId: string; at: string;
  from: "me" | "agent" | "ai" | "system";
  type: string; text: string | null; senderName: string | null;
  attachment: { url: string; name: string | null; mime: string | null; size: number | null } | null;
  card: Record<string, unknown> | null;
}
export interface ConversationState {
  id: string; status: string; open: boolean; createdAt: string; closedAt: string | null;
  destination: { code: string | null; name: string | null; group: string | null } | null;
  agent: { name: string } | null; queuePosition: number | null; csatScore: number | null;
  /** The latest call: `live` while it lasts; status tells missed / ended afterwards. */
  call: { interactionId: string; status: string; live: boolean; roomName: string | null; endedAt: string | null } | null;
  sendInteractionId: string | null;
}
export interface LiveKitJoin { url: string; token: string; roomName: string }
export interface Started {
  conversationId: string; interactionId: string; continued: boolean;
  livekit: LiveKitJoin | null; state: ConversationState | null;
}
export interface StartOptions { destination: string; mode?: "chat" | "voice"; text?: string; leaveMessage?: boolean }
export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

/** Where the session is kept between app launches (AsyncStorage, Keychain, localStorage…). */
export interface SessionStore {
  get(): Promise<string | null> | string | null;
  set(value: string): Promise<void> | void;
  remove(): Promise<void> | void;
}

export interface HainivaAppOptions {
  tenantId: string;
  channelId: string;
  /** e.g. https://channel.hainiva.com */
  baseUrl: string;
  /** Ask YOUR backend for a fresh user assertion (it holds the channel secret). */
  getAssertion: () => Promise<string>;
  platform?: "ios" | "android" | "web" | "other";
  appVersion?: string;
  store?: SessionStore;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /** Reconnect backoff, ms. */
  backoff?: { initial?: number; max?: number };
  log?: (event: string, detail?: unknown) => void;
}

export class HainivaError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown> = {}) {
    super(`${status} ${code}`);
    this.name = "HainivaError";
  }
}

interface Handlers {
  message?: (m: Message) => void;
  state?: (s: ConversationState) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Exponential backoff with full jitter. */
export function backoffDelay(attempt: number, initial = 1000, max = 30000, rnd: () => number = Math.random): number {
  const cap = Math.min(max, initial * 2 ** Math.max(0, attempt));
  return Math.round(cap / 2 + rnd() * (cap / 2));
}

// ── Client ────────────────────────────────────────────────────────────────────

export class HainivaApp {
  private session: Session | null = null;
  private refreshing: Promise<Session> | null = null;
  private ws: WebSocket | null = null;
  private wsState: ConnectionState = "idle";
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wantSocket = false;
  private subs = new Map<string, { cursor: string | null; handlers: Set<Handlers> }>();
  private pending = new Map<string, { resolve: (f: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }>();
  private seen = new Set<string>();
  private lastSeq = 0;
  private connListeners = new Set<(s: ConnectionState) => void>();
  private readonly f: typeof fetch;
  private readonly WS: typeof WebSocket | undefined;

  constructor(private readonly o: HainivaAppOptions) {
    this.f = o.fetch ?? fetch.bind(globalThis);
    this.WS = o.WebSocket ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  }

  private get api(): string { return `${this.o.baseUrl.replace(/\/$/, "")}/app/v1`; }
  private log(e: string, d?: unknown) { this.o.log?.(e, d); }

  // ── Session ──

  /** Restore a saved session, or sign in with a new assertion. */
  async signIn(): Promise<Session> {
    const saved = await this.o.store?.get();
    if (saved) {
      try {
        const s = JSON.parse(saved) as Session;
        if (Date.parse(s.refreshExpiresAt) > Date.now() + 60_000) { this.session = s; await this.ensureFresh(); return this.session!; }
      } catch { /* sign in afresh */ }
    }
    return this.freshSignIn();
  }

  private async freshSignIn(): Promise<Session> {
    const assertion = await this.o.getAssertion();
    const s = await this.raw<Session>("POST", "/sessions", {
      tenantId: this.o.tenantId, channelId: this.o.channelId, assertion,
      ...(this.o.platform ? { platform: this.o.platform } : {}), ...(this.o.appVersion ? { appVersion: this.o.appVersion } : {}),
    }, false);
    await this.keep(s);
    return s;
  }

  private async keep(s: Session): Promise<void> {
    this.session = s;
    await this.o.store?.set(JSON.stringify(s));
  }

  /** Refresh when the access token has under a minute left; sign in again when refresh is refused. */
  private async ensureFresh(force = false): Promise<Session> {
    if (!this.session) return this.freshSignIn();
    if (!force && Date.parse(this.session.accessExpiresAt) - Date.now() > 60_000) return this.session;
    this.refreshing ??= (async () => {
      try {
        const r = await this.raw<Session>("POST", "/sessions/refresh", { tenantId: this.o.tenantId, refreshToken: this.session!.refreshToken }, false);
        const next = { ...this.session!, ...r };
        await this.keep(next);
        this.sendFrame({ type: "token.refresh", token: next.accessToken });
        return next;
      } catch (e) {
        if (e instanceof HainivaError && (e.status === 401 || e.status === 403)) return this.freshSignIn();
        throw e;
      } finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    this.disconnect();
    if (this.session) await this.call("DELETE", "/sessions/current").catch(() => undefined);
    this.session = null;
    await this.o.store?.remove();
  }

  // ── HTTP ──

  private async raw<T>(method: string, path: string, body?: unknown, auth = true, form?: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth && this.session) headers["authorization"] = `Bearer ${this.session.accessToken}`;
    if (body !== undefined && !form) headers["content-type"] = "application/json";
    const res = await this.f(`${this.api}${path}`, { method, headers, ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new HainivaError(res.status, String(data["error"] ?? "request_failed"), data);
    return data as T;
  }

  /** Authenticated call; one retry after a refresh when the token was refused. */
  private async call<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    await this.ensureFresh();
    try { return await this.raw<T>(method, path, body, true, form); }
    catch (e) {
      if (e instanceof HainivaError && e.status === 401) { await this.ensureFresh(true); return this.raw<T>(method, path, body, true, form); }
      throw e;
    }
  }

  // ── Directory and conversations ──

  destinations(q: { q?: string; group?: string; limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") qs.set(k, String(v));
    return this.call<{ total: number; groups: { name: string; count: number }[]; items: Destination[] }>("GET", `/destinations${qs.size ? `?${qs}` : ""}`);
  }

  /** Start or continue a chat (or a call) with a destination; subscribes to it when the socket is in use. */
  async start(opts: StartOptions): Promise<Started> {
    const r = await this.call<Started>("POST", "/conversations", { mode: "chat", ...opts });
    if (this.wantSocket && !this.subs.has(r.conversationId)) this.subscribe(r.conversationId, {});
    return r;
  }

  /** A call: returns where to join with your LiveKit SDK, e.g. `await room.connect(j.url, j.token)`. */
  async startCall(destination: string): Promise<Started & { livekit: LiveKitJoin }> {
    const r = await this.start({ destination, mode: "voice" });
    if (!r.livekit) throw new HainivaError(502, "no_livekit");
    return r as Started & { livekit: LiveKitJoin };
  }

  conversations() { return this.call<{ data: { id: string; status: string; open: boolean; createdAt: string; destination: { code: string | null; name: string | null } | null; lastMessage: { text: string; at: string | null } | null }[] }>("GET", "/conversations"); }
  state(conversationId: string) { return this.call<ConversationState>("GET", `/conversations/${conversationId}`); }
  messages(conversationId: string, after?: string) {
    return this.call<{ messages: Message[]; more: boolean }>("GET", `/conversations/${conversationId}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`);
  }

  /** Send text. Goes over the socket when it is open, REST otherwise; a retry never duplicates (clientId). */
  async send(conversationId: string, text: string, clientId = randomId()): Promise<{ id: string; duplicate: boolean }> {
    if (this.wsState === "open") {
      const ack = await this.request({ type: "message.send", conversationId, text, clientId }).catch(() => null);
      if (ack?.["ok"]) return { id: String(ack["messageId"]), duplicate: ack["duplicate"] === true };
      if (ack && ack["error"] && ack["error"] !== "timeout") throw new HainivaError(400, String(ack["error"]), ack);
    }
    return this.call("POST", `/conversations/${conversationId}/messages`, { text, clientId });
  }

  /** A photo or a file (≤ 25 MB). `file` is a Blob/File, or { uri, name, type } in React Native. */
  upload(conversationId: string, file: Blob | { uri: string; name: string; type: string }, name?: string) {
    const fd = new FormData();
    if (typeof Blob !== "undefined" && file instanceof Blob) fd.append("file", file, name ?? "file");
    else fd.append("file", file as unknown as Blob);
    return this.call<{ id: string | null }>("POST", `/conversations/${conversationId}/attachments`, undefined, fd);
  }

  close(conversationId: string) { return this.call<void>("POST", `/conversations/${conversationId}/close`); }
  rate(conversationId: string, score: 1 | 2 | 3 | 4 | 5) { return this.call<void>("POST", `/conversations/${conversationId}/csat`, { score }); }

  // ── Socket ──

  onConnection(fn: (s: ConnectionState) => void): () => void { this.connListeners.add(fn); return () => this.connListeners.delete(fn); }
  get connection(): ConnectionState { return this.wsState; }
  private setState(s: ConnectionState) { this.wsState = s; for (const fn of this.connListeners) fn(s); }

  /** Live updates for a conversation. Returns an unsubscribe function. Opens the socket if needed. */
  subscribe(conversationId: string, handlers: Handlers, after?: string): () => void {
    let sub = this.subs.get(conversationId);
    if (!sub) { sub = { cursor: after ?? null, handlers: new Set() }; this.subs.set(conversationId, sub); }
    sub.handlers.add(handlers);
    this.connect();
    if (this.wsState === "open") this.sendFrame({ type: "subscribe", conversationId, ...(sub.cursor ? { after: sub.cursor } : {}) });
    return () => {
      sub!.handlers.delete(handlers);
      if (!sub!.handlers.size) { this.subs.delete(conversationId); this.sendFrame({ type: "unsubscribe", conversationId }); }
    };
  }

  connect(): void {
    this.wantSocket = true;
    if (this.ws || !this.WS) return;
    void this.open();
  }

  disconnect(): void {
    this.wantSocket = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close(1000);
    this.ws = null;
    this.setState("closed");
  }

  private async open(): Promise<void> {
    let s: Session;
    try { s = await this.ensureFresh(); } catch (e) { this.log("auth_failed", e); return this.scheduleReconnect(); }
    this.setState(this.attempt ? "reconnecting" : "connecting");
    const ws = new this.WS!(s.wsUrl);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "auth", token: this.session!.accessToken }));
    ws.onmessage = (ev) => this.onFrame(typeof ev.data === "string" ? ev.data : String(ev.data));
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve({ id, ok: false, error: "disconnected" }); }
      this.pending.clear();
      this.log("socket_closed", ev.code);
      if (!this.wantSocket) return this.setState("closed");
      if (ev.code === 4003) { this.session = null; void this.o.store?.remove(); }   // revoked: sign in again
      if (ev.code === 4001) void this.ensureFresh(true).catch(() => undefined);
      this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private scheduleReconnect(): void {
    if (!this.wantSocket) return;
    const d = backoffDelay(this.attempt++, this.o.backoff?.initial, this.o.backoff?.max);
    this.setState("reconnecting");
    this.reconnectTimer = setTimeout(() => void this.open(), d);
  }

  private onFrame(raw: string): void {
    let f: Record<string, unknown>;
    try { f = JSON.parse(raw); } catch { return; }
    if (typeof f["seq"] === "number") this.lastSeq = f["seq"];
    switch (f["type"]) {
      case "ready":
        this.attempt = 0; this.setState("open");
        this.pingTimer = setInterval(() => this.sendFrame({ type: "ping" }), 20_000);
        // Resume: every subscription from its last message.
        for (const [conversationId, sub] of this.subs) this.sendFrame({ type: "subscribe", conversationId, ...(sub.cursor ? { after: sub.cursor } : {}) });
        return;
      case "ack": {
        const p = this.pending.get(String(f["id"]));
        if (p) { clearTimeout(p.timer); this.pending.delete(String(f["id"])); p.resolve(f); }
        return;
      }
      case "message.new": {
        const conv = String(f["conversationId"]); const m = f["message"] as Message;
        const sub = this.subs.get(conv);
        if (!sub || !m?.id || this.seen.has(m.id)) return;
        this.seen.add(m.id); if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2000));
        sub.cursor = m.id;
        for (const h of sub.handlers) h.message?.(m);
        return;
      }
      case "conversation.state": {
        const sub = this.subs.get(String(f["conversationId"]));
        for (const h of sub?.handlers ?? []) h.state?.(f["state"] as ConversationState);
        return;
      }
      case "session.expiring": void this.ensureFresh(true).catch(() => undefined); return;
      default: return;
    }
  }

  private sendFrame(f: Record<string, unknown>): void {
    if (this.ws && this.wsState === "open") this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...f }));
  }

  private request(f: Record<string, unknown>, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    const id = randomId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ id, ok: false, error: "timeout" }); }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.sendFrame({ ...f, id });
    });
  }
}
