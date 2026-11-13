// a Topic Post's body html beyond a note's: each image on its own line and the title as the alt text of an image with
// none, for its readers, each body image at the api's origin and back at its site path before a save, and what the
// phone's editor drops, put back before a save: each code block's language and each image's alt text and alignment. a
// view that draws an image at its stored size gets each image scaled to its width, and a save puts the stored size back
import { toApiUrl } from "@carlnotes/client/apiClient"
import { TOPIC_POST_BODY_IMAGES_PATH } from "@carlnotes/contracts/topicPostBodyImages"

// a code block's opening tag and its body, an img tag, and a paragraph's attributes and body
const CODE_BLOCK_PATTERN = /<codeblock\b([^>]*)>([\s\S]*?)<\/codeblock>/g
const IMG_PATTERN = /<img\b[^>]*>/g
const PARAGRAPH_PATTERN = /<p\b([^>]*)>([\s\S]*?)<\/p>/g

// an image's attributes that the phone's editor drops and a save puts back: its alt text and its alignment
const KEPT_IMAGE_ATTRIBUTES = ["alt", "data-align"]

// one attribute's quoted value in a tag's attributes
const toAttribute = (attributes: string, name: string): string | null =>
	new RegExp(`\\s${name}="([^"]*)"`).exec(attributes)?.[1] ?? null

// a block's text with its tags dropped, which matches a block across the two editors' markup
const toBlockText = (blockHtml: string): string => blockHtml.replace(/<[^>]*>/g, "").trim()

// an image src's path, with a site origin and a read signature dropped
export const toBodyImageSrcPath = (src: string): string => URL.parse(src, "http://localhost")?.pathname ?? ""

// the src opening of a body image at its site path
const SITE_BODY_IMAGE_SRC = `src="${TOPIC_POST_BODY_IMAGES_PATH}/`

// an image's width and height in pixels
export type BodyImageSize = { width: number; height: number }

// an img tag's size, if it names a whole one
const toImageSize = (img: string): BodyImageSize | null => {
	const width = Number(toAttribute(img, "width"))
	const height = Number(toAttribute(img, "height"))
	return width > 0 && height > 0 ? { width, height } : null
}

// an img tag at the given size
const toSizedImg = (img: string, { width, height }: BodyImageSize): string =>
	img.replace(/\swidth="[^"]*"/, ` width="${width}"`).replace(/\sheight="[^"]*"/, ` height="${height}"`)

/**
 * Returns a Topic Post's body for its readers, with each image on its own line at the api's origin and the post's
 * title as the alt text of each image that has none.
 */
export function toTopicPostReaderHtml({ html, title }: { html: string; title: string }): string {
	// the title as an attribute value, its markup characters escaped
	const alt = title.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
	return toBlockImageHtml(toApiBodyImageHtml(html)).replace(IMG_PATTERN, (img) =>
		toAttribute(img, "alt") !== null ? img : img.replace("<img", () => `<img alt="${alt}"`),
	)
}

/**
 * Returns a body with each image in a paragraph of its own, split from the text around it. A paragraph whose image
 * sits inside a formatting tag, such as bold or a link, stays whole.
 */
export function toBlockImageHtml(html: string): string {
	return html.replace(PARAGRAPH_PATTERN, (paragraph, attributes: string, body: string) => {
		// the text before, between, and after the images, and the images
		const texts = body.split(IMG_PATTERN)
		const images = body.match(IMG_PATTERN) ?? []
		if (images.length === 0 || !texts.every(isTagBalanced)) {
			return paragraph
		}

		// each image in its own paragraph, and each run of text with words in one
		const blocks = texts.flatMap((text, i) => [
			...(isBlankText(text) ? [] : [text.trim()]),
			...(images[i] ? [images[i]] : []),
		])
		return blocks.map((block) => `<p${attributes}>${block}</p>`).join("")
	})
}

