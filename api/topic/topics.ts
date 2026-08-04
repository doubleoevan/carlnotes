// the topic logic behind the api routes. it loads one topic's full payload and applies the owner's creates, edits, and deletes
import { trackEvent } from "@shared/analytics"
import type { TopicResponse, TopicScan, UpdateTopicPayload } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { attachments, scans, sources, subscriptions, topicInvites, topics } from "../../db/schema"
import { deleteAttachment, failStaleScans, scanTopic } from "../../worker"
import { isAllowed, isMonthlySpendExhausted, loadUserAccess } from "../authorization"
import { deleteChatAttachments } from "../chat/attachments"
import type { AnalyticsProperties } from "../currentUser"
import { loadTopicFindings, newTopicFindingCount, toUrlHost } from "./findings"
import { loadDirectSubscription, subscriptionActivatedAt } from "./permissions"
import { scansRemaining, startOfUtcMonth } from "./quotas"

// the outcome of a topic creation request
type CreateTopicResult = { status: "created"; id: string } | { status: "quota" }

/**
 * Load one topic's full payload or null when the topic is missing or not visible to this user.
 * A signed-out visitor may view a public topic, with no consumed state and no owner extras.
 */
export async function loadTopicPayload(userId: string | null, topicId: string): Promise<TopicResponse | null> {
	// load the topic behind the visibility gate. a hidden topic looks identical to a missing one
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
		return null
	}

	// close out this Topic's own stale Scan before reading its history
	// reclaiming a scan on the read means looking at a stale Topic doesn't have
	// to wait on a sweep that only runs when the worker does
	await failStaleScans(topic.id)

	// the owner and admins see spend. a signed-out visitor is a plain free viewer who never owns the topic
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	const isOwner = topic.ownerId === userId

	// the findings with this user's consumed state, and the sources with their display summaries
	const topicFindings = await loadTopicFindings(
		topic.id,
		userId,
		await findingsActivationCutoff(topic, userId, isAdmin),
	)
	const sourceRows = await db.select().from(sources).where(eq(sources.topicId, topic.id))
	const sourceSummaries = sourceRows.map((source) => ({
		id: source.id,
		kind: source.kind,
		summary: toSourceSummary(source.kind, source.config),
	}))

	// the attachments and the scan history, newest scan first.
	// the generated context steers every later scan, so the owner and admins see it to edit it, and nobody else does
	const attachmentRows = (
		await db
			.select({
				id: attachments.id,
				filename: attachments.filename,
				sourceUrl: attachments.sourceUrl,
				status: attachments.status,
				context: attachments.context,
			})
			.from(attachments)
			.where(eq(attachments.topicId, topic.id))
	).map((attachment) => ({ ...attachment, context: isAdmin || isOwner ? attachment.context : null }))
	const scanRows = await db.select().from(scans).where(eq(scans.topicId, topic.id)).orderBy(desc(scans.startedAt))
	const scanHistory: TopicScan[] = scanRows.map((scan) => ({
		id: scan.id,
		status: scan.status,
		// the run times, iso encoded for the wire
		startedAt: scan.startedAt.toISOString(),
		finishedAt: scan.finishedAt?.toISOString() ?? null,
		// the counts, the cost in dollars for the owner or an admin, and Carl's recap
		foundCount: scan.foundCount,
		keptCount: scan.keptCount,
		filteredCount: scan.filteredCount,
		cost: isAdmin || isOwner ? Number(scan.cost) : null,
		scanSummary: scan.scanSummary,
		error: scan.error,
	}))

	// the active subscriber count and this user's own subscription state. the owner's own row never counts,
	// since they subscribe to their own topic for delivery and "subscribers" means readers other than them
	const [subscriberRow] = await db
		.select({ count: count() })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.topicId, topic.id),
				eq(subscriptions.isActive, true),
				sql`${subscriptions.subscriberUserId} is distinct from ${topic.ownerId}`,
			),
		)
	const isSubscribed = userId ? (await loadDirectSubscription(userId, topic.id))?.isActive === true : false

	// the owner-only extras: the invite list and the manual scan quota
	const inviteRows = isOwner
		? await db.select({ email: topicInvites.email }).from(topicInvites).where(eq(topicInvites.topicId, topic.id))
		: []
	const manualScansRemaining = userId ? await scansRemaining(userId, isOwner) : null
	// only the owner can start a scan here, so nobody else needs their spend checked
	const isSpendExhausted = userId && isOwner ? await isMonthlySpendExhausted(userId) : false

	// the latest succeeded scan feeds the schedule section, mirroring the homepage feed
	const lastSucceededScan = toLastSucceededScan(scanHistory)
	// how long that scan took, from its start and finish times
	const lastScanDurationMs =
		lastSucceededScan?.finishedAt != null
			? new Date(lastSucceededScan.finishedAt).getTime() - new Date(lastSucceededScan.startedAt).getTime()
			: null

	// this month's total scan spend, for the owner or an admin, summed from the raw scans since the first of the utc month
	const monthStart = startOfUtcMonth(new Date())
	const monthCost =
		isAdmin || isOwner
			? scanRows.filter((scan) => scan.startedAt >= monthStart).reduce((sum, scan) => sum + Number(scan.cost), 0)
			: null
	return {
		// the topic identity and its editable fields
		id: topic.id,
		name: topic.name,
		prompt: topic.prompt,
		tags: topic.tags,
		frequency: topic.frequency,
		scheduledTime: toScheduledTimeLabel(topic.scheduledTime),
		scheduledDayOfWeek: topic.scheduledDayOfWeek,
		maxResults: topic.maxResults,
		visibility: topic.visibility,
		// what this user may do with the topic
		isOwner,
		isSubscribed,
		canRate: await isAllowed(userId, "topic:rate", topic),
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount: subscriberRow?.count ?? 0,
		// the schedule details
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastSucceededScan?.startedAt ?? null,
		lastScanDurationMs,
		monthCost,
		scanSummary: lastSucceededScan?.scanSummary ?? null,
		// everything hanging off the topic
		attachments: attachmentRows,
		sources: sourceSummaries,
		scans: scanHistory,
		findings: topicFindings,
		invitees: inviteRows.map((invite) => invite.email),
		manualScansRemaining,
		isSpendExhausted,
	}
}

