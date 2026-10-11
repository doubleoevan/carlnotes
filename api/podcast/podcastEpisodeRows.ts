// the podcast episode row reads: a topic's published episodes, one episode by its id or by its season and number,
// and the subscription activation gate that limits each read to what the user may listen to
import { isPodcastEpisodeRecordingConfigured } from "@shared/podcastEpisodes"
import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { db } from "../../db"
import { loadUserAccess } from "../../db/quotas"
import { podcastEpisodeListens, podcastEpisodes } from "../../db/schema/podcast"
import { scans } from "../../db/schema/scans"
import { topics } from "../../db/schema/topics"
import { isAllowed } from "../authorization"
import { topicSubscriptionStartDate } from "../topic/helpers"

// a podcast episode's columns, without its script
export const podcastEpisodeColumns = {
	id: podcastEpisodes.id,
	topicId: podcastEpisodes.topicId,
	scanId: podcastEpisodes.scanId,
	status: podcastEpisodes.status,
	title: podcastEpisodes.title,
	description: podcastEpisodes.description,
	// assigned on publish
	season: podcastEpisodes.season,
	episodeNumber: podcastEpisodes.episodeNumber,
	audioKey: podcastEpisodes.audioKey,
	audioByteSize: podcastEpisodes.audioByteSize,
	durationSeconds: podcastEpisodes.durationSeconds,
	publishedAt: podcastEpisodes.publishedAt,
}

// a podcast episode row with the columns above, and a topic row
export type PodcastEpisodeRow = Pick<typeof podcastEpisodes.$inferSelect, keyof typeof podcastEpisodeColumns>
export type TopicRow = typeof topics.$inferSelect

// a user's saved progress through one podcast episode, and when the user finished it
export type PodcastEpisodeListenRow = Pick<
	typeof podcastEpisodeListens.$inferSelect,
	"podcastEpisodeId" | "progressSeconds" | "completedAt"
>

// the topic fields that a podcast episode's page path is built from
export type PodcastEpisodeTopic = Pick<TopicRow, "id" | "name" | "visibility">

// a podcast episode's row and its topic, for a user who may listen to the episode
export type AccessiblePodcastEpisode = { podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow }

/**
 * Returns whether a time passes the user's subscription activation gate. No gate passes every time, no active
 * subscription passes none, and an activation passes only a later time.
 */
export function isAfterSubscriberActivation(
	time: Date | null,
	subscriberActivatedAt: Date | null | undefined,
): boolean {
	if (subscriberActivatedAt === undefined) {
		return true
	}
	return subscriberActivatedAt !== null && time !== null && time > subscriberActivatedAt
}

// the user, null for a visitor, and the podcast episode to load
type LoadAccessiblePodcastEpisodeOptions = { userId: string | null; podcastEpisodeId: string }

/**
 * Loads a podcast episode's row and its topic if the user may listen to the episode, or null.
 */
export async function loadAccessiblePodcastEpisode({
	userId,
	podcastEpisodeId,
}: LoadAccessiblePodcastEpisodeOptions): Promise<AccessiblePodcastEpisode | null> {
	if (!isPodcastEpisodeRecordingConfigured()) {
		return null
	}

	// the podcast episode with its topic and when its scan started.
	// an episode whose topic was deleted has no topic to join
	const [podcastEpisodeTopicRow] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics, scanStartedAt: scans.startedAt })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.leftJoin(scans, eq(podcastEpisodes.scanId, scans.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))

	// return null for a removed podcast episode or an episode on a topic that the user cannot see
	const isPodcastEpisodeRemoved = podcastEpisodeTopicRow?.podcastEpisodeRow.status === "removed"
	if (
		!podcastEpisodeTopicRow ||
		isPodcastEpisodeRemoved ||
		!(await isAllowed(userId, "topic:view", podcastEpisodeTopicRow.topic))
	) {
		return null
	}

	// gate the podcast episode on the user's subscription activation by its publish time,
	// or by its scan's start if the podcast episode has not published
	const subscriberActivatedAt = await loadSubscriberActivatedAt(podcastEpisodeTopicRow.topic, userId)
	const publishedOrScanStartedAt =
		podcastEpisodeTopicRow.podcastEpisodeRow.publishedAt ?? podcastEpisodeTopicRow.scanStartedAt
	return isAfterSubscriberActivation(publishedOrScanStartedAt, subscriberActivatedAt) ? podcastEpisodeTopicRow : null
}

