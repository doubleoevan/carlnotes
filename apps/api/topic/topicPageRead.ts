// a topic's page read: the head with the page, served to visitors from one copy per topic
import { toCardsPage } from "@carlnotes/contracts/cardPages"
import type { TopicPageRead } from "@carlnotes/contracts/pageReads"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { readVisitorPage, toVisitorTopicPageKey } from "@carlnotes/db/visitorPageCaches"
import { traceRequestStage } from "@carlnotes/server/monitoringTracing"
import { loadTopicPageHead, toTopicPageHeadFromRows } from "../share/pageHead"
import { overlayUncheckedTopicImage } from "../uncheckedImageOverlays"
import { loadViewableTopic } from "./accessibleFindings"
import { loadTopicGateResponse } from "./helpers"
import { loadTopicScansPage } from "./topicScansPage"
import { loadTopicPageWithHeadRows } from "./topics"

// the user, null for a visitor, and the topic
type ReadTopicPageReadOptions = { userId: string | null; topicId: string }

// whether a user's read holds the newest page of scans alone. a visitor's copy always holds the newest page alone
type NewestScansOption = { isNewestScans?: boolean }

/**
 * Returns a topic's page read, or null if no topic has that id. A visitor's read of a topic they may open is served from
 * the topic's copy, which holds the newest page of scans. A user's read is built for them and never stored.
 */
export async function readTopicPageRead({
	userId,
	topicId,
	isNewestScans = false,
}: ReadTopicPageReadOptions & NewestScansOption): Promise<TopicPageRead | null> {
	if (userId) {
		return buildTopicPageRead({ userId, topicId, isNewestScans })
	}
	return readVisitorPage({
		key: toVisitorTopicPageKey(topicId),
		pageKind: "topic",
		load: () => buildTopicPageRead({ userId: null, topicId, isNewestScans: true }),
		isShared: (topicPageRead) => Boolean(topicPageRead?.topic),
	})
}

/**
 * Returns a topic page with one zero-based page of its Topic Posts and where the page sits. A page without its Topic
 * Posts, a poll's, stays as it is.
 */
export function toPagedTopicPage(topicPage: TopicResponse, topicPostsPage: number): TopicResponse {
	if (!topicPage.topicPosts) {
		return topicPage
	}
	const { rows, position } = toCardsPage(topicPage.topicPosts.topicPosts, topicPostsPage)
	return { ...topicPage, topicPosts: { ...topicPage.topicPosts, topicPosts: rows }, topicPostsPage: position }
}

/**
 * Returns the topic page a visitor may open, from the topic's copy, or null for a topic they may not open. A read that
 * does not ask for the newest scans alone gets the whole history in place of the copy's newest page.
 */
export async function readVisitorTopicPage(
	topicId: string,
	{ isNewestScans = false }: NewestScansOption = {},
): Promise<TopicResponse | null> {
	// the copy's page, which a read that asks for the newest scans takes as it is
	const topicPage = (await readTopicPageRead({ userId: null, topicId }))?.topic ?? null
	if (!topicPage?.scansPage || isNewestScans) {
		return topicPage
	}

	// the copy's page is the whole history unless the history lists more scans than it holds
	const { scansPage, ...wholeTopicPage } = topicPage
	if (scansPage.totalCount <= topicPage.scans.length) {
		return wholeTopicPage
	}
	const topic = await loadViewableTopic(null, topicId)
	return topic ? { ...wholeTopicPage, scans: (await loadTopicScansPage({ userId: null, topic })).scans } : null
}

// the topic options that a page load takes beside the user and the topic: whether it is a poll reload, whether its
// reader loads the related topics in a read of their own, and whether it holds the newest page of scans alone
type LoadTracedTopicPageOptions = ReadTopicPageReadOptions &
	NewestScansOption & { isPoll?: boolean; isRelatedTopicsSeparate?: boolean }

/**
 * Loads a topic's page as the user may see it, traced, with a signed-in editor's unchecked upload in the topic image's
 * place, or null for a topic the user may not open. The load also reads the rows of the page's head if the options ask
 * for them.
 */
export function loadTracedTopicPageWithHeadRows({
	userId,
	topicId,
	isPoll = false,
	isRelatedTopicsSeparate = false,
	isHeadRead = false,
	isNewestScans = false,
}: LoadTracedTopicPageOptions & { isHeadRead?: boolean }): ReturnType<typeof loadTopicPageWithHeadRows> {
	return traceRequestStage("topic_page.load", async () => {
		const topicPageWithHeadRows = await loadTopicPageWithHeadRows(userId, topicId, {
			isPoll,
			isRelatedTopicsSeparate,
			isHeadRead,
			isNewestScans,
		})
		if (!topicPageWithHeadRows) {
			return null
		}
		const topicPage = await overlayUncheckedTopicImage(topicPageWithHeadRows.topicPage, userId)
		return { ...topicPageWithHeadRows, topicPage }
	})
}

// build the page with its head from the page's own rows, or for a topic the user may not open its head from the
// topic's preview, with the gate of an invite topic
async function buildTopicPageRead({
	userId,
	topicId,
	isNewestScans = false,
}: ReadTopicPageReadOptions & NewestScansOption): Promise<TopicPageRead | null> {
	const topicPageWithHeadRows = await loadTracedTopicPageWithHeadRows({
		userId,
		topicId,
		isHeadRead: true,
		isNewestScans,
	})
	if (topicPageWithHeadRows?.topicHeadRows) {
		const { topicPage, topicHeadRows } = topicPageWithHeadRows
		return { head: toTopicPageHeadFromRows(topicHeadRows), topic: topicPage, topicGate: null }
	}

	// a topic the user may not open, or no topic
	const head = await loadTopicPageHead(topicId)
	return head ? { head, topic: null, topicGate: await loadTopicGateResponse(topicId) } : null
}
