// the note body's sanitizer: the editor's own tag set and nothing else, run on every save before the write
import sanitizeHtml from "sanitize-html"

// the tags the editor writes, from its supported tags page: paragraphs and empty lines, the inline marks, links, the
// six headings, the three lists, quotes, and code blocks
const NOTE_ALLOWED_TAGS = [
	"p",
	"br",
	"b",
	"i",
	"u",
	"s",
	"code",
	"a",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"ul",
	"ol",
	"li",
	"blockquote",
	"codeblock",
]

// the editor's empty document once sanitized: one empty line
const SANITIZED_EMPTY_EDITOR_HTML = "<br />"

/**
 * Returns the body with everything but the editor's own markup dropped: a link keeps an http, https, or mailto href,
 * a checkbox list keeps its data-type, a checked item keeps its mark, and the text inside an unknown tag stays. An
 * empty document is an empty string.
 */
export function sanitizeNoteHtml(html: string): string {
	const sanitizedHtml = sanitizeHtml(html, {
		allowedTags: NOTE_ALLOWED_TAGS,
		allowedAttributes: { a: ["href"], li: ["checked"], ul: ["data-type"] },
		allowedSchemes: ["http", "https", "mailto"],
		// a list keeps data-type only as the checkbox list's marker. the attribute filter alone leaves an empty data-type
		// behind, which the editor styles as neither list
		transformTags: {
			ul: (tagName, attributes) => {
				const keptAttributes: Record<string, string> =
					attributes["data-type"] === "checkbox" ? { "data-type": "checkbox" } : {}
				return { tagName, attribs: keptAttributes }
			},
		},
	})
	return sanitizedHtml === SANITIZED_EMPTY_EDITOR_HTML ? "" : sanitizedHtml
}
