import type { TopicFinding } from "@carlnotes/contracts/findings"
import { toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toAttachmentFailureMessage } from "@carlnotes/contracts/topics"
import { db } from "@carlnotes/db"
import { attachments, sources, type topics } from "@carlnotes/db/schema/topics"
import { loadTopicImageForUser } from "@carlnotes/db/topicImages"
import { traceRequestStage } from "@carlnotes/server/monitoringTracing"
import { isPodcastEpisodeRecordingConfigured } from "@carlnotes/server/podcastEpisodeSettings"
import { eq } from "drizzle-orm"
import { isAllowed, loadUserAccess } from "../authorization"
import { withAvatarVersion } from "../avatars"
import { loadTopicChatMentions } from "../chat/mentions"
import type { ScanFinding } from "../jsonLd"
import { loadTopicPodcast } from "../podcast/helpers"
import { loadPublishedAndNewestPodcastEpisodeRows } from "../podcast/podcastEpisodeRows"
import { loadPageCommentThread } from "../social/pageCommentThread"
import { loadTopicPostCards } from "../topicPost/topicPosts"
import {
	loadTopicAccessAndFindings,
	loadTopicWithOwner,
	loadViewableTopic,
	type TopicWithOwner,
} from "./accessibleFindings"
import { newTopicFindingCount } from "./findings"
import {
	toDailyFrequencyPaused,
	toHomeTopics,
	toInviteAndScanFields,
	toScanHistory,
	toScheduledTimeLabel,
	toTeamFields,
} from "./helpers"
import { loadEditorImageRegenerationQuota } from "./imageEdits"
import { loadDirectSubscription } from "./permissions"
import { loadRelatedTopics } from "./relatedTopics"
import { startTopicScanRowsRead, type TopicScanRowWithGroups, toTopicScanFields } from "./topicScanRows"
import { toTopicSourceSummary } from "./topicSourceSummary"

// whether the load is a poll reload while a scan runs, which leaves out the related topics, whether the page's reader
// loads the related topics in a read of their own, which leaves them out too, whether the page's head is built from
// the page's rows, which then also read the topic's shown finding count and when its feed last changed, and whether the
// page holds the newest page of scans alone
type LoadTopicPageOptions = {
	isPoll?: boolean
	isRelatedTopicsSeparate?: boolean
	isHeadRead?: boolean
	isNewestScans?: boolean
}

// what a topic page's head reads, from the rows that the page loads: the topic with its owner, its ready Sources, its
// shown findings, its last scan summary, its last scan's shown findings, when its feed last changed, and whether it has
// a published podcast episode
export type TopicPageHeadRows = {
	topicWithOwner: TopicWithOwner
	sourceCount: number
	keptCount: number
	// what the description and the structured data read
	scanSummary: string | null
	lastScanFindings: ScanFinding[]
	feedUpdatedAt: Date
	hasPublishedPodcastEpisode: boolean
}

// a topic's page, and the rows its head is built from if the load reads them
type TopicPageWithHeadRows = { topicPage: TopicResponse; topicHeadRows: TopicPageHeadRows | null }

/**
 * Loads one topic's page or null if the topic is missing or not visible to this user.
 * A signed-out visitor may view a public topic, with no consumed state and no owner extras.
 */
export async function loadTopicPage(
	userId: string | null,
	topicId: string,
	loadTopicPageOptions: LoadTopicPageOptions = {},
): Promise<TopicResponse | null> {
	return (await loadTopicPageWithHeadRows(userId, topicId, loadTopicPageOptions))?.topicPage ?? null
}

/**
 * Loads one topic's page as loadTopicPage does, with the rows its head is built from if the options ask for them.
 */
