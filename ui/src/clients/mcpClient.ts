// the api client for the mcp consent page. it fetches the mcp client's name and sends the user's consent
import { hc } from "hono/client"
import type { AppType } from "../../../api"

const apiClient = hc<AppType>(window.location.origin)

/**
 * Fetches the name of the mcp client asking for consent, or null when no client has that id.
 */
export async function fetchMcpClientName(clientId: string): Promise<string | null> {
	const clientNameResponse = await apiClient.api.mcp.clients[":clientId"].$get({ param: { clientId } })
	if (!clientNameResponse.ok) {
		return null
	}
	return (await clientNameResponse.json()).name
}

/**
 * Sends the user's consent, allowed or denied, and returns the redirect url.
 */
export async function sendMcpConsent(consentCode: string, isAccepted: boolean): Promise<string> {
	// post the consent to better auth's consent endpoint. the typed api client has no path for it
	const consentResponse = await fetch("/api/auth/oauth2/consent", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ accept: isAccepted, consent_code: consentCode }),
	})
	if (!consentResponse.ok) {
		throw new Error(`consent returned ${consentResponse.status}`)
	}
	return ((await consentResponse.json()) as { redirectURI: string }).redirectURI
}
