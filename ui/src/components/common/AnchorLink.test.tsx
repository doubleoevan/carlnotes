// render tests for AnchorLink, which renders each kind of href its own way
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { AnchorLink } from "./AnchorLink"

// a scheme link and a server path are plain anchors with no target and no rel, and an api file keeps its download
test("a scheme link and a server path render plain anchors", async () => {
	const anchorsHtml = await renderWithRouter(
		<>
			<AnchorLink href="mailto:carl@carlnotes.com">Email</AnchorLink>
			<AnchorLink href="/docs/start">Docs</AnchorLink>
			<AnchorLink href="/api/attachments/a1/download" download="notes.txt">
				notes.txt
			</AnchorLink>
		</>,
	)
	expect(anchorsHtml).toContain('<a href="mailto:carl@carlnotes.com">Email</a>')
	expect(anchorsHtml).toContain('<a href="/docs/start">Docs</a>')
	expect(anchorsHtml).toContain('<a href="/api/attachments/a1/download" download="notes.txt">notes.txt</a>')
})

// an internal link keeps its query and hash, and a number in the query stays unquoted
test("an internal link keeps its query and hash", async () => {
	const linksHtml = await renderWithRouter(
		<>
			<AnchorLink href="/signup?cta=header#plans">Sign up</AnchorLink>
			<AnchorLink href="/?featured=2">Featured</AnchorLink>
		</>,
	)
	expect(linksHtml).toContain('href="/signup?cta=header#plans"')
	expect(linksHtml).toContain('href="/?featured=2"')
})

// an external link opens a new tab, a user content link gets rel ugc and keeps its referrer, a protocol-relative url is
// external too, and a javascript scheme renders with no href
test("an external link opens a new tab with its rel", async () => {
	const linksHtml = await renderWithRouter(
		<>
			<AnchorLink href="https://example.com/docs">Docs</AnchorLink>
			<AnchorLink href="https://example.com/finding" isUserContent>
				Finding
			</AnchorLink>
			<AnchorLink href="//example.com/other">Other</AnchorLink>
			{/* biome-ignore lint/security/noScriptUrl: the test proves this scheme renders with no href */}
			<AnchorLink href="javascript:alert(1)">Script</AnchorLink>
		</>,
	)
	expect(linksHtml).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>')
	expect(linksHtml).toContain('<a href="https://example.com/finding" target="_blank" rel="noopener ugc">Finding</a>')
	expect(linksHtml).toContain('<a href="//example.com/other" target="_blank" rel="noopener noreferrer">Other</a>')
	expect(linksHtml).toContain('<a target="_blank" rel="noopener noreferrer">Script</a>')
	expect(linksHtml).not.toContain("javascript:")
})
