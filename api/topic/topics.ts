// the topic logic behind the api routes. it loads one topic's full payload and applies the owner's edits, deletes, subscriptions, and manual scans
import type { TopicResponse, TopicScan, UpdateTopicPayload } from "@shared/contracts"
import { ADMIN_QUOTA, PLANS } from "@shared/plans"
import { and, count, desc, eq, notInArray } from "drizzle-orm"
import { db } from "../../db"
import { attachments, scans, sources, subscriptions, topicInvites, topics } from "../../db/schema"
import { deleteAttachment, runTopicScan } from "../../worker"
import { loadTopicFindings, newTopicFindingCount, toUrlHost } from "./findings"
import { canRateTopic, canSeeTopic, loadDirectSubscription, loadOwnedTopic } from "./permissions"
import { loadUserAccess, scansRemaining, scansToday, startOfUtcMonth, topicsRemaining } from "./quotas"

// the outcomes of a manual scan or topic creation request
type ManualScanResult = { status: "started"; remaining: number } | { status: "forbidden" } | { status: "quota" }
type CreateTopicResult = { status: "created"; id: string } | { status: "quota" }

/**
 * Load one topic's full payload or null when the topic is missing or not visible to this user.
 * A signed-out visitor may view a public topic, with no consumed state and no owner extras.
 */
export async function loadTopicPayload(userId: string | null, topicId: string): Promise<TopicResponse | null> {
	// load the topic and enforce its visibility. a hidden topic looks identical to a missing one
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await canSeeTopic(userId, topic))) {
		return null
	}

	// the findings with this user's consumed state, and the sources with their display summaries
	const topicFindings = await loadTopicFindings(topic.id, userId)
	const sourceRows = await db.select().from(sources).where(eq(sources.topicId, topic.id))
	const sourceSummaries = sourceRows.map((source) => ({
		id: source.id,
		kind: source.kind,
		summary: toSourceSummary(source.kind, source.config),
	}))

	// the owner and admins see spend. a signed-out visitor is a plain free viewer who never owns the topic
	const { isAdmin } = userId ? await loadUserAccess(userId) : { isAdmin: false }
	const isOwner = topic.ownerId === userId

	// the attachments and the scan history, newest scan first
	const attachmentRows = await db
		.select({
			id: attachments.id,
			filename: attachments.filename,
			sourceUrl: attachments.sourceUrl,
			status: attachments.status,
		})
		.from(attachments)
		.where(eq(attachments.topicId, topic.id))
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

	// the subscriber count and this user's own subscription state
	const [subscriberRow] = await db
		.select({ count: count() })
		.from(subscriptions)
		.where(eq(subscriptions.topicId, topic.id))
	const isSubscribed = userId ? (await loadDirectSubscription(userId, topic.id)) !== undefined : false

	// the owner-only extras: the invite list and the manual scan quota
	const inviteRows = isOwner
		? await db.select({ email: topicInvites.email }).from(topicInvites).where(eq(topicInvites.topicId, topic.id))
		: []
	const manualScansRemaining = userId ? await scansRemaining(userId, isOwner) : null

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
		visibility: topic.visibility,
		// what this user may do with the topic
		isOwner,
		isSubscribed,
		canRate: await canRateTopic(userId, topic),
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
	}
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
export function toSourceSummary(kind: string, config: Record<string, unknown>): string {
	// each kind names its config differently. an unknown kind or a missing value falls back to an empty summary
	const { url, subreddit, channelId, playlistId } = config
	if (kind === "rss" && typeof url === "string") {
		return toUrlHost(url) ?? url
	}

	// a search source is the built-in web scout. its adapter ignores the config, so the ui supplies the copy
	if (kind === "search") {
		return ""
	}
	if (kind === "reddit" && typeof subreddit === "string") {
		return `r/${subreddit}`
	}

	// a youtube source carries either a channel id or a playlist id
	if (kind === "youtube") {
		const youtubeId = [channelId, playlistId].find((id) => typeof id === "string")
		return typeof youtubeId === "string" ? youtubeId : ""
	}
	return ""
}

/**
 * Create a topic for the user with its invitees and sources, enforcing the topic cap.
 */
