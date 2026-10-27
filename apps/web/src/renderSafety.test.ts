// a guard over the whole ui tree: model-written text renders through one of two filtered Markdown subsets

import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// the files that allowed to render Markdown: our own static legal copy
const STATIC_COPY_PAGES = ["pages/TermsPage.tsx", "pages/PrivacyPage.tsx"]
const SAFETY_RENDERER = "components/topic/TopicScanRecap.tsx"

// the streaming chat renderer, the only file allowed to load streamdown
const STREAMING_CHAT_RENDERER = "components/chat/ChatMarkdown.tsx"

// every ui source file, minus the build output and the tests
function uiSourceFiles(): string[] {
	return (
		readdirSync(import.meta.dir, { recursive: true })
			.map((entry) => String(entry))
			// filter out the tests and the build output
			.filter(
				(name) =>
					(name.endsWith(".ts") || name.endsWith(".tsx")) &&
					!name.endsWith(".test.ts") &&
					!name.endsWith(".test.tsx") &&
					!name.includes(".tsbuild"),
			)
	)
}

// check for files reaching for a Markdown library that are not allowed to
function rendererOffenders(library: string, allowed: string[]): string[] {
	return uiSourceFiles().filter(
		(name) => !allowed.includes(name) && readFileSync(join(import.meta.dir, name), "utf8").includes(library),
	)
}

// no component outside the allowed files renders Markdown
test("only the static copy pages and the sanitizing renderer use markdown", () => {
	expect(rendererOffenders("markdown-to-jsx", [...STATIC_COPY_PAGES, SAFETY_RENDERER])).toEqual([])
})

// streaming is the only reason to reach for the streamdown library, so only the chat renderer can
test("only the streaming renderer uses streamdown", () => {
	expect(rendererOffenders("streamdown", [STREAMING_CHAT_RENDERER])).toEqual([])
})

// the safety renderer keeps its policy: raw HTML stays text and every anchor routes through the allowlist
test("the safety renderer disables raw html and routes anchors through the allowlist", () => {
	const rendererSource = readFileSync(join(import.meta.dir, SAFETY_RENDERER), "utf8")
	expect(rendererSource).toContain("disableParsingRawHTML: true")
	expect(rendererSource).toContain("a: { component: FindingLink, props: { allowedUrls } }")
	expect(rendererSource).toContain("<SafeNoteLink {...props}")

	// both platform renderers now delegate link eligibility to the same portable component
	const sharedLinkSource = readFileSync(
		new URL("../../../packages/core/components/SafeNoteLink.tsx", import.meta.url),
		"utf8",
	)
	expect(sharedLinkSource).toContain("isAllowedNoteUrl(href, allowedUrls)")
})

// the streaming renderer scheme-checks anchors and images
test("the streaming renderer disables raw html and scheme-checks every destination", () => {
	// the renderer delegates its scheme policy to the same module used by native chat
	const rendererSource =
		readFileSync(join(import.meta.dir, STREAMING_CHAT_RENDERER), "utf8") +
		readFileSync(new URL("../../../packages/core/lib/safeChatMarkdown.ts", import.meta.url), "utf8")
	expect(rendererSource).toContain('from "@carlnotes/core/lib/safeChatMarkdown"')
	expect(rendererSource).toContain("!isSafeHref(href)")
	expect(rendererSource).toContain("!isSafeHref(src)")
	expect(rendererSource).toContain("[defaultRehypePlugins.sanitize, defaultRehypePlugins.harden]")
	expect(rendererSource).not.toContain("defaultRehypePlugins.raw")
	expect(rendererSource).toContain("rehypePlugins={SAFE_REHYPE_PLUGINS}")

	// an unsafe scheme renders as its own text, and an image is linked instead of being loaded
	expect(rendererSource).toContain("a: ReplyLink")
	expect(rendererSource).toContain("img: ReplyImage")
	expect(rendererSource).toContain('href.startsWith("https://") || href.startsWith("http://")')
})

// nothing in the ui injects raw HTML. the note's stored body renders through the editor package's display component
test("no ui file injects raw html", () => {
	const unsafeSourceFiles = uiSourceFiles().filter((name) =>
		readFileSync(join(import.meta.dir, name), "utf8").includes("dangerouslySetInnerHTML"),
	)
	expect(unsafeSourceFiles).toEqual([])
})

// the body a note stores is sanitized in the api before every write, to the editor's own tag set
test("the note html is sanitized server-side", () => {
	const sanitizerSource = readFileSync(join(import.meta.dir, "../../api/note/noteHtml.ts"), "utf8")
	expect(sanitizerSource).toContain('allowedSchemes: ["http", "https", "mailto"]')
	const routeSource = readFileSync(join(import.meta.dir, "../../api/note/notes.ts"), "utf8")
	expect(routeSource).toContain("html: sanitizeNoteHtml(html)")
})
