// the api client for the mcp consent page. it fetches the mcp client's name and sends the user's consent
import { apiClient, toApiUrl } from "./apiClient"

/**
 * Fetches the name of the mcp client asking for consent, or null when no client has that id.
 */
export async function fetchMcpClientName(clientId: string): Promise<string | null> {
	const clientNameResponse = await apiClient().api.mcp.clients[":clientId"].$get({ param: { clientId } })
	if (!clientNameResponse.ok) {
		return null
	}
	return (await clientNameResponse.json()).name
}

/**
 * Sends the user's consent, allowed or denied, with the signed query the auth server sent the consent page,
 * and returns the url to go to next.
 */
export async function sendMcpConsent(oauthQuery: string, isAccepted: boolean): Promise<string> {
	// post the consent to better auth's consent endpoint. the typed api client has no path for it
	const consentResponse = await fetch(toApiUrl("/api/auth/oauth2/consent"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ accept: isAccepted, oauth_query: oauthQuery }),
	})
	if (!consentResponse.ok) {
		throw new Error(`consent returned ${consentResponse.status}`)
	}
	return ((await consentResponse.json()) as { url: string }).url
}