// the invite-topic findings cutoff for this viewer. undefined loads full history, for the owner, an admin, or a
// non-invite topic. a date gates findings to scans after it. null means no active subscription, so no findings
async function findingsActivationCutoff(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "visibility">,
	userId: string | null,
	isAdmin: boolean,
): Promise<Date | null | undefined> {
	// only an invite topic gates findings, and never for the owner or an admin
	if (topic.visibility !== "invite" || topic.ownerId === userId || isAdmin) {
		return undefined
	}
	// a signed-out viewer holds no subscription to activate
	return userId ? subscriptionActivatedAt(userId, topic.id) : null
}

/**
 * The most recent succeeded scan in a newest-first history. A later failed scan never replaces the last successful result.
 */
export function toLastSucceededScan(scanHistory: TopicScan[]): TopicScan | undefined {
	return scanHistory.find((scan) => scan.status === "succeeded")
}

/**
 * The one-line display summary for a source's config: feed host, subreddit, or channel/playlist id.
 */
export function toSourceSummary(sourceKind: string, config: Record<string, unknown>): string {
	// each kind names its config differently. an unknown kind or a missing value falls back to an empty summary
	const { url, subreddit, channelId, playlistId } = config
	if (sourceKind === "rss" && typeof url === "string") {
		return toUrlHost(url) ?? url
	}

	// a url source uses the full path
	if (sourceKind === "url" && typeof url === "string") {
		return url
	}

	// a search source is the built-in web search. its ingester ignores the config, so the ui supplies the copy
	if (sourceKind === "search") {
		return ""
	}
	if (sourceKind === "reddit" && typeof subreddit === "string") {
		return `r/${subreddit}`
	}

	// a YouTube source includes either a channel id or a playlist id
	if (sourceKind === "youtube") {
		const youtubeId = [channelId, playlistId].find((id) => typeof id === "string")
		return typeof youtubeId === "string" ? youtubeId : ""
	}
	return ""
}

/**
 * A scheduled time for the wire, dropping the seconds drizzle's time column always returns ("09:00:00" to "09:00").
 */
export function toScheduledTimeLabel(scheduledTime: string): string {
	return scheduledTime.slice(0, 5)
}

/**
 * Create a topic for the user with its invitees and sources, enforcing the topic cap.
 */
