// the Add to AI dialog's AI providers, their deeplinks and paste steps, and the remembered choice

// the AI providers Carl can be added to, in their default order
export const AI_PROVIDERS = [
	"claude",
	"chatgpt",
	"gemini",
	"grok",
	"perplexity",
	"deepseek",
	"cursor",
	"vscode",
] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

// the two that install with one click, and the six that take a pasted url
export type DeeplinkAiProvider = "cursor" | "vscode"
export type PasteAiProvider = "claude" | "chatgpt" | "gemini" | "grok" | "perplexity" | "deepseek"

// the mcp server a provider installs: its name and url
export type McpServer = { name: string; url: string }

// the localStorage key for the last chosen provider
const LAST_AI_PROVIDER_KEY = "add-to-ai:last"

// a terminal command that adds the server, and the name of the tool that runs it
export type AddMcpCommand = { tool: string; line: string }

// the paste steps for each paste provider, and the command for one that has a terminal tool
export const PASTE_STEPS: Record<PasteAiProvider, { steps: string; command: AddMcpCommand | null }> = {
	claude: {
		steps: "In Claude, open Settings, then Connectors, then Add custom connector, and paste the server URL.",
		command: { tool: "Claude Code", line: "claude mcp add --transport http carlnotes" },
	},
	chatgpt: {
		steps:
			"In ChatGPT, open Settings, then Apps and Connectors, then Advanced settings. Turn on Developer mode, choose Create, and paste the server URL.",
		command: null,
	},
	gemini: {
		steps: "In Gemini, open Settings & help, then Connected apps, add a custom app, and paste the server URL.",
		command: null,
	},
	grok: {
		steps: "In Grok, open Connectors, then New Connector, then Custom, and paste the server URL.",
		command: null,
	},
	perplexity: {
		steps: "In Perplexity, open Settings, then Connectors, then Add custom connector, and paste the server URL.",
		command: null,
	},
	deepseek: {
		steps:
			"DeepSeek's chat app takes no connectors. In DeepSeek Harness, add an @deepseek-ai/dsh-mcp-client entry to ~/.dsh/profiles/web/cordis.patch.yml with transport streamable-http and the server URL.",
		command: null,
	},
}

/**
 * Builds the one-click install deeplink for Cursor or VS Code.
 */
export function toInstallDeeplink(deeplinkAiProvider: DeeplinkAiProvider, mcpServer: McpServer): string {
	// build the cursor deeplink with the config as base64 json in the query
	if (deeplinkAiProvider === "cursor") {
		const encodedConfig = btoa(JSON.stringify({ url: mcpServer.url }))
		return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(mcpServer.name)}&config=${encodeURIComponent(encodedConfig)}`
	}

	// build the vs code deeplink with the server as url-encoded json
	return `vscode://mcp/install?${encodeURIComponent(JSON.stringify({ name: mcpServer.name, url: mcpServer.url }))}`
}

/**
 * Puts the remembered provider first, the rest in their default order.
 */
export function toSortedAiProviders(lastAiProvider: AiProvider | null): AiProvider[] {
	if (!lastAiProvider) {
		return [...AI_PROVIDERS]
	}
	return [lastAiProvider, ...AI_PROVIDERS.filter((aiProvider) => aiProvider !== lastAiProvider)]
}

/**
 * Reads the last chosen provider in this browser, or null when none can be read.
 */
export function readLastAiProvider(): AiProvider | null {
	try {
		const storedAiProvider = localStorage.getItem(LAST_AI_PROVIDER_KEY)
		return AI_PROVIDERS.find((aiProvider) => aiProvider === storedAiProvider) ?? null
	} catch {
		return null
	}
}

/**
 * Remembers the chosen provider for the next visit and ignores a failed write.
 */
export function storeAiProvider(aiProvider: AiProvider): void {
	try {
		localStorage.setItem(LAST_AI_PROVIDER_KEY, aiProvider)
	} catch {
		// ignore a failed write
	}
}
