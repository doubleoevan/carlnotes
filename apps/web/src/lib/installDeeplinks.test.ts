// install deeplink tests. both links include the server, and the provider order leads with the remembered choice
import { expect, test } from "bun:test"
import { AI_PROVIDERS, toInstallDeeplink, toSortedAiProviders } from "./installDeeplinks"

// the server both links are built from
const mcpServer = { name: "CarlNotes: Agent infra", url: "https://carlnotes.com/mcp/t/topic-1" }

// the cursor link puts the name in its query and the url in its base64 config
test("the cursor deeplink includes the name and the url", () => {
	const cursorLink = new URL(toInstallDeeplink("cursor", mcpServer))
	expect(cursorLink.protocol).toBe("cursor:")
	expect(cursorLink.searchParams.get("name")).toBe(mcpServer.name)
	expect(JSON.parse(atob(cursorLink.searchParams.get("config") ?? ""))).toEqual({ url: mcpServer.url })
})

// the vs code link includes the whole server as url-encoded json
test("the vs code deeplink includes the name and the url", () => {
	const vscodeLink = toInstallDeeplink("vscode", mcpServer)
	expect(vscodeLink.startsWith("vscode://mcp/install?")).toBe(true)
	expect(JSON.parse(decodeURIComponent(vscodeLink.slice("vscode://mcp/install?".length)))).toEqual(mcpServer)
})

// no remembered choice keeps the default order. a remembered choice moves to the front
test("the remembered provider leads and the rest keep their order", () => {
	expect(toSortedAiProviders(null)).toEqual([...AI_PROVIDERS])
	expect(toSortedAiProviders("vscode")).toEqual([
		"vscode",
		"claude",
		"chatgpt",
		"gemini",
		"grok",
		"perplexity",
		"deepseek",
		"cursor",
	])
	expect(toSortedAiProviders("claude")).toEqual([...AI_PROVIDERS])
})
