/**
 * Minimal type declarations for the Electron renderer-side APIs used by this plugin.
 * The full `electron` package is an external module supplied by Obsidian (Electron) at
 * runtime — it is listed in esbuild's `external` array and is never bundled.
 */
declare module "electron" {
	interface Shell {
		/** Open a URL in the user's default system browser. */
		openExternal(url: string): Promise<void>;
	}

	const shell: Shell;
	export { shell };
}
