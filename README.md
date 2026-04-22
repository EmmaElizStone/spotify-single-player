# Spotify Single Player

Obsidian community plugin that inserts inline Spotify track iframes into your notes and loops playback by reloading the embed at track end.

## Features

- Command: **Insert Spotify track iframe**
  - Uses the current editor selection (if it is a Spotify track URL/URI), or prompts for a link.
  - Inserts an inline `<iframe>` embed in the note.
- Command: **Authenticate Spotify developer credentials**
  - Validates your Spotify Developer client credentials.
- Auto-repeat playback
  - The plugin reads track duration from Spotify Web API and reloads the iframe after the track completes.

## Setup

1. Create a Spotify app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. In Obsidian, open **Settings → Community plugins → Spotify Single Player**.
3. Enter:
   - **Spotify client id**
   - **Spotify client secret**
4. Optionally configure autoplay and iframe height.
5. Run **Authenticate Spotify developer credentials** from the command palette.

## Usage

1. Copy a Spotify track link like:
   - `https://open.spotify.com/track/<id>`
   - `spotify:track:<id>`
2. In a note, run **Insert Spotify track iframe**.
3. The plugin inserts an inline iframe that plays the track and repeats.

## Privacy and network usage

- This plugin makes outbound requests only to Spotify:
  - `https://accounts.spotify.com/api/token` (client credentials auth)
  - `https://api.spotify.com/v1/tracks/<id>` (track metadata, duration)
- No telemetry is collected by this plugin.
- Spotify credentials are stored in Obsidian plugin data on your device.

## Development

```bash
npm install
npm run lint
npm run build
```
