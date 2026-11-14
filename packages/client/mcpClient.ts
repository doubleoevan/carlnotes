// the api client for the mcp consent page. it fetches the mcp client asking for consent and sends the user's consent
import { type McpConsentClient, mcpConsentClient } from "@carlnotes/contracts/aiAgentIdentity"
import { apiClient, fetchApi, readApiResponse } from "./apiClient"

/**
 * Fetches the mcp client asking for consent, with the host its answer returns to if CarlNotes does not know that host,
 * or null if no client has that id. The redirect address is the one in the consent page's own query. Throws an
 * ApiResponseError if the response does not parse as the client.
 */
export async function fetchMcpConsentClient(
	clientId: string,
	redirectUri: string | null,
): Promise<McpConsentClient | null> {
	// a client id can be a url, so it is encoded to stay one path segment
	const mcpConsentClientResponse = await apiClient().api.mcp.clients[":clientId"].$get({
		param: { clientId: encodeURIComponent(clientId) },
		query: { redirect_uri: redirectUri ?? undefined },
	})
	if (!mcpConsentClientResponse.ok) {
		return null
	}
	return readApiResponse(mcpConsentClient, mcpConsentClientResponse)
}

/**
 * Sends the user's consent, allowed or denied, with the signed query the auth server sent the consent page,
 * and returns the url to go to next.
 */
export async function sendMcpConsent(oauthQuery: string, isAccepted: boolean): Promise<string> {
	// post the consent to better auth's consent endpoint. the typed api client has no path for it
	const consentResponse = await fetchApi("/api/auth/oauth2/consent", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ accept: isAccepted, oauth_query: oauthQuery }),
	})
	if (!consentResponse.ok) {
		throw new Error(`consent returned ${consentResponse.status}`)
	}
	return ((await consentResponse.json()) as { url: string }).url
}
