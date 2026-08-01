// a guard over the whole ui tree: model-written text renders through one filtered Markdown subset,
// so nothing a model read off a web page can become a link, an image, or embedded markup in the browser

import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// the files that allowed to render Markdown: our own static legal copy, which no model writes,
// and the one safety renderer every model-written note routes through
const STATIC_COPY_PAGES = ["pages/TermsPage.tsx", "pages/PrivacyPage.tsx"]
const SAFETY_RENDERER = "components/topic/TopicScanRecap.tsx"

// every ui source file, minus the allowed renderers, the build output, and the tests
function uiSourceFiles(): string[] {
	return (
		readdirSync(import.meta.dir, { recursive: true })
			.map((entry) => String(entry))
			// filter out the tests, the build output, and the files allowed to render Markdown
			.filter(
				(name) =>
					(name.endsWith(".ts") || name.endsWith(".tsx")) &&
					!name.endsWith(".test.ts") &&
					!name.endsWith(".test.tsx") &&
					!name.includes(".tsbuild") &&
					!STATIC_COPY_PAGES.includes(name) &&
					name !== SAFETY_RENDERER,
			)
	)
}

// no component outside the allowed files renders Markdown
test("only the static copy pages and the hardened renderer use markdown", () => {
	const offenders = uiSourceFiles().filter((name) =>
		readFileSync(join(import.meta.dir, name), "utf8").includes("markdown-to-jsx"),
	)
	expect(offenders).toEqual([])
})

// the safety renderer keeps its policy: raw HTML stays text and every anchor routes through the allowlist.
// a source-level pin, so removing either line fails here before it ships an unvetted anchor
test("the safety renderer disables raw html and routes anchors through the allowlist", () => {
	const rendererSource = readFileSync(join(import.meta.dir, SAFETY_RENDERER), "utf8")
	expect(rendererSource).toContain("disableParsingRawHTML: true")
	expect(rendererSource).toContain("a: { component: FindingLink, props: { allowedUrls } }")
	expect(rendererSource).toContain("allowedUrls?.has(href)")
})

// nothing in the ui injects raw HTML, which would defeat escaping wherever model-written text lands
test("no ui file injects raw html", () => {
	const unsafeSourceFiles = uiSourceFiles().filter((name) =>
		readFileSync(join(import.meta.dir, name), "utf8").includes("dangerouslySetInnerHTML"),
	)
	expect(unsafeSourceFiles).toEqual([])
})
