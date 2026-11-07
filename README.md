<p align="center">
  <a href="https://hainiva.com"><img src="https://raw.githubusercontent.com/hainiva/app-sdk/main/assets/hainiva-lockup.png" alt="HAINIVA" width="220"></a>
</p>

<h1 align="center">@hainiva/app-sdk</h1>

<p align="center">
  Connect your mobile app's users to a HAINIVA organisation: <b>chat over WebSocket</b> and <b>voice calls over LiveKit</b>, through the App channel.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@hainiva/app-sdk"><img src="https://img.shields.io/npm/v/@hainiva/app-sdk?color=0096b4" alt="npm version"></a>
  <a href="https://github.com/hainiva/app-sdk/actions/workflows/ci.yml"><img src="https://github.com/hainiva/app-sdk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/types-TypeScript-3178c6" alt="TypeScript">
  <img src="https://img.shields.io/badge/dependencies-0-success" alt="zero dependencies">
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@hainiva/app-sdk" alt="MIT license"></a>
</p>

- **Zero dependencies.** Uses the platform's `fetch` and `WebSocket`: React Native, browsers and Node 22+.
- **Nothing lost, nothing twice.** Reconnects with backoff, resumes from the last message, retries are de-duplicated.
- **Your users, your identity.** Your backend vouches for the signed-in user; no HAINIVA secret ever ships in the app.
- **Full reference:** [API docs → App channel](https://api.hainiva.com/docs/#tag/app-channel). This package is a convenience over that protocol.

## Install

```sh
npm install @hainiva/app-sdk
# yarn add @hainiva/app-sdk  ·  pnpm add @hainiva/app-sdk
```

You need, from the HAINIVA organisation's admin (**Admin → Channels → Mobile App**): the **Organisation ID**, the **Channel ID** and the channel's **signing secret** (for your backend only).

| Environment | `baseUrl` |
|---|---|
| Production | `https://channel.hainiva.com` |
| Staging (testing) | `https://channel.stg.hainiva.com` |

## 1. Your backend signs the user in

The channel secret stays on your server. Give your app an endpoint that returns a fresh assertion for the user **you** have signed in — see [`examples/partner-backend.mjs`](examples/partner-backend.mjs):

```js
hainivaAssertion({ id: user.id, fullName: user.name, phone: user.phone, phoneVerified: user.phoneVerifiedByOtp })
```

Claims: `iss` = channel id, `sub` = your user id (the identity), `iat`/`exp` ≤ 5 min apart (2 recommended), `jti` random & single-use, optional `name`, `phone`, `phone_verified`, `email`.

## 2. The app

```ts
import { HainivaApp } from "@hainiva/app-sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";

const hv = new HainivaApp({
  baseUrl: "https://channel.hainiva.com",
  tenantId: "<organisation id>",
  channelId: "<channel id>",
  platform: Platform.OS === "ios" ? "ios" : "android",
  getAssertion: () => api.post("/hainiva/assertion").then((r) => r.data.assertion),
  store: { get: () => AsyncStorage.getItem("hv"), set: (v) => AsyncStorage.setItem("hv", v), remove: () => AsyncStorage.removeItem("hv") },
});

await hv.signIn();                                    // restores a saved session or signs in
const { items, groups } = await hv.destinations({ q: "vĩnh lộc" });

const conv = await hv.start({ destination: items[0].code, text: "Xin chào" });
const stop = hv.subscribe(conv.conversationId, {
  message: (m) => appendBubble(m),                    // m.from: "me" | "agent" | "ai" | "system"
  state: (s) => setHeader(s.agent?.name, s.queuePosition, s.status),
});
await hv.send(conv.conversationId, "Tôi cần hỏi về hồ sơ đất đai");
await hv.upload(conv.conversationId, { uri, name: "giay-to.jpg", type: "image/jpeg" });
```

- **Resume**: the socket reconnects with backoff and re-subscribes from the last message it delivered — nothing is lost or repeated.
- **Retries never duplicate**: `send` carries a `clientId`.
- **Tokens**: refreshed before they expire; when the refresh is refused, `getAssertion` is asked again.
- **Closed destinations**: `start` throws `HainivaError` `destination_closed` with `body.nextOpenAt`; call again with `leaveMessage: true` and a `text` to leave the message in the queue.

## 3. Voice calls

```ts
import { Room } from "livekit-client";                // or @livekit/react-native
const call = await hv.startCall(destination.code);
const room = new Room();
await room.connect(call.livekit.url, call.livekit.token);
await room.localParticipant.setMicrophoneEnabled(true);
```

Use CallKit (iOS) and ConnectionService + a foreground service (Android) so calls survive the background.

## 4. Push notifications

The socket reaches an open app only. Subscribe a webhook to `app.message.outbound`; it carries your user id (`userId`), the conversation and a preview — send your own FCM/APNs push.

## Errors

`HainivaError { status, code, body }` — codes as in the API reference (`destination_closed`, `mode_not_allowed`, `rate_limited`, `conversation_closed`, …).

## Compatibility

| Runtime | Supported |
|---|---|
| React Native (Hermes) and Expo | ✓ |
| Browsers (last 2 versions of Chrome, Safari, Firefox, Edge) | ✓ |
| Node.js 22+ | ✓ (global `WebSocket`) |

Ships ESM and CommonJS with TypeScript types.

## Versioning

[Semantic Versioning](https://semver.org/). While the version is `0.x`, a minor release may change the API; read the [changelog](CHANGELOG.md) before upgrading. The wire protocol is versioned separately (`/app/v1`) and only grows within v1.

## Support and security

- Questions and bugs: [GitHub issues](https://github.com/hainiva/app-sdk/issues), or your HAINIVA contact.
- Vulnerabilities: please follow [SECURITY.md](SECURITY.md); do not open a public issue.

## License

[MIT](LICENSE) © ePacific Telecom (HAINIVA)
