# Spotify Single Player

Obsidian community plugin that inserts inline Spotify track iframes into your notes and loops playback. When you log in with your Spotify account (Premium), embeds play full songs instead of 30-second previews.

> **Desktop only** — the user login flow uses a local HTTP server for the OAuth callback.

## Features

- **Insert Spotify track iframe** — uses the current editor selection (if it is a Spotify track URL/URI), or prompts for a link. Inserts an inline `<iframe>` embed in the note.
- **Log in to Spotify account** — authenticates with your personal Spotify account via OAuth 2.0 PKCE. Stores access and refresh tokens for subsequent use.
- **Log out of Spotify account** — clears the stored user session.
- **Authenticate Spotify developer credentials** — validates your app's client credentials.
- **Auto-repeat playback** — reloads the embed at track end. Uses the full track duration for Premium accounts, or the 30-second preview window for free/unauthenticated users.

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
3. Optionally configure autoplay and iframe height under **Embed configuration**.

### 3. Log in to your Spotify account (for full song playback)

1. From the command palette, run **Log in to spotify account**, or click **Log in to spotify** in the plugin settings.
2. Your system browser opens the Spotify authorization page. Approve the request.
3. After approval, a second panel opens inside Obsidian — sign in to Spotify there so the embed player can detect your session.
4. Close that panel. Your embeds will now play full songs on repeat (requires Spotify Premium).

## Usage

1. Copy a Spotify track link:
   - `https://open.spotify.com/track/<id>`
   - `spotify:track:<id>`
2. In a note, run **Insert spotify track iframe** from the command palette.
3. The plugin inserts an inline iframe that plays the track and repeats.

## Privacy and network usage

This plugin is desktop-only and makes outbound requests only to Spotify:

- `https://accounts.spotify.com/api/token` — client credentials + user OAuth token exchange/refresh
- `https://accounts.spotify.com/authorize` — user login (opened in your browser)
- `https://api.spotify.com/v1/tracks/<id>` — track metadata and duration
- `https://api.spotify.com/v1/me` — user profile (display name, account tier)

No telemetry is collected. Credentials and tokens are stored in Obsidian plugin data on your device only.

## Development

```bash
npm install
npm run lint
npm run build
```

