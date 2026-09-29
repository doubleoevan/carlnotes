// the typed Hono client for the api, and readApiErrorMessage, which reads the api's error message.
// the types-only AppType import adds no api code to the ui bundle
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// the api's base url. a browser request goes to the page's own origin,
// and a server render's request goes to the api on port 3000, in dev and in production
const API_BASE_URL = typeof window === "undefined" ? "http://localhost:3000" : ""

export const apiClient = hc<AppType>(API_BASE_URL)

/**
 * Returns the error message in a failed api response's body, or undefined if the body has none.
 */
export async function readApiErrorMessage(response: Response): Promise<string | undefined> {
	const body = (await response.json().catch(() => null)) as { error?: string } | null
	return body?.error
}
