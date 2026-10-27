import {
	AI_PROVIDERS,
	type AiProvider,
	type DeeplinkAiProvider,
	LAST_AI_PROVIDER_KEY,
	type McpServer,
} from "@carlnotes/core/lib/installDeeplinks"

export * from "@carlnotes/core/lib/installDeeplinks"

/**
 * Builds the one-click install deeplink for Cursor or VS Code.
 */
export function toInstallDeeplink(deeplinkAiProvider: DeeplinkAiProvider, mcpServer: McpServer): string {
	// build the cursor deeplink with the config as base64 json in the query
	if (deeplinkAiProvider === "cursor") {
		const encodedConfig = btoa(JSON.stringify({ url: mcpServer.url }))
		return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(mcpServer.name)}&config=${encodeURIComponent(encodedConfig)}`
	}

	// build the vs code deeplink with the server as url-encoded json. a remote server declares the http transport
	const vscodeMcpServer = { name: mcpServer.name, type: "http", url: mcpServer.url }
	return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeMcpServer))}`
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
