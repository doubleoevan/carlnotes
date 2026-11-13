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
 * from the sm breakpoint up, with its code blocks' text inset from their fill. A Topic Post's image sits on its own
 * line with a little space above and below, no wider than the column, at the shape its width and height give it. The
 * editor's image wrapper is only as wide as its image, so the resize handle stays at the image's corner. The editor's
 * scroll box reaches a little past the column on the right and below, with the text where it was, so the handle of a
 * full-width image is not cut off. An image placed at the left or the right sits at that side on a phone, and from the
 * sm breakpoint up floats there at up to half the column with the text beside it. A centered image sits in the middle.
 * The body holds its floats, so none reaches past its end. The editor's image wrapper and the reader's image are marked
 * block as important, because the editor package's own stylesheet sets them inline-block outside every layer.
 */
export const NOTE_BODY_CLASS =
	"font-sans text-sm text-card-foreground px-4 sm:px-6 [&_codeblock]:px-3 [&_codeblock]:py-2 [&_input[type=checkbox]]:min-h-6 [&_input[type=checkbox]]:min-w-6 [&_input[type=checkbox]]:accent-primary [&_.eti-editor]:-mr-2 [&_.eti-editor]:pr-2 [&_.eti-editor]:-mb-2 [&_.eti-editor]:pb-2 [&_.eti-inline-image]:block! [&_.eti-inline-image]:my-2 [&_.eti-inline-image]:w-fit [&_.eti-inline-image_img]:my-0 [&_.eti-inline-image]:max-w-full [&_img]:block! [&_img]:my-2 [&_img]:max-w-full [&_img]:h-auto flow-root [&_[data-align=center]]:mx-auto [&_[data-align=right]]:ml-auto sm:[&_[data-align=left]]:float-left sm:[&_[data-align=left]]:mr-4 sm:[&_[data-align=left]]:max-w-[50%] sm:[&_[data-align=right]]:float-right sm:[&_[data-align=right]]:ml-4 sm:[&_[data-align=right]]:max-w-[50%]"

/**
 * A Topic Post body's code block colors, in the reader and the editor: each highlight.js class in its Nightshift syntax color, color alone, so a
 * colored block keeps its size. A variant reads an underscore as a space, so built_in is matched by its prefix.
 */
export const CODE_BLOCK_COLORS_CLASS = [
	"[&_.hljs-keyword]:text-syntax-keyword [&_.hljs-selector-tag]:text-syntax-keyword [&_.hljs-name]:text-syntax-keyword",
	"[&_.hljs-meta]:text-syntax-keyword [&_.hljs-section]:text-syntax-keyword",
	"[&_.hljs-string]:text-syntax-string [&_.hljs-regexp]:text-syntax-string [&_.hljs-symbol]:text-syntax-string",
	"[&_.hljs-template-variable]:text-syntax-string [&_.hljs-addition]:text-syntax-string",
	"[&_.hljs-comment]:text-syntax-comment [&_.hljs-quote]:text-syntax-comment [&_.hljs-deletion]:text-syntax-comment",
	"[&_.hljs-number]:text-syntax-number [&_.hljs-literal]:text-syntax-number [&_.hljs-bullet]:text-syntax-number",
	"[&_.hljs-title]:text-syntax-function [&_[class*=hljs-built]]:text-syntax-function [&_.hljs-type]:text-syntax-function",
	"[&_.hljs-attr]:text-syntax-function [&_.hljs-attribute]:text-syntax-function [&_.hljs-property]:text-syntax-function",
	"[&_.hljs-selector-class]:text-syntax-function [&_.hljs-selector-id]:text-syntax-function",
].join(" ")
