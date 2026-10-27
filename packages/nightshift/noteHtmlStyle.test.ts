// the note style reads the type roles, the radius scale, and whichever palette the app resolves
import { expect, test } from "bun:test"
import { darkRoast, latte } from "./colors"
import { toNoteHtmlStyle } from "./noteHtmlStyle"
import { toColorCssVariable } from "./theme"
import { toTokensCss } from "./tokensCss"

// the heading sizes are the page title, section heading, and large body roles in pixels, all bold
test("headings take the type roles' sizes in bold", () => {
	const noteHtmlStyle = toNoteHtmlStyle(latte)
	expect(noteHtmlStyle.h1).toEqual({ fontSize: 24, bold: true })
	expect(noteHtmlStyle.h2).toEqual({ fontSize: 18, bold: true })
	expect(noteHtmlStyle.h3).toEqual({ fontSize: 16, bold: true })
})

// each color comes from the palette given, so a mode's values and the web's CSS variables both work
test("colors follow the palette", () => {
	expect(toNoteHtmlStyle(latte).a.color).toBe(latte.link)
	expect(toNoteHtmlStyle(darkRoast).code.backgroundColor).toBe(darkRoast.muted)
	const cssVariableStyle = toNoteHtmlStyle({
		foreground: toColorCssVariable("foreground"),
		mutedForeground: toColorCssVariable("mutedForeground"),
		muted: toColorCssVariable("muted"),
		border: toColorCssVariable("border"),
		link: toColorCssVariable("link"),
		primary: toColorCssVariable("primary"),
	})
	expect(cssVariableStyle.blockquote.color).toBe("var(--muted-foreground)")
	expect(cssVariableStyle.ulCheckbox.boxColor).toBe("var(--primary)")
})

// inline library styles must reference properties emitted in each runtime palette, not Tailwind-only aliases
test("web note colors exist in both runtime palettes", () => {
	const paletteBlocks = toTokensCss().match(/(?::root|\.dark) \{[^}]+\}/g) ?? []
	expect(paletteBlocks).toHaveLength(2)
	for (const name of ["foreground", "mutedForeground", "muted", "border", "link", "primary"] as const) {
		const property = toColorCssVariable(name).slice(4, -1)
		for (const block of paletteBlocks) {
			expect(block).toContain(`${property}:`)
		}
	}
})

// the code block's corners are the medium radius step in pixels
test("the code block takes the medium radius", () => {
	expect(toNoteHtmlStyle(latte).codeblock.borderRadius).toBe(8)
})

test("a checkbox's 44-point touch target stops before editable text", () => {
	// leave room for the native checkbox's expanded target on both themes
	for (const palette of [latte, darkRoast]) {
		const { boxSize, gapWidth } = toNoteHtmlStyle(palette).ulCheckbox
		expect(boxSize / 2 + gapWidth).toBeGreaterThanOrEqual(44 / 2)
	}
})
