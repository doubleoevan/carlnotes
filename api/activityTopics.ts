// the activity rows for a set of topics: each topic's month scans, counts, chat mentions, and latest podcast episode
import type { ActivityScan, OwnerTopic } from "@shared/contracts/activity"
import type { ChatMention } from "@shared/contracts/chat"
import type { PodcastEpisodeSummary } from "@shared/contracts/podcast"
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import { scans } from "../db/schema/scans"
import { subscriptions, topicEmailSends, topics } from "../db/schema/topics"
import { loadTopicChatMentions } from "./chat/mentions"
import { loadLatestPodcastEpisodeSummaries } from "./podcast/podcastEpisodeShapes"
import { startOfUtcMonth } from "./topic/quotas"

// the topic rows that toActivityTopics reads
type TopicRow = {
	id: string
	ownerId: string
	name: string
	visibility: OwnerTopic["visibility"]
	frequency: OwnerTopic["frequency"]
	// the times the activity list sorts and dates its rows by
	createdAt: Date
	updatedAt: Date
}

// the month-scan rows that hang off each topic in the sub-table
type ScanRow = {
	id: string
	topicId: string
	// the outcome and, for a failed scan, the recorded reason
	status: ActivityScan["status"]
	error: string | null
	startedAt: Date
	finishedAt: Date | null
	// set if the user stopped the scan, which the recap line reads
	stoppedAt: Date | null
	// what the scan found, kept, and cost
	foundCount: number
	keptCount: number
	costDollars: string
}

// the topics to build rows for, the signed-in user viewing the rows, and the user whose chat mentions the rows show
type LoadTopicsOptions = { topicIds: string[]; signedInUserId: string; mentionUserId?: string | null }

/**
 * The activity rows for a given set of topics, whoever owns them. The admin console reads a team's topics through this,
 * so a team's subtable shows its topic activity.
 */
