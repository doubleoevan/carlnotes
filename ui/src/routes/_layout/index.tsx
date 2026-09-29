import type { TopicSectionKey } from "@shared/contracts"
import { topicSectionKeys } from "@shared/enums"
import { toOrganizationLd, toSoftwareApplicationLd, toWebSiteLd } from "@shared/seo"
import { createFileRoute } from "@tanstack/react-router"
import { fetchTopicFeed } from "@/clients/topicClient"
import { loadOnServer } from "@/lib/loadOnServer"
import { SITE_URL, toJsonLdScript } from "@/lib/pageHead"
import { HomePage } from "@/pages/HomePage"

// the page each section shows, by section key. an absent key means the first page
type TopicSectionPageNumbers = Partial<Record<TopicSectionKey, number>>

// the homepage, with the site-wide title and description, its canonical url and structured data,
// and a visitor's topic sections by page
export const Route = createFileRoute("/_layout/")({
	// each section's page number past the first, read from the url's search params
	validateSearch: (search: Record<string, unknown>): TopicSectionPageNumbers =>
		Object.fromEntries(
			topicSectionKeys.flatMap((sectionKey) => {
				const pageNumber = toPageNumber(search[sectionKey])
				return pageNumber ? [[sectionKey, pageNumber]] : []
			}),
		),
	// a visitor's feed, read on the server only, or null in the browser or if the read fails
	loader: () => loadOnServer(() => fetchTopicFeed(true).catch(() => null), null),
	head: () => ({
		links: [{ rel: "canonical", href: SITE_URL }],
		scripts: [
			toJsonLdScript(toWebSiteLd(SITE_URL)),
			toJsonLdScript(toOrganizationLd(SITE_URL)),
			toJsonLdScript(toSoftwareApplicationLd(SITE_URL)),
		],
	}),
	component: HomePage,
})

// a page number from a search param, or undefined if the param is not a page number past the first
function toPageNumber(value: unknown): number | undefined {
	const pageNumber = Number(value)
	return Number.isInteger(pageNumber) && pageNumber > 1 ? pageNumber : undefined
}
