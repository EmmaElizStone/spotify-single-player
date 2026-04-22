import { App, Modal, Notice, Plugin, Setting } from "obsidian";
import { buildEmbedMarkdown, fetchSpotifyAccessToken, fetchTrackInfo, parseSpotifyTrackId } from "./spotify";
import { DEFAULT_SETTINGS, SpotifySinglePlayerSettingTab, SpotifySinglePlayerSettings } from "./settings";

interface CachedSpotifyToken {
	accessToken: string;
	expiresAt: number;
}

export default class SpotifySinglePlayerPlugin extends Plugin {
	settings: SpotifySinglePlayerSettings;
	private token: CachedSpotifyToken | null = null;
	private iframeRepeatIntervals = new WeakMap<HTMLIFrameElement, number>();

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "insert-spotify-track-iframe",
			name: "Insert spotify track iframe",
			editorCallback: async (editor) => {
				const selection = editor.getSelection().trim();
				const spotifyInput = selection || (await new SpotifyTrackUrlModal(this.app).openAndGetValue());
				if (!spotifyInput) {
					return;
				}

				try {
					const trackId = parseSpotifyTrackId(spotifyInput);
					if (!trackId) {
						new Notice("Enter a valid spotify track link or spotify:track reference.");
						return;
					}

					const accessToken = await this.getSpotifyAccessToken();
					const track = await fetchTrackInfo(trackId, accessToken);
					editor.replaceSelection(
						buildEmbedMarkdown(track, this.settings.autoplay, this.settings.iframeHeight),
					);
					new Notice(`Inserted iframe for ${track.name} (${track.artists.join(", ")})`);
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown Spotify error.";
					new Notice(`Could not insert Spotify iframe: ${message}`);
				}
			},
		});

		this.addCommand({
			id: "authenticate-spotify-client",
			name: "Authenticate spotify developer credentials",
			callback: async () => {
				try {
					await this.getSpotifyAccessToken(true);
					new Notice("Spotify developer credentials are valid.");
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown Spotify error.";
					new Notice(`Spotify authentication failed: ${message}`);
				}
			},
		});

		this.registerMarkdownPostProcessor((root) => {
			for (const frame of Array.from(root.querySelectorAll<HTMLIFrameElement>("iframe.spotify-single-player-embed"))) {
				const repeatMs = Number(frame.getAttribute("data-spotify-repeat-ms"));
				const src = frame.getAttribute("src");
				if (!Number.isFinite(repeatMs) || repeatMs <= 0 || !src || this.iframeRepeatIntervals.has(frame)) {
					continue;
				}

				const interval = window.setInterval(() => {
					if (!frame.isConnected) {
						window.clearInterval(interval);
						this.iframeRepeatIntervals.delete(frame);
						return;
					}

					const separator = src.includes("?") ? "&" : "?";
					frame.setAttribute("src", `${src}${separator}repeatTick=${Date.now()}`);
				}, repeatMs + 600);

				this.iframeRepeatIntervals.set(frame, interval);
				this.register(() => window.clearInterval(interval));
			}
		});

		this.addSettingTab(new SpotifySinglePlayerSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<SpotifySinglePlayerSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async getSpotifyAccessToken(forceRefresh = false): Promise<string> {
		const now = Date.now();
		if (!forceRefresh && this.token && this.token.expiresAt > now + 10_000) {
			return this.token.accessToken;
		}

		const tokenResponse = await fetchSpotifyAccessToken(this.settings);
		this.token = {
			accessToken: tokenResponse.access_token,
			expiresAt: now + tokenResponse.expires_in * 1000,
		};

		return this.token.accessToken;
	}
}

class SpotifyTrackUrlModal extends Modal {
	private resolveValue: ((value: string | null) => void) | null = null;
	private value = "";

	constructor(app: App) {
		super(app);
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolveValue = resolve;
			this.open();
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl)
			.setName("Spotify track link")
			.setDesc("Paste a spotify track link or spotify:track reference.")
			.addText((text) => {
				text.setPlaceholder("https://open.spotify.com/track/...").onChange((value) => {
					this.value = value;
				});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						this.submitValue();
					}
				});
				text.inputEl.focus();
			});

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText("Insert")
				.setCta()
				.onClick(() => this.submitValue()),
		);
	}

	onClose() {
		this.contentEl.empty();
		if (this.resolveValue) {
			this.resolveValue(null);
			this.resolveValue = null;
		}
	}

	private submitValue() {
		this.resolveValue?.(this.value.trim() || null);
		this.resolveValue = null;
		this.close();
	}
}
