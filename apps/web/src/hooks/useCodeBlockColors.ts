// a Topic Post's code block colors: the highlighter loads only for a body with a code block to color, and colors a
// reader's rendered blocks in place and the editor's blocks as they are typed
import { PLAIN_TEXT_LANGUAGE } from "@carlnotes/contracts/topicPosts"
import { type RefObject, useEffect } from "react"

// a code block that is not Plain text, in a body's html
const COLORED_CODE_BLOCK_PATTERN = new RegExp(`<codeblock\\b(?![^>]*\\bdata-language="${PLAIN_TEXT_LANGUAGE}")`)

/**
 * Returns whether a body has a code block that is not Plain text, the only kind the highlighter colors.
 */
export function hasColoredCodeBlock(html: string): boolean {
	return COLORED_CODE_BLOCK_PATTERN.test(html)
}

/**
 * Colors the code blocks inside a rendered body once the highlighter loads. A body with only Plain text blocks never
 * loads it.
 */
export function useCodeBlockColors(containerRef: RefObject<HTMLElement | null>, html: string): void {
	useEffect(() => {
		// only a body with a code block to color loads the highlighter
		const container = containerRef.current
		if (!container || !hasColoredCodeBlock(html)) {
			return
		}

		// a body replaced before the highlighter loads is not colored by the stale load
		let isCurrent = true
		void import("@/lib/codeBlockColors").then(({ colorCodeBlocks }) => {
			if (isCurrent) {
				colorCodeBlocks(container)
			}
		})

		// a new body or an unmount makes the load stale
		return () => {
			isCurrent = false
		}
	}, [containerRef, html])
}

// whether the editor's highlighter load has started, once for every editor on the page
let hasEditorHighlighterLoadStarted = false

/**
 * Loads the highlighter into the editor once, which then colors every code block in a language as it is typed.
 */
export function loadEditorCodeBlockColors(): void {
	if (hasEditorHighlighterLoadStarted) {
		return
	}
	hasEditorHighlighterLoadStarted = true
	// the editor package is imported here too, so a reader that imports this module never loads it
	void Promise.all([import("@/lib/codeBlockColors"), import("react-native-enriched-html")]).then(
		([{ toCodeBlockClassRanges }, { setCodeBlockHighlighter }]) => setCodeBlockHighlighter(toCodeBlockClassRanges),
	)
}
