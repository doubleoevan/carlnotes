// the page head helpers. the site and page titles, structured data, topic slugs and paths, and the meta description
import { PLANS } from "./plans"

// the site's own title, on the homepage and on any page with no title of its own
export const SITE_TITLE = "CarlNotes — He already read it. All of it."

// the docs site's address without its scheme
export const DOCS_SITE_ADDRESS = "carlnotes.com/docs"

// the site's public accounts and its source repository, for the Organization schema's sameAs list
const ORGANIZATION_PROFILES = [
	// X
	"https://x.com/notesofcarl",
	// Bluesky
	"https://bsky.app/profile/notesofcarl.bsky.social",
	// Reddit
	"https://www.reddit.com/user/notesofcarl/",
	// GitHub
	"https://github.com/doubleoevan/carlnotes",
	// not live yet. add each url once the account exists
	// YouTube
	// Instagram
	// TikTok
	// Facebook
	// Mastodon
]

// how many rows of a paged list a page's html holds for a reader without JavaScript, a crawler included
export const NO_SCRIPT_ROW_LIMIT = 50

// how many characters a slug keeps
const TOPIC_SLUG_LIMIT = 60

// a search result shows about this many characters of a description
const META_DESCRIPTION_LIMIT = 160

/**
 * Returns a page's document title: its own name, then the site's name.
 */
export function toPageTitle(pageName: string): string {
	return `${pageName} — CarlNotes`
}

/**
 * Serializes a JSON-LD object as script tag text, with "<" escaped so no data can close the tag.
 */
export function toJsonLdText(jsonLd: object): string {
	return JSON.stringify(jsonLd).replaceAll("<", "\\u003c")
}

/**
 * Builds the site's Organization schema.
 */
export function toOrganizationLd(appUrl: string): object {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "CarlNotes",
		url: appUrl,
		logo: `${appUrl}/carl-hero.png`,
		sameAs: ORGANIZATION_PROFILES,
	}
}

/**
 * Builds the site's WebSite schema, which a search engine reads for the site's name.
 */
export function toWebSiteLd(appUrl: string): object {
	return { "@context": "https://schema.org", "@type": "WebSite", name: "CarlNotes", url: appUrl }
}

/**
 * Builds the site's SoftwareApplication schema, with one offer per plan.
 */
export function toSoftwareApplicationLd(appUrl: string): object {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "CarlNotes",
		url: appUrl,
		applicationCategory: "NewsApplication",
		operatingSystem: "Web",
		// one offer per plan, priced at its monthly rate
		offers: Object.entries(PLANS).map(([plan, planConfig]) => ({
			"@type": "Offer",
			name: `${plan[0]?.toUpperCase()}${plan.slice(1)}`,
			price: (planConfig.priceMonthlyCents / 100).toFixed(2),
			priceCurrency: "USD",
		})),
	}
}

/**
 * Returns a topic's slug, its name as url-safe words, or an empty string for a name with no url-safe characters.
 */
export function toTopicSlug(name: string): string {
	// the name without its accents, lowercased, with every run of other characters as one dash
	const dashedName = name
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
	// trim the dashes at either end, and limit the length without leaving a dash at the end
	return dashedName
		.replace(/^-+|-+$/g, "")
		.slice(0, TOPIC_SLUG_LIMIT)
		.replace(/-+$/, "")
}

/**
 * Returns a topic page's path, the id then the slug.
 */
export function toTopicPath(topic: { id: string; name: string }): string {
	// build the path from the id and the slug, or the id alone if the name has no url-safe characters
	const slug = toTopicSlug(topic.name)
	return slug ? `/topics/${topic.id}/${slug}` : `/topics/${topic.id}`
}

/**
 * Returns whether a topic page's url is missing the topic's current slug, or has an old one.
 */
export function isTopicSlugStale(topic: { id: string; name: string }, topicSlug: string | undefined): boolean {
	return (topicSlug ?? "") !== toTopicSlug(topic.name)
}

/**
 * Returns a topic's feed path, which names the topic by id alone so a renamed topic keeps its feed url.
 */
export function toTopicFeedPath(topicId: string): string {
	return `/topics/${topicId}/feed.xml`
}

/**
 * Returns a topic's podcast feed path, which names the topic by id alone so a renamed topic keeps its feed url.
 */
export function toPodcastFeedPath(topicId: string): string {
	return `/topics/${topicId}/podcast.xml`
}

/**
 * Returns a podcast episode page's path, which comes after its topic page's path.
 */
export function toPodcastEpisodePath(
	topic: { id: string; name: string },
	podcastEpisode: { season: number | null; episodeNumber: number | null },
): string {
	return `${toTopicPath(topic)}/episodes/${podcastEpisode.season}/${podcastEpisode.episodeNumber}`
}

/**
 * Returns a url's host in lowercase without a leading www, or the url itself if it does not parse.
 */
export function toHostWithoutWww(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
	} catch {
		return url
	}
}

/**
 * Builds a page's meta description, the text's plain words on one line, clipped at a word to fit a search result.
 */
export function toMetaDescription(text: string): string {
	// join the lines of the plain text, and return it whole if it fits
	const oneLineText = toPlainText(text).replace(/\s+/g, " ").trim()
	if (oneLineText.length <= META_DESCRIPTION_LIMIT) {
		return oneLineText
	}
	// clip at the last whole word, or at the limit if the clipped text has no space
	const clippedText = oneLineText.slice(0, META_DESCRIPTION_LIMIT - 1)
	const lastSpaceIndex = clippedText.lastIndexOf(" ")
	const wholeWordText = lastSpaceIndex === -1 ? clippedText : clippedText.slice(0, lastSpaceIndex)

	// drop a trailing comma, semicolon, or colon, and end with an ellipsis
	return `${wholeWordText.replace(/[,;:]$/, "")}…`
}

// markdown as its plain words. a link or image keeps its text, and the marks for bold, star emphasis, code,
// headings, quotes, and lists go
function toPlainText(markdown: string): string {
	return markdown
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\*\*|__|`/g, "")
		.replace(/\*(\S[^*]*?)\*/g, "$1")
		.replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
}
