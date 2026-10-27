// the note editor's style: the sizes and colors the web app passes the editor and its display component as htmlStyle,
// from the type roles, the radius scale, and the palette the app resolves
import type { ColorName } from "./colors"
import { toRadiusPixels } from "./radius"
import { typeRoles } from "./typography"
import { toPixels } from "./units"

/** The note body's relaxed line spacing, shared by web and native text styles. */
export const NOTE_BODY_LEADING = 1.625

/** The color tokens a note's style reads, resolved by the app. The web app passes CSS variables. */
export type NotePalette = Pick<
	Record<ColorName, string>,
	"foreground" | "mutedForeground" | "muted" | "border" | "link" | "primary"
>

/** A heading's size in pixels and whether it renders bold. */
type NoteHeadingStyle = { fontSize: number; bold: boolean }

/**
 * The shape of the editor package's htmlStyle, for the keys a note sets. The app's assignment to the package's own
 * prop checks it structurally.
 */
export type NoteHtmlStyle = {
	// the three headings the toolbar offers
	h1: NoteHeadingStyle
	h2: NoteHeadingStyle
	h3: NoteHeadingStyle
	// the quote, the code block, inline code, and a link
	blockquote: { borderColor: string; borderWidth: number; gapWidth: number; color: string }
	codeblock: { color: string; backgroundColor: string; borderRadius: number }
	code: { color: string; backgroundColor: string }
	a: { color: string; textDecorationLine: "underline" }
	// the three lists: numbers, bullets, and checkboxes, each with its indent and the gap before its text
	ol: { markerColor: string; marginLeft: number; gapWidth: number }
	ul: { bulletColor: string; bulletSize: number; marginLeft: number; gapWidth: number }
	ulCheckbox: { boxColor: string; boxSize: number; marginLeft: number; gapWidth: number }
}

// the gap between a list's marker and its text, and the room a list indents by, in pixels
const LIST_GAP_PIXELS = 8
const LIST_MARGIN_PIXELS = 8

/**
 * Returns the note style for a palette: headings at the page title, section heading, and large body sizes in bold,
 * quotes on the border color in muted text, code on the muted fill, links in the link color, and the checkbox in the
 * primary color. Headings keep the body family. The editor sets no family per tag.
 */
export function toNoteHtmlStyle(palette: NotePalette): NoteHtmlStyle {
	return {
		h1: { fontSize: toPixels(typeRoles.pageTitle.fontSizeRem), bold: true },
		h2: { fontSize: toPixels(typeRoles.sectionHeading.fontSizeRem), bold: true },
		h3: { fontSize: toPixels(typeRoles.bodyLarge.fontSizeRem), bold: true },
		blockquote: { borderColor: palette.border, borderWidth: 4, gapWidth: 16, color: palette.mutedForeground },
		codeblock: { color: palette.foreground, backgroundColor: palette.muted, borderRadius: toRadiusPixels("md") },
		code: { color: palette.foreground, backgroundColor: palette.muted },
		a: { color: palette.link, textDecorationLine: "underline" },
		ol: { markerColor: palette.foreground, marginLeft: LIST_MARGIN_PIXELS, gapWidth: LIST_GAP_PIXELS },
		ul: { bulletColor: palette.foreground, bulletSize: 6, marginLeft: LIST_MARGIN_PIXELS, gapWidth: LIST_GAP_PIXELS },
		// leave the 44-point checkbox touch target clear of editable text
		ulCheckbox: { boxColor: palette.primary, boxSize: 24, marginLeft: LIST_MARGIN_PIXELS, gapWidth: 10 },
	}
}