export async function loadTopicPageWithHeadRows(
	userId: string | null,
	topicId: string,
	{
		isPoll = false,
		isRelatedTopicsSeparate = false,
		isHeadRead = false,
		isNewestScans = false,
	}: LoadTopicPageOptions = {},
): Promise<TopicPageWithHeadRows | null> {
	// load the topic behind the visibility gate. a hidden topic looks identical to a missing one
	const topic = await traceRequestStage("topic_page.gate", () => loadViewableTopic(userId, topicId))
	if (!topic) {
		return null
	}

	// the scans newest first, the whole history or its newest page, and the page's scan ids for its podcast episodes
	const { scanRowsRead, pageScanIds } = startTopicScanRowsRead({ topic, userId, isHeadRead, isNewestScans })

	// the user's access with the findings and the page's reactions, and the podcast, which shares the reactions read
	const { topicAccessAndFindings, topicPodcast } = startTopicFindingsAndPodcastReads({
		topic,
		userId,
		isPoll,
		pageScanIds,
	})

	// the page's independent reads run together
	const isTopicOwner = topic.ownerId === userId
	const [
		// the user's access with the findings and the topic's own reactions, then the sources, the attachments, and the scans
		{ isAdmin, topicFindings, reactions },
		topicSourceRows,
		rawAttachmentRows,
		scanRows,
		// the user's subscription, the owner-only extras, the owner, and the team
		directSubscription,
		inviteAndScanFields,
		topicWithOwner,
		teamFields,
		// whether a daily frequency is paused, what the user may do and see on the topic, the podcast, and the related
		// topics
		isDailyFrequencyPaused,
		canRate,
		canRateTopicMemories,
		canEdit,
		canViewOwnerDetails,
		{ podcast, latestPodcastEpisode, topicPodcastEpisodeVideoCards, podcastEpisodeByScanId },
		relatedTopics,
		commentThread,
		topicImageForUser,
		topicPostCards,
		// the editor's regenerations this month, the user's unseen chat mentions, and the admin's home topics
		imageRegenerationQuota,
		chatMentionsByTopicId,
		homeTopics,
	] = await traceRequestStage("topic_page.reads", () =>
		Promise.all([
			// the user's access and the findings it gates
			topicAccessAndFindings,
			// every Source row, and the attachment rows and their context, each narrowed once the reads finish
			db.select().from(sources).where(eq(sources.topicId, topic.id)),
			loadTopicAttachmentRows(topic.id),
			// the scans newest first, with the reader's Journal groups, the last recap, and the month's cost on the first row
			scanRowsRead,
			// this user's own subscription state. a signed-out visitor subscribes to nothing
			userId ? loadDirectSubscription(userId, topic.id) : null,
			// the owner-only extras: the invite list, the manual scan quota, and whether their spend is past the manual
			// scans cutoff or used up
			toInviteAndScanFields(userId, topic, isTopicOwner),
			// the topic with its owner's username, avatar and profile page id, from the gate's read
			loadTopicWithOwner(topic.id),
			// the team fields, read once: the badge, the user's membership, and the byline credit all follow from them
			toTeamFields(topic.id, topic.teamId, userId),
			// whether the owner's daily topics outgrew their plan, and what this user may do here
			toDailyFrequencyPaused(topic, isTopicOwner),
			isAllowed(userId, "topic:rate", topic),
			isAllowed(userId, "topicMemory:rate", topic),
			isAllowed(userId, "topic:edit", topic),
			isAllowed(userId, "topic:viewOwnerDetails", topic),
			// the topic's podcast, and each listed scan's podcast episode for the scan history
			topicPodcast,
			// the most related topics that the user may open, none for a poll reload or a reader who loads them separately
			isPoll || isRelatedTopicsSeparate ? [] : loadRelatedTopics(topic, userId),
			// the first page of the topic's comment thread, none for a poll reload
			isPoll ? undefined : loadPageCommentThread({ userId, topic, target: { kind: "topic", id: topic.id } }),
			// the image row for its origin and whether the user reported it
			userId ? loadTopicImageForUser(topic.id, userId) : null,
			// the topic's published Topic Posts and the user's own drafts, none for a poll reload
			isPoll ? undefined : loadTopicPostCards(userId, topic.id),
			// the editor's regenerations this month, read for an editor alone
			loadImageRegenerationQuotaForEditor(userId, topic),
			// the user's unseen chat room mentions, for the count badge on the page's title
			loadTopicChatMentions(userId, [topic.id]),
			// where the topic sits in the Home topics, and the section itself, for an admin alone
			loadHomeTopicsForUser(userId, topic.homeOrder),
		]),
	)

	// every later scan reads the generated context, so the owner and admins see the context to edit, and nobody else does.
	// the owner and admins also see why a failed attachment failed, as a message instead of the recorded reason
	const attachmentRows = rawAttachmentRows.map(({ error, ...attachment }) => ({
		...attachment,
		context: canViewOwnerDetails ? attachment.context : null,
		failureMessage: canViewOwnerDetails && attachment.status === "failed" ? toAttachmentFailureMessage(error) : null,
	}))
	// a stopped scan is left out of the history and the last-succeeded scan. the month's cost still counts it.
	// each scan in the history gets its published podcast episode
	const scanHistory = toScanHistory(scanRows, canViewOwnerDetails).map((topicScan) => ({
		...topicScan,
		podcastEpisode: podcastEpisodeByScanId.get(topicScan.id) ?? null,
	}))

	// the owner-only extras, unpacked from their grouped read
	const { inviteRows, manualScansRemaining, manualScanLimit, isManualScanPaused, isSpendExhausted } =
		inviteAndScanFields

	// the schedule section's scan fields, the month's cost, the page of scans, and the Journal's count
	const { lastSucceededTopicScan, scanSummary, lastScanDurationMs, monthCostDollars, scansPage, topicMemoryCount } =
		toTopicScanFields({ scanRows, scanHistory, isNewestScans, canViewOwnerDetails })

	// a Source that has not passed its screen is only seen by someone who may edit the list.
	// an editor's save deletes every source it does not list, so hiding a row from them would delete it
	const visibleTopicSourceRows = topicSourceRows.filter(
		(topicSource) => topicSource.status === "ready" || isAdmin || canEdit,
	)

	// the owner's identity, from the topic's read with its owner, which the gate's read already found
	if (!topicWithOwner) {
		return null
	}
	const { userId: ownerUserId, username, avatarSource, avatarKey } = topicWithOwner.owner
	const topicPage: TopicResponse = {
		// the topic identity and its editable fields
		id: topic.id,
		name: topic.name,
		owner: withAvatarVersion({ userId: ownerUserId, username, avatarSource, avatarKey }),
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
		chatMentions: chatMentionsByTopicId.get(topic.id) ?? [],
		canRate,
		canEdit,
		canReadPersonalSources:
			canEdit || Boolean(userId && topicSourceRows.some((source) => source.personalSourcesUserId === userId)),
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount: topic.subscriberCount,
		viewerCount: topic.viewerCount,
		// the schedule details
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastSucceededTopicScan?.startedAt ?? null,
		lastScanDurationMs,
		monthCostDollars,
		scanSummary,
		// everything connected to the topic
		attachments: attachmentRows,
		sources: visibleTopicSourceRows.flatMap(toTopicSourceSummary),
		scans: scanHistory,
		scansPage,
		topicMemoryCount,
		canRateTopicMemories,
		podcast,
		topicPodcastEpisodeVideoCards,
		latestPodcastEpisode,
		// the topic's image urls, null until its first render lands, and null for a user who reported this image
		image: topicImageForUser?.isReportedByUser ? null : toTopicImageUrlsOrNull(topic.id, topic.imageHash),
		imageRegenerationQuota,
		imageOrigin: canEdit ? (topicImageForUser?.topicImage?.origin ?? null) : null,
		imagePrompt: canEdit ? (topicImageForUser?.topicImage?.imagePrompt ?? null) : null,
		findings: topicFindings,
		invites: inviteRows,
		manualScansRemaining,
		manualScanLimit,
		isManualScanPaused,
		isSpendExhausted,
		...teamFields,
		isOnTeam: topic.teamId !== null,
		...homeTopics,
		relatedTopics,
		reactions,
		commentThread,
		// whoever may edit the topic may publish a Topic Post on it
		topicPosts: topicPostCards && { topicPosts: topicPostCards, canPublish: canEdit },
	}

	// the head's rows, if the load reads them
	const topicHeadRows = isHeadRead
		? toTopicPageHeadRows({
				topicWithOwner,
				topicSourceRows,
				scanRows,
				topicFindings,
				hasPublishedPodcastEpisode: Boolean(podcast?.publicFeedUrl),
			})
		: null
	return { topicPage, topicHeadRows }
}

