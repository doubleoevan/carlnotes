// the topic logic behind the api routes. it loads one topic's full payload and applies the owner's creates, edits, and deletes
import { trackEvent } from "@shared/analytics"
import type { TopicResponse, TopicScan, UpdateTopicPayload } from "@shared/contracts"
import { isDailyFrequency } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { toSourceSummary } from "@shared/sources"
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm"
import { db } from "../../db"
import { dailyTopicIdsWithinLimit } from "../../db/quotas"
import { attachments, scans, sources, subscriptions, topicInvites, topics } from "../../db/schema"
import { deleteAttachment, failStaleScans, scanTopic, screenPendingSources, screenTopicSources } from "../../worker"
import { isAllowed, isMonthlySpendExhausted, loadDailyFrequencyAuthorization, loadUserAccess } from "../authorization"
import { deleteChatAttachments } from "../chat/attachments"
import type { AnalyticsProperties } from "../currentUser"
import { loadFeaturedTopics, releaseFeatureOrder } from "./featuring"
import { loadTopicFindings, newTopicFindingCount } from "./findings"
import { loadDirectSubscription, subscriptionActivatedAt } from "./permissions"
import { scansRemaining, startOfUtcMonth } from "./quotas"

// the outcome of a topic creation request
type CreateTopicResult = { status: "created"; id: string } | { status: "quota" } | DailyFrequencyRejection

// the outcome of a topic edit
export type UpdateTopicResult = { status: "saved" } | { status: "forbidden" } | DailyFrequencyRejection

// a rejected attempt to add one more topic on a daily frequency, including the plan's limit so the message can show it
type DailyFrequencyRejection = { status: "dailyFrequency"; limit: number }

// a Source that the payload adds instead of an existing one
type NewTopicSource = Extract<UpdateTopicPayload["sources"][number], { sourceKind: string }>
type Scan = typeof scans.$inferSelect

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
	// marking a stale scan failed on the read means catching a stale Topic doesn't have to wait on a sweep that only runs when the worker does
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
	// a Source that has not passed its llm-guard screen can only be seen by the owner
	const sourceRows = await db.select().from(sources).where(eq(sources.topicId, topic.id))
	const sourceSummaries = sourceRows
		.filter((source) => source.status === "ready" || isAdmin || isOwner)
		.map((source) => ({
			id: source.id,
			sourceKind: source.kind,
			summary: toSourceSummary(source.kind, source.config),
			status: source.status,
			error: source.error,
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
		costDollars: isAdmin || isOwner ? Number(scan.cost) : null,
		scanSummary: scan.scanSummary,
		error: scan.error,
	}))

	// the active subscriber count and this user's own subscription state. the owner's own row never counts,
	// since they subscribe to their own topic for delivery and "subscribers" means users other than them
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
	const canScan = await isAllowed(userId, "scan:request", topic)
	const manualScansRemaining = userId ? await scansRemaining(userId, canScan) : null
	// only someone who may scan needs their spend checked, and only show their own spend
	const isSpendExhausted = userId && canScan ? await isMonthlySpendExhausted(userId) : false

	// the latest succeeded scan feeds the schedule section, mirroring the homepage feed
	const lastSucceededScan = toLastSucceededScan(scanHistory)
	// how long that scan took, from its start and finish times
	const lastScanDurationMs =
		lastSucceededScan?.finishedAt != null
			? new Date(lastSucceededScan.finishedAt).getTime() - new Date(lastSucceededScan.startedAt).getTime()
			: null

	// this month's total scan spend, for the owner or an admin, summed from the raw scans since the first of the utc month
	const monthStart = startOfUtcMonth(new Date())
	const monthCostDollars =
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
		isDailyFrequencyPaused: await toDailyFrequencyPaused(topic, isOwner),
		isSubscribed,
		canRate: await isAllowed(userId, "topic:rate", topic),
		canEdit: await isAllowed(userId, "topic:edit", topic),
		newCount: newTopicFindingCount(topicFindings),
		subscriberCount: subscriberRow?.count ?? 0,
		// the schedule details
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastSucceededScan?.startedAt ?? null,
		lastScanDurationMs,
		monthCostDollars,
		scanSummary: lastSucceededScan?.scanSummary ?? null,
		// everything hanging off the topic
		attachments: attachmentRows,
		sources: sourceSummaries,
		scans: scanHistory,
		findings: topicFindings,
		invitees: inviteRows.map((invite) => invite.email),
		manualScansRemaining,
		isSpendExhausted,
		...(await toFeaturedTopics(topic.featureOrder, isAdmin)),
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

// whether the owner holds more daily topics than their plan allows, leaving this topic's frequency unscanned.
// the sweep skips the extras, so a schedule reading "Daily" would otherwise take a frequency that never runs.
async function toDailyFrequencyPaused(
	topic: Pick<typeof topics.$inferSelect, "id" | "ownerId" | "frequency">,
	isOwner: boolean,
): Promise<boolean> {
	if (!isOwner || !isDailyFrequency(topic.frequency)) {
		return false
	}
	return !(await dailyTopicIdsWithinLimit(topic.ownerId)).has(topic.id)
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

	// check if a topic asking for a daily frequency can fit under the plan's daily topic limit
	const dailyFrequency = await authorizeNewDailyFrequency(userId, payload)
	if (dailyFrequency) {
		return dailyFrequency
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
		// every subscriber count filters this row back out, since "subscribers" means users other than the author
		await transaction.insert(subscriptions).values({ topicId: topic.id, subscriberUserId: userId })

		// dedupe and insert the invitees
		const invitees = [...new Set(payload.invitees)]
		if (invitees.length > 0) {
			await transaction.insert(topicInvites).values(invitees.map((email) => ({ topicId: topic.id, email })))
		}

		// insert the new sources. a create payload never includes kept ids
		const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
		if (newSources.length > 0) {
			await transaction.insert(sources).values(newSources.map((source) => toNewSourceRow(topic.id, source)))
		}

		// open the first scan as running, so the new topic page shows a scan already under way
		const [firstScan] = await transaction.insert(scans).values({ topicId: topic.id, ownerId: userId }).returning()
		return { topicId: topic.id, firstScan }
	})

	// screen the url Sources this topic was created with, then hand the open scan to Temporal.
	// neither is awaited here, so the create response returns before either runs
	startFirstScan(topicId, firstScan, userId).catch((error) => {
		console.error(`could not start first scan for topic ${topicId}`, error)
		reportError(error, "first-scan", { topicId, userId })
	})

	// track the topic creation event
	trackEvent("topic_created", userId, { ...analyticsProperties, topicId })
	return { status: "created", id: topicId }
}

