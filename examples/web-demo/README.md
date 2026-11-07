# Web demo: a partner app on the HAINIVA App channel

A phone-sized web app plus the small backend every partner runs. Its users sign in, pick a destination from your directory (a ward, a store, a branch), then **chat** or **call** the people who serve it. Staff answer in the HAINIVA desk.

It is the same integration a mobile app does, in about 400 lines you can read in one sitting:

| File | What it shows |
|---|---|
| `server.mjs` | Your backend: holds the channel secret and signs a 2-minute assertion for the signed-in user. Nothing else is needed server-side. |
| `public/index.html` | Your app: `HainivaApp` sign-in, the directory with search and open/closed state, chat with live messages, a voice call with LiveKit (ring-back, mute, hang up). |
| `presets.mjs` | Words, colours and icon for three kinds of organisation: `gov` (citizen → ward), `retail` (customer → store), `office` (client → branch/department). |

## Run it

You need an App channel (Admin → **Channels → Mobile App → Add**) with a few destinations in its directory.

```sh
npm install
cp .env.example .env          # fill in the ids; leave the secret empty in the file
read -s HAINIVA_APP_SECRET && export HAINIVA_APP_SECRET
node --env-file=.env server.mjs
```

Open http://localhost:5174 in Chrome or Safari and allow the microphone for calls. `localhost` counts as a secure origin, so calls work without HTTPS.

Switch the look with `DEMO_PRESET=retail` or `DEMO_PRESET=office`.

## Hosting it for others

- Serve it behind **HTTPS** — browsers allow the microphone only on secure pages.
- Put it behind a login (for example HTTP basic auth on the reverse proxy). As written, anyone who can open the page can sign in to your channel as any name and phone number: a real backend signs only the user it has authenticated.
- It uses only relative paths, so it works under a sub-path such as `https://example.com/demo/`.

## What a call does

`startCall(code)` returns a LiveKit URL and token for one room. The page joins and publishes the microphone. Hanging up is just leaving the room: HAINIVA ends the call as the caller's hang-up about 12 seconds after the app leaves (a rejoin within that time, e.g. after a network switch, keeps the call). When staff hang up, the room closes and the app sees the disconnect.

On iOS and Android use CallKit / ConnectionService so the call survives the background; see the [App channel guide](https://api.hainiva.com/docs/#tag/app-channel).
