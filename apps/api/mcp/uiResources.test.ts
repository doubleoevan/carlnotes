// the MCP view resources: the nine resources and their security policy, the MCP view html with its escaped script, and
// the message a missing build reads
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { toMcpViewHtmlFromBundle } from "@carlnotes/contracts/mcpViewHtml"
import { MCP_VIEW_META_KEY, MCP_VIEW_VERSION, MCP_VIEWS, toMcpUiResourceUri } from "@carlnotes/contracts/mcpViews"
import { STORED_MCP_VIEW_VERSIONS, type StoredMcpViewVersion } from "@carlnotes/contracts/mcpViewVersions"
import * as store from "@carlnotes/db/store"
import * as monitoring from "@carlnotes/server/monitoring"
import {
	MISSING_MCP_VIEW_BUNDLE_MESSAGE,
	readMcpViewBundle,
	registerMcpUiResources,
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
function toRegisteredMcpUiResources(storedMcpViewVersions?: StoredMcpViewVersion[]): RegisteredMcpUiResource[] {
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
	registerMcpUiResources(
		fakeMcpServer as unknown as Parameters<typeof registerMcpUiResources>[0],
		storedMcpViewVersions,
	)
	return registeredMcpUiResources
}

test("sixteen versioned MCP view resources retain unversioned aliases with the same security policy", () => {
	const registeredMcpUiResources = toRegisteredMcpUiResources()
	const aliasedVersionSuffixes = ["", "?v=2", "?v=3", "?v=4", "?v=5", "?v=6", "?v=7", "?v=8", "?v=9", "?v=10", "?v=11"]
	const versionSuffixes = [`?v=${MCP_VIEW_VERSION}`, ...aliasedVersionSuffixes]
	const storedUris = STORED_MCP_VIEW_VERSIONS.flatMap(({ version, mcpViews }) =>
		mcpViews.map((mcpView) => toMcpUiResourceUri(mcpView, version)),
	)
	expect(MCP_VIEWS).toHaveLength(16)

	// each uri once, and a stored version's uri in place of its alias, since the server rejects a uri registered twice
	const registeredUris = registeredMcpUiResources.map((uiResource) => uiResource.uri)
	expect(new Set(registeredUris).size).toBe(registeredUris.length)
	expect(registeredUris.sort()).toEqual(
		[
			...new Set([
				...MCP_VIEWS.flatMap((mcpView) =>
					versionSuffixes.map((versionSuffix) => `ui://carlnotes/${mcpView}.html${versionSuffix}`),
				),
				...storedUris,
			]),
		].sort(),
	)
	for (const { config } of registeredMcpUiResources) {
		expect(config.mimeType).toBe("text/html;profile=mcp-app")

		// the site's origin for its files and its base url, and no connections
		const siteOrigin = new URL(Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173").origin
		expect(config._meta.ui.csp.resourceDomains).toContain(siteOrigin)
		expect(config._meta.ui.csp.baseUriDomains).toEqual([siteOrigin])
		expect(config._meta.ui.csp.connectDomains).toBeUndefined()
	}
})

afterEach(() => {
	mock.restore()
})

// the script of the bundle a test reads in place of the build on disk
const CURRENT_SCRIPT = "console.log('the current build')"

// serve the current build from memory
function stubCurrentBundle(): void {
	const toBundleFile = (path: string): unknown => ({
		exists: async () => true,
		text: async () => (path.endsWith(".js") ? CURRENT_SCRIPT : "body{color:blue}"),
	})
	spyOn(Bun, "file").mockImplementation(toBundleFile as unknown as typeof Bun.file)
}

test("the current version is above every stored one", () => {
	const storedVersions = STORED_MCP_VIEW_VERSIONS.map(({ version }) => version)
	expect(MCP_VIEW_VERSION).toBeGreaterThan(Math.max(0, ...storedVersions))
})

test("a stored version lists only the MCP views it holds", () => {
	const registeredMcpUiResources = toRegisteredMcpUiResources([{ version: 100, mcpViews: ["search", "findings"] }])
	const storedUris = registeredMcpUiResources.map(({ uri }) => uri).filter((uri) => uri.endsWith("?v=100"))
	expect(storedUris).toEqual([toMcpUiResourceUri("search", 100), toMcpUiResourceUri("findings", 100)])
})

test("a stored version reads its own bundle once, and names its MCP view", async () => {
	const getResourceContent = spyOn(store, "getResourceContent").mockImplementation(async (contentKey) =>
		contentKey.endsWith(".js") ? "console.log('version 101')" : "body{color:green}",
	)
	const registeredMcpUiResources = toRegisteredMcpUiResources([{ version: 101, mcpViews: ["findings"] }])
	const storedResource = registeredMcpUiResources.find(({ uri }) => uri === toMcpUiResourceUri("findings", 101))

	// a second read comes from the first
	const firstRead = await storedResource?.read()
	await storedResource?.read()
	const storedHtml = firstRead?.contents[0]?.text
	expect(storedHtml).toContain("console.log('version 101')")
	expect(storedHtml).toContain("<style>body{color:green}</style>")
	expect(storedHtml).toContain('<body data-mcp-view="findings"')
	expect(getResourceContent.mock.calls.map(([contentKey]) => contentKey)).toEqual([
		"mcp-view-bundles/v101/mcpViews.js",
		"mcp-view-bundles/v101/mcpViews.css",
	])
})

test("the current version and an alias never read a stored bundle", async () => {
	const getResourceContent = spyOn(store, "getResourceContent")
	stubCurrentBundle()
	const registeredMcpUiResources = toRegisteredMcpUiResources([{ version: 102, mcpViews: ["topic"] }])
	// the current version's uri and each alias return the current bundle
	for (const uri of [toMcpUiResourceUri("topic"), "ui://carlnotes/topic.html", "ui://carlnotes/topic.html?v=2"]) {
		const uiResource = registeredMcpUiResources.find((registeredResource) => registeredResource.uri === uri)
		expect((await uiResource?.read())?.contents[0]?.text).toContain(CURRENT_SCRIPT)
	}
	expect(getResourceContent).not.toHaveBeenCalled()
})

test("a stored bundle that cannot be read reports the failure and returns the current bundle", async () => {
	const readError = new Error("no such object")
	spyOn(store, "getResourceContent").mockRejectedValue(readError)
	stubCurrentBundle()
	const reportError = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const registeredMcpUiResources = toRegisteredMcpUiResources([{ version: 103, mcpViews: ["scan"] }])
	const storedResource = registeredMcpUiResources.find(({ uri }) => uri === toMcpUiResourceUri("scan", 103))

	const storedHtml = (await storedResource?.read())?.contents[0]?.text
	expect(storedHtml).toContain(CURRENT_SCRIPT)
	expect(reportError).toHaveBeenCalledWith(readError, "object-storage", { uri: toMcpUiResourceUri("scan", 103) })
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
	expect(readMcpViewBundle("./apps/web/dist/no-such-bundle", "findings")).rejects.toThrow(
		MISSING_MCP_VIEW_BUNDLE_MESSAGE,
	)
	expect(MISSING_MCP_VIEW_BUNDLE_MESSAGE).toContain("bun run build:ui")
})

test("the dashboard MCP view reads its own script, and every other MCP view the shared one", async () => {
	const readPaths: string[] = []
	const toBundleFile = (path: string): unknown => {
		readPaths.push(path)
		return { exists: async () => true, text: async () => "" }
	}
	spyOn(Bun, "file").mockImplementation(toBundleFile as unknown as typeof Bun.file)

	// each read names its script, then the one stylesheet
	await readMcpViewBundle("bundle", "dashboard")
	await readMcpViewBundle("bundle", "topic")
	expect(readPaths).toEqual([
		"bundle/dashboardMcpView.js",
		"bundle/mcpViews.css",
		"bundle/mcpViews.js",
		"bundle/mcpViews.css",
	])
})
