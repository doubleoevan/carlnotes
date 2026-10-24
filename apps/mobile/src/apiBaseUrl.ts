// the api base url the app configures the shared client with
import { SITE_URL } from "@carlnotes/core/lib/pageHead"

// the api's port on the machine that serves bun run dev:api
const DEVELOPMENT_API_PORT = 3000

// how the url is chosen: whether this is a development build, and the host the device reached the dev server on
export type ToApiBaseUrlOptions = { isDevelopment: boolean; hostUri?: string }

/**
 * Returns the api base url. A development build reaches the api port on the host the device already reached the Expo
 * dev server on. That one rule serves the simulator, the emulator, and a phone on the same network. A production
 * build reaches the site's own domain.
 */
export function toApiBaseUrl({ isDevelopment, hostUri }: ToApiBaseUrlOptions): string {
	// a production build talks to the site
	if (!isDevelopment) {
		return SITE_URL
	}

	// the dev server's host without its bundler port. localhost covers a missing address
	const [host] = (hostUri ?? "").split(":")
	return `http://${host || "localhost"}:${DEVELOPMENT_API_PORT}`
}