// the topic, the user, whether the read is a poll reload, which reads no page reactions of its own, and the ids of the
// scans a page of the scan history lists, if the page holds one page
type StartTopicFindingsAndPodcastReadsOptions = {
	topic: typeof topics.$inferSelect
	userId: string | null
	isPoll: boolean
	pageScanIds?: Promise<ReadonlySet<string>>
}

// the topic page's findings read with its reactions, and its podcast, started together. the published podcast episodes
// are read once for the podcast and for the reaction read, which includes them for the film cards
function startTopicFindingsAndPodcastReads({
	topic,
	userId,
	isPoll,
	pageScanIds,
}: StartTopicFindingsAndPodcastReadsOptions): {
	topicAccessAndFindings: ReturnType<typeof loadTopicAccessAndFindings>
	topicPodcast: ReturnType<typeof loadTopicPodcast>
} {
	// a failed podcast episode read fails the podcast, so the reaction read goes on without those targets.
	// ponytail: every published podcast episode is a target, not just the ones with a ready film, because the films are
	// read later. narrow the targets if a topic's podcast episodes reach the hundreds
	const publishedAndNewestPodcastEpisodeRows = isPodcastEpisodeRecordingConfigured()
		? loadPublishedAndNewestPodcastEpisodeRows(topic, userId)
		: undefined
	const podcastEpisodeReactionTargets = publishedAndNewestPodcastEpisodeRows?.then(
		({ publishedPodcastEpisodeRows }) =>
			publishedPodcastEpisodeRows.map(({ id }) => ({ kind: "podcastEpisode" as const, id })),
		() => [],
	)

	// the findings with the page's reactions, which the podcast's film cards read from
	const topicAccessAndFindings = loadTopicAccessAndFindings({
		topic,
		userId,
		pageSocialTarget: isPoll ? undefined : { kind: "topic", id: topic.id },
		extraReactionTargets: podcastEpisodeReactionTargets,
	})
	const topicPodcast = loadTopicPodcast(topic, userId, {
		publishedAndNewestPodcastEpisodeRows,
		pageReactionRead: topicAccessAndFindings,
		pageScanIds,
	})
	return { topicAccessAndFindings, topicPodcast }
}