/**
 * Apply the edit modal's saved fields and reconcile the invitee and source lists. owner or admin only.
 */
export async function updateTopic(
	userId: string,
	topicId: string,
	payload: UpdateTopicPayload,
	analyticsProperties: AnalyticsProperties,
): Promise<UpdateTopicResult> {
	// authorize the edit through the user role
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic))) {
		return { status: "forbidden" }
	}

	// an edit moving their topic onto a daily frequency takes a slot, so it is checked before anything is written
	const dailyFrequency = await authorizeNewDailyFrequency(userId, payload, topic.frequency)
	if (dailyFrequency) {
		return dailyFrequency
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

		// only a public topic can be featured, so changing the visibility from public drops it from the featured topics
		if (visibility !== "public") {
			await releaseFeatureOrder(topicId, transaction)
		}

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
			await transaction.insert(sources).values(newSources.map((source) => toNewSourceRow(topicId, source)))
		}
	})

	// screen whatever this edit added with llm-guard, now that the rows are committed
	startPendingSourceScreens(topicId)

	// record who saved the topic. an admin may edit a topic they do not own so flag if it was not saved by the owner
	trackEvent("topic_updated", userId, { ...analyticsProperties, topicId, isOwner: topic.ownerId === userId })
	return { status: "saved" }
}

/**
 * Whether saving this frequency takes a new daily slot
 */
export function isTakingDailySlot(savedFrequency: string, currentFrequency?: string): boolean {
	return isDailyFrequency(savedFrequency) && !isDailyFrequency(currentFrequency ?? "")
}

// the rejection when a payload moves a topic onto a daily frequency past the plan's daily topic limit or null if not
async function authorizeNewDailyFrequency(
	userId: string,
	payload: UpdateTopicPayload,
	currentFrequency?: string,
): Promise<DailyFrequencyRejection | null> {
	if (!isTakingDailySlot(payload.frequency, currentFrequency)) {
		return null
	}
	const authorization = await loadDailyFrequencyAuthorization(userId)
	return authorization.status === "quota" ? { status: "dailyFrequency", limit: authorization.limit } : null
}

// where this topic sits in the Featured section, and the section itself for the Rank menu to show. only an admin can see it
async function toFeaturedTopics(
	featureOrder: number | null,
	isAdmin: boolean,
): Promise<Pick<TopicResponse, "featureOrder" | "featuredTopics">> {
	if (!isAdmin) {
		return { featureOrder: null, featuredTopics: null }
	}
	return { featureOrder, featuredTopics: await loadFeaturedTopics() }
}

// a new Source row. a url Source is saved as pending so it isn't ready until its page has been fetched and screened,
// every other source kind is saved as ready
function toNewSourceRow(topicId: string, source: NewTopicSource): typeof sources.$inferInsert {
	return {
		topicId,
		kind: source.sourceKind,
		config: source.config,
		status: source.sourceKind === "url" ? "pending" : "ready",
	}
}

// start the llm-guard screen for the Topic's newly saved url Sources asynchronously, without holding up the save.
// the llm-guard screen decides whether the sources are ever shown or ever scanned, so until it passes they are not ready
function startPendingSourceScreens(topicId: string): void {
	screenPendingSources(topicId).catch((error) => {
		console.error(`could not start source screens for topic ${topicId}`, error)
		reportError(error, "source-screen", { topicId })
	})
}

// screen the new Topic's url Sources with llm-guard, then start the Scan. the Scan waits on the screens,
// so the first Scan an owner watches reads the urls they just saved instead of skipping them as unchecked.
// the wait is bounded, and an llm-screen screen that outlasts it leaves a Source for a later Scan
async function startFirstScan(topicId: string, firstScan: Scan | undefined, ownerId: string): Promise<void> {
	await screenTopicSources(topicId)
	if (firstScan) {
		await scanTopic(firstScan, topicId, ownerId, "creation")
	}
}

/**
 * Delete a topic and everything it includes. Owner or admin only.
 */
export async function deleteTopic(
	userId: string,
	topicId: string,
	analyticsProperties: AnalyticsProperties,
): Promise<boolean> {
	// authorize the delete through the access gate: owner, or admin
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

	// a featured topic gives up its position before it's deleted.
	// the topic row delete cascades to sources, findings, invites, and subscriptions.
	// a scan keeps its row with a null topic, so the spend and the daily count it used is still tracked
	await db.transaction(async (transaction) => {
		await releaseFeatureOrder(topicId, transaction)
		await transaction.delete(topics).where(eq(topics.id, topicId))
	})

	// record who deleted the topic. the row is gone, so this event is the only account of who deleted it
	trackEvent("topic_deleted", userId, { ...analyticsProperties, topicId, isOwner: topic.ownerId === userId })
	return true
}
