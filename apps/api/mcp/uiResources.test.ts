// the MCP view resources: the four resources and their security policy, the MCP view html with its escaped script, and
// the message a missing build reads
import { expect, test } from "bun:test"
import { MCP_VIEW_META_KEY, toMcpUiResourceUri } from "@carlnotes/contracts/mcpViews"
import {
	MISSING_MCP_VIEW_BUNDLE_MESSAGE,
	readMcpViewBundle,
	registerMcpUiResources,
	toMcpViewHtmlFromBundle,
	toMcpViewToolMeta,
} from "./uiResources"

// a registered resource's uri, its metadata, and its read
type RegisteredMcpUiResource = {
	uri: string
	config: {
		mimeType: string
		_meta: { ui: { csp: { resourceDomains: string[]; baseUriDomains: string[]; connectDomains?: string[] } } }
	}
	read: () => Promise<{ contents: { text: string; mimeType: string }[] }>
}

// the resources a fake server registers
function toRegisteredMcpUiResources(): RegisteredMcpUiResource[] {
	const registeredMcpUiResources: RegisteredMcpUiResource[] = []
	const fakeMcpServer = {
		registerResource: (
			_name: string,
			uri: string,
			config: RegisteredMcpUiResource["config"],
			read: RegisteredMcpUiResource["read"],
		) => {
			registeredMcpUiResources.push({ uri, config, read })
			return {}
		},
	}
	registerMcpUiResources(fakeMcpServer as unknown as Parameters<typeof registerMcpUiResources>[0])
	return registeredMcpUiResources
}

test("four versioned MCP view resources retain unversioned aliases with the same security policy", () => {
	const registeredMcpUiResources = toRegisteredMcpUiResources()
	expect(registeredMcpUiResources.map((uiResource) => uiResource.uri)).toEqual([
		"ui://carlnotes/search.html?v=9",
		"ui://carlnotes/search.html",
		"ui://carlnotes/search.html?v=2",
		"ui://carlnotes/search.html?v=3",
		"ui://carlnotes/search.html?v=4",
		"ui://carlnotes/search.html?v=5",
		"ui://carlnotes/search.html?v=6",
		"ui://carlnotes/search.html?v=7",
		"ui://carlnotes/search.html?v=8",
		"ui://carlnotes/topic.html?v=9",
		"ui://carlnotes/topic.html",
		"ui://carlnotes/topic.html?v=2",
		"ui://carlnotes/topic.html?v=3",
		"ui://carlnotes/topic.html?v=4",
		"ui://carlnotes/topic.html?v=5",
		"ui://carlnotes/topic.html?v=6",
		"ui://carlnotes/topic.html?v=7",
		"ui://carlnotes/topic.html?v=8",
		"ui://carlnotes/findings.html?v=9",
		"ui://carlnotes/findings.html",
		"ui://carlnotes/findings.html?v=2",
		"ui://carlnotes/findings.html?v=3",
		"ui://carlnotes/findings.html?v=4",
		"ui://carlnotes/findings.html?v=5",
		"ui://carlnotes/findings.html?v=6",
		"ui://carlnotes/findings.html?v=7",
		"ui://carlnotes/findings.html?v=8",
		"ui://carlnotes/suggest-topics.html?v=9",
		"ui://carlnotes/suggest-topics.html",
		"ui://carlnotes/suggest-topics.html?v=2",
		"ui://carlnotes/suggest-topics.html?v=3",
		"ui://carlnotes/suggest-topics.html?v=4",
		"ui://carlnotes/suggest-topics.html?v=5",
		"ui://carlnotes/suggest-topics.html?v=6",
		"ui://carlnotes/suggest-topics.html?v=7",
		"ui://carlnotes/suggest-topics.html?v=8",
	])
	for (const { config } of registeredMcpUiResources) {
		expect(config.mimeType).toBe("text/html;profile=mcp-app")

		// the site's origin for its files and its base url, and no connections
		const siteOrigin = new URL(Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173").origin
		expect(config._meta.ui.csp.resourceDomains).toContain(siteOrigin)
		expect(config._meta.ui.csp.baseUriDomains).toEqual([siteOrigin])
		expect(config._meta.ui.csp.connectDomains).toBeUndefined()
	}
})

test("a tool names its MCP view in the current _meta form and the earlier one", () => {
	expect(toMcpViewToolMeta("topic")).toEqual({
		ui: { resourceUri: toMcpUiResourceUri("topic") },
		"ui/resourceUri": toMcpUiResourceUri("topic"),
	})
	expect(MCP_VIEW_META_KEY).toBe("carlnotes/card")
})

test("an MCP view's html holds the built bundle, names its MCP view, and escapes a closing script tag", () => {
	const mcpViewHtml = toMcpViewHtmlFromBundle({
		mcpView: "findings",
		mcpViewBundle: { mcpViewScript: 'console.log("</script>")', mcpViewStylesheet: "body{color:red}" },
		siteUrl: "https://carlnotes.test",
	})
	expect(mcpViewHtml).not.toContain("<base")
	expect(mcpViewHtml).toContain('data-site-url="https://carlnotes.test/"')
	expect(mcpViewHtml).toContain('<body data-mcp-view="findings"')
	expect(mcpViewHtml).toContain("<style>body{color:red}</style>")
	expect(mcpViewHtml).toContain('console.log("<\\/script>")')
	expect(mcpViewHtml.match(/<\/script>/g)).toHaveLength(1)
})

test("a missing build fails the read with the build that makes it", async () => {
	expect(readMcpViewBundle("./apps/web/dist/no-such-bundle")).rejects.toThrow(MISSING_MCP_VIEW_BUNDLE_MESSAGE)
	expect(MISSING_MCP_VIEW_BUNDLE_MESSAGE).toContain("bun run build:ui")
})