// the rows that a topic page loaded, which its head is built from
type ToTopicPageHeadRowsOptions = {
	topicWithOwner: TopicWithOwner
	topicSourceRows: Pick<typeof sources.$inferSelect, "status">[]
	scanRows: TopicScanRowWithGroups[]
	topicFindings: TopicFinding[]
	hasPublishedPodcastEpisode: boolean
}

// a topic page's head rows, read as toTopicPreview, lastScan, scanFindings, and loadTopicFeedUpdatedAt read them
function toTopicPageHeadRows({
	topicWithOwner,
	topicSourceRows,
	scanRows,
	topicFindings,
	hasPublishedPodcastEpisode,
}: ToTopicPageHeadRowsOptions): TopicPageHeadRows {
	// the newest succeeded scan
	const lastScanId = scanRows.find((scanRow) => scanRow.status === "succeeded")?.id

	// the newest scan's row holds the topic's shown finding count, its newest shown finding's time, and the summary of
	// the newest succeeded scan that kept findings
	const [newestScanRow] = scanRows
	return {
		topicWithOwner,
		sourceCount: topicSourceRows.filter((topicSource) => topicSource.status === "ready").length,
		keptCount: newestScanRow?.shownFindingCount ?? 0,
		scanSummary: newestScanRow?.headScanSummary ?? null,
		// the last scan's shown findings, most relevant first
		lastScanFindings: topicFindings
			.filter((topicFinding) => topicFinding.scanId === lastScanId && topicFinding.rating !== "down")
			.map(({ title, url, relevanceExplanation }) => ({ title, url, relevanceExplanation })),
		feedUpdatedAt: newestScanRow?.newestShownFindingAt ?? topicWithOwner.topic.createdAt,
		hasPublishedPodcastEpisode,
	}
}

// the regenerations this month of a user who may edit the topic, and null for anyone else. the edit check shares the
// request's one read of the user's topic role
async function loadImageRegenerationQuotaForEditor(
	userId: string | null,
	topic: typeof topics.$inferSelect,
): Promise<TopicResponse["imageRegenerationQuota"]> {
	const canEdit = await isAllowed(userId, "topic:edit", topic)
	return canEdit && userId ? loadEditorImageRegenerationQuota(userId) : null
}

// where a topic sits in the Home topics, and the section itself, which only an admin sees
async function loadHomeTopicsForUser(
	userId: string | null,
	homeOrder: number | null,
): Promise<Pick<TopicResponse, "homeOrder" | "homeTopics">> {
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	return toHomeTopics(homeOrder, isAdmin)
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
