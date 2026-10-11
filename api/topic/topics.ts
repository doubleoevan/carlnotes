import type { TopicResponse } from "@shared/contracts"
import { toAttachmentFailureMessage } from "@shared/contracts"
import { traceRequestStage } from "@shared/monitoring"
import { toSourceSummary, toSourceValue } from "@shared/sources"
import { desc, eq } from "drizzle-orm"
import { db } from "../../db"
import { scans } from "../../db/schema/scans"
import { attachments, sources, topics } from "../../db/schema/topics"
import { isAllowed } from "../authorization"
import { loadTopicChatMentions } from "../chat/mentions"
import { loadTopicPodcast } from "../podcast/helpers"
import { loadTopicAccessAndFindings } from "./accessibleFindings"
import { newTopicFindingCount } from "./findings"
import {
	loadTopicOwner,
	toDailyFrequencyPaused,
	toFeaturedTopics,
	toInviteAndScanFields,
	toLastTopicScanFields,
	toScanHistory,
	toScheduledTimeLabel,
	toTeamFields,
} from "./helpers"
import { readMoreTopics } from "./moreTopics"
import { loadDirectSubscription } from "./permissions"
import { startOfUtcMonth } from "./quotas"

/**
 * Loads one topic's page or null if the topic is missing or not visible to this user.
 * A signed-out visitor may view a public topic, with no consumed state and no owner extras.
 */
export async function loadTopicPage(userId: string | null, topicId: string): Promise<TopicResponse | null> {
	// load the topic behind the visibility gate. a hidden topic looks identical to a missing one
	const topic = await traceRequestStage("topic_page.gate", async () => {
		const [topicRow] = await db.select().from(topics).where(eq(topics.id, topicId))
		return topicRow && (await isAllowed(userId, "topic:view", topicRow)) ? topicRow : null
	})
	if (!topic) {
		return null
	}

	// the page's independent reads run together
	const isTopicOwner = topic.ownerId === userId
	const [
		// the user's access with the findings, then the sources, the attachments, and the scans
		{ isAdmin, topicFindings },
		topicSourceRows,
		rawAttachmentRows,
		scanRows,
		// the user's subscription, the owner-only extras, the owner, and the team
		directSubscription,
		inviteAndScanFields,
		owner,
		teamFields,
		// whether a daily frequency is paused, what the user may do on the topic, the podcast, and the more topics
		isDailyFrequencyPaused,
		canRate,
		canEdit,
		{ podcast, latestPodcastEpisode, podcastEpisodeByScanId },
		moreTopics,
	] = await traceRequestStage("topic_page.reads", () =>
		Promise.all([
			// the user's access and the findings it gates
			loadTopicAccessAndFindings({ topic, userId }),
			// every Source row, and the attachment rows and their context, each narrowed once the reads finish
			db.select().from(sources).where(eq(sources.topicId, topic.id)),
			loadTopicAttachmentRows(topic.id),
			// every scan, newest first
			loadTopicScanRows(topic.id),
			// this user's own subscription state. a signed-out visitor subscribes to nothing
			userId ? loadDirectSubscription(userId, topic.id) : null,
			// the owner-only extras: the invite list, the manual scan quota, and whether their spend is used up
			toInviteAndScanFields(userId, topic, isTopicOwner),
			// the topic owner's username, avatar and profile page id
			loadTopicOwner(topic.ownerId),
			// the team fields, read once: the badge, the user's membership, and the byline credit all follow from them
			toTeamFields(topic.id, topic.teamId, userId),
			// whether the owner's daily topics outgrew their plan, and what this user may do here
			toDailyFrequencyPaused(topic, isTopicOwner),
			isAllowed(userId, "topic:rate", topic),
			isAllowed(userId, "topic:edit", topic),
			// the topic's podcast, and each scan's podcast episode for the scan history
			loadTopicPodcast(topic, userId),
			// the other public topics the page links, none for a topic that is not public and shown
			readMoreTopics(topic),
		]),
	)

	// every later scan reads the generated context, so the owner and admins see the context to edit, and nobody else does.
	// the owner and admins also see why a failed attachment failed, as a message instead of the recorded reason
	const canSeeOwnerDetails = isAdmin || isTopicOwner
	const attachmentRows = rawAttachmentRows.map(({ error, ...attachment }) => ({
		...attachment,
		context: canSeeOwnerDetails ? attachment.context : null,
		failureMessage: canSeeOwnerDetails && attachment.status === "failed" ? toAttachmentFailureMessage(error) : null,
	}))
	// a stopped scan is left out of the history and the last-succeeded scan. the month's cost still counts it.
	// each scan in the history gets its published podcast episode
	const scanHistory = toScanHistory(scanRows, canSeeOwnerDetails).map((topicScan) => ({
		...topicScan,
		podcastEpisode: podcastEpisodeByScanId.get(topicScan.id) ?? null,
	}))

	// the owner-only extras, unpacked from their grouped read
	const { inviteRows, manualScansRemaining, manualScanLimit, isSpendExhausted } = inviteAndScanFields

	// the latest succeeded scan feeds the schedule section, with its recap and duration beside it
	const { lastSucceededTopicScan, scanSummary, lastScanDurationMs } = toLastTopicScanFields(scanHistory, scanRows)

	// a Source that has not passed its llm-guard screen is only seen by someone who may edit the list.
	// an editor's save deletes every source it does not list, so hiding a row from them would delete it
	const visibleTopicSourceRows = topicSourceRows.filter(
		(topicSource) => topicSource.status === "ready" || isAdmin || canEdit,
	)
	return {
		// the topic identity and its editable fields
		id: topic.id,
		name: topic.name,
		owner,
		prompt: topic.prompt,
		tags: topic.tags,
		frequency: topic.frequency,
		scheduledTime: toScheduledTimeLabel(topic.scheduledTime),
		scheduledDayOfWeek: topic.scheduledDayOfWeek,
		maxTopicFindings: topic.maxTopicFindings,
		visibility: topic.visibility,
		// what this user may do with the topic
		isTopicOwner,
		isDailyFrequencyPaused,
		isSubscribed: directSubscription?.isActive === true,
		// the user's unseen chat room mentions, for the count badge on the page's title
		chatMentions: (await loadTopicChatMentions(userId, [topic.id])).get(topic.id) ?? [],
		canRate,
		canEdit,
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount: topic.subscriberCount,
		// the schedule details
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastSucceededTopicScan?.startedAt ?? null,
		lastScanDurationMs,
		monthCostDollars: canSeeOwnerDetails ? toMonthCostDollars(scanRows) : null,
		scanSummary,
		// everything connected to the topic
		attachments: attachmentRows,
		sources: visibleTopicSourceRows.map((topicSource) => toTopicSourceSummary(topicSource)),
		scans: scanHistory,
		podcast,
		latestPodcastEpisode,
		findings: topicFindings,
		invites: inviteRows,
		manualScansRemaining,
		manualScanLimit,
		isSpendExhausted,
		...teamFields,
		isOnTeam: topic.teamId !== null,
		...(await toFeaturedTopics(topic.featureOrder, isAdmin)),
		moreTopics,
	}
}

