import { App, PluginSettingTab, Setting } from "obsidian";
import SpotifySinglePlayerPlugin from "./main";

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
