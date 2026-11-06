// the MCP views: the ui resources a host that renders MCP Apps reads, each one html document written from the
// MCP view bundle build:ui makes in apps/web, and the _meta a tool names its MCP view with
import {
	type McpViewBundle,
	toMcpViewContentSecurityPolicy,
	toMcpViewHtmlFromBundle,
} from "@carlnotes/contracts/mcpViewHtml"
import { MCP_VIEWS, type McpView, toMcpUiResourceUri } from "@carlnotes/contracts/mcpViews"
import { STORED_MCP_VIEW_VERSIONS, type StoredMcpViewVersion } from "@carlnotes/contracts/mcpViewVersions"
import { getResourceContent, toMcpViewBundleKey, toPodcastEpisodeAudioUrl } from "@carlnotes/db/store"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer, ReadResourceResult } from "@modelcontextprotocol/server"
import { MCP_VIEWS_BUNDLE_ROOT } from "../bundlePaths"

// what a resource read says if build:ui never made the MCP view bundle
export const MISSING_MCP_VIEW_BUNDLE_MESSAGE = "The MCP view bundle is not built. Run bun run build:ui."

// the versions from before the first stored one, which serve the current build
const ALIASED_MCP_VIEW_VERSIONS = [2, 3, 4, 5, 6, 7, 8]

// what each MCP view shows, for the resource list
const MCP_VIEW_DESCRIPTIONS: Record<McpView, string> = {
	"suggest-topics":
		"Ranked editable Topics with selection, search, paging, a single send, and a confirmed Topic Draft.",
	search: "The search results as a paged table, with play buttons, Follow, and a link to the search page.",
	topic: "A topic's settings, prompt, and sources, with a proposed edit and its Save button.",
	findings: "A topic's findings with Carl's notes, the play button, Follow, and thumbs, bookmark, and done.",
	updates: "Carl's list of unread findings, with his opener and a link to the rest.",
	scan: "A topic's running brew by stage and source, with stop, then its recap and podcast episode.",
}

/**
 * Returns the _meta a tool names its MCP view with, in the current form and the earlier one older hosts read.
 */
export function toMcpViewToolMeta(mcpView: McpView): Record<string, unknown> {
	const resourceUri = toMcpUiResourceUri(mcpView)
	return { ui: { resourceUri }, [RESOURCE_URI_META_KEY]: resourceUri }
}

/**
 * Registers the MCP view resources: the current version, its aliases, and each stored version of every MCP view it holds.
 */
export function registerMcpUiResources(
	mcpServer: McpServer,
	storedMcpViewVersions: StoredMcpViewVersion[] = STORED_MCP_VIEW_VERSIONS,
): void {
	const contentSecurityPolicy = toMcpViewContentSecurityPolicy({
		siteUrl: appUrl(),
		objectStorageOrigins: toObjectStorageOrigins(),
	})
	const uiResourceMeta = { ui: { csp: contentSecurityPolicy, prefersBorder: true } }

	// register one resource, whose html the read builds
	const registerUiResource = (
		mcpView: McpView,
		{ name, uri, readHtml }: { name: string; uri: string; readHtml: () => Promise<string> },
	): void => {
		mcpServer.registerResource(
			name,
			uri,
			{ mimeType: RESOURCE_MIME_TYPE, description: MCP_VIEW_DESCRIPTIONS[mcpView], _meta: uiResourceMeta },
			async (): Promise<ReadResourceResult> => ({
				contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await readHtml(), _meta: uiResourceMeta }],
			}),
		)
	}
	for (const mcpView of MCP_VIEWS) {
		// the current version, with the aliases that keep existing connections readable after a bundle upgrade
		const currentUiResourceUris = [toMcpUiResourceUri(mcpView), `ui://carlnotes/${mcpView}.html`]
		const aliasUiResourceUris = ALIASED_MCP_VIEW_VERSIONS.map((version) => toMcpUiResourceUri(mcpView, version))
		for (const [index, uiResourceUri] of [...currentUiResourceUris, ...aliasUiResourceUris].entries()) {
			const uiResourceName = index === 0 ? `${mcpView}-card` : `${mcpView}-legacy-${index}-card`
			registerUiResource(mcpView, { name: uiResourceName, uri: uiResourceUri, readHtml: () => toMcpViewHtml(mcpView) })
		}

		// each stored version that holds this MCP view, from its own bundle
		for (const { version, mcpViews } of storedMcpViewVersions) {
			if (mcpViews.includes(mcpView)) {
				registerUiResource(mcpView, {
					name: `${mcpView}-v${version}-card`,
					uri: toMcpUiResourceUri(mcpView, version),
					readHtml: () => toStoredMcpViewHtml(mcpView, version),
				})
			}
		}
	}
}

