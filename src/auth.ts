import * as http from "http";
import { requestUrl } from "obsidian";

// PKCE helpers

function base64UrlEncode(buffer: ArrayBuffer): string {
	let str = "";
	for (const b of new Uint8Array(buffer)) {
		str += String.fromCharCode(b);
	}
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeVerifier(): Promise<string> {
	const array = new Uint8Array(32);
	window.crypto.getRandomValues(array);
	return base64UrlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const data = new TextEncoder().encode(verifier);
	const digest = await window.crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(digest);
}

function generateState(): string {
	const array = new Uint8Array(16);
	window.crypto.getRandomValues(array);
	return base64UrlEncode(array.buffer);
}

async function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = http.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const { port } = address;
				server.close(() => resolve(port));
			} else {
				reject(new Error("Could not determine a free port."));
			}
		});
		server.on("error", reject);
	});
}

// Types

export interface UserTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope: string;
}

export interface SpotifyUserProfile {
	displayName: string;
	premium: boolean;
}

const SPOTIFY_SCOPES = "user-read-private user-read-email";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML =
	"<html><body style='font-family:sans-serif;padding:32px'><h2>Logged in to Spotify!</h2><p>You can close this tab and return to Obsidian.</p></body></html>";
const CANCELLED_HTML =
	"<html><body style='font-family:sans-serif;padding:32px'><h2>Login cancelled.</h2><p>You can close this tab and return to Obsidian.</p></body></html>";

/**
 * Start Spotify OAuth login via PKCE.
 * Opens the system browser for the user to authorize, then captures
 * the authorization code via a temporary local HTTP server.
 */
export async function startSpotifyOAuthLogin(clientId: string): Promise<UserTokenResponse> {
	const codeVerifier = await generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	const state = generateState();
	const port = await findFreePort();
	const redirectUri = `http://127.0.0.1:${port}/callback`;

	const authUrl = new URL("https://accounts.spotify.com/authorize");
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("scope", SPOTIFY_SCOPES);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("code_challenge_method", "S256");
	authUrl.searchParams.set("code_challenge", codeChallenge);
	authUrl.searchParams.set("state", state);

	return new Promise((resolve, reject) => {
		let server: http.Server | null = null;
		let settled = false;

		const cleanup = () => {
			server?.close();
			server = null;
		};

		const timeoutId = window.setTimeout(() => {
			if (!settled) {
				settled = true;
				cleanup();
				reject(new Error("Login timed out. Please try again."));
			}
		}, LOGIN_TIMEOUT_MS);

		const settle = (action: () => void) => {
			if (!settled) {
				settled = true;
				window.clearTimeout(timeoutId);
				cleanup();
				action();
			}
		};

		server = http.createServer((req, res) => {
			if (!req.url) {
				res.writeHead(400).end("Bad request");
				return;
			}

			const url = new URL(req.url, `http://127.0.0.1:${port}`);
			if (url.pathname !== "/callback") {
				res.writeHead(404).end("Not found");
				return;
			}

			const returnedState = url.searchParams.get("state");
			const code = url.searchParams.get("code");
			const error = url.searchParams.get("error");

			if (error) {
				res.writeHead(200, { "Content-Type": "text/html" }).end(CANCELLED_HTML);
				settle(() => reject(new Error(`Spotify login was cancelled or failed: ${error}`)));
				return;
			}

			if (returnedState !== state || !code) {
				res.writeHead(400, { "Content-Type": "text/html" }).end(
					"<html><body><p>Invalid response.</p></body></html>",
				);
				settle(() => reject(new Error("OAuth state mismatch or missing authorization code.")));
				return;
			}

			res.writeHead(200, { "Content-Type": "text/html" }).end(SUCCESS_HTML);

			exchangeCodeForTokens(code, codeVerifier, clientId, redirectUri)
				.then((tokenResponse) => settle(() => resolve(tokenResponse)))
				.catch((err: unknown) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))));
		});

		server.on("error", (err: Error) => settle(() => reject(err)));

		server.listen(port, "127.0.0.1", () => {
			window.open(authUrl.toString());
		});
	});
}

async function exchangeCodeForTokens(
	code: string,
	codeVerifier: string,
	clientId: string,
	redirectUri: string,
): Promise<UserTokenResponse> {
	const response = await requestUrl({
		url: "https://accounts.spotify.com/api/token",
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
			code_verifier: codeVerifier,
		}).toString(),
	});

	const body = response.json as Partial<UserTokenResponse>;
	if (!body.access_token || !body.refresh_token || typeof body.expires_in !== "number") {
		throw new Error("Spotify token response was invalid.");
	}

	return {
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_in: body.expires_in,
		scope: body.scope ?? "",
	};
}

export async function refreshSpotifyUserToken(refreshToken: string, clientId: string): Promise<UserTokenResponse> {
	const response = await requestUrl({
		url: "https://accounts.spotify.com/api/token",
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
		}).toString(),
	});

	const body = response.json as Partial<UserTokenResponse>;
	if (!body.access_token || typeof body.expires_in !== "number") {
		throw new Error("Spotify token refresh failed.");
	}

	return {
		access_token: body.access_token,
		refresh_token: body.refresh_token ?? refreshToken,
		expires_in: body.expires_in,
		scope: body.scope ?? "",
	};
}

export async function fetchUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
	const response = await requestUrl({
		url: "https://api.spotify.com/v1/me",
		method: "GET",
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	const body = response.json as Partial<{ display_name: string; product: string }>;
	return {
		displayName: body.display_name ?? "Unknown",
		premium: body.product === "premium",
	};
}
