// the app's own base url, from BETTER_AUTH_URL, for the server code that links back into the app

/**
 * Returns the app's base url without a trailing slash, or undefined if it is not configured.
 */
export function appBaseUrl(): string | undefined {
	return Bun.env.BETTER_AUTH_URL?.replace(/\/$/, "")
}

/**
 * Returns the app's base url without a trailing slash, or the local dev server's if it is not configured.
 */
export function appUrl(): string {
	return appBaseUrl() ?? "http://localhost:5173"
}
