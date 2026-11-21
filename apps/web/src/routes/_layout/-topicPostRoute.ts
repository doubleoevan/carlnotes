import { fetchTopicPostPageRead } from "@carlnotes/client/pageReadClient"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { toTopicPostWithUserState } from "@carlnotes/core/lib/pageUserStates"
import { notFound, redirect } from "@tanstack/react-router"
import { loadPageReadOnServer } from "@/lib/loadOnServer"

// the data that a Topic Post route loads: the page head, and the post if a visitor may read it
export type TopicPostRouteData = { head: PageHead | undefined; topicPost: TopicPostResponse | null }

// the topic's id and slug and the post's id from the url, and the post's slug if the url has one
type LoadTopicPostRouteOptions = { topicId: string; topicSlug: string; topicPostId: string; postSlug?: string }

/**
 * Loads a published Topic Post's page read on the server, and redirects a url without the current slugs. A draft
 * has no head, so a visitor's request for one responds 404. In the browser loadTopicPostRoute returns no head and no
 * post.
 */
export async function loadTopicPostRoute({
	topicId,
	topicSlug,
	topicPostId,
	postSlug,
}: LoadTopicPostRouteOptions): Promise<TopicPostRouteData> {
	// read the post's page read, which holds its head, on the server
	const topicPostPageRead = await loadPageReadOnServer(() => fetchTopicPostPageRead(topicPostId))

	// respond 404 for a post that the api does not know, and for a draft
	const topicPostHead = topicPostPageRead === undefined ? undefined : (topicPostPageRead?.head ?? null)
	if (topicPostHead === null) {
		throw notFound()
	}

	// redirect any other path permanently to the post's current path, the path of its card url
	const currentTopicPostPath = topicPostHead ? new URL(topicPostHead.cardUrl).pathname : null
	const requestedTopicPostPath = `/topics/${topicId}/${topicSlug}/posts/${topicPostId}${postSlug ? `/${postSlug}` : ""}`
	if (currentTopicPostPath && currentTopicPostPath !== requestedTopicPostPath) {
		throw redirect({ href: currentTopicPostPath, statusCode: 301 })
	}
	return {
		head: topicPostHead,
		topicPost: toTopicPostWithUserState(topicPostPageRead),
	}
}
