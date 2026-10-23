// the mcp cards: the three ui resources a host that renders MCP Apps reads, each one html document written from the
// card bundle build:ui makes in apps/web, and the _meta a tool names its card with
import { MCP_CARDS, type McpCard, toMcpCardUri } from "@carlnotes/contracts/mcpCards"
import { toPodcastEpisodeAudioUrl } from "@carlnotes/db/store"
import { appUrl } from "@carlnotes/server/appUrl"
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer, ReadResourceResult } from "@modelcontextprotocol/server"
import { MCP_CARDS_BUNDLE_ROOT } from "../bundlePaths"

// what a resource read says if build:ui never made the card bundle
export const MISSING_CARD_BUNDLE_MESSAGE = "The mcp card bundle is not built. Run bun run build:ui."

// the origins of the Google Fonts stylesheet the card's stylesheet imports, and of the fonts it names
const GOOGLE_FONTS_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]

// what each card shows, for the resource list
const MCP_CARD_DESCRIPTIONS: Record<McpCard, string> = {
	search: "The search results as a paged table, with play buttons, Follow, and a link to the search page.",
	topic: "A topic's settings, prompt, and sources, with a proposed edit and its Save button.",
	findings: "A topic's findings with Carl's notes, the play button, Follow, and thumbs, bookmark, and done.",
}

/**
 * Returns the _meta a tool names its card with, in the current form and the earlier one older hosts read.
 */
export function toCardToolMeta(mcpCard: McpCard): Record<string, unknown> {
	const resourceUri = toMcpCardUri(mcpCard)
	return { ui: { resourceUri }, [RESOURCE_URI_META_KEY]: resourceUri }
}

/**
 * Registers the three card resources.
 */
export function registerCardResources(mcpServer: McpServer): void {
	for (const mcpCard of MCP_CARDS) {
		const resourceUri = toMcpCardUri(mcpCard)
		const cardResourceMeta = { ui: { csp: toCardContentSecurityPolicy(), prefersBorder: true } }
		mcpServer.registerResource(
			`${mcpCard}-card`,
			resourceUri,
			{ mimeType: RESOURCE_MIME_TYPE, description: MCP_CARD_DESCRIPTIONS[mcpCard], _meta: cardResourceMeta },
			async (): Promise<ReadResourceResult> => ({
				contents: [
					{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await toCardHtml(mcpCard), _meta: cardResourceMeta },
				],
			}),
		)
	}
}

// a card bundle's two files: its one script and its one stylesheet
export type CardBundle = { cardScript: string; cardStylesheet: string }

// each card's html, built once from the bundle, which does not change while the server runs
const cardHtmlByCard = new Map<McpCard, string>()

/**
 * Returns a card's html from the built bundle, built once per card.
 */
async function toCardHtml(mcpCard: McpCard): Promise<string> {
	const builtCardHtml = cardHtmlByCard.get(mcpCard)
	if (builtCardHtml) {
		return builtCardHtml
	}

	// read the bundle, then build and keep this card's html
	const cardBundle = await readCardBundle(MCP_CARDS_BUNDLE_ROOT)
	const cardHtml = toCardHtmlFromBundle({ mcpCard, cardBundle, siteUrl: appUrl() })
	cardHtmlByCard.set(mcpCard, cardHtml)
	return cardHtml
}

/**
 * Returns a card's html: the bundle's stylesheet and script in one document that names its card, with relative urls
 * resolving against the site.
 */
export function toCardHtmlFromBundle({
	mcpCard,
	cardBundle,
	siteUrl,
}: {
	mcpCard: McpCard
	cardBundle: CardBundle
	siteUrl: string
}): string {
	// a closing script tag inside the script would end its element, so every one is escaped
	const escapedCardScript = cardBundle.cardScript.replaceAll("</script", "<\\/script")
	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<base href="${siteUrl}/">`,
		`<style>${cardBundle.cardStylesheet}</style>`,
		"</head>",
		`<body data-card="${mcpCard}">`,
		'<div id="root"></div>',
		`<script type="module">${escapedCardScript}</script>`,
		"</body>",
		"</html>",
	].join("\n")
}

/**
 * Reads a card bundle's script and stylesheet from where build:ui writes them, or throws an error naming that build.
 */
export async function readCardBundle(bundleRoot: string): Promise<CardBundle> {
	const cardScriptFile = Bun.file(`${bundleRoot}/cards.js`)
	const cardStylesheetFile = Bun.file(`${bundleRoot}/cards.css`)
	if (!(await cardScriptFile.exists()) || !(await cardStylesheetFile.exists())) {
		throw new Error(MISSING_CARD_BUNDLE_MESSAGE)
	}
	return { cardScript: await cardScriptFile.text(), cardStylesheet: await cardStylesheetFile.text() }
}

// what a card may load: images, fonts, and media from the site, the Google Fonts it imports, and the audio the site
// redirects to in object storage.
// a card fetches nothing itself, so it names no connections, and its base url is the site
function toCardContentSecurityPolicy(): { resourceDomains: string[]; baseUriDomains: string[] } {
	const siteOrigin = new URL(appUrl()).origin
	const resourceDomains = [siteOrigin, ...GOOGLE_FONTS_ORIGINS, ...toObjectStorageOrigins()]
	return { resourceDomains, baseUriDomains: [siteOrigin] }
}

// the origin a presigned audio url points at, read from one presign so it matches the host the presigner signs for.
// a server with no object storage configured has none
function toObjectStorageOrigins(): string[] {
	try {
		return [new URL(toPodcastEpisodeAudioUrl("mcp-card-origin")).origin]
	} catch {
		return []
	}
}
