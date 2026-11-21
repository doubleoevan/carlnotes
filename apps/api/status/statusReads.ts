// the status reads a page's poll sends: a film's, a Topic Post Discussion's, and a Topic's latest Scan's. each loads
// one subject's row through its status copy and returns its status alone. a public subject's status goes to anyone,
// and any other passes the access check of the page that shows it
import type {
	TopicPostDiscussionStatusRead,
	TopicScanStatusRead,
	TopicVideoStatusRead,
} from "@carlnotes/contracts/statusReads"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { scans } from "@carlnotes/db/schema/scans"
import { topicPostDiscussions, topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { readStatusRead } from "@carlnotes/db/statusReadCaches"
import { gatedTopicColumns, namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { desc, eq } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { loadAccessiblePodcastEpisode, toNewestPodcastEpisodeFilter } from "../podcast/podcastEpisodeRows"
import { canReadTopicPost } from "../topicPost/topicPosts"

// a status for a caller who may read it, and whether its subject is public, which lets the edge share it
export type StatusReadResult<StatusRead> = { statusRead: StatusRead; isPublic: boolean }

// the user who asks, null for a visitor, and the id of the status read's subject
type LoadStatusReadOptions = { userId: string | null; subjectId: string }

/**
 * Returns a podcast episode's film status for a caller who may listen to the podcast episode, or null.
 */
export async function loadTopicVideoStatusRead({
	userId,
	subjectId: podcastEpisodeId,
}: LoadStatusReadOptions): Promise<StatusReadResult<TopicVideoStatusRead> | null> {
	// the film's status with the podcast episode's own status and its Topic's access columns, from the status copy
	const statusRow = await readStatusRead({
		statusKind: "topicVideo",
		subjectId: podcastEpisodeId,
		load: () => loadTopicVideoStatusRow(podcastEpisodeId),
	})
	if (!statusRow) {
		return null
	}

	// a published podcast episode on a public Topic goes to anyone
	const isPublic =
		isPodcastEpisodeRecordingConfigured() &&
		statusRow.topic.visibility === "public" &&
		statusRow.podcastEpisodeStatus === "published"

	// any other goes to a caller who may listen to it
	if (!(isPublic || (await loadAccessiblePodcastEpisode({ userId, podcastEpisodeId })))) {
		return null
	}
	return { statusRead: { status: statusRow.status }, isPublic }
}

// a podcast episode's film status, none with no film row, with the podcast episode's status and its Topic's access
// columns, or null for a podcast episode that does not exist
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the join's generated type
async function loadTopicVideoStatusRow(podcastEpisodeId: string) {
	const [statusRow] = await db
		.select({ status: topicVideos.status, podcastEpisodeStatus: podcastEpisodes.status, topic: gatedTopicColumns })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.leftJoin(topicVideos, eq(topicVideos.podcastEpisodeId, podcastEpisodes.id))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))

	// a podcast episode with no film row reads none
	return statusRow ? { ...statusRow, status: statusRow.status ?? ("none" as const) } : null
}

/**
 * Returns a Topic Post's newest discussion status for a caller who may read the post, or null.
 */
export async function loadTopicPostDiscussionStatusRead({
	userId,
	subjectId: topicPostId,
}: LoadStatusReadOptions): Promise<StatusReadResult<TopicPostDiscussionStatusRead> | null> {
	// the newest discussion's status with the post's access columns and its Topic's, from the status copy
	const statusRow = await readStatusRead({
		statusKind: "topicPostDiscussion",
		subjectId: topicPostId,
		load: () => loadTopicPostDiscussionStatusRow(topicPostId),
	})
	if (!statusRow) {
		return null
	}

	// a published post on a public Topic goes to anyone, and any other through the post's own read check
	const isPublic = statusRow.topic.visibility === "public" && statusRow.topicPost.publishedAt !== null
	if (!(isPublic || (await canReadTopicPost(userId, statusRow)))) {
		return null
	}
	return { statusRead: { status: statusRow.status }, isPublic }
}

// a Topic Post's newest discussion status, none with no discussion, with the post's and its Topic's access columns, or
// null for a post that does not exist
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the join's generated type
async function loadTopicPostDiscussionStatusRow(topicPostId: string) {
	const [[accessRow], [discussionRow]] = await Promise.all([
		// the post with its Topic
		db
			.select({
				topicPost: { publishedAt: topicPosts.publishedAt, authorUserId: topicPosts.authorUserId },
				topic: { ...namedTopicColumns, imageHash: topics.imageHash },
			})
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.where(eq(topicPosts.id, topicPostId)),
		// its newest discussion's status
		db
			.select({ status: topicPostDiscussions.status })
			.from(topicPostDiscussions)
			.where(eq(topicPostDiscussions.topicPostId, topicPostId))
			.orderBy(desc(topicPostDiscussions.createdAt))
			.limit(1),
	])
	return accessRow ? { ...accessRow, status: discussionRow?.status ?? ("none" as const) } : null
}

/**
 * Returns a Topic's latest Scan with its counts and its newest podcast episode's status for a caller who may view the
 * Topic, or null.
 */
export async function loadTopicScanStatusRead({
	userId,
	subjectId: topicId,
}: LoadStatusReadOptions): Promise<StatusReadResult<TopicScanStatusRead> | null> {
	// the Topic's access columns, its latest Scan, and its newest podcast episode's status, from the status copy
	const statusRow = await readStatusRead({
		statusKind: "scan",
		subjectId: topicId,
		load: () => loadTopicScanStatusRow(topicId),
	})
	if (!statusRow) {
		return null
	}

	// a public Topic's status goes to anyone, and any other to a caller who may view the Topic
	const isPublic = statusRow.topic.visibility === "public"
	if (!(isPublic || (await isAllowed(userId, "topic:view", statusRow.topic)))) {
		return null
	}
	return { statusRead: { scan: statusRow.scan, podcastEpisodeStatus: statusRow.podcastEpisodeStatus }, isPublic }
}

// a Topic's access columns, its latest Scan with its counts, and its newest podcast episode's status that was not
// removed, or null for a Topic that does not exist
// biome-ignore lint/nursery/useExplicitReturnType: the row's type is the reads' generated types
async function loadTopicScanStatusRow(topicId: string) {
	const [[topic], [scan], [podcastEpisode]] = await Promise.all([
		// the Topic's access columns, then its latest Scan
		db.select(gatedTopicColumns).from(topics).where(eq(topics.id, topicId)),
		db
			.select({ id: scans.id, status: scans.status, foundCount: scans.foundCount, keptCount: scans.keptCount })
			.from(scans)
			.where(eq(scans.topicId, topicId))
			.orderBy(desc(scans.startedAt), scans.id)
			.limit(1),
		// its newest podcast episode that was not removed
		db
			.select({ status: podcastEpisodes.status })
			.from(podcastEpisodes)
			.where(toNewestPodcastEpisodeFilter(topicId))
			.orderBy(desc(podcastEpisodes.createdAt))
			.limit(1),
	])
	return topic ? { topic, scan: scan ?? null, podcastEpisodeStatus: podcastEpisode?.status ?? null } : null
}
