import { Notice, Plugin } from "obsidian";
import { fetchSpotifyAccessToken, fetchTrackInfo, parseSpotifyTrackId, buildEmbedMarkdown } from "./spotify";
import { DEFAULT_SETTINGS, SpotifySinglePlayerSettingTab, SpotifySinglePlayerSettings } from "./settings";
import { fetchUserProfile, refreshSpotifyUserToken, startSpotifyOAuthLogin, UserTokenResponse } from "./auth";
import { SpotifyEmbedLoginModal, SpotifyTrackUrlModal } from "./ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CachedToken {
accessToken: string;
expiresAt: number;
}

export interface StoredUserAuth {
accessToken: string;
refreshToken: string;
expiresAt: number;
displayName: string;
premium: boolean;
}

interface PluginData {
/** Nested settings (v1.1+). */
settings?: Partial<SpotifySinglePlayerSettings>;
/** Stored user OAuth tokens and profile. */
userAuth?: StoredUserAuth;
// Legacy flat settings keys kept for backward compatibility (v1.0).
clientId?: string;
clientSecret?: string;
autoplay?: boolean;
iframeHeight?: number;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class SpotifySinglePlayerPlugin extends Plugin {
settings: SpotifySinglePlayerSettings;
userAuth: StoredUserAuth | null = null;

private clientToken: CachedToken | null = null;
private userToken: CachedToken | null = null;
private iframeRepeatIntervals = new WeakMap<HTMLIFrameElement, number>();

async onload() {
await this.loadSettings();

// ---- Commands ----

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
const fullPlayback = this.userAuth?.premium === true;
editor.replaceSelection(
buildEmbedMarkdown(track, this.settings.autoplay, this.settings.iframeHeight, fullPlayback),
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
await this.getClientCredentialsToken(true);
new Notice("Spotify developer credentials are valid.");
} catch (error) {
const message = error instanceof Error ? error.message : "Unknown Spotify error.";
new Notice(`Spotify authentication failed: ${message}`);
}
},
});

this.addCommand({
id: "login-to-spotify-account",
name: "Log in to spotify account",
callback: () => this.loginToSpotify(),
});

this.addCommand({
id: "logout-of-spotify-account",
name: "Log out of spotify account",
callback: async () => {
this.userAuth = null;
this.userToken = null;
await this.savePluginData();
new Notice("Logged out of your spotify account.");
},
});

// ---- Markdown post-processor: repeat playback ----

this.registerMarkdownPostProcessor((root) => {
for (const frame of Array.from(
root.querySelectorAll<HTMLIFrameElement>("iframe.spotify-single-player-embed"),
)) {
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

// ---- Data persistence ----

async loadSettings() {
const data = ((await this.loadData()) ?? {}) as PluginData;

// Support the legacy flat format (v1.0) where settings lived at the root.
const savedSettings: Partial<SpotifySinglePlayerSettings> = data.settings ?? {
clientId: data.clientId,
clientSecret: data.clientSecret,
autoplay: data.autoplay,
iframeHeight: data.iframeHeight,
};

this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
this.userAuth = data.userAuth ?? null;

if (this.userAuth) {
this.userToken = {
accessToken: this.userAuth.accessToken,
expiresAt: this.userAuth.expiresAt,
};
}
}

async saveSettings() {
await this.savePluginData();
}

async savePluginData() {
await this.saveData({ settings: this.settings, userAuth: this.userAuth });
}

// ---- OAuth login / logout ----

async loginToSpotify() {
if (!this.settings.clientId) {
new Notice("Enter a spotify client identifier in plugin settings first.");
return;
}

try {
new Notice("Opening spotify login in your browser…");
const tokenResponse = await startSpotifyOAuthLogin(this.settings.clientId);
await this.handleLoginSuccess(tokenResponse);
// Open the in-app Spotify login so session cookies are set in the
// Electron browser context, enabling full-song playback in embeds.
new SpotifyEmbedLoginModal(this.app).open();
} catch (error) {
const message = error instanceof Error ? error.message : "Unknown Spotify error.";
new Notice(`Spotify login failed: ${message}`);
}
}

async handleLoginSuccess(tokenResponse: UserTokenResponse) {
const now = Date.now();
const expiresAt = now + tokenResponse.expires_in * 1000;

let displayName = "Unknown";
let premium = false;

try {
const profile = await fetchUserProfile(tokenResponse.access_token);
displayName = profile.displayName;
premium = profile.premium;
} catch {
// Profile fetch is best-effort; proceed with defaults.
}

this.userAuth = {
accessToken: tokenResponse.access_token,
refreshToken: tokenResponse.refresh_token,
expiresAt,
displayName,
premium,
};
this.userToken = { accessToken: tokenResponse.access_token, expiresAt };

await this.savePluginData();

const tier = premium ? "Premium" : "Free";
new Notice(
`Logged in as ${displayName} (${tier}). ` +
(premium
? "Sign in on the Spotify page that opened to enable full song playback in embeds."
: "A Spotify Premium account is required for full song playback."),
);
}

// ---- Token helpers ----

private async getSpotifyAccessToken(forceRefresh = false): Promise<string> {
const userToken = await this.getUserToken(forceRefresh);
if (userToken) {
return userToken;
}
return this.getClientCredentialsToken(forceRefresh);
}

private async getUserToken(forceRefresh = false): Promise<string | null> {
if (!this.userAuth) {
return null;
}

const now = Date.now();
if (!forceRefresh && this.userToken && this.userToken.expiresAt > now + 10_000) {
return this.userToken.accessToken;
}

try {
const refreshed = await refreshSpotifyUserToken(this.userAuth.refreshToken, this.settings.clientId);
const expiresAt = now + refreshed.expires_in * 1000;
this.userAuth = {
...this.userAuth,
accessToken: refreshed.access_token,
refreshToken: refreshed.refresh_token,
expiresAt,
};
this.userToken = { accessToken: refreshed.access_token, expiresAt };
await this.savePluginData();
return refreshed.access_token;
} catch {
// If the refresh fails, clear user auth and fall back to client credentials.
this.userAuth = null;
this.userToken = null;
await this.savePluginData();
new Notice("Spotify session expired. Please log in again.");
return null;
}
}

private async getClientCredentialsToken(forceRefresh = false): Promise<string> {
const now = Date.now();
if (!forceRefresh && this.clientToken && this.clientToken.expiresAt > now + 10_000) {
return this.clientToken.accessToken;
}

const tokenResponse = await fetchSpotifyAccessToken(this.settings);
this.clientToken = {
accessToken: tokenResponse.access_token,
expiresAt: now + tokenResponse.expires_in * 1000,
};
return this.clientToken.accessToken;
}
}
