import { toHeadTags, toNoindexHeadTags } from "@carlnotes/core/lib/pageHead"
import { createFileRoute } from "@tanstack/react-router"
import { TopicPostPage } from "@/pages/TopicPostPage"
import { loadTopicPostRoute } from "./-topicPostRoute"

// a Topic Post's page at its canonical path, after its topic's path: the post's id, then the slug of its title. the
// server renders a public topic's post, and the browser renders any other post
export const Route = createFileRoute("/_layout/topics/$topicId_/$topicSlug_/posts/$topicPostId_/$postSlug")({
	loader: ({ params }) => loadTopicPostRoute(params),
	// a page with no head is left out of search results, and a private or invite topic's post head is noindex
	head: ({ loaderData }) => (loaderData?.head ? toHeadTags(loaderData.head) : toNoindexHeadTags()),
	component: TopicPostPage,
	// the Topic Post page renders a missing post too, with a 404 status
	notFoundComponent: TopicPostPage,
})
