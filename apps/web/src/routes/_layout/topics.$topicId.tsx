import { FILM_SEASON_KEY, PODCAST_EPISODE_SEASON_KEY } from "@carlnotes/core/components/PodcastEpisodesCard"
import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { TopicPage } from "@/pages/TopicPage"
import { loadTopicRoute, toLinkedSeason } from "./-topicRoute"

// the topic page by its id alone, which redirects to the path with the topic's current slug
export const Route = createFileRoute("/_layout/topics/$topicId")({
	loader: ({ params, location }) =>
		loadTopicRoute({
			...params,
			season: toLinkedSeason(location.search, PODCAST_EPISODE_SEASON_KEY),
			filmSeason: toLinkedSeason(location.search, FILM_SEASON_KEY),
			search: location.searchStr,
		}),
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: TopicPage,
	// the topic page renders a missing topic too, with a 404 status
	notFoundComponent: TopicPage,
})
