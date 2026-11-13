// the body sanitizers: a note's keeps the editor's own tag set and nothing else, and a Topic Post's adds its own body
// images, a code block's language, and a block's alignment. each runs on every save before the write
import {
	fromTopicPostBodyImagePath,
	isTopicPostAlign,
	TOPIC_POST_BODY_IMAGE_ALT_MAX_CHARS,
	TOPIC_POST_BODY_IMAGE_MAX_SIDE,
} from "@carlnotes/contracts/topicPostBodyImages"
import { isStoredCodeBlockLanguage } from "@carlnotes/contracts/topicPosts"
import { appUrl } from "@carlnotes/server/appUrl"
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

// the attributes a note's tags keep
const NOTE_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
	a: ["href"],
	li: ["checked"],
	ul: ["data-type"],
}

// a list keeps data-type only as the checkbox list's marker. the attribute filter alone leaves an empty data-type
// behind, which the editor styles as neither list. its style goes on to the attribute filter, which a Topic Post's
// alignment passes
const toNoteList: sanitizeHtml.Transformer = (tagName, attributes) => {
	const keptAttributes: Record<string, string> =
		attributes["data-type"] === "checkbox" ? { "data-type": "checkbox" } : {}
	return { tagName, attribs: attributes.style ? { ...keptAttributes, style: attributes.style } : keptAttributes }
}

// the blocks a Topic Post aligns, each by its style's text-align alone
const TOPIC_POST_ALIGNED_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"]
const TOPIC_POST_ALIGNED_ATTRIBUTES = Object.fromEntries(TOPIC_POST_ALIGNED_TAGS.map((tag) => [tag, ["style"]]))

/**
 * Returns the body with everything but the editor's own markup dropped: a link keeps an http, https, or mailto href,
 * a checkbox list keeps its data-type, a checked item keeps its mark, and the text inside an unknown tag stays. A NUL
 * is dropped, which Postgres text cannot hold. An empty document is an empty string.
 */
export function sanitizeNoteHtml(html: string): string {
	return toSanitizedBody(html, {
		allowedTags: NOTE_ALLOWED_TAGS,
		allowedAttributes: NOTE_ALLOWED_ATTRIBUTES,
		allowedSchemes: ["http", "https", "mailto"],
		transformTags: { ul: toNoteList },
	})
}

// what a Topic Post's sanitize can also do: drop one of its body images, as an admin's removal does
export type SanitizeTopicPostHtmlOptions = { removedImageId?: string }

/**
 * Returns a Topic Post's body cleaned as a note's is, keeping an img only if its src is on our own site and names one
 * of this post's own body images, a code block's data-language only for a language on the list or Plain text, and a block's left,
 * center, or right text-align. A kept img holds
 * its path alone, with its alt text, its whole-number width and height, and its alignment, and any read signature is dropped.
 */
export function sanitizeTopicPostHtml(
	html: string,
	topicPostId: string,
	{ removedImageId }: SanitizeTopicPostHtmlOptions = {},
): string {
	return toSanitizedBody(html, {
		allowedTags: [...NOTE_ALLOWED_TAGS, "img"],
		allowedAttributes: {
			...TOPIC_POST_ALIGNED_ATTRIBUTES,
			...NOTE_ALLOWED_ATTRIBUTES,
			ul: ["data-type", "style"],
			img: ["src", "alt", "width", "height", "data-align"],
			codeblock: ["data-language"],
		},
		allowedStyles: { "*": { "text-align": [/^(left|center|right)$/] } },
		allowedSchemes: ["http", "https", "mailto"],
		transformTags: {
			ul: toNoteList,
			img: (tagName, attributes) => ({
				tagName,
				attribs: toTopicPostBodyImageAttributes(attributes, { topicPostId, removedImageId }),
			}),
			codeblock: (tagName, attributes) => {
				const language = attributes["data-language"] ?? ""
				const codeBlockAttributes: Record<string, string> = isStoredCodeBlockLanguage(language)
					? { "data-language": language }
					: {}
				return { tagName, attribs: codeBlockAttributes }
			},
		},
		// an img the transform emptied names no image of this post, so it goes whole
		exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
	})
}

// the sanitizer's pass, with a NUL dropped first and an empty document as an empty string
function toSanitizedBody(html: string, options: sanitizeHtml.IOptions): string {
	const sanitizedHtml = sanitizeHtml(html.replaceAll("\u0000", ""), options)
	return sanitizedHtml === SANITIZED_EMPTY_EDITOR_HTML ? "" : sanitizedHtml
}

// the post whose images an img may name, and an image the sanitize drops
type TopicPostBodyImageAttributesOptions = { topicPostId: string; removedImageId: string | undefined }

// an img's kept attributes: its path, its size, its alt text, and its alignment, or none for an img that names no image of the post,
// has no usable size, or is the removed image
function toTopicPostBodyImageAttributes(
	attributes: sanitizeHtml.Attributes,
	{ topicPostId, removedImageId }: TopicPostBodyImageAttributesOptions,
): sanitizeHtml.Attributes {
	// the src resolves against our own site, and must stay on it and name exactly one of this post's column copies
	const imagePath = toOwnSitePathname(attributes.src ?? "")
	const bodyImagePath = imagePath ? fromTopicPostBodyImagePath(imagePath) : null
	const isOwnImage = bodyImagePath?.topicPostId === topicPostId && bodyImagePath.imageId !== removedImageId

	// a size is a whole number of css pixels inside the range
	const width = toBodyImageSide(attributes.width)
	const height = toBodyImageSide(attributes.height)
	if (!isOwnImage || !imagePath || !width || !height) {
		return {}
	}

	// the alt text is one line, trimmed to its limit. an empty one is left off, so readers show the post's title
	const alt = (attributes.alt ?? "").replace(/\s+/g, " ").trim().slice(0, TOPIC_POST_BODY_IMAGE_ALT_MAX_CHARS)
	// an alignment off the list is left off, so the image sits on its own line
	const align = attributes["data-align"]
	return {
		src: imagePath,
		width: String(width),
		height: String(height),
		...(alt ? { alt } : {}),
		...(isTopicPostAlign(align) ? { "data-align": align } : {}),
	}
}

// the pathname of a url on our own site, resolved against it, or null for one that parses elsewhere or not at all
function toOwnSitePathname(src: string): string | null {
	// a relative path, an absolute url, and a protocol-relative one all resolve against the site's own url
	const siteUrl = new URL(appUrl())
	const resolvedUrl = URL.canParse(src, siteUrl) ? new URL(src, siteUrl) : null
	return resolvedUrl?.origin === siteUrl.origin ? resolvedUrl.pathname : null
}

// a size attribute as a whole number of css pixels inside the range, or null
function toBodyImageSide(side: string | undefined): number | null {
	if (!side || !/^\d+$/.test(side)) {
		return null
	}
	const sideValue = Number(side)
	return sideValue >= 1 && sideValue <= TOPIC_POST_BODY_IMAGE_MAX_SIDE ? sideValue : null
}
