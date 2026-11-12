// the signed-in people Postgres records as a topic's or a Topic Post's viewers or a podcast episode's listeners, which
// a rebuilt Redis counts with the same element the live count adds. a topic's owner and a published Topic Post's
// author always count
import { db } from "@carlnotes/db"
import { podcastEpisodeListens } from "@carlnotes/db/schema/podcast"
import { findings, findingViews } from "@carlnotes/db/schema/scans"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { toChangedSetMember, type ViewerCountRef, type ViewerCountSeed } from "@carlnotes/db/viewerCounts"
import { toUserViewerElement } from "@carlnotes/server/viewerElements"
import { eq, isNotNull } from "drizzle-orm"

// one recorded viewer or listener of a topic, a Topic Post, or a podcast episode
type RecordedViewer = { viewerCountRef: ViewerCountRef; userId: string }

/**
 * Loads every topic's owner, active subscribers, and users who opened its findings, every published Topic Post's
 * author, and every podcast episode's listeners, as one seed per topic, Topic Post, and podcast episode.
 */
export async function loadViewerCountSeeds(): Promise<ViewerCountSeed[]> {
	const [ownerRows, subscriberRows, findingOpenerRows, listenerRows, authorRows] = await Promise.all([
		db.select({ topicId: topics.id, userId: topics.ownerId }).from(topics),
		db
			.select({ topicId: subscriptions.topicId, userId: subscriptions.subscriberUserId })
			.from(subscriptions)
			.where(eq(subscriptions.isActive, true)),
		db
			.selectDistinct({ topicId: findings.topicId, userId: findingViews.userId })
			.from(findingViews)
			.innerJoin(findings, eq(findings.id, findingViews.findingId))
			.where(isNotNull(findingViews.openedAt)),
		db
			.selectDistinct({
				podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId,
				userId: podcastEpisodeListens.userId,
			})
			.from(podcastEpisodeListens),
		db
			.select({ topicPostId: topicPosts.id, userId: topicPosts.authorUserId })
			.from(topicPosts)
			.where(isNotNull(topicPosts.publishedAt)),
	])

	// every recorded viewer of a topic and of a Topic Post, and every listener of a podcast episode
	const topicViewers = [...ownerRows, ...subscriberRows, ...findingOpenerRows].map(
		({ topicId, userId }): RecordedViewer => ({ viewerCountRef: { kind: "topic", id: topicId }, userId }),
	)
	const podcastEpisodeListeners = listenerRows.map(
		({ podcastEpisodeId, userId }): RecordedViewer => ({
			viewerCountRef: { kind: "podcastEpisode", id: podcastEpisodeId },
			userId,
		}),
	)
	const topicPostAuthors = authorRows.map(
		({ topicPostId, userId }): RecordedViewer => ({ viewerCountRef: { kind: "topicPost", id: topicPostId }, userId }),
	)
	return toViewerCountSeeds([...topicViewers, ...topicPostAuthors, ...podcastEpisodeListeners])
}

/**
 * Groups recorded viewers into one seed per topic, Topic Post, and podcast episode, each person once.
 */
export function toViewerCountSeeds(recordedViewers: RecordedViewer[]): ViewerCountSeed[] {
	// collect each ref's elements in a set, so a person recorded twice is added once
	const seedByRefMember = new Map<string, { viewerCountRef: ViewerCountRef; elements: Set<string> }>()
	for (const { viewerCountRef, userId } of recordedViewers) {
		const refMember = toChangedSetMember(viewerCountRef)
		const viewerCountSeed = seedByRefMember.get(refMember) ?? { viewerCountRef, elements: new Set<string>() }
		viewerCountSeed.elements.add(toUserViewerElement(userId))
		seedByRefMember.set(refMember, viewerCountSeed)
	}

	// each seed's elements as a list
	return [...seedByRefMember.values()].map(({ viewerCountRef, elements }) => ({
		viewerCountRef,
		elements: [...elements],
	}))
}
