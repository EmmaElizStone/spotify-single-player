import { requestUrl } from "obsidian";
import type { SpotifySinglePlayerSettings } from "./settings";

export interface SpotifyTrackInfo {
	id: string;
	name: string;
	artists: string[];
	durationMs: number;
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
	};
}

export function buildEmbedMarkdown(track: SpotifyTrackInfo, autoplay: boolean, iframeHeight: number): string {
	const params = new URLSearchParams({
		utm_source: "obsidian_plugin",
	});
	if (autoplay) {
		params.set("autoplay", "1");
	}

	const safeHeight = Number.isFinite(iframeHeight) && iframeHeight > 0 ? Math.round(iframeHeight) : 152;
	const embedSrc = `https://open.spotify.com/embed/track/${track.id}?${params.toString()}`;
	return `<iframe class="spotify-single-player-embed" src="${embedSrc}" width="100%" height="${safeHeight}" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" data-spotify-repeat-ms="${track.durationMs}"></iframe>\n\n`;
}
