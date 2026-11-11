import { FILM_SEASON_KEY, PODCAST_EPISODE_SEASON_KEY } from "@carlnotes/core/components/PodcastEpisodesCard"
import { toHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { TopicPage } from "@/pages/TopicPage"
import { loadTopicRoute, toLinkedSeason } from "./-topicRoute"

// the topic page at its canonical path, the id and then the slug
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug")({
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
