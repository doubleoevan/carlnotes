// an MCP view's document and what it may load, the same for the api's ui resources and for the MCP view test host
import type { McpView } from "./mcpViews"

// the origins of the Google Fonts stylesheet the MCP view's stylesheet imports, and of the fonts it names
const GOOGLE_FONTS_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]

// an MCP view bundle's two files: its one script and its one stylesheet
export type McpViewBundle = { mcpViewScript: string; mcpViewStylesheet: string }

// the domains a ui resource names for its content security policy
export type McpViewContentSecurityPolicy = { resourceDomains: string[]; baseUriDomains: string[] }

/**
 * Returns an MCP view's html: the bundle's stylesheet and script in one document that names its MCP view, with relative
 * urls resolved against the explicit connected site URL.
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
 * Returns what an MCP view may load: images, fonts, and media from the site, the Google Fonts it imports, and the audio
 * the site redirects to in object storage. An MCP view fetches nothing itself, so it names no connections, and links
 * resolve against the explicit connected site URL.
 */
export function toMcpViewContentSecurityPolicy({
	siteUrl,
	objectStorageOrigins,
}: {
	siteUrl: string
	objectStorageOrigins: string[]
}): McpViewContentSecurityPolicy {
	const siteOrigin = new URL(siteUrl).origin
	return {
		resourceDomains: [siteOrigin, ...GOOGLE_FONTS_ORIGINS, ...objectStorageOrigins],
		baseUriDomains: [siteOrigin],
	}
}
