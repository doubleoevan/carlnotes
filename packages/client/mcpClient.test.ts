// the mcp consent page's client: a client id that is a url stays one path segment
import { afterEach, expect, test } from "bun:test"
import { fetchMcpClientName } from "./mcpClient"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test("a client id that is a url is sent encoded, so the route reads it whole", async () => {
	// the name route returns Claude, with the request url recorded
	let requestedUrl = ""
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		requestedUrl = String(input instanceof Request ? input.url : input)
		return Response.json({ name: "Claude" })
	}) as unknown as typeof fetch

	expect(await fetchMcpClientName("https://claude.ai/oauth/mcp-oauth-client-metadata")).toBe("Claude")
	expect(requestedUrl).toEndWith("/api/mcp/clients/https%3A%2F%2Fclaude.ai%2Foauth%2Fmcp-oauth-client-metadata")
})
