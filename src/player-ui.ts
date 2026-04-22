import { Notice, setIcon } from "obsidian";
import { SpotifyWebPlayer, SpotifyPlaybackState } from "./player";

// ---------------------------------------------------------------------------
// Data contract (matches the JSON stored in the spotify-player code block)
// ---------------------------------------------------------------------------

export interface TrackDisplayData {
	trackId: string;
	trackName: string;
	artists: string;
	albumArtUrl: string;
	durationMs: number;
	height: number;
}

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

/**
 * Populate `container` with a Spotify-styled interactive player.
 *
 * `container` is the element provided by Obsidian's code-block processor.
 * This function is idempotent — a second call on the same element is a no-op.
 */
export function initPlayerElement(
	container: HTMLElement,
	data: TrackDisplayData,
	player: SpotifyWebPlayer,
	getToken: () => Promise<string>,
	isPremium: boolean,
): void {
	if (container.hasAttribute("data-sp-init")) return;
	container.setAttribute("data-sp-init", "1");
	container.style.height = `${data.height}px`;

	// ---- Build DOM -------------------------------------------------------

	const root = container.createDiv({ cls: "spotify-single-player" });

	// Album art
	const art = root.createDiv({ cls: "sp-art" });
	if (data.albumArtUrl) {
		const img = art.createEl("img");
		img.setAttribute("src", data.albumArtUrl);
		img.setAttribute("alt", `${data.trackName} album art`);
		img.setAttribute("loading", "lazy");
	}

	// Right section
	const body = root.createDiv({ cls: "sp-body" });

	// Top row: track info + logo
	const header = body.createDiv({ cls: "sp-header" });
	const meta = header.createDiv({ cls: "sp-meta" });
	meta.createDiv({ cls: "sp-track-name", text: data.trackName });
	meta.createDiv({ cls: "sp-artist-name", text: data.artists });

	const logoLink = header.createEl("a", { cls: "sp-logo" });
	logoLink.setAttr("href", `https://open.spotify.com/track/${data.trackId}`);
	logoLink.setAttr("target", "_blank");
	logoLink.setAttr("rel", "noopener noreferrer");
	logoLink.setAttr("aria-label", "Open on Spotify");
	appendSpotifyLogoSvg(logoLink);

	// Bottom row: progress + play button
	const footer = body.createDiv({ cls: "sp-footer" });
	const progressRow = footer.createDiv({ cls: "sp-progress-row" });
	const timeCurrent = progressRow.createEl("span", { cls: "sp-time", text: "0:00" });
	const trackBar = progressRow.createDiv({ cls: "sp-track-bar" });
	const trackFill = trackBar.createDiv({ cls: "sp-track-fill" });
	progressRow.createEl("span", { cls: "sp-time sp-time-total", text: formatMs(data.durationMs) });

	const playBtn = footer.createEl("button", { cls: "sp-play-btn" });
	playBtn.setAttribute("aria-label", "Play");
	setPlayBtnIcon(playBtn, "idle");

	// ---- State management -----------------------------------------------

	let isPlayingThis = false;
	let lastKnownPos = 0;
	let lastEventAt = 0;
	let animFrame = 0;

	function updateProgress(posMs: number, durMs: number) {
		const safeDur = durMs > 0 ? durMs : data.durationMs;
		const pct = Math.min((posMs / safeDur) * 100, 100);
		trackFill.style.width = `${pct}%`;
		timeCurrent.textContent = formatMs(posMs);
	}

	function tick() {
		if (!container.isConnected) {
			unsubscribe();
			return;
		}
		if (!isPlayingThis) return;
		const elapsed = Date.now() - lastEventAt;
		updateProgress(Math.min(lastKnownPos + elapsed, data.durationMs), data.durationMs);
		animFrame = window.requestAnimationFrame(tick);
	}

	const unsubscribe = player.onStateChange((state: SpotifyPlaybackState | null) => {
		if (!container.isConnected) {
			unsubscribe();
			return;
		}

		const isThisTrack = state?.track_window.current_track.id === data.trackId;

		if (!state || !isThisTrack) {
			if (isPlayingThis) {
				// This track was deactivated (another track started, or player stopped).
				isPlayingThis = false;
				window.cancelAnimationFrame(animFrame);
				setPlayBtnIcon(playBtn, "idle");
				updateProgress(0, data.durationMs);
			}
			return;
		}

		isPlayingThis = !state.paused;
		lastKnownPos = state.position;
		lastEventAt = Date.now();
		setPlayBtnIcon(playBtn, state.paused ? "paused" : "playing");
		updateProgress(state.position, state.duration);

		window.cancelAnimationFrame(animFrame);
		if (!state.paused) animFrame = window.requestAnimationFrame(tick);
	});

	// ---- Play / pause click ---------------------------------------------

	playBtn.addEventListener("click", () => {
		void handlePlayClick(data, player, getToken, isPremium, playBtn);
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handlePlayClick(
	data: TrackDisplayData,
	player: SpotifyWebPlayer,
	getToken: () => Promise<string>,
	isPremium: boolean,
	playBtn: HTMLButtonElement,
): Promise<void> {
	if (!isPremium) {
		new Notice("Full song playback requires a spotify premium account.");
		return;
	}

	// If this track is already active in the player, just toggle play/pause.
	if (player.activeTrackId === data.trackId) {
		await player.togglePlay();
		return;
	}

	// Otherwise start this track from the beginning.
	setPlayBtnIcon(playBtn, "loading");
	try {
		await player.playTrack(data.trackId, getToken);
		// The state-change listener will update the icon once playback begins.
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown playback error.";
		new Notice(`Spotify playback error: ${message}`);
		setPlayBtnIcon(playBtn, "idle");
	}
}

type PlayBtnState = "idle" | "loading" | "playing" | "paused";

function setPlayBtnIcon(btn: HTMLButtonElement, state: PlayBtnState): void {
	btn.empty();
	btn.setAttribute("aria-label", state === "playing" ? "Pause" : "Play");
	switch (state) {
		case "idle":
		case "paused":
			setIcon(btn, "play");
			break;
		case "playing":
			setIcon(btn, "pause");
			break;
		case "loading":
			setIcon(btn, "loader-2");
			btn.querySelector("svg")?.addClass("sp-spinner");
			break;
	}
}

function formatMs(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

/**
 * Append the Spotify wordmark icon to `parent` using the DOM API.
 * Building the SVG element directly avoids the innerHTML linting restriction
 * while keeping the icon fully inline (no external image request).
 */
function appendSpotifyLogoSvg(parent: HTMLElement): void {
	const ns = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(ns, "svg");
	svg.setAttribute("viewBox", "0 0 168 168");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(ns, "path");
	path.setAttribute("fill", "#1DB954");
	path.setAttribute(
		"d",
		"M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0z" +
			"m38.6 121.2c-1.5 2.5-4.8 3.3-7.3 1.8-20-12.2-45.2-14.9-74.8-8.2" +
			"-2.9.7-5.7-1.1-6.4-4-.7-2.9 1.1-5.7 4-6.4 32.4-7.4 60.2-4.2 82.6" +
			" 9.5 2.5 1.5 3.2 4.8 1.9 7.3zm10.3-22.9c-1.9 3.1-5.9 4-9 2.1" +
			"-22.9-14-57.8-18.1-84.9-9.9-3.5 1.1-7.2-.9-8.3-4.4-1.1-3.5.9-7.2" +
			" 4.4-8.3 31-9.4 69.5-4.8 95.8 11.4 3 1.9 4 5.9 2 9.1z" +
			"M134 75c-27.5-16.3-72.9-17.8-99.2-9.8-4.2 1.3-8.6-1.1-9.9-5.3" +
			"-1.3-4.2 1.1-8.6 5.3-9.9 30.2-9.2 80.3-7.4 112 11.3 3.8 2.2 5" +
			" 7.1 2.8 10.9-2.1 3.7-7 4.9-10.9 2.8z",
	);
	svg.appendChild(path);
	parent.appendChild(svg);
}

