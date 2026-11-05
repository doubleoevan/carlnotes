// render tests for AnchorLink, which renders each kind of href its own way
import { expect, mock, test } from "bun:test"
import { act } from "react"
import { renderWithRouter } from "@/components/chat/renderWithRouter"
import { renderTestHook } from "@/lib/hookTestHarness"
import { AnchorLink, LinkBaseUrlContext, LinkOpenerContext } from "./AnchorLink"

// a scheme link and a server path are plain anchors with no target and no rel, and an api file keeps its download
test("a scheme link and a server path render plain anchors", async () => {
	const anchorsHtml = await renderWithRouter(
		<>
			<AnchorLink href="mailto:carl@carlnotes.com">Email</AnchorLink>
			<AnchorLink href="/docs/start">Docs</AnchorLink>
			<AnchorLink href="/nightshift/">Nightshift</AnchorLink>
			<AnchorLink href="/api/attachments/a1/download" download="notes.txt">
				notes.txt
			</AnchorLink>
		</>,
	)
	expect(anchorsHtml).toContain('<a href="mailto:carl@carlnotes.com">Email</a>')
	expect(anchorsHtml).toContain('<a href="/docs/start">Docs</a>')
	expect(anchorsHtml).toContain('<a href="/nightshift/">Nightshift</a>')
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

// isNewTab gives a server path and an internal route the same target and rel as an external link
test("isNewTab opens a server path and an internal route in a new tab", async () => {
	const linksHtml = await renderWithRouter(
		<>
			<AnchorLink href="/docs" isNewTab>
				Docs
			</AnchorLink>
			<AnchorLink href="/profiles/u1" isNewTab>
				Profile
			</AnchorLink>
		</>,
	)
	expect(linksHtml).toContain('<a href="/docs" target="_blank" rel="noopener noreferrer">Docs</a>')
	expect(linksHtml).toMatch(/<a [^>]*href="\/profiles\/u1"[^>]*>Profile<\/a>/)
	expect(linksHtml).toMatch(/<a [^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>Profile<\/a>/)
})

test("host links resolve against the connected site when the sandbox rejects a document base", async () => {
	const openLink = mock<(url: string) => void>(() => {})
	const hook = await renderTestHook(
		() => null,
		() => (
			<LinkBaseUrlContext.Provider value="http://localhost:5173/">
				<LinkOpenerContext.Provider value={openLink}>
					<AnchorLink href="/topics/terrarium" isNewTab>
						Topic
					</AnchorLink>
					<AnchorLink href="https://en.wikipedia.org/wiki/Terrarium">Article</AnchorLink>
				</LinkOpenerContext.Provider>
			</LinkBaseUrlContext.Provider>
		),
	)
	try {
		// the test document has no usable web base, matching an opaque host frame
		expect(document.baseURI).toBe("about:blank")
		const links = [...hook.container.querySelectorAll<HTMLAnchorElement>("a")]
		await act(async () => {
			links[0]?.click()
			links[1]?.click()
		})
		expect(openLink.mock.calls).toEqual([
			["http://localhost:5173/topics/terrarium"],
			["https://en.wikipedia.org/wiki/Terrarium"],
		])
	} finally {
		await hook.close()
	}
})

// only an existing local Codex chat may use its native scheme
test("Codex chat links open the app while action links remain inert", async () => {
	const reference = "codex://threads/00000000-0000-4000-8000-000000000001"
	const html = await renderWithRouter(
		<>
			<AnchorLink href={reference}>Conversation</AnchorLink>
			<AnchorLink href="codex://threads/new?prompt=run">New</AnchorLink>
			<AnchorLink href="codex://settings">Settings</AnchorLink>
		</>,
	)
	expect(html).toContain(`<a href="${reference}">Conversation</a>`)
	expect(html).not.toContain('href="codex://threads/new')
	expect(html).not.toContain('href="codex://settings')
})
