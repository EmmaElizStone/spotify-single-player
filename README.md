# Spotify Single Player

Obsidian community plugin that inserts interactive Spotify players into your notes. When you log in with a Spotify Premium account, the player streams the full song on repeat until you pause it.

> **Desktop only** — the user login flow uses a local HTTP server for the OAuth callback, and audio is played via the Spotify Web Playback SDK running inside Electron.

## Features

- **Insert spotify player** — uses the current editor selection (if it is a Spotify track URL/URI), or prompts for a link. Inserts an interactive player block into the note.
- **Log in to Spotify account** — authenticates with your personal Spotify account via OAuth 2.0 PKCE. Stores access and refresh tokens for subsequent use.
- **Log out of Spotify account** — clears the stored user session.
- **Authenticate Spotify developer credentials** — validates your app's client credentials.
- **Full-song repeat playback** — Premium users get full track audio that loops automatically via the Spotify Web Playback SDK. Free/unauthenticated users can open the track on Spotify with the logo link.

## Setup

### 1. Create a Spotify developer app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Under **Edit settings → Redirect URIs**, add the following URI **exactly** (including the port and path):
   ```
   http://127.0.0.1:8765/callback
   ```
3. Copy the **Client ID** and **Client secret**.

### 2. Configure the plugin

1. In Obsidian, open **Settings → Community plugins → Spotify Single Player**.
2. Enter:
   - **Spotify client identifier**
   - **Spotify client secret**
3. Optionally configure autoplay and player height under **Player configuration**.

### 3. Log in to your Spotify account (for full song playback)

1. From the command palette, run **Log in to spotify account**, or click **Log in to spotify** in the plugin settings.
2. Your **default system browser** opens the Spotify authorization page. Sign in and approve the request.
   - You can use Google sign-in or your Spotify email and password here.
3. Once authorized, the plugin stores your session. Your players will now stream full songs on repeat (requires Spotify Premium).

## Usage

1. Copy a Spotify track link:
   - `https://open.spotify.com/track/<id>`
   - `spotify:track:<id>`
2. In a note, run **Insert spotify player** from the command palette.
3. The plugin inserts a player block. Click the play button to start the full song. It will loop on repeat until you pause it.
4. The Spotify logo icon on the right opens the track on Spotify in your browser.

## Privacy and network usage

This plugin is desktop-only and makes outbound requests only to Spotify:

- `https://accounts.spotify.com/api/token` — client credentials + user OAuth token exchange/refresh
- `https://accounts.spotify.com/authorize` — user login (opened in your browser)
- `https://api.spotify.com/v1/tracks/<id>` — track metadata (title, artist, album art, duration)
- `https://api.spotify.com/v1/me` — user profile (display name, account tier)
- `https://api.spotify.com/v1/me/player/play` — start playback on the SDK device (Premium only)
- `https://api.spotify.com/v1/me/player/repeat` — enable single-track repeat (Premium only)
- `https://sdk.scdn.co/spotify-player.js` — the Spotify Web Playback SDK (loaded once on first play)

No telemetry is collected. Credentials and tokens are stored in Obsidian plugin data on your device only.

## Development

```bash
npm install
npm run lint
npm run build
```
