import { requestUrl } from "obsidian";
import type { SpotifySinglePlayerSettings } from "./settings";
import type { TrackDisplayData } from "./player-ui";

export interface SpotifyTrackInfo {
	id: string;
	name: string;
	artists: string[];
	durationMs: number;
	/** URL of the largest available album art image. */
	albumArtUrl: string;
}

interface SpotifyTokenResponse {
	access_token: string;
	expires_in: number;
}

interface SpotifyTrackResponse {
	id: string;
	name: string;
	duration_ms: number;
	artists: Array<{ name: string }>;
	album: { images: Array<{ url: string; width: number; height: number }> };
}

export function parseSpotifyTrackId(value: string): string | null {
	const input = value.trim();
	if (!input) {
		return null;
	}

	const spotifyUriMatch = input.match(/^spotify:track:([A-Za-z0-9]+)$/);
	if (spotifyUriMatch) {
		return spotifyUriMatch[1] ?? null;
	}

	try {
		const parsed = new URL(input);
		const trackMatch = parsed.pathname.match(/\/track\/([A-Za-z0-9]+)/);
		return trackMatch?.[1] ?? null;
	} catch {
		return null;
	}
}

export async function fetchSpotifyAccessToken(settings: SpotifySinglePlayerSettings): Promise<SpotifyTokenResponse> {
	if (!settings.clientId || !settings.clientSecret) {
		throw new Error("Missing Spotify client credentials in plugin settings.");
	}

	const credentials = `${settings.clientId}:${settings.clientSecret}`;
	const auth = btoa(credentials);
	const response = await requestUrl({
		url: "https://accounts.spotify.com/api/token",
		method: "POST",
		headers: {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
	});

	const tokenBody = response.json as Partial<SpotifyTokenResponse>;
	if (!tokenBody.access_token || typeof tokenBody.expires_in !== "number") {
		throw new Error("Spotify token response was invalid.");
	}

	return {
		access_token: tokenBody.access_token,
		expires_in: tokenBody.expires_in,
	};
}

export async function fetchTrackInfo(trackId: string, accessToken: string): Promise<SpotifyTrackInfo> {
	const response = await requestUrl({
		url: `https://api.spotify.com/v1/tracks/${trackId}`,
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	const trackBody = response.json as Partial<SpotifyTrackResponse>;
	if (!trackBody.id || typeof trackBody.duration_ms !== "number" || !Array.isArray(trackBody.artists)) {
		throw new Error("Spotify track response was invalid.");
	}

	return {
		id: trackBody.id,
		name: trackBody.name ?? "Unknown track",
		durationMs: trackBody.duration_ms,
		artists: trackBody.artists.map((artist) => artist.name).filter(Boolean),
		// Use the largest available image (Spotify returns images in descending size order).
		albumArtUrl: trackBody.album?.images?.[0]?.url ?? "",
	};
}

/**
 * Build the fenced code block markdown for a Spotify track.
 *
 * The `spotify-player` code block is rendered by the plugin's code-block
 * processor into a Spotify-styled interactive player powered by the Web
 * Playback SDK.  The block stores all track metadata as JSON so that no
 * additional API calls are needed at render time.
 *
 * @param track        - Spotify track metadata.
 * @param height       - Height in pixels for the rendered player element.
 */
export function buildPlayerCodeBlock(track: SpotifyTrackInfo, height: number): string {
	const safeHeight = Number.isFinite(height) && height > 0 ? Math.round(height) : 152;
	const data: TrackDisplayData = {
		trackId: track.id,
		trackName: track.name,
		artists: track.artists.join(", "),
		albumArtUrl: track.albumArtUrl,
		durationMs: track.durationMs,
		height: safeHeight,
	};
	return `\`\`\`spotify-player\n${JSON.stringify(data)}\n\`\`\`\n\n`;
}
