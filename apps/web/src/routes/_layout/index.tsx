import { fetchHome } from "@carlnotes/client/homeClient"
import {
	toHomeTopicsItemListLd,
	toOrganizationLd,
	toSoftwareApplicationLd,
	toVideoObjectLd,
	toWebSiteLd,
} from "@carlnotes/contracts/seo"
import { SITE_URL } from "@carlnotes/contracts/site"
import { TOPIC_TUTORIAL_VIDEO } from "@carlnotes/contracts/youtube"
import { HOME_NEWEST_PAGE_SEARCH_KEYS, toHomePageOptions } from "@carlnotes/core/lib/homeFaces"
import { toJsonLdScript } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { toPageSearch } from "@/lib/pageSearch"
import { HomePage } from "@/pages/HomePage"

// the url search keys of the week's new sections, whose pages the server pages
const HOME_NEWEST_PAGE_SEARCH_KEY_LIST = Object.values(HOME_NEWEST_PAGE_SEARCH_KEYS)

// the home page, with the site-wide title and description, its canonical url, its structured data with the home
// topics and the video on making a topic, and a visitor's home topic and podcast cards read on the server
export const Route = createFileRoute("/_layout/")({
	// the page past the first of each of the week's new sections, read from the url's search params
	validateSearch: (search: Record<string, unknown>) => toPageSearch(search, HOME_NEWEST_PAGE_SEARCH_KEY_LIST),
	loaderDeps: ({ search }) => search,
	// a visitor's home payload, read on the server only, or null in the browser or if the read fails, which marks the
	// render degraded. a user's payload is read in the browser, where their session is. the read holds the page of each
	// of the week's new sections that the url names
	loader: ({ deps }) =>
		loadOnServer(() => readWithDegradedFallback(() => fetchHome(toHomePageOptions(deps)), null), null),
	head: ({ loaderData }) => ({
		links: [{ rel: "canonical", href: SITE_URL }],
		scripts: [
			toJsonLdScript(toWebSiteLd(SITE_URL)),
			toJsonLdScript(toOrganizationLd(SITE_URL)),
			toJsonLdScript(toSoftwareApplicationLd(SITE_URL)),
			toJsonLdScript(toVideoObjectLd(SITE_URL, TOPIC_TUTORIAL_VIDEO)),
			toJsonLdScript(toHomeTopicsItemListLd(SITE_URL, loaderData?.homeTopics ?? [])),
		],
	}),
	component: HomePage,
})
