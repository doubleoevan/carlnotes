// the MCP views: the ui resources a host that renders MCP Apps reads, each one html document written from the
// MCP view bundle build:ui makes in apps/web, and the _meta a tool names its MCP view with
import { MCP_VIEWS, type McpView, toMcpUiResourceUri } from "@carlnotes/contracts/mcpViews"
import { toPodcastEpisodeAudioUrl } from "@carlnotes/db/store"
import { appUrl } from "@carlnotes/server/appUrl"
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer, ReadResourceResult } from "@modelcontextprotocol/server"
import { MCP_VIEWS_BUNDLE_ROOT } from "../bundlePaths"

// what a resource read says if build:ui never made the MCP view bundle
export const MISSING_MCP_VIEW_BUNDLE_MESSAGE = "The MCP view bundle is not built. Run bun run build:ui."

// the origins of the Google Fonts stylesheet the MCP view's stylesheet imports, and of the fonts it names
const GOOGLE_FONTS_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]

// what each MCP view shows, for the resource list
const MCP_VIEW_DESCRIPTIONS: Record<McpView, string> = {
	"suggest-topics":
		"Ranked editable Topics with selection, search, paging, a single send, and a confirmed Topic Draft.",
	search: "The search results as a paged table, with play buttons, Follow, and a link to the search page.",
	topic: "A topic's settings, prompt, and sources, with a proposed edit and its Save button.",
	findings: "A topic's findings with Carl's notes, the play button, Follow, and thumbs, bookmark, and done.",
}

/**
 * Returns the _meta a tool names its MCP view with, in the current form and the earlier one older hosts read.
 */
export function toMcpViewToolMeta(mcpView: McpView): Record<string, unknown> {
	const resourceUri = toMcpUiResourceUri(mcpView)
	return { ui: { resourceUri }, [RESOURCE_URI_META_KEY]: resourceUri }
}

/**
 * Registers the MCP view resources.
 */
export function registerMcpUiResources(mcpServer: McpServer): void {
	for (const mcpView of MCP_VIEWS) {
		const resourceUris = [
			toMcpUiResourceUri(mcpView),
			`ui://carlnotes/${mcpView}.html`,
			`ui://carlnotes/${mcpView}.html?v=2`,
			`ui://carlnotes/${mcpView}.html?v=3`,
			`ui://carlnotes/${mcpView}.html?v=4`,
			`ui://carlnotes/${mcpView}.html?v=5`,
			`ui://carlnotes/${mcpView}.html?v=6`,
			`ui://carlnotes/${mcpView}.html?v=7`,
			`ui://carlnotes/${mcpView}.html?v=8`,
		]
		const uiResourceMeta = { ui: { csp: toMcpViewContentSecurityPolicy(), prefersBorder: true } }
		// unversioned aliases keep existing connections readable after a bundle upgrade
		for (const [index, resourceUri] of resourceUris.entries()) {
			mcpServer.registerResource(
				index === 0 ? `${mcpView}-card` : `${mcpView}-legacy-${index}-card`,
				resourceUri,
				{ mimeType: RESOURCE_MIME_TYPE, description: MCP_VIEW_DESCRIPTIONS[mcpView], _meta: uiResourceMeta },
				async (): Promise<ReadResourceResult> => ({
					contents: [
						{
							uri: resourceUri,
							mimeType: RESOURCE_MIME_TYPE,
							text: await toMcpViewHtml(mcpView),
							_meta: uiResourceMeta,
						},
					],
				}),
			)
		}
	}
}

// an MCP view bundle's two files: its one script and its one stylesheet
export type McpViewBundle = { mcpViewScript: string; mcpViewStylesheet: string }

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

/**
 * Returns an MCP view's html: the bundle's stylesheet and script in one document that names its MCP view, with relative urls
 * resolved against the explicit connected site URL.
 */
export function toMcpViewHtmlFromBundle({
	mcpView,
	mcpViewBundle,
	siteUrl,
}: {
	mcpView: McpView
	mcpViewBundle: McpViewBundle
	siteUrl: string
}): string {
	// a closing script tag inside the script would end its element, so every one is escaped
	const escapedMcpViewScript = mcpViewBundle.mcpViewScript.replaceAll("</script", "<\\/script")
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<style>${mcpViewBundle.mcpViewStylesheet}</style>`,
		"</head>",
		`<body data-mcp-view="${mcpView}" data-site-url="${siteUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}/">`,
		'<div id="root"></div>',
		`<script type="module">${escapedMcpViewScript}</script>`,
		"</body>",
		"</html>",
	].join("\n")
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

// what an MCP view may load: images, fonts, and media from the site, the Google Fonts it imports, and the audio the site
// redirects to in object storage.
// an MCP view fetches nothing itself, so it names no connections, and links resolve against the explicit connected site URL
function toMcpViewContentSecurityPolicy(): { resourceDomains: string[]; baseUriDomains: string[] } {
	const siteOrigin = new URL(appUrl()).origin
	const resourceDomains = [siteOrigin, ...GOOGLE_FONTS_ORIGINS, ...toObjectStorageOrigins()]
	return { resourceDomains, baseUriDomains: [siteOrigin] }
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
