// the patched web editor keeps an image's alt text through its own rendering, and an inserted image takes one

import { afterAll, beforeAll, expect, test } from "bun:test"
import type { NoteEditorCommands } from "@carlnotes/core/lib/noteFormats"
import { act, createRef, type ReactNode } from "react"
import type { EnrichedTextInputInstance } from "react-native-enriched-html"
import { type HookTestHarness, renderTestHook, waitForHook } from "@/lib/hookTestHarness"

// a body with an image with alt text. happy-dom's DOMPurify drops a codeblock tag that browsers keep, and its
// selection selects no image, so a code block's language and the alt command are checked in the browser instead
const IMAGE_PATH = "/api/topic-post-body-images/a/b/column.webp"
const BODY_HTML = `<html><p>a</p><img src="${IMAGE_PATH}" alt="A latte" width="640" height="480" /></html>`

// the editor the harness shows, which changes per test. the editor's sanitizer binds to the window it first loads
// under, so one window serves the whole file and the editor loads after it
let shownEditor: ReactNode = null
let harness: HookTestHarness<null>
let EnrichedTextInput: typeof import("react-native-enriched-html").EnrichedTextInput
const addedGlobalNames: string[] = []
beforeAll(async () => {
	harness = await renderTestHook(
		() => null,
		() => shownEditor,
	)

	// the editor also reads the window's classes and functions, such as DOMParser and getComputedStyle, as globals
	const { window } = globalThis as unknown as { window: Record<string, unknown> }
	for (const name of Object.getOwnPropertyNames(window)) {
		const value = window[name]
		if (name in globalThis) {
			continue
		}
		const isWindowFunction = typeof value === "function" && /^[a-z]/.test(name)
		const globalValue = isWindowFunction ? (value as () => unknown).bind(window) : value
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: globalValue })
		addedGlobalNames.push(name)
	}
	;({ EnrichedTextInput } = await import("react-native-enriched-html"))
})
afterAll(async () => {
	await harness.close()
	for (const name of addedGlobalNames) {
		Reflect.deleteProperty(globalThis, name)
	}
})

// show a fresh editor on a body, recording each html it reports
async function mountEditor(defaultValue: string) {
	const editorRef = createRef<EnrichedTextInputInstance>()
	const htmls: string[] = []
	shownEditor = (
		<EnrichedTextInput
			key={defaultValue}
			ref={editorRef}
			defaultValue={defaultValue}
			onChangeHtml={(event) => htmls.push(event.nativeEvent.value)}
		/>
	)
	await harness.render()
	await waitForHook(() => htmls.some((html) => html.includes("<img")))
	return { editorRef, htmls }
}

test("the editor's own rendering keeps an image's alt text", async () => {
	const { htmls } = await mountEditor(BODY_HTML)
	expect(htmls.at(-1)).toContain('alt="A latte"')
})

test("an image inserted with alt text keeps it", async () => {
	const { editorRef, htmls } = await mountEditor(`<html><p>a</p><img src="${IMAGE_PATH}" /></html>`)

	// a second image goes in with its alt text, through the patched command the library's types leave out
	const editor = editorRef.current as NoteEditorCommands | null
	await act(async () => editor?.setImage?.(IMAGE_PATH.replace("/b/", "/c/"), 4, 3, "A mug"))
	await waitForHook(() => (htmls.at(-1) ?? "").includes('alt="A mug"'))
})
