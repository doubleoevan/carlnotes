// grouping uses only registered origins, keeping mixed and loopback registrations distinct
import { expect, test } from "bun:test"
import { toAiAgentIdentity } from "./aiAgentIdentity"

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
