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
import { toJsonLdScript } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { loadOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"
import { HomePage } from "@/pages/HomePage"

// the home page, with the site-wide title and description, its canonical url, its structured data with the home
// topics and the video on making a topic, and a visitor's home topic and podcast cards read on the server
export const Route = createFileRoute("/_layout/")({
	// a visitor's home payload, read on the server only, or null in the browser or if the read fails, which marks the
	// render degraded. a user's payload is read in the browser, where their session is
	loader: () => loadOnServer(() => readWithDegradedFallback(fetchHome, null), null),
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
