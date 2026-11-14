// the mcp consent page's client: a client id that is a url stays one path segment, the redirect address goes with
// it, and a response that is not the client is rejected
import { afterEach, expect, test } from "bun:test"
import { ApiResponseError } from "./apiClient"
import { fetchMcpConsentClient } from "./mcpClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("a client id that is a url is sent encoded, so the route reads it whole", async () => {
	// the client route returns Claude on a known host, with the request url recorded
	let requestedUrl = ""
	const mcpConsentClient = { name: "Claude", unknownRedirectHost: null }
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input instanceof Request ? input.url : input)
		return Response.json(mcpConsentClient)
	}) as unknown as typeof fetch

	// the client id stays one path segment, and the consent page's redirect address is the query
	const clientId = "https://claude.ai/oauth/mcp-oauth-client-metadata"
	const redirectUri = "https://claude.ai/api/mcp/auth_callback"
	expect(await fetchMcpConsentClient(clientId, redirectUri)).toEqual(mcpConsentClient)
	expect(requestedUrl).toEndWith(
		"/api/mcp/clients/https%3A%2F%2Fclaude.ai%2Foauth%2Fmcp-oauth-client-metadata?redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback",
	)
})

test("a consent page with no redirect address sends no query", async () => {
	// the client route returns a client, with the request url recorded
	let requestedUrl = ""
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input instanceof Request ? input.url : input)
		return Response.json({ name: "Claude", unknownRedirectHost: null })
	}) as unknown as typeof fetch
	await fetchMcpConsentClient("client-1", null)
	expect(requestedUrl).toEndWith("/api/mcp/clients/client-1")
})

test("a response with no unknown redirect host is rejected, so the consent page never reads it as a known host", async () => {
	globalThis.fetch = (async () => Response.json({ name: "Claude" })) as unknown as typeof fetch
	await expect(fetchMcpConsentClient("client-1", null)).rejects.toBeInstanceOf(ApiResponseError)
})