export async function loadTopics({
	topicIds,
	signedInUserId,
	mentionUserId = null,
}: LoadTopicsOptions): Promise<OwnerTopic[]> {
	if (topicIds.length === 0) {
		return []
	}

	// the topic rows themselves and their scan history this month
	const monthStart = startOfUtcMonth(new Date())
	const topicRows = await db
		.select({
			id: topics.id,
			ownerId: topics.ownerId,
			name: topics.name,
			visibility: topics.visibility,
			frequency: topics.frequency,
			createdAt: topics.createdAt,
			updatedAt: topics.updatedAt,
		})
		.from(topics)
		.where(inArray(topics.id, topicIds))
	const monthScanRows = await db
		.select({
			id: scans.id,
			topicId: scans.topicId,
			// the scan outcome and its recorded failure reason for the recap popover
			status: scans.status,
			error: scans.error,
			startedAt: scans.startedAt,
			finishedAt: scans.finishedAt,
			stoppedAt: scans.stoppedAt,
			// what the scan found, kept, and cost
			foundCount: scans.foundCount,
			keptCount: scans.keptCount,
			costDollars: scans.cost,
		})
		.from(scans)
		.where(and(inArray(scans.topicId, topicIds), gte(scans.startedAt, monthStart)))
		.orderBy(desc(scans.startedAt))
	const monthScans = monthScanRows.filter(
		(scanRow): scanRow is typeof scanRow & { topicId: string } => scanRow.topicId !== null,
	)

	// the counts each topic column reads, each query checking the topic's own owner
	const subscriberRows = await db
		.select({ topicId: subscriptions.topicId, count: count() })
		.from(subscriptions)
		.innerJoin(topics, eq(subscriptions.topicId, topics.id))
		.where(
			// only other subscribers, so an owner's own row never inflates their topic's count
			and(
				inArray(subscriptions.topicId, topicIds),
				eq(subscriptions.isActive, true),
				sql`${subscriptions.subscriberUserId} is distinct from ${topics.ownerId}`,
			),
		)
		.groupBy(subscriptions.topicId)
	const emailSendRows = await db
		.select({ topicId: topicEmailSends.topicId, count: count() })
		.from(topicEmailSends)
		.innerJoin(topics, eq(topicEmailSends.topicId, topics.id))
		.where(
			and(
				inArray(topicEmailSends.topicId, topicIds),
				eq(topicEmailSends.recipientUserId, topics.ownerId),
				gte(topicEmailSends.sentAt, monthStart),
			),
		)
		.groupBy(topicEmailSends.topicId)
	const ownerEmailRows = await db
		.select({ topicId: subscriptions.topicId, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.where(and(inArray(subscriptions.topicId, topicIds), eq(subscriptions.subscriberUserId, topics.ownerId)))
	return toActivityTopics({
		topicRows,
		scanRows: monthScans,
		subscriberCountByTopic: new Map(
			subscriberRows.map((subscriberRow) => [subscriberRow.topicId, subscriberRow.count]),
		),
		emailEnabledByTopic: new Map(
			ownerEmailRows.map((ownerEmailRow) => [ownerEmailRow.topicId, ownerEmailRow.isEmailEnabled]),
		),
		emailCountByTopic: new Map(emailSendRows.map((emailSendRow) => [emailSendRow.topicId, emailSendRow.count])),
		mentionByTopic: await loadTopicChatMentions(mentionUserId, topicIds),
		latestPodcastEpisodeByTopic: await loadLatestPodcastEpisodeSummaries(topicRows, signedInUserId),
	})
}

// the rows and the counts that each owned topic row is built from, keyed by topic id
type ToActivityTopicsOptions = {
	topicRows: TopicRow[]
	scanRows: ScanRow[]
	subscriberCountByTopic: Map<string, number>
	// the maps that a caller may leave out, each read as empty
	emailEnabledByTopic?: Map<string, boolean>
	emailCountByTopic?: Map<string, number>
	mentionByTopic?: Map<string, ChatMention[]>
	latestPodcastEpisodeByTopic?: Map<string, PodcastEpisodeSummary>
}

export function toActivityTopics({
	topicRows,
	scanRows,
	subscriberCountByTopic,
	emailEnabledByTopic = new Map(),
	emailCountByTopic = new Map(),
	mentionByTopic = new Map(),
	latestPodcastEpisodeByTopic = new Map(),
}: ToActivityTopicsOptions): OwnerTopic[] {
	// group each topic's scans once, then build every row
	const scansByTopic = Map.groupBy(scanRows, (scan) => scan.topicId)
	return topicRows.map((topic) => {
		const topicScans = scansByTopic.get(topic.id) ?? []
		return {
			id: topic.id,
			ownerUserId: topic.ownerId,
			name: topic.name,
			visibility: topic.visibility,
			frequency: topic.frequency,
			// the month figures and dates the row's columns render
			monthScanCount: topicScans.length,
			// a topic nobody subscribes to has no row in the count query at all
			subscriberCount: subscriberCountByTopic.get(topic.id) ?? 0,
			createdAt: topic.createdAt.toISOString(),
			updatedAt: topic.updatedAt.toISOString(),
			monthCostCents: topicScans.reduce((sum, scan) => sum + toCents(scan.costDollars), 0),
			// the number of emails sent to the topic's owner this month
			monthEmailCount: emailCountByTopic.get(topic.id) ?? 0,
			// the owner holds a subscription to their own topic, and a missing row reads as on, matching the column default
			isEmailEnabled: emailEnabledByTopic.get(topic.id) ?? true,
			chatMentions: mentionByTopic.get(topic.id) ?? [],
			latestPodcastEpisode: latestPodcastEpisodeByTopic.get(topic.id) ?? null,
			scans: topicScans.map((scan) => ({
				id: scan.id,
				status: scan.status,
				error: scan.error,
				startedAt: scan.startedAt.toISOString(),
				finishedAt: scan.finishedAt?.toISOString() ?? null,
				stoppedAt: scan.stoppedAt?.toISOString() ?? null,
				foundCount: scan.foundCount,
				keptCount: scan.keptCount,
				costCents: toCents(scan.costDollars),
			})),
		}
	})
}

/**
 * Cents from a dollars string, how scans.cost is stored. A null or malformed value reads as zero.
 */
export function toCents(dollars: string | null): number {
	const amount = Number(dollars)
	return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}