// whether a run of html opens as many tags as it closes, line breaks and images aside
const isTagBalanced = (text: string): boolean =>
	(text.match(/<(?!\/|br\b|img\b)[a-z]/gi) ?? []).length === (text.match(/<\//g) ?? []).length

// whether a run of html holds no words, only spaces and line breaks
const isBlankText = (text: string): boolean => text.replace(/<br\s*\/?>|&nbsp;|\s/gi, "") === ""

/**
 * Returns a body with each body image at the api's origin, which an app on another origin loads it from. The web's
 * api shares the site's origin, so its body is unchanged.
 */
export function toApiBodyImageHtml(html: string): string {
	return html.replaceAll(SITE_BODY_IMAGE_SRC, `src="${toApiUrl(TOPIC_POST_BODY_IMAGES_PATH)}/`)
}

/**
 * Returns a body with each body image back at its site path, as a save stores it.
 */
export function toSiteBodyImageHtml(html: string): string {
	return html.replaceAll(`src="${toApiUrl(TOPIC_POST_BODY_IMAGES_PATH)}/`, SITE_BODY_IMAGE_SRC)
}

/**
 * Returns a size scaled down at its shape to the given width, or the size itself if it fits.
 */
export function toWidthLimitedSize(size: BodyImageSize, maxWidth: number): BodyImageSize {
	if (size.width <= maxWidth) {
		return size
	}
	return { width: Math.floor(maxWidth), height: Math.max(1, Math.round((size.height * maxWidth) / size.width)) }
}

/**
 * Returns a body with each image wider than the given width scaled down to it at its shape, for a view that draws an
 * image at its stored size.
 */
export function toWidthLimitedImageHtml(html: string, maxWidth: number): string {
	return html.replace(IMG_PATTERN, (img) => {
		const size = toImageSize(img)
		return size ? toSizedImg(img, toWidthLimitedSize(size, maxWidth)) : img
	})
}

/**
 * Returns each body image's size by its path.
 */
export function toBodyImageSizes(html: string): Map<string, BodyImageSize> {
	// each image with a src and a whole size
	const sizes = new Map<string, BodyImageSize>()
	for (const [img] of html.matchAll(IMG_PATTERN)) {
		// the image's path and size
		const src = toAttribute(img, "src")
		const size = toImageSize(img)
		if (src && size) {
			sizes.set(toBodyImageSrcPath(src), size)
		}
	}
	return sizes
}

/**
 * Returns a body with each image at the size given for its path, and each other image as it is.
 */
export function toStoredSizeImageHtml(html: string, sizes: Map<string, BodyImageSize>): string {
	return html.replace(IMG_PATTERN, (img) => {
		const src = toAttribute(img, "src")
		const size = src ? sizes.get(toBodyImageSrcPath(src)) : undefined
		return size ? toSizedImg(img, size) : img
	})
}

/**
 * Returns the edited body with the code block languages, image alt texts, and image alignments that the previous body had
 * and the edited one lost. A code block takes the language of the previous block with the same text, else the previous
 * block at its alignment. An image takes the alt text and the alignment of the previous image with the same src.
 */
export function toHtmlWithKeptAttributes(previousHtml: string, editedHtml: string): string {
	// the previous body's code blocks, each with its language and text
	const previousCodeBlocks = [...previousHtml.matchAll(CODE_BLOCK_PATTERN)].map(([, attributes = "", body = ""]) => ({
		language: toAttribute(attributes, "data-language"),
		text: toBlockText(body),
	}))

	// the previous images' alt texts and alignments by path
	const previousImageAttributes = new Map<string, Record<string, string>>()
	for (const [img] of previousHtml.matchAll(IMG_PATTERN)) {
		const src = toAttribute(img, "src")
		const keptAttributes = Object.fromEntries(
			KEPT_IMAGE_ATTRIBUTES.flatMap((name) => {
				const value = toAttribute(img, name)
				return value ? [[name, value]] : []
			}),
		)
		if (src && Object.keys(keptAttributes).length > 0) {
			previousImageAttributes.set(toBodyImageSrcPath(src), keptAttributes)
		}
	}

	// each edited code block with no language takes one, from the previous block with its text, else the unmatched
	// previous block at its alignment
	const languages = toCodeBlockLanguages(previousCodeBlocks, editedHtml)
	let codeBlockIndex = 0
	const htmlWithLanguages = editedHtml.replace(CODE_BLOCK_PATTERN, (codeBlock, attributes: string) => {
		const language = languages[codeBlockIndex]
		codeBlockIndex += 1

		// a block that names its own language keeps it
		if (!language || toAttribute(attributes, "data-language") !== null) {
			return codeBlock
		}
		return codeBlock.replace("<codeblock", () => `<codeblock data-language="${language}"`)
	})

	// each edited image takes the alt text and the alignment it lacks from the previous image at its path
	return htmlWithLanguages.replace(IMG_PATTERN, (img) => {
		const src = toAttribute(img, "src")
		const keptAttributes = src ? previousImageAttributes.get(toBodyImageSrcPath(src)) : undefined
		const lostAttributes = Object.entries(keptAttributes ?? {}).filter(([name]) => toAttribute(img, name) === null)
		const lostAttributesHtml = lostAttributes.map(([name, value]) => ` ${name}="${value}"`).join("")
		return lostAttributesHtml ? img.replace("<img", () => `<img${lostAttributesHtml}`) : img
	})
}

// each edited code block's language: a text match first, each previous block matched once, then the previous block at
// its alignment if no text match took it
function toCodeBlockLanguages(
	previousCodeBlocks: { language: string | null; text: string }[],
	editedHtml: string,
): (string | null)[] {
	// the text matches
	const matchedIndexes = new Set<number>()
	const textMatches = [...editedHtml.matchAll(CODE_BLOCK_PATTERN)].map(([, , body = ""]) => {
		const text = toBlockText(body)
		const i = previousCodeBlocks.findIndex((block, j) => !matchedIndexes.has(j) && block.text === text)
		if (i === -1) {
			return undefined
		}

		// a matched previous block matches no other
		matchedIndexes.add(i)
		return previousCodeBlocks[i]?.language ?? null
	})

	// a block with no text match takes the language at its alignment
	return textMatches.map((language, i) =>
		language !== undefined ? language : matchedIndexes.has(i) ? null : (previousCodeBlocks[i]?.language ?? null),
	)
}
