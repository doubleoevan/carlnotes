// the head tags a route's head() returns, built from the api's page head or from a page's own title and path
import type { PageHead } from "@shared/contracts"
import { toJsonLdText, toPageTitle } from "@shared/seo"

// the site's origin in production
export const SITE_URL = "https://carlnotes.com"

// the shape a route's head() returns
export type HeadTags = {
	meta: { title?: string; name?: string; property?: string; content?: string }[]
	links: { rel: string; href: string; type?: string; title?: string }[]
	scripts: { type?: string; children?: string }[]
}

/**
 * The head tags for a page the api described, or no tags if there is no head. A page that is not indexed gets a
 * robots noindex, nofollow tag.
 */
export function toHeadTags(pageHead: PageHead | null | undefined): HeadTags {
	if (!pageHead) {
		return { meta: [], links: [], scripts: [] }
	}
	return {
		meta: [
			{ title: pageHead.title },
			{ name: "description", content: pageHead.description },
			...(pageHead.isIndexed ? [] : [{ name: "robots", content: "noindex, nofollow" }]),
			{ property: "og:title", content: pageHead.cardTitle },
			{ property: "og:description", content: pageHead.description },
			{ property: "og:image", content: pageHead.imageUrl },
			{ property: "og:image:alt", content: pageHead.cardTitle },
			{ property: "og:url", content: pageHead.cardUrl },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: pageHead.cardTitle },
			{ name: "twitter:description", content: pageHead.description },
			{ name: "twitter:image", content: pageHead.imageUrl },
		],
		links: [
			...(pageHead.canonicalUrl ? [{ rel: "canonical", href: pageHead.canonicalUrl }] : []),
			...(pageHead.feedUrl
				? [{ rel: "alternate", type: "application/rss+xml", title: pageHead.cardTitle, href: pageHead.feedUrl }]
				: []),
		],
		scripts: pageHead.jsonLd ? [toJsonLdScript(pageHead.jsonLd)] : [],
	}
}

/**
 * The head tags of a page left out of search results, such as a sign-in page or a private team's page, with the
 * page's own title if one is given. A crawler still follows the page's links.
 */
export function toNoindexHeadTags(title?: string): HeadTags {
	return {
		meta: [...(title ? [{ title: toPageTitle(title) }] : []), { name: "robots", content: "noindex, follow" }],
		links: [],
		scripts: [],
	}
}

// what a fixed-title page's head tags are built from
type ToStaticHeadTagsOptions = { title: string; path: string; description: string }

/**
 * The head tags for a page with a fixed title, a path, and a description. The card image and every other tag are the
 * site-wide defaults.
 */
export function toStaticHeadTags({ title, path, description }: ToStaticHeadTagsOptions): HeadTags {
	const pageUrl = `${SITE_URL}${path}`
	return {
		meta: [
			{ title: toPageTitle(title) },
			{ property: "og:title", content: title },
			{ name: "twitter:title", content: title },
			{ property: "og:url", content: pageUrl },
			{ name: "description", content: description },
			{ property: "og:description", content: description },
			{ name: "twitter:description", content: description },
		],
		links: [{ rel: "canonical", href: pageUrl }],
		scripts: [],
	}
}

/**
 * A structured-data script tag.
 */
export function toJsonLdScript(jsonLd: object): { type: string; children: string } {
	return { type: "application/ld+json", children: toJsonLdText(jsonLd) }
}