// each MCP view's html, built once from the bundle, which does not change while the server runs
const uiResourceHtmlByMcpView = new Map<McpView, string>()

/**
 * Returns an MCP view's html from the built bundle, built once per MCP view.
 */
async function toMcpViewHtml(mcpView: McpView): Promise<string> {
	const builtUiResourceHtml = uiResourceHtmlByMcpView.get(mcpView)
	if (builtUiResourceHtml) {
		return builtUiResourceHtml
	}

	// read the bundle, then build and keep this MCP view's html
	const mcpViewBundle = await readMcpViewBundle(MCP_VIEWS_BUNDLE_ROOT)
	const mcpViewHtml = toMcpViewHtmlFromBundle({ mcpView, mcpViewBundle, siteUrl: appUrl() })
	uiResourceHtmlByMcpView.set(mcpView, mcpViewHtml)
	return mcpViewHtml
}

// each stored MCP view's html, read once
const storedUiResourceHtmlByUri = new Map<string, string>()

// a stored version's html from its own bundle. a bundle that cannot be read reports the failure, returns the current
// html, and is tried again on the next read
async function toStoredMcpViewHtml(mcpView: McpView, version: number): Promise<string> {
	const uri = toMcpUiResourceUri(mcpView, version)
	const storedUiResourceHtml = storedUiResourceHtmlByUri.get(uri)
	if (storedUiResourceHtml) {
		return storedUiResourceHtml
	}
	try {
		const [mcpViewScript, mcpViewStylesheet] = await Promise.all([
			getResourceContent(toMcpViewBundleKey(version, "mcpViews.js")),
			getResourceContent(toMcpViewBundleKey(version, "mcpViews.css")),
		])
		const mcpViewBundle = { mcpViewScript, mcpViewStylesheet }
		const mcpViewHtml = toMcpViewHtmlFromBundle({ mcpView, mcpViewBundle, siteUrl: appUrl() })
		storedUiResourceHtmlByUri.set(uri, mcpViewHtml)
		return mcpViewHtml
	} catch (error) {
		// report the failed read and return the current bundle's html
		reportError(error, "object-storage", { uri })
		return toMcpViewHtml(mcpView)
	}
}

/**
 * Reads an MCP view bundle's script and stylesheet from where build:ui writes them, or throws an error naming that build.
 */
export async function readMcpViewBundle(bundleRoot: string): Promise<McpViewBundle> {
	const mcpViewScriptFile = Bun.file(`${bundleRoot}/mcpViews.js`)
	const mcpViewStylesheetFile = Bun.file(`${bundleRoot}/mcpViews.css`)
	if (!(await mcpViewScriptFile.exists()) || !(await mcpViewStylesheetFile.exists())) {
		throw new Error(MISSING_MCP_VIEW_BUNDLE_MESSAGE)
	}
	return { mcpViewScript: await mcpViewScriptFile.text(), mcpViewStylesheet: await mcpViewStylesheetFile.text() }
}

// the origin a presigned audio url points at, read from one presign so it matches the host the presigner signs for.
// a server with no object storage configured has none
function toObjectStorageOrigins(): string[] {
	try {
		return [new URL(toPodcastEpisodeAudioUrl("mcp-view-origin")).origin]
	} catch {
		return []
	}
}
