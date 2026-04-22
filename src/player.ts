import { requestUrl } from "obsidian";

// ---------------------------------------------------------------------------
// Spotify Web Playback SDK — minimal type declarations
// The SDK is loaded at runtime from https://sdk.scdn.co/spotify-player.js and
// is never bundled. The global `window.Spotify` is set by the SDK script.
// ---------------------------------------------------------------------------

interface SpotifyPlayerOptions {
	name: string;
	getOAuthToken: (cb: (token: string) => void) => void;
	volume?: number;
}

interface SpotifySDKTrack {
	id: string;
	name: string;
	duration_ms: number;
	uri: string;
	album: { images: { url: string }[] };
	artists: { name: string }[];
}

export interface SpotifyPlaybackState {
	paused: boolean;
	position: number;
	duration: number;
	track_window: { current_track: SpotifySDKTrack };
}

interface SpotifySDKPlayer {
	connect(): Promise<boolean>;
	disconnect(): void;
	addListener(event: "ready", cb: (data: { device_id: string }) => void): boolean;
	addListener(event: "not_ready", cb: (data: { device_id: string }) => void): boolean;
	addListener(
		event: "player_state_changed",
		cb: (state: SpotifyPlaybackState | null) => void,
	): boolean;
	addListener(
		event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
		cb: (data: { message: string }) => void,
	): boolean;
	removeListener(event: string): boolean;
	getCurrentState(): Promise<SpotifyPlaybackState | null>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	seek(position_ms: number): Promise<void>;
}

declare global {
	interface Window {
		onSpotifyWebPlaybackSDKReady?: () => void;
		Spotify?: { Player: new (opts: SpotifyPlayerOptions) => SpotifySDKPlayer };
	}
}

// ---------------------------------------------------------------------------
// SpotifyWebPlayer — wraps the SDK as a lazily-initialized singleton device
// ---------------------------------------------------------------------------

type StateListener = (state: SpotifyPlaybackState | null) => void;

export class SpotifyWebPlayer {
	private player: SpotifySDKPlayer | null = null;
	private deviceId: string | null = null;
	private stateListeners = new Set<StateListener>();
	private initPromise: Promise<void> | null = null;
	private currentTrackId: string | null = null;

	// -- SDK loading --

	private loadSdk(): Promise<void> {
		if (window.Spotify) return Promise.resolve();
		return new Promise((resolve) => {
			window.onSpotifyWebPlaybackSDKReady = resolve;
			const script = document.createElement("script");
			script.src = "https://sdk.scdn.co/spotify-player.js";
			document.head.appendChild(script);
		});
	}

	private connect(getToken: () => Promise<string>): Promise<void> {
		return new Promise((resolve, reject) => {
			const sdk = window.Spotify;
			if (!sdk) {
				reject(new Error("Spotify SDK failed to load."));
				return;
			}

			const player = new sdk.Player({
				name: "Obsidian",
				getOAuthToken: (cb) => {
					void getToken().then(cb);
				},
				volume: 0.8,
			});

			player.addListener("ready", ({ device_id }) => {
				this.deviceId = device_id;
				resolve();
			});
			player.addListener("initialization_error", ({ message }) => reject(new Error(message)));
			player.addListener("authentication_error", ({ message }) => reject(new Error(message)));
			player.addListener("account_error", ({ message }) =>
				reject(new Error(`Spotify Premium is required for full song playback. ${message}`)),
			);
			player.addListener("player_state_changed", (state) => {
				if (state) this.currentTrackId = state.track_window.current_track.id;
				this.stateListeners.forEach((l) => l(state));
			});

			void player.connect();
			this.player = player;
		});
	}

	// -- Public API --

	/**
	 * Lazily initialize the SDK player. Safe to call multiple times — returns
	 * the same promise if initialization is already in progress or complete.
	 */
	async initialize(getToken: () => Promise<string>): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this.initPromise = (async () => {
			await this.loadSdk();
			await this.connect(getToken);
		})();
		return this.initPromise;
	}

	/**
	 * Start playing a track on this device, then enable single-track repeat so
	 * the song loops automatically until the user pauses it.
	 */
	async playTrack(trackId: string, getToken: () => Promise<string>): Promise<void> {
		await this.initialize(getToken);
		if (!this.deviceId) throw new Error("Playback device is not ready.");

		const token = await getToken();
		const deviceParam = encodeURIComponent(this.deviceId);

		// Transfer playback to this device and start the track.
		const playRes = await requestUrl({
			url: `https://api.spotify.com/v1/me/player/play?device_id=${deviceParam}`,
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
			throw: false,
		});

		if (playRes.status >= 400) {
			const err = playRes.json as Partial<{ error: { message: string } }>;
			throw new Error(err.error?.message ?? `Spotify playback error (${playRes.status})`);
		}

		// Enable single-track repeat so the song loops until the user pauses.
		await requestUrl({
			url: `https://api.spotify.com/v1/me/player/repeat?state=track&device_id=${deviceParam}`,
			method: "PUT",
			headers: { Authorization: `Bearer ${token}` },
			throw: false,
		});
	}

	/** Toggle play/pause for the currently active track. */
	async togglePlay(): Promise<void> {
		if (!this.player) return;
		const state = await this.player.getCurrentState();
		if (!state) return;
		if (state.paused) {
			await this.player.resume();
		} else {
			await this.player.pause();
		}
	}

	/**
	 * Subscribe to SDK state-change events. Returns an unsubscribe function.
	 * Fired roughly every 500 ms while playing, and on play/pause/seek events.
	 */
	onStateChange(listener: StateListener): () => void {
		this.stateListeners.add(listener);
		return () => this.stateListeners.delete(listener);
	}

	/** The Spotify track ID that is currently loaded in the player, or null. */
	get activeTrackId(): string | null {
		return this.currentTrackId;
	}

	/** Disconnect and fully reset the player. Called from Plugin.onunload(). */
	destroy(): void {
		this.player?.disconnect();
		this.player = null;
		this.deviceId = null;
		this.initPromise = null;
		this.stateListeners.clear();
		this.currentTrackId = null;
	}
}
