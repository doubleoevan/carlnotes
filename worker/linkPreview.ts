// the link preview a link gets: the page's own title, description, and image, every fetch through the public-url guard
import { fetchPublicUrl, toFetchableUrl } from "./publicFetch"
import { toYoutubeVideoId } from "./scrape"

// how long one link preview fetch may run. a member is waiting on their post
const PREVIEW_TIMEOUT_MS = 3_000

// how much of a page is read to find its meta tags. the head that holds them is far smaller than this
const MAX_PREVIEW_HTML_BYTES = 256 * 1024

// youtube's channel and playlist pages bury their meta tags far deeper, so they get a bigger bounded read
const YOUTUBE_PAGE_READ_BYTES = 1024 * 1024

// how large a link preview image may be before it is rejected
const MAX_LINK_PREVIEW_IMAGE_BYTES = 2 * 1024 * 1024

// the image types a link preview image may be stored as. an svg can hold a script and is left out
const PREVIEW_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"])

// how long a title or description may run
const MAX_PREVIEW_TEXT_CHARS = 500

// what a page offered for its link preview. a field is null if the page named nothing for it
export type LinkPreviewMetaTags = { title: string | null; description: string | null; imageUrl: string | null }

// a link preview image as it was fetched, ready to store
export type LinkPreviewImage = { bytes: Uint8Array; contentType: string }

// a url inside a message, ending at whitespace or at a character a url may not hold
const MESSAGE_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi

/**
 * The first distinct http(s) urls in a message, up to the limit, in the order they appear.
 */
export function toLinkPreviewUrls(content: string, limit: number): string[] {
	const urlMatches = content.match(MESSAGE_URL_PATTERN) ?? []

	// each match drops its trailing punctuation, and a repeated url keeps only its first appearance
	const linkPreviewUrls: string[] = []
	for (const urlMatch of urlMatches) {
		const linkPreviewUrl = toTrimmedUrl(urlMatch)
		if (linkPreviewUrl && !linkPreviewUrls.includes(linkPreviewUrl)) {
			linkPreviewUrls.push(linkPreviewUrl)
		}
		// stop once the limit is reached
		if (linkPreviewUrls.length >= limit) {
			break
		}
	}
	return linkPreviewUrls
}

// a matched url without the sentence punctuation that follows it
function toTrimmedUrl(urlMatch: string): string {
	// a markdown link inside parentheses ends in a run of them, so trimming repeats until nothing changes
	let linkPreviewUrl = urlMatch
	let trimmedUrl = ""
	while (linkPreviewUrl !== trimmedUrl) {
		trimmedUrl = linkPreviewUrl

		// a url written at the end of a sentence takes the punctuation with it
		linkPreviewUrl = linkPreviewUrl.replace(/[.,;:!?]+$/, "")

		// a closing bracket is punctuation only when the url opened none
		if (/[)\]]$/.test(linkPreviewUrl) && !/[([]/.test(linkPreviewUrl)) {
			linkPreviewUrl = linkPreviewUrl.slice(0, -1)
		}
	}
	return linkPreviewUrl
}

/**
 * The url as the link preview cache keys it, without the fragment. Throws when the url is malformed, not http(s), or internal.
 */
export function toNormalizedLinkPreviewUrl(url: string): string {
	// the guard rejects everything unfetchable, and the parsed url lowercases the host on its own
	const parsedUrl = toFetchableUrl(url)
	parsedUrl.hash = ""
	return parsedUrl.toString()
}

/**
 * Fetch a page and read the link preview its own tags offer. Throws when the url is unfetchable or the page does not answer with HTML.
 */
export async function fetchLinkPreviewMetadata(url: string): Promise<LinkPreviewMetaTags> {
	// YouTube's own oembed endpoint answers for a video, small and stable. a video it will not answer for,
	// like one with embedding turned off, falls through to its page's own tags
	const youtubeVideoId = toYoutubeVideoId(url)
	const embedVideoMetadata = youtubeVideoId ? await fetchYoutubeLinkPreviewMetaTags(url, youtubeVideoId) : null
	return embedVideoMetadata ?? fetchPageMetaTags(url)
}

// a page's link preview from its own tags
async function fetchPageMetaTags(url: string): Promise<LinkPreviewMetaTags> {
	// the fetch checks every redirect hop itself, so an internal address anywhere in the chain throws
	const response = await fetchPublicUrl(url, {
		signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
		headers: { accept: "text/html,application/xhtml+xml" },
	})
	if (!response.ok) {
		throw new Error(`link preview fetch for ${url} answered ${response.status}`)
	}

	// a direct image link previews as itself: the file is the card's image and its file name the title
	const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
	if (contentType.startsWith("image/")) {
		const imageName = decodeURIComponent(new URL(response.url || url).pathname.split("/").pop() ?? "")
		return { title: imageName || "Image", description: null, imageUrl: response.url || url }
	}

	// only HTML holds meta-tags, so anything else has no link preview to read
	if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
		throw new Error(`link preview fetch for ${url} answered ${contentType || "no content type"}`)
	}

	// a page larger than the limit is truncated to its start, which is where the meta-tags live
	const isYoutubePage = URL.parse(response.url || url)?.hostname.endsWith("youtube.com") ?? false
	const pageStart = await readStart(response, isYoutubePage ? YOUTUBE_PAGE_READ_BYTES : MAX_PREVIEW_HTML_BYTES)
	const metaTags = await toLinkPreviewMetaTags(new TextDecoder().decode(pageStart))
	return { ...metaTags, imageUrl: toAbsoluteImageUrl(metaTags.imageUrl, response.url || url) }
}

