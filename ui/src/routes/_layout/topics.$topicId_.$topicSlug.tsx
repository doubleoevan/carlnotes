import { createFileRoute } from "@tanstack/react-router"
import { toHeadTags } from "@/lib/pageHead"
import { TopicPage } from "@/pages/TopicPage"
import { loadTopicRoute } from "./-topicRoute"

// the topic page at its canonical path, the id and then the slug
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug")({
	loader: ({ params }) => loadTopicRoute(params),
	head: ({ loaderData }) => toHeadTags(loaderData?.head),
	component: TopicPage,
	// the topic page renders a missing topic too, with a 404 status
	notFoundComponent: TopicPage,
})