export async function createTopic(
	userId: string,
	payload: UpdateTopicPayload,
	analyticsProperties: AnalyticsProperties,
): Promise<CreateTopicResult> {
	// enforce the topic cap and user role before writing anything.
	if (!(await isAllowed(userId, "topic:create"))) {
		return { status: "quota" }
	}

	// one transaction writes the topic and everything hanging off it,
	// so a failure partway leaves no partial topic and no orphaned first scan
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxResults } = payload
	const { topicId, firstScan } = await db.transaction(async (transaction) => {
		// insert the topic row owned by the user
		const [topic] = await transaction
			.insert(topics)
			.values({
				ownerId: userId,
				name,
				prompt,
				tags,
				frequency,
				scheduledTime,
				scheduledDayOfWeek,
				visibility,
				maxResults,
			})
			.returning()
		if (!topic) {
			throw new Error("failed to create topic")
		}

		// the owner subscribes to their own topic, so its deliveries reach them like any other subscriber.
		// every subscriber count filters this row back out, since "subscribers" means readers other than the author
		await transaction.insert(subscriptions).values({ topicId: topic.id, subscriberUserId: userId })

		// dedupe and insert the invitees
		const invitees = [...new Set(payload.invitees)]
		if (invitees.length > 0) {
			await transaction.insert(topicInvites).values(invitees.map((email) => ({ topicId: topic.id, email })))
		}

		// insert the new sources. a create payload never includes kept ids
		const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((source) => ({ topicId: topic.id, kind: source.kind, config: source.config })))
		}

		// open the first scan as running, so the new topic page shows a scan already under way
		const [firstScan] = await transaction.insert(scans).values({ topicId: topic.id, ownerId: userId }).returning()
		return { topicId: topic.id, firstScan }
	})

	// hand off the open scan to Temporal without awaiting the scan itself. the workflow owns it from here
	if (firstScan) {
		scanTopic(firstScan, topicId, userId, "creation").catch((error) => {
			console.error(`could not start first scan for topic ${topicId}`, error)
			reportError(error, "first-scan", { topicId, userId })
		})
	}

	// track the topic creation event
	trackEvent("topic_created", userId, { ...analyticsProperties, topicId })
	return { status: "created", id: topicId }
}

/**
 * Apply the edit modal's saved fields and reconcile the invitee and source lists. owner or admin only.
 */
export async function updateTopic(userId: string, topicId: string, payload: UpdateTopicPayload): Promise<boolean> {
	// authorize the edit through the user role
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic))) {
		return false
	}

	// one transaction covers the fields and both reconciled invitee and source lists,
	// so a failure partway never leaves the topic with a partial edit
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxResults } = payload
	await db.transaction(async (transaction) => {
		// write the editable topic fields
		await transaction
			.update(topics)
			.set({ name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxResults })
			.where(eq(topics.id, topicId))

		// reconcile invitees: drop the removed emails. the payload already trimmed and lowercased them
		const invitees = [...new Set(payload.invitees)]
		const staleInviteFilter =
			invitees.length > 0
				? and(eq(topicInvites.topicId, topicId), notInArray(topicInvites.email, invitees))
				: eq(topicInvites.topicId, topicId)
		await transaction.delete(topicInvites).where(staleInviteFilter)

		// insert the newly invited emails
		if (invitees.length > 0) {
			await transaction
				.insert(topicInvites)
				.values(invitees.map((email) => ({ topicId, email })))
				.onConflictDoNothing()
		}

		// reconcile sources: keep the rows the payload names by id, delete the rest, insert the ones without an id
		const keptSourceIds = payload.sources.flatMap((source) => ("id" in source ? [source.id] : []))
		const staleSourceFilter =
			keptSourceIds.length > 0
				? and(eq(sources.topicId, topicId), notInArray(sources.id, keptSourceIds))
				: eq(sources.topicId, topicId)
		await transaction.delete(sources).where(staleSourceFilter)

		// insert the newly added sources. the flatMap narrows the union to the members carrying source kind and source config
		const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((source) => ({ topicId, kind: source.kind, config: source.config })))
		}
	})

	// the whole edit committed together
	return true
}

/**
 * Delete a topic and everything hanging off it. Owner or admin only.
 */
export async function deleteTopic(userId: string, topicId: string): Promise<boolean> {
	// authorize the delete through the gate: the owner, or an admin
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:delete", topic))) {
		return false
	}

	// best-effort delete of the stored attachment objects before their rows cascade away,
	// both the topic's own attachments and chat attachments
	const attachmentRows = await db
		.select({ objectKey: attachments.objectKey })
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
	await Promise.all(attachmentRows.map((row) => deleteAttachment(row.objectKey).catch(() => {})))
	await deleteChatAttachments(topicId)

	// the row delete cascades to sources, findings, invites, and subscriptions.
	// a scan keeps its row with a null topic, so the spend and the daily count it incurred survive
	await db.delete(topics).where(eq(topics.id, topicId))
	return true
}
