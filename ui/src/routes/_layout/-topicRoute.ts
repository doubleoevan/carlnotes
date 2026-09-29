import type { PageHead, TopicResponse } from "@shared/contracts"
import { notFound, redirect } from "@tanstack/react-router"
import { fetchTopicPageHead } from "@/clients/pageHeadClient"
import { fetchTopicPage } from "@/clients/topicClient"
import { loadPageOnServer } from "@/lib/loadOnServer"

// the data both topic routes load, the page head and the topic if it is public
export type TopicRouteData = { head: PageHead | undefined; topic: TopicResponse | null }

// the topic id from the url, and the slug if the url has one
type LoadTopicRouteOptions = { topicId: string; topicSlug?: string }

/**
 * Loads a topic's head and public page on the server, and redirects a url without the current slug.
 * In the browser loadTopicRoute returns no head and no topic.
 */
export async function loadTopicRoute({ topicId, topicSlug }: LoadTopicRouteOptions): Promise<TopicRouteData> {
	// read the head and the topic page on the server
	const [topicHead, topicPage] = await loadPageOnServer({
		fetchPageHead: () => fetchTopicPageHead(topicId),
		fetchPage: () => fetchTopicPage(topicId),
	})

	// respond 404 for a topic the api does not know
	if (topicHead === null) {
		throw notFound()
	}

	// redirect any other path permanently to the topic's current path, the path of its card url
	const currentTopicPath = topicHead ? new URL(topicHead.cardUrl).pathname : null
	const requestedTopicPath = topicSlug ? `/topics/${topicId}/${topicSlug}` : `/topics/${topicId}`
	if (currentTopicPath && currentTopicPath !== requestedTopicPath) {
		throw redirect({ href: currentTopicPath, statusCode: 301 })
	}

	// return the topic only if it is public
	return { head: topicHead, topic: topicPage?.status === "visible" ? topicPage.topic : null }
}