// a video's title, channel, and thumbnail from youtube's own oembed answer, which is small and stable.
// oembed only answers for a watch url, so a shorts, embed, or youtu.be link asks through its canonical form
async function fetchYoutubeLinkPreviewMetaTags(url: string, videoId: string): Promise<LinkPreviewMetaTags | null> {
	const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
	const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
	const response = await fetchPublicUrl(oembedUrl, { signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS) })
	if (!response.ok) {
		console.error(`youtube oembed fell back to the page for ${url}: ${response.status}`)
		return null
	}

	// the channel stands in for a description
	const oembed = (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
	return {
		title: toClippedText(oembed.title ?? ""),
		description: toClippedText(oembed.author_name ?? ""),
		imageUrl: oembed.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
	}
}

/**
 * The link preview a page's tags offer: its OpenGraph values, and its plain title and description where it published none.
 */
export async function toLinkPreviewMetaTags(html: string): Promise<LinkPreviewMetaTags> {
	// the OpenGraph and plain tags are collected apart, so an og value wins only where the page actually set one
	const openGraphContent: Record<string, string> = {}
	const plainContent: Record<string, string> = {}
	let titleText = ""

	// a meta tag names itself with property for OpenGraph and with name for the plain description
	const rewriter = new HTMLRewriter()
		.on("meta", {
			element(element) {
				const content = element.getAttribute("content")
				if (!content) {
					return
				}

				// the property attribute holds the og values and the name attribute holds the plain ones
				const property = element.getAttribute("property")?.toLowerCase()
				const name = element.getAttribute("name")?.toLowerCase()

				// each tag is filed under whichever attribute named it
				if (property?.startsWith("og:")) {
					openGraphContent[property] = content
				} else if (name) {
					plainContent[name] = content
				}
			},
		})
		// the head's title arrives as text, delivered in several chunks when it is long
		.on("head title", {
			text(chunk) {
				titleText += chunk.text
			},
		})

	// the handlers run only while the body is read, so the transformed response has to be consumed
	await rewriter.transform(new Response(html)).text()
	return {
		title: toClippedText(openGraphContent["og:title"] ?? titleText),
		description: toClippedText(openGraphContent["og:description"] ?? plainContent.description ?? ""),
		imageUrl: openGraphContent["og:image"] ?? null,
	}
}

/**
 * Fetch a page's link preview image through the public-url guard. Throws when it is not an image type served inline or is too large.
 */
export async function fetchLinkPreviewImage(imageUrl: string): Promise<LinkPreviewImage> {
	// the same guard the page went through, so an image host redirecting inward is rejected too
	const response = await fetchPublicUrl(imageUrl, { signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS) })
	if (!response.ok) {
		throw new Error(`link preview image fetch for ${imageUrl} answered ${response.status}`)
	}

	// the type decides this before the bytes are read, and an svg never passes
	const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? ""
	if (!PREVIEW_IMAGE_TYPES.has(contentType)) {
		throw new Error(`link preview image ${imageUrl} is ${contentType || "an unnamed type"}`)
	}

	// one byte past the limit is enough to know the image is too large to store
	const bytes = await readStart(response, MAX_LINK_PREVIEW_IMAGE_BYTES + 1)
	if (bytes.byteLength > MAX_LINK_PREVIEW_IMAGE_BYTES) {
		throw new Error(`link preview image ${imageUrl} exceeds ${MAX_LINK_PREVIEW_IMAGE_BYTES} bytes`)
	}
	return { bytes, contentType }
}

// an og:image may be written relative to its page, and only an http(s) url survives the guard later
function toAbsoluteImageUrl(imageUrl: string | null, pageUrl: string): string | null {
	if (!imageUrl) {
		return null
	}

	// a relative url resolves against the page that named it, the way a browser would
	try {
		return new URL(imageUrl, pageUrl).toString()
	} catch {
		return null
	}
}

// collapse a tag's whitespace and limit its length, or null if it holds no words
function toClippedText(text: string): string | null {
	const collapsedText = text.replace(/\s+/g, " ").trim()
	return collapsedText ? collapsedText.slice(0, MAX_PREVIEW_TEXT_CHARS) : null
}

// read a response from the start, stopping at the byte limit so a large body is never buffered whole
async function readStart(response: Response, maxBytes: number): Promise<Uint8Array> {
	const reader = response.body?.getReader()
	if (!reader) {
		return new Uint8Array()
	}

	// collect chunks until the limit is reached
	const chunks: Uint8Array[] = []
	let byteCount = 0
	while (byteCount < maxBytes) {
		const { done, value } = await reader.read()
		if (done) {
			break
		}

		// the loop condition stops on the chunk that crosses the limit, so the last one may overshoot it
		chunks.push(value)
		byteCount += value.length
	}

	// cancelling closes the connection, so the rest of a large body is never downloaded
	await reader.cancel().catch(() => {})

	// join the chunks once
	return Buffer.concat(chunks)
}
