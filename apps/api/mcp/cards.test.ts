// the mcp card resources: the three resources and their security policy, the card html with its escaped script, and
// the message a missing build reads
import { expect, test } from "bun:test"
import { MCP_CARD_META_KEY, toMcpCardUri } from "@carlnotes/contracts/mcpCards"
import {
	MISSING_CARD_BUNDLE_MESSAGE,
	readCardBundle,
	registerCardResources,
	toCardHtmlFromBundle,
	toCardToolMeta,
} from "./cards"

// a registered resource's uri, its metadata, and its read
type RegisteredCardResource = {
	uri: string
	config: {
		mimeType: string
		_meta: { ui: { csp: { resourceDomains: string[]; baseUriDomains: string[]; connectDomains?: string[] } } }
	}
	read: () => Promise<{ contents: { text: string; mimeType: string }[] }>
}

// the resources a fake server registers
function toRegisteredCardResources(): RegisteredCardResource[] {
	const registeredCardResources: RegisteredCardResource[] = []
	const fakeMcpServer = {
		registerResource: (
			_name: string,
			uri: string,
			config: RegisteredCardResource["config"],
			read: RegisteredCardResource["read"],
		) => {
			registeredCardResources.push({ uri, config, read })
			return {}
		},
	}
	registerCardResources(fakeMcpServer as unknown as Parameters<typeof registerCardResources>[0])
	return registeredCardResources
}

test("the three card resources are mcp app html, each naming the site and no connections", () => {
	const registeredCardResources = toRegisteredCardResources()
	expect(registeredCardResources.map((cardResource) => cardResource.uri)).toEqual([
		"ui://carlnotes/search.html",
		"ui://carlnotes/topic.html",
		"ui://carlnotes/findings.html",
	])
	for (const { config } of registeredCardResources) {
		expect(config.mimeType).toBe("text/html;profile=mcp-app")

		// the site's origin for its files and its base url, and no connections
		const siteOrigin = new URL(Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173").origin
		expect(config._meta.ui.csp.resourceDomains).toContain(siteOrigin)
		expect(config._meta.ui.csp.baseUriDomains).toEqual([siteOrigin])
		expect(config._meta.ui.csp.connectDomains).toBeUndefined()
	}
})

test("a tool names its card in the current _meta form and the earlier one", () => {
	expect(toCardToolMeta("topic")).toEqual({
		ui: { resourceUri: toMcpCardUri("topic") },
		"ui/resourceUri": toMcpCardUri("topic"),
	})
	expect(MCP_CARD_META_KEY).toBe("carlnotes/card")
})

test("a card's html holds the built bundle, names its card, and escapes a closing script tag", () => {
	const cardHtml = toCardHtmlFromBundle({
		mcpCard: "findings",
		cardBundle: { cardScript: 'console.log("</script>")', cardStylesheet: "body{color:red}" },
		siteUrl: "https://carlnotes.test",
	})
	expect(cardHtml).toContain('<base href="https://carlnotes.test/">')
	expect(cardHtml).toContain('<body data-card="findings">')
	expect(cardHtml).toContain("<style>body{color:red}</style>")
	expect(cardHtml).toContain('console.log("<\\/script>")')
	expect(cardHtml.match(/<\/script>/g)).toHaveLength(1)
})

test("a missing build fails the read with the build that makes it", async () => {
	expect(readCardBundle("./apps/web/dist/no-such-bundle")).rejects.toThrow(MISSING_CARD_BUNDLE_MESSAGE)
	expect(MISSING_CARD_BUNDLE_MESSAGE).toContain("bun run build:ui")
})
