// the images a page's own content shows, read from the page's main-content Markdown: each image outside any link, in
// the page's order, without the ones whose url names a logo, an icon, or an advert

// how much of a page's Markdown is read for images, and how many of its images are tried at most
const RESOURCE_IMAGE_MARKDOWN_MAX_LENGTH = 200_000
const RESOURCE_IMAGE_CANDIDATE_LIMIT = 24

// one image in Markdown: its alt text, then its url, bare or inside angle brackets, then an optional title. each part
// has a length limit, so a page of unclosed images cannot make the match run long
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]\n]{0,300}\]\(\s*<?([^)\s>]{1,2048})>?(?:\s[^)\n]{0,300})?\)/g

// the words in a url that name an image a film never shows, each as a whole word
const REJECTED_IMAGE_WORD_PATTERN =
	/(?<![a-z])(logos?|favicon|icons?|emojis?|sprites?|badges?|placeholder|adverts?|advertisements?|advertising|doubleclick)(?![a-z])/i

// a tracking pixel's file name
const TRACKING_PIXEL_PATTERN = /(?<![a-z0-9])(pixel|1x1)\.(gif|png)/i

/**
 * Returns the urls of the images that a page's main-content Markdown shows outside any link, in the page's order,
 * absolute and each once, up to the candidate limit. An image inside a link is the picture of another page, and an
 * image whose url names a logo, an icon, an emoji, a sprite, a badge, a placeholder, an advert, or a tracking pixel
 * is left out. Only the start of a very long page is read.
 */
export function toResourceImageCandidateUrls(pageMarkdown: string, pageUrl: string): string[] {
	// how many links' texts each character sits inside
	const markdown = pageMarkdown.slice(0, RESOURCE_IMAGE_MARKDOWN_MAX_LENGTH)
	const linkTextDepths = toLinkTextDepths(markdown)
	const candidateUrls: string[] = []
	for (const imageMatch of markdown.matchAll(MARKDOWN_IMAGE_PATTERN)) {
		// leave out an image that sits inside a link's text
		if ((linkTextDepths[imageMatch.index] ?? 0) > 0) {
			continue
		}

		// keep an absolute http or https url that names nothing rejected, once, and stop at the limit
		const candidateUrl = toAbsoluteImageUrl(imageMatch[1] ?? "", pageUrl)
		if (candidateUrl && !isRejectedImageUrl(candidateUrl) && !candidateUrls.includes(candidateUrl)) {
			candidateUrls.push(candidateUrl)
		}

		// the page's later images are never tried
		if (candidateUrls.length === RESOURCE_IMAGE_CANDIDATE_LIMIT) {
			break
		}
	}
	return candidateUrls
}

/**
 * Returns whether an image's url names a logo, an icon, an emoji, a sprite, a badge, a placeholder, an advert, or a
 * tracking pixel.
 */
export function isRejectedImageUrl(imageUrl: string): boolean {
	return REJECTED_IMAGE_WORD_PATTERN.test(imageUrl) || TRACKING_PIXEL_PATTERN.test(imageUrl)
}

// how many links' texts each character of the Markdown sits inside. a link's text runs from its opening bracket to its
// closing bracket, for a bracket pair that a link's address or reference follows. an image's own brackets are not a link
function toLinkTextDepths(markdown: string): Int32Array {
	// each link's text adds one after its opening bracket and takes one away at its closing bracket
	const depthChanges = new Int32Array(markdown.length + 1)
	const openBrackets: { start: number; isImage: boolean }[] = []
	for (let i = 0; i < markdown.length; i++) {
		// skip an escaped character
		const character = markdown[i]
		if (character === "\\") {
			i++
			continue
		}

		// remember each opening bracket, and whether an image opens with it
		if (character === "[") {
			openBrackets.push({ start: i, isImage: markdown[i - 1] === "!" })
			continue
		}

		// a closing bracket ends the last opening one, which is a link's text if an address or a reference follows it
		const openBracket = character === "]" ? openBrackets.pop() : undefined
		const nextCharacter = markdown[i + 1]
		if (openBracket && !openBracket.isImage && (nextCharacter === "(" || nextCharacter === "[")) {
			depthChanges[openBracket.start + 1] = (depthChanges[openBracket.start + 1] ?? 0) + 1
			depthChanges[i] = (depthChanges[i] ?? 0) - 1
		}
	}

	// the running sum of the changes is each character's depth
	const linkTextDepths = new Int32Array(markdown.length + 1)
	let depth = 0
	for (let i = 0; i <= markdown.length; i++) {
		depth += depthChanges[i] ?? 0
		linkTextDepths[i] = depth
	}
	return linkTextDepths
}

// an image url as an absolute http or https url, resolved against its page, or null for any other url
function toAbsoluteImageUrl(imageUrl: string, pageUrl: string): string | null {
	try {
		const absoluteUrl = new URL(imageUrl, pageUrl)
		return absoluteUrl.protocol === "http:" || absoluteUrl.protocol === "https:" ? absoluteUrl.href : null
	} catch {
		return null
	}
}
