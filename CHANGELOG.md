# Changelog

All notable changes to `@hainiva/app-sdk` are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[Semantic Versioning](https://semver.org/). While the version is `0.x`, a minor
release (`0.2.0`) may change the API; a patch release (`0.1.1`) never does.

## [0.1.1] - 2026-11-07

- Package description: voice calls run over HAINIVA AICC.
- Security contact is now security@epacific.com.vn.

## [0.1.0] - 2026-11-07

First public release.

- `HainivaApp`: sign in with your backend's assertion, saved sessions, token refresh before expiry, re-sign-in on a refused refresh.
- Directory: `destinations({ q, group })`, accent-insensitive search, open/closed now.
- Chat: `start`, `send` (retry-safe with `clientId`), `upload`, `close`, `rate`, `conversations`, `messages`.
- Live updates: `subscribe` over one WebSocket, reconnect with backoff and jitter, resume from the last message, no duplicates.
- Voice: `startCall` returns the LiveKit url and token.
- Closed destinations: `HainivaError` `destination_closed`, and `leaveMessage: true`.
- ESM and CommonJS builds with TypeScript types. No runtime dependencies.

[0.1.1]: https://github.com/hainiva/app-sdk/releases/tag/v0.1.1
[0.1.0]: https://github.com/hainiva/app-sdk/releases/tag/v0.1.0
