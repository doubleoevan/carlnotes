// grouping uses only registered origins, keeping mixed and loopback registrations distinct, and a redirect address
// names its host only if CarlNotes does not know it
import { expect, test } from "bun:test"
import { toAiAgentIdentity, toUnknownRedirectHost } from "./aiAgentIdentity"

test("self-reported names cannot impersonate registered app domains", () => {
	const unknownClient = toAiAgentIdentity({
		clientId: "registered-1",
		clientDiscoveryId: null,
		redirectUris: ["https://unknown.example/callback"],
	})
	expect(unknownClient.label).toBe("unknown.example")
	expect(unknownClient.id).toBe("domain:unknown.example")
	expect(
		toAiAgentIdentity({ clientId: "https://claude.ai/client.json", clientDiscoveryId: "cimd", redirectUris: [] }).label,
	).toBe("Claude")
})

test("known aliases group together while local and mixed registrations stay concrete", () => {
	const first = toAiAgentIdentity({
		clientId: "a",
		clientDiscoveryId: null,
		redirectUris: ["https://chatgpt.com/callback"],
	})
	const second = toAiAgentIdentity({
		clientId: "b",
		clientDiscoveryId: null,
		redirectUris: ["https://chat.openai.com/callback"],
	})
	expect(first.id).toBe(second.id)
	expect(
		toAiAgentIdentity({ clientId: "a", clientDiscoveryId: null, redirectUris: ["http://localhost:8000/"] }).id,
	).toBe("client:a")
	expect(
		toAiAgentIdentity({ clientId: "b", clientDiscoveryId: null, redirectUris: ["http://localhost:8000/"] }).id,
	).toBe("client:b")
	expect(
		toAiAgentIdentity({
			clientId: "mixed",
			clientDiscoveryId: null,
			redirectUris: ["https://claude.ai/callback", "http://localhost:8000/"],
		}).domain,
	).toBeNull()
	expect(
		toAiAgentIdentity({
			clientId: "lookalike",
			clientDiscoveryId: null,
			redirectUris: ["https://claude.ai.evil.example/callback"],
		}).label,
	).toBe("claude.ai.evil.example")
})

// the MCP consent page's warning: only a host CarlNotes does not know is returned
test.each([
	["https://claude.ai/api/mcp/auth_callback", null],
	["https://claude.com/api/mcp/auth_callback", null],
	["https://chatgpt.com/connector_platform_oauth_redirect", null],
	["https://www.perplexity.ai/rest/connections/oauth_callback", null],
	["https://vscode.dev/redirect", null],
	["http://localhost:33418/", null],
	["http://127.0.0.1:8976/callback", null],
	["http://[::1]:8976/callback", null],
	["cursor://anysphere.cursor-retrieval/oauth/callback", null],
	["not an address", null],
	["https://unknown.example/callback", "unknown.example"],
	["https://claude.ai.evil.example/callback", "claude.ai.evil.example"],
	["https://claude.ai:8443/callback", "claude.ai"],
	["http://claude.ai/callback", "claude.ai"],
	["https://user:secret@claude.ai/callback", "claude.ai"],
	["http://192.168.1.20:8080/callback", "192.168.1.20"],
])("the unknown redirect host of %s is %p", (redirectUri, unknownRedirectHost) => {
	expect(toUnknownRedirectHost(redirectUri)).toBe(unknownRedirectHost)
})
