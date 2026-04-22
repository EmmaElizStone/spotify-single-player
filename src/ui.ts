import { App, Modal, Setting } from "obsidian";

/**
 * Modal that prompts the user to paste a Spotify track link or URI.
 */
export class SpotifyTrackUrlModal extends Modal {
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

/**
 * Modal that loads accounts.spotify.com/login inside Obsidian's Electron browser
 * context. When the user signs in here, Spotify session cookies are stored in
 * Obsidian's session so that embed iframes can play full songs.
 */
export class SpotifyEmbedLoginModal extends Modal {
constructor(app: App) {
super(app);
}

onOpen() {
const { contentEl, modalEl } = this;

modalEl.addClass("spotify-embed-login-modal-el");
contentEl.addClass("spotify-embed-login-content");

const header = contentEl.createDiv({ cls: "spotify-embed-login-header" });
header.createEl("p", {
text: "Sign in to your spotify account below so the embed player can detect your session and play full songs. Close this panel when done.",
});
header.createEl("p", {
text: "Use your email and password to sign in — the external sign-in option does not work in this panel.",
cls: "spotify-embed-login-warning",
});

const frameContainer = contentEl.createDiv({ cls: "spotify-embed-login-frame-container" });

const iframe = frameContainer.createEl("iframe", { cls: "spotify-embed-login-iframe" });
iframe.setAttribute("src", "https://accounts.spotify.com/login");
}

onClose() {
this.contentEl.empty();
}
}
