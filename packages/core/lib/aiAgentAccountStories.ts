import type { AiAgentAccountState } from "../hooks/useAiAgentAccount"

/**
 * Supplies inert account states to both component browsers without credentials or account requests.
 */
export function aiAgentAccountStory(overrides: Partial<AiAgentAccountState> = {}): AiAgentAccountState {
	return {
		aiAgents: [
			{
				id: "domain:claude.ai",
				label: "Claude",
				domain: "claude.ai",
				clientIds: ["example-client"],
				isConnected: true,
				consentCreatedAt: "2026-11-02T00:00:00Z",
			},
		],
		keys: [
			{
				id: "example-key",
				label: "My coding agent",
				lastFour: "demo",
				createdAt: "2026-11-02T00:00:00Z",
				lastUsedAt: null,
				revokedAt: null,
			},
		],
		canCreate: true,
		isLoading: false,
		hasError: false,
		isPending: false,
		error: null,
		secret: null,
		createKey: async () => {},
		revokeAiAgent: async () => {},
		revokeKey: async () => {},
		retry: () => {},
		dismissSecret: () => {},
		...overrides,
	}
}
