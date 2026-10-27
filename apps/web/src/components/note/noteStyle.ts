// the note's style on the web: Nightshift's note style over the theme's CSS variables, so the theme toggle restyles an
// open note with no re-render, and the classes the editor and the display component share
import { NOTE_BODY_LEADING, type NotePalette, toNoteHtmlStyle } from "@carlnotes/nightshift/noteHtmlStyle"
import { toColorCssVariable } from "@carlnotes/nightshift/theme"

// each color the note style reads, as the variable the theme sets
const NOTE_PALETTE: NotePalette = {
	foreground: toColorCssVariable("foreground"),
	mutedForeground: toColorCssVariable("mutedForeground"),
	muted: toColorCssVariable("muted"),
	border: toColorCssVariable("border"),
	link: toColorCssVariable("link"),
	primary: toColorCssVariable("primary"),
}

/** The htmlStyle of the editor and the display component. */
export const NOTE_HTML_STYLE = toNoteHtmlStyle(NOTE_PALETTE)

/** The editor's placeholder color, the muted text. */
export const NOTE_PLACEHOLDER_COLOR = NOTE_PALETTE.mutedForeground

/** The shared relaxed spacing scales with the browser's text size. */
export const NOTE_BODY_STYLE = { lineHeight: NOTE_BODY_LEADING }

/**
 * The note's text: the body font at the dialog's size in the card's color, inset from the page card's edge, further
 * from the sm breakpoint up.
 */
export const NOTE_BODY_CLASS =
	"font-sans text-sm text-card-foreground px-4 sm:px-6 [&_input[type=checkbox]]:min-h-6 [&_input[type=checkbox]]:min-w-6 [&_input[type=checkbox]]:accent-primary"
