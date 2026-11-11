import { toHeadTags, toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { TopicPostPage } from "@/pages/TopicPostPage"
import { loadTopicPostRoute } from "./-topicPostRoute"

// a Topic Post's page by its id alone, which redirects a post with a title to the path with its current slug. a
// draft with no title yet has no slug, so its author's editor opens here
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug_/posts/$topicPostId")({
	loader: ({ params }) => loadTopicPostRoute(params),
	// a page with no head is left out of search results
	head: ({ loaderData }) => (loaderData?.head ? toHeadTags(loaderData.head) : toNoindexHeadTags()),
	component: TopicPostPage,
	// the Topic Post page renders a missing post too, with a 404 status
	notFoundComponent: TopicPostPage,
})