// the topic, the season, and the episode number within the season that name a podcast episode page
export type PodcastEpisodePageRef = { topicId: string; season: number; episodeNumber: number }

/**
 * Loads the published podcast episode at a season and episode number, with its topic of any visibility, or null.
 */
export async function loadPublishedPodcastEpisode({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageRef): Promise<{ podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow } | null> {
	// the published podcast episode of the topic at the season and episode number
	const isPodcastEpisodeAtPageRef = and(
		eq(podcastEpisodes.topicId, topicId),
		eq(podcastEpisodes.season, season),
		eq(podcastEpisodes.episodeNumber, episodeNumber),
	)
	const [publishedPodcastEpisode] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(isPodcastEpisodeAtPageRef, eq(podcastEpisodes.status, "published")))
	return isPodcastEpisodeRecordingConfigured() && publishedPodcastEpisode ? publishedPodcastEpisode : null
}

/**
 * Loads a published podcast episode by its id, with its topic of any visibility, or null.
 */
export async function loadPublishedPodcastEpisodeById(
	podcastEpisodeId: string,
): Promise<{ podcastEpisodeRow: PodcastEpisodeRow; topic: TopicRow } | null> {
	// the published podcast episode with that id, with its topic
	const [publishedPodcastEpisode] = await db
		.select({ podcastEpisodeRow: podcastEpisodeColumns, topic: topics })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), eq(podcastEpisodes.status, "published")))
	return isPodcastEpisodeRecordingConfigured() && publishedPodcastEpisode ? publishedPodcastEpisode : null
}

/**
 * Loads a topic's published podcast episodes that the user may listen to, newest first.
 */
export async function loadPublishedPodcastEpisodeRows(
	topic: TopicRow,
	userId: string | null,
): Promise<PodcastEpisodeRow[]> {
	// return no podcast episodes if episode recording is not configured,
	// or if the user has no active subscription to an invite topic
	const subscriberActivatedAt = isPodcastEpisodeRecordingConfigured()
		? await loadSubscriberActivatedAt(topic, userId)
		: null
	if (subscriberActivatedAt === null) {
		return []
	}

	// the activation gate keeps only the podcast episodes published after the user's subscription activated
	// ponytail: reads every published episode of the topic.
	// page the read in sql if a topic's episodes reach the thousands
	const isPublishedPodcastEpisode = and(eq(podcastEpisodes.topicId, topic.id), eq(podcastEpisodes.status, "published"))
	return db
		.select(podcastEpisodeColumns)
		.from(podcastEpisodes)
		.where(
			subscriberActivatedAt
				? and(isPublishedPodcastEpisode, gt(podcastEpisodes.publishedAt, subscriberActivatedAt))
				: isPublishedPodcastEpisode,
		)
		.orderBy(desc(podcastEpisodes.publishedAt))
}

// when the user's subscription to an invite topic activated, null if the user has no active subscription,
// or undefined if no activation gate applies to the user
async function loadSubscriberActivatedAt(topic: TopicRow, userId: string | null): Promise<Date | null | undefined> {
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	return topicSubscriptionStartDate(topic, userId, isAdmin)
}

/**
 * Loads the user's progress through the given podcast episodes. A visitor has none.
 */
export async function loadPodcastEpisodeListenRows(
	userId: string | null,
	podcastEpisodeIds: string[],
): Promise<PodcastEpisodeListenRow[]> {
	if (!userId || podcastEpisodeIds.length === 0) {
		return []
	}
	return db
		.select({
			podcastEpisodeId: podcastEpisodeListens.podcastEpisodeId,
			progressSeconds: podcastEpisodeListens.progressSeconds,
			completedAt: podcastEpisodeListens.completedAt,
		})
		.from(podcastEpisodeListens)
		.where(
			and(eq(podcastEpisodeListens.userId, userId), inArray(podcastEpisodeListens.podcastEpisodeId, podcastEpisodeIds)),
		)
}