// the attachment rows that a topic page lists
async function loadTopicAttachmentRows(
	topicId: string,
): Promise<Pick<typeof attachments.$inferSelect, "id" | "filename" | "sourceUrl" | "status" | "context" | "error">[]> {
	return db
		.select({
			id: attachments.id,
			filename: attachments.filename,
			sourceUrl: attachments.sourceUrl,
			status: attachments.status,
			context: attachments.context,
			error: attachments.error,
		})
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
}

// the scan columns that a topic page shows
type TopicScanRow = Pick<
	typeof scans.$inferSelect,
	// when the scan ran and how it ended
	| "id"
	| "status"
	| "startedAt"
	| "finishedAt"
	| "stoppedAt"
	| "error"
	// what it found and kept, what it cost, and its recap
	| "foundCount"
	| "keptCount"
	| "filteredCount"
	| "cost"
	| "scanSummary"
>

// a topic's scans, newest first
async function loadTopicScanRows(topicId: string): Promise<TopicScanRow[]> {
	return db
		.select({
			id: scans.id,
			status: scans.status,
			startedAt: scans.startedAt,
			finishedAt: scans.finishedAt,
			stoppedAt: scans.stoppedAt,
			foundCount: scans.foundCount,
			keptCount: scans.keptCount,
			filteredCount: scans.filteredCount,
			cost: scans.cost,
			error: scans.error,
			scanSummary: scans.scanSummary,
		})
		.from(scans)
		.where(eq(scans.topicId, topicId))
		.orderBy(desc(scans.startedAt))
}

// this month's total scan spend, summed from the raw scans since the first of the utc month
function toMonthCostDollars(scanRows: Pick<TopicScanRow, "startedAt" | "cost">[]): number {
	const monthStart = startOfUtcMonth(new Date())
	return scanRows.filter((scan) => scan.startedAt >= monthStart).reduce((sum, scan) => sum + Number(scan.cost), 0)
}

// one Source as the topic page lists it
function toTopicSourceSummary(topicSource: typeof sources.$inferSelect): TopicResponse["sources"][number] {
	return {
		id: topicSource.id,
		sourceKind: topicSource.kind,
		summary: toSourceSummary(topicSource.kind, topicSource.config),
		value: toSourceValue(topicSource.kind, topicSource.config),
		status: topicSource.status,
		error: topicSource.error,
	}
}