export async function createTopic(userId: string, payload: UpdateTopicPayload): Promise<CreateTopicResult> {
	// enforce the cap before writing anything
	if ((await topicsRemaining(userId)) <= 0) {
		return { status: "quota" }
	}

	// insert the topic row owned by the user
	const { name, prompt, tags, frequency, visibility } = payload
	const [topic] = await db
		.insert(topics)
		.values({ ownerId: userId, name, prompt, tags, frequency, visibility })
		.returning()
	if (!topic) {
		throw new Error("failed to create topic")
	}

	// insert the invitees, deduped like an update would
	const invitees = [...new Set(payload.invitees)]
	if (invitees.length > 0) {
		await db.insert(topicInvites).values(invitees.map((email) => ({ topicId: topic.id, email })))
	}

	// insert the new sources. a create payload never carries kept ids
	const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
	if (newSources.length > 0) {
		await db
			.insert(sources)
			.values(newSources.map((source) => ({ topicId: topic.id, kind: source.kind, config: source.config })))
	}
	return { status: "created", id: topic.id }
}

/**
 * Apply the edit modal's saved fields and reconcile the invitee and source lists. Owner only.
 */
export async function updateTopic(userId: string, topicId: string, payload: UpdateTopicPayload): Promise<boolean> {
	if (!(await loadOwnedTopic(userId, topicId))) {
		return false
	}

	// write the editable topic fields
	const { name, prompt, tags, frequency, visibility } = payload
	await db.update(topics).set({ name, prompt, tags, frequency, visibility }).where(eq(topics.id, topicId))

	// reconcile invitees: drop the removed emails. the payload already trimmed and lowercased them
	const invitees = [...new Set(payload.invitees)]
	const staleInviteFilter =
		invitees.length > 0
			? and(eq(topicInvites.topicId, topicId), notInArray(topicInvites.email, invitees))
			: eq(topicInvites.topicId, topicId)
	await db.delete(topicInvites).where(staleInviteFilter)

	// insert the newly invited emails
	if (invitees.length > 0) {
		await db
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
	await db.delete(sources).where(staleSourceFilter)

	// insert the newly added sources. the flatMap narrows the union to the members carrying kind and config
	const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
	if (newSources.length > 0) {
		await db.insert(sources).values(newSources.map((source) => ({ topicId, kind: source.kind, config: source.config })))
	}
	return true
}

/**
 * Delete a topic and everything hanging off it. Owner only.
 */
export async function deleteTopic(userId: string, topicId: string): Promise<boolean> {
	if (!(await loadOwnedTopic(userId, topicId))) {
		return false
	}

	// best-effort delete of the stored attachment objects before their rows cascade away
	const attachmentRows = await db
		.select({ objectKey: attachments.objectKey })
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
	await Promise.all(attachmentRows.map((row) => deleteAttachment(row.objectKey).catch(() => {})))

	// the row delete cascades to sources, scans, findings, invites, and subscriptions
	await db.delete(topics).where(eq(topics.id, topicId))
	return true
}

/**
 * Subscribe or unsubscribe the current user. Allowed on any visible topic that can have subscribers.
 */
export async function setTopicSubscription(userId: string, topicId: string, isSubscribed: boolean): Promise<boolean> {
	// a private topic never has subscribers, an owner can't subscribe to their own topic, and an invisible topic cannot be subscribed to
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || topic.visibility === "private" || topic.ownerId === userId || !(await canSeeTopic(userId, topic))) {
		return false
	}

	// unsubscribing deletes this user's direct subscription row
	if (!isSubscribed) {
		await db
			.delete(subscriptions)
			.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
		return true
	}

	// subscribing inserts a direct row unless one already exists
	if (!(await loadDirectSubscription(userId, topicId))) {
		await db.insert(subscriptions).values({ topicId, subscriberUserId: userId })
	}
	return true
}

/**
 * Start a manual scan for the owner, enforcing the daily quota. The scan runs without blocking the request.
 */
export async function runManualScan(userId: string, topicId: string): Promise<ManualScanResult> {
	if (!(await loadOwnedTopic(userId, topicId))) {
		return { status: "forbidden" }
	}

	// admins bypass the daily quota so they can test freely. everyone else stops here once they've hit their plan's cap
	const { isAdmin, plan } = await loadUserAccess(userId)
	const dailyLimit = PLANS[plan].dailyScanLimit
	const usedToday = isAdmin ? 0 : await scansToday(userId)
	if (!isAdmin && usedToday >= dailyLimit) {
		return { status: "quota" }
	}

	// start the scan without awaiting it. history shows the running row until it finishes.
	// check-then-start is not atomic, so concurrent requests can slip a few scans past the daily count.
	// the real spend ceiling is the owner's per-user litellm key budget, which litellm enforces atomically, so an
	// over-count never becomes over-spend. a per-user advisory lock around the count and insert would close the count gap
	runTopicScan(topicId, true).catch((error) => console.error(`manual scan failed for topic ${topicId}`, error))
	return { status: "started", remaining: isAdmin ? ADMIN_QUOTA : dailyLimit - usedToday - 1 }
}
