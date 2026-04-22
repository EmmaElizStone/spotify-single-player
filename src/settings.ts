import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import SpotifySinglePlayerPlugin from "./main";
import { CALLBACK_REDIRECT_URI } from "./auth";

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

new Setting(containerEl)
.setName("Redirect uri")
.setDesc(
"Add this exact URI as an allowed redirect URI in your spotify developer app settings. " +
"Navigate to your app on the Spotify developer dashboard → Edit settings → Redirect URIs.",
)
.addText((text) => {
text.setValue(CALLBACK_REDIRECT_URI);
text.inputEl.setAttr("readonly", "true");
text.inputEl.addClass("spotify-redirect-uri-input");
})
.addButton((button) =>
button.setButtonText("Copy").onClick(() => {
navigator.clipboard.writeText(CALLBACK_REDIRECT_URI).then(() => {
new Notice("Redirect uri copied to clipboard.");
}, () => {
new Notice("Could not copy to clipboard.");
});
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
.setName("Full song playback")
.setDesc(
userAuth.premium
? "Premium account detected. Insert a spotify player into any note and click play to stream the full song on repeat."
: "Free account detected. A spotify premium subscription is required for full song playback.",
);
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

// ---- Player options ----

new Setting(containerEl).setName("Player configuration").setHeading();

new Setting(containerEl)
.setName("Enable autoplay")
.setDesc("Automatically start playback when a spotify player is rendered in a note.")
.addToggle((toggle) =>
toggle.setValue(this.plugin.settings.autoplay).onChange(async (value) => {
this.plugin.settings.autoplay = value;
await this.plugin.saveSettings();
}),
);

new Setting(containerEl)
.setName("Player height")
.setDesc("Height in pixels for inserted spotify players.")
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
