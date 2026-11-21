import { fetchPodcastEpisodePageRead } from "@carlnotes/client/pageReadClient"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toHeadTags, toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { loadPageReadOnServer } from "@/lib/loadOnServer"
import { PodcastEpisodePage } from "@/pages/PodcastEpisodePage"

// the data that the podcast episode route loads, the page head and the episode page
type PodcastEpisodeRouteData = { head: PageHead | undefined; podcastEpisodePage: PodcastEpisodePageResponse | null }

// the topic's id and slug, the season, and the podcast episode's number from the url
type LoadPodcastEpisodeRouteOptions = { topicId: string; topicSlug: string; season: string; episodeNumber: string }

/**
 * Loads a podcast episode's page read on the server, and redirects a url with a stale slug.
 * In the browser loadPodcastEpisodeRoute returns no head and no page.
 */
async function loadPodcastEpisodeRoute({
	topicId,
	topicSlug,
	season,
	episodeNumber,
}: LoadPodcastEpisodeRouteOptions): Promise<PodcastEpisodeRouteData> {
	// read the podcast episode's page read, which holds its head, on the server
	const podcastEpisodePageRead = await loadPageReadOnServer(() =>
		fetchPodcastEpisodePageRead({ topicId, season, episodeNumber }),
	)

	// respond 404 for a podcast episode that the api does not know
	if (podcastEpisodePageRead === null) {
		throw notFound()
	}
	const podcastEpisodeHead = podcastEpisodePageRead?.head

	// redirect a stale slug permanently to the podcast episode's current path, the path of its card url
	const currentPodcastEpisodePath = podcastEpisodeHead ? new URL(podcastEpisodeHead.cardUrl).pathname : null
	const requestedPodcastEpisodePath = `/topics/${topicId}/${topicSlug}/episodes/${season}/${episodeNumber}`
	if (currentPodcastEpisodePath && currentPodcastEpisodePath !== requestedPodcastEpisodePath) {
		throw redirect({ href: currentPodcastEpisodePath, statusCode: 301 })
	}
	return { head: podcastEpisodeHead, podcastEpisodePage: podcastEpisodePageRead?.podcastEpisodePage ?? null }
}

// a podcast episode's page, at a path after its topic's path. every published episode has its card in its head.
// the server renders a public topic's episode, and the browser renders any other episode or its topic's gate
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug_/episodes/$season/$episodeNumber")({
	loader: ({ params }) => loadPodcastEpisodeRoute(params),
	// a page with no head is left out of search results, and a private or invite topic's episode head is noindex
	head: ({ loaderData }) => (loaderData?.head ? toHeadTags(loaderData.head) : toNoindexHeadTags()),
	component: PodcastEpisodePage,
	// the podcast episode page renders a missing episode too, with a 404 status
	notFoundComponent: PodcastEpisodePage,
})
