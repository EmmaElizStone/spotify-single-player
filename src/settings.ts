import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import SpotifySinglePlayerPlugin from "./main";
import { SpotifyEmbedLoginModal } from "./ui";

export interface SpotifySinglePlayerSettings {
clientId: string;
clientSecret: string;
autoplay: boolean;
iframeHeight: number;
}

export const DEFAULT_SETTINGS: SpotifySinglePlayerSettings = {
clientId: "",
clientSecret: "",
autoplay: true,
iframeHeight: 152,
};

export class SpotifySinglePlayerSettingTab extends PluginSettingTab {
plugin: SpotifySinglePlayerPlugin;

constructor(app: App, plugin: SpotifySinglePlayerPlugin) {
super(app, plugin);
this.plugin = plugin;
}

display(): void {
const { containerEl } = this;
containerEl.empty();

// ---- Developer credentials ----

new Setting(containerEl).setName("Developer credentials").setHeading();

new Setting(containerEl)
.setName("Spotify client identifier")
.setDesc("Client identifier from your spotify developer app.")
.addText((text) =>
text
.setPlaceholder("Spotify client identifier")
.setValue(this.plugin.settings.clientId)
.onChange(async (value) => {
this.plugin.settings.clientId = value.trim();
await this.plugin.saveSettings();
}),
);

new Setting(containerEl)
.setName("Spotify client secret")
.setDesc("Client secret from your spotify developer app.")
.addText((text) =>
text
.setPlaceholder("Spotify client secret")
.setValue(this.plugin.settings.clientSecret)
.onChange(async (value) => {
this.plugin.settings.clientSecret = value.trim();
await this.plugin.saveSettings();
}),
);

// ---- Spotify account ----

new Setting(containerEl).setName("Spotify account").setHeading();

const { userAuth } = this.plugin;

if (userAuth) {
const tier = userAuth.premium ? "Premium" : "Free";

new Setting(containerEl)
.setName("Account status")
.setDesc(`Logged in as ${userAuth.displayName} (${tier}).`)
.addButton((button) =>
button
.setButtonText("Log out")
.onClick(async () => {
this.plugin.userAuth = null;
await this.plugin.savePluginData();
new Notice("Logged out of your spotify account.");
this.display();
}),
);

new Setting(containerEl)
.setName("Full song playback in embeds")
.setDesc(
userAuth.premium
? "Premium account detected. Click below to sign in to spotify inside obsidian so embeds can play full songs."
: "Free account detected. A spotify premium subscription is required for full song playback in embeds.",
)
.addButton((button) => {
button.setButtonText("Open spotify sign-in page");
if (!userAuth.premium) {
button.setDisabled(true);
}
button.onClick(() => new SpotifyEmbedLoginModal(this.app).open());
});
} else {
new Setting(containerEl)
.setName("Account status")
.setDesc(
"Not logged in. Log in with your spotify account to enable full song playback (requires spotify premium).",
)
.addButton((button) =>
button
.setButtonText("Log in to spotify")
.setCta()
.onClick(async () => {
await this.plugin.loginToSpotify();
// Refresh the tab once the login flow settles.
window.setTimeout(() => this.display(), 500);
}),
);
}

// ---- Embed options ----

new Setting(containerEl).setName("Embed configuration").setHeading();

new Setting(containerEl)
.setName("Enable autoplay for spotify embeds")
.setDesc("Enable autoplay on generated spotify iframe embeds.")
.addToggle((toggle) =>
toggle.setValue(this.plugin.settings.autoplay).onChange(async (value) => {
this.plugin.settings.autoplay = value;
await this.plugin.saveSettings();
}),
);

new Setting(containerEl)
.setName("Iframe height")
.setDesc("Height in pixels used for inserted spotify iframe embeds.")
.addText((text) =>
text
.setPlaceholder("152")
.setValue(this.plugin.settings.iframeHeight.toString())
.onChange(async (value) => {
const height = Number.parseInt(value, 10);
this.plugin.settings.iframeHeight = Number.isFinite(height) && height > 0 ? height : 152;
await this.plugin.saveSettings();
}),
);
}
}
