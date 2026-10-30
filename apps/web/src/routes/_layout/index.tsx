import { fetchTopicFeed } from "@carlnotes/client/topicClient"
import { topicSectionKeys } from "@carlnotes/contracts/enums"
import { toOrganizationLd, toSoftwareApplicationLd, toVideoObjectLd, toWebSiteLd } from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { TopicSectionKey } from "@carlnotes/contracts/topics"
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import { toJsonLdScript } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { HomePage } from "@/pages/HomePage"

// the page each section shows, by section key. an absent key means the first page
type TopicSectionPageNumbers = Partial<Record<TopicSectionKey, number>>

// the homepage, with the site-wide title and description, its canonical url,
// its structured data with the video on making a topic, and a visitor's topic sections by page
export const Route = createFileRoute("/_layout/")({
	// each section's page number past the first, read from the url's search params
	validateSearch: (search: Record<string, unknown>): TopicSectionPageNumbers =>
		Object.fromEntries(
			topicSectionKeys.flatMap((sectionKey) => {
				const pageNumber = toPageNumber(search[sectionKey])
				return pageNumber ? [[sectionKey, pageNumber]] : []
			}),
		),
	// a visitor's feed, read on the server only, or null in the browser or if the read fails, which marks the render
	// degraded
	loader: () => loadOnServer(() => readWithDegradedFallback(() => fetchTopicFeed(true), null), null),
	head: () => ({
		links: [{ rel: "canonical", href: SITE_URL }],
		scripts: [
			toJsonLdScript(toWebSiteLd(SITE_URL)),
			toJsonLdScript(toOrganizationLd(SITE_URL)),
			toJsonLdScript(toSoftwareApplicationLd(SITE_URL)),
			toJsonLdScript(toVideoObjectLd(SITE_URL, TOPIC_TUTORIAL_VIDEO)),
		],
	}),
	component: HomePage,
})

// a page number from a search param, or undefined if the param is not a page number past the first
function toPageNumber(value: unknown): number | undefined {
	const pageNumber = Number(value)
	return Number.isInteger(pageNumber) && pageNumber > 1 ? pageNumber : undefined
}
