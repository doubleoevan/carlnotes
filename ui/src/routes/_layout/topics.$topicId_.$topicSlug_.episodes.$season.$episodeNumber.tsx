import type { PageHead, PodcastEpisodePageResponse } from "@shared/contracts"
import { createFileRoute, notFound, redirect } from "@tanstack/react-router"
import { fetchPodcastEpisodePageHead } from "@/clients/pageHeadClient"
import { fetchPodcastEpisodePage } from "@/clients/podcastEpisodeClient"
import { loadPageOnServer } from "@/lib/loadOnServer"
import { toHeadTags, toNoindexHeadTags } from "@/lib/pageHead"
import { PodcastEpisodePage } from "@/pages/PodcastEpisodePage"

// the data that the podcast episode route loads, the page head and the episode page
type PodcastEpisodeRouteData = { head: PageHead | undefined; podcastEpisodePage: PodcastEpisodePageResponse | null }

// the topic's id and slug, the season, and the podcast episode's number from the url
type LoadPodcastEpisodeRouteOptions = { topicId: string; topicSlug: string; season: string; episodeNumber: string }

/**
 * Loads a public podcast episode's head and page on the server, and redirects a url with a stale slug.
 * In the browser loadPodcastEpisodeRoute returns no head and no page.
 */
async function loadPodcastEpisodeRoute({
	topicId,
	topicSlug,
	season,
	episodeNumber,
}: LoadPodcastEpisodeRouteOptions): Promise<PodcastEpisodeRouteData> {
	// read the head and the podcast episode page on the server
	const [podcastEpisodeHead, podcastEpisodePage] = await loadPageOnServer({
		fetchPageHead: () => fetchPodcastEpisodePageHead({ topicId, season, episodeNumber }),
		fetchPage: () => fetchPodcastEpisodePage({ topicId, season, episodeNumber }),
	})

	// respond 404 for a podcast episode that the api does not know, or an episode whose topic is not public
	if (podcastEpisodeHead === null) {
		throw notFound()
	}

	// redirect a stale slug permanently to the podcast episode's current path, the path of its card url
	const currentPodcastEpisodePath = podcastEpisodeHead ? new URL(podcastEpisodeHead.cardUrl).pathname : null
	const requestedPodcastEpisodePath = `/topics/${topicId}/${topicSlug}/episodes/${season}/${episodeNumber}`
	if (currentPodcastEpisodePath && currentPodcastEpisodePath !== requestedPodcastEpisodePath) {
		throw redirect({ href: currentPodcastEpisodePath, statusCode: 301 })
	}
	return { head: podcastEpisodeHead, podcastEpisodePage }
}

// a podcast episode's page, at a path after its topic's path. the server renders a public topic's episode,
// and any other topic's episode loads in the browser for a user who may listen to the episode
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug_/episodes/$season/$episodeNumber")({
	loader: ({ params }) => loadPodcastEpisodeRoute(params),
	// a page with no head, such as a private or invite topic's episode, is left out of search results
	head: ({ loaderData }) => (loaderData?.head ? toHeadTags(loaderData.head) : toNoindexHeadTags()),
	component: PodcastEpisodePage,
	// the podcast episode page renders a missing episode too, with a 404 status
	notFoundComponent: PodcastEpisodePage,
})
