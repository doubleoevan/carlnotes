// render tests for AnchorLink, which renders each kind of href its own way
import { expect, test } from "bun:test"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { AnchorLink } from "./AnchorLink"

// a scheme link and a server-rendered path are plain anchors with no target and no rel
test("a scheme link and a server-rendered path render plain anchors", async () => {
	const anchorsHtml = await renderWithRouter(
		<>
			<AnchorLink href="mailto:carl@carlnotes.com">Email</AnchorLink>
			<AnchorLink href="/docs/start">Docs</AnchorLink>
		</>,
	)
	expect(anchorsHtml).toContain('<a href="mailto:carl@carlnotes.com">Email</a>')
	expect(anchorsHtml).toContain('<a href="/docs/start">Docs</a>')
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

// an external link opens a new tab, and a user content link gets rel ugc and keeps its referrer
test("an external link opens a new tab with its rel", async () => {
	const linksHtml = await renderWithRouter(
		<>
			<AnchorLink href="https://example.com/docs">Docs</AnchorLink>
			<AnchorLink href="https://example.com/finding" isUserContent>
				Finding
			</AnchorLink>
		</>,
	)
	expect(linksHtml).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>')
	expect(linksHtml).toContain('<a href="https://example.com/finding" target="_blank" rel="noopener ugc">Finding</a>')
})
