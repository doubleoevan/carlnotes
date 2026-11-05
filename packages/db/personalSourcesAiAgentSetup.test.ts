import { expect, test } from "bun:test"
import type { ConnectedAiAgent } from "@carlnotes/contracts/personalSourcesAccounts"
import { toPersonalSourcesConnectionNudge } from "./personalSourcesAiAgentSetup"

const aiAgent: ConnectedAiAgent = {
	id: "domain:claude.ai",
	label: "Claude",
	domain: "claude.ai",
	clientIds: ["client"],
	isConnected: true,
	consentCreatedAt: "2026-11-02T00:00:00.000Z",
}

test("a new consent nudges once, a dismissal persists, and a later reconnect nudges again", () => {
	// derive setup from live grant timestamps without reading received content
	expect(toPersonalSourcesConnectionNudge({ aiAgents: [aiAgent], dismissedAt: null })).toBe(aiAgent.consentCreatedAt)
	expect(toPersonalSourcesConnectionNudge({ aiAgents: [aiAgent], dismissedAt: aiAgent.consentCreatedAt })).toBeNull()
	const reconnect = { ...aiAgent, consentCreatedAt: "2026-11-02T01:00:00.000Z" }
	expect(toPersonalSourcesConnectionNudge({ aiAgents: [reconnect], dismissedAt: aiAgent.consentCreatedAt })).toBe(
		reconnect.consentCreatedAt,
	)
	expect(
		toPersonalSourcesConnectionNudge({ aiAgents: [{ ...reconnect, isConnected: false }], dismissedAt: null }),
	).toBeNull()
	expect(
		toPersonalSourcesConnectionNudge({ aiAgents: [{ ...aiAgent, consentCreatedAt: null }], dismissedAt: null }),
	).toBeNull()
})
