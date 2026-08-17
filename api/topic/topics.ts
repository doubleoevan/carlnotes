// the topic logic behind the api routes. it loads one topic's full payload and applies the owner's creates, edits, and deletes
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import type { TopicResponse, TopicScan, UpdateTopicPayload } from "@shared/contracts"
import { suggestSourcesPayload, updateTopicPayload } from "@shared/contracts"
import { isDailyFrequency } from "@shared/enums"
import { reportError } from "@shared/monitoring"
import { toSourceSummary, toSourceValue } from "@shared/sources"
import { and, desc, eq, notInArray } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { dailyTopicIdsWithinLimit } from "../../db/quotas"
import { attachments, scans, sources, subscriptions, topicInvites, topics, users } from "../../db/schema"
import {
	renderTopicInviteEmail,
	renderTopicInviteEmailText,
	toTopicInviteSubject,
} from "../../emails/topic-invite-email"
import {
	deleteAttachment,
	failStaleScans,
	lookupPodcast,
	scanTopic,
	screenPendingSources,
	screenTopicSources,
	suggestSources,
} from "../../worker"
import { sendEmail } from "../../worker/email"
import { createTopicEmailSend } from "../../worker/notify"
import { isAllowed, isMonthlySpendExhausted, loadDailyFrequencyAuthorization, loadUserAccess } from "../authorization"
import { deleteChatAttachments } from "../chat/attachments"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
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

// how a topic the user may not see is gated, or null if no such topic exists
async function toGatedTopic(
	topicId: string,
): Promise<{ visibility: "invite" | "private"; name: string | null } | null> {
	const [topic] = await db
		.select({ visibility: topics.visibility, name: topics.name })
		.from(topics)
		.where(eq(topics.id, topicId))
	// a missing or public topic is not gated at all
	if (!topic || topic.visibility === "public") {
		return null
	}
	return { visibility: topic.visibility, name: topic.visibility === "invite" ? topic.name : null }
}

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
			value: toSourceValue(source.kind, source.config),
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
	// every scan column but the recap, which is loaded dynamically one scan at a time
	const scanRows = await db
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
		})
		.from(scans)
		.where(eq(scans.topicId, topic.id))
		.orderBy(desc(scans.startedAt))
	// a scan the user cancelled is left out of the history.
	// and out of the last-succeeded scan that the schedule line and the topic's note are read from,
	// where it would otherwise report a scan time with no recap behind it.
	// the month's cost below still counts it, since it was spent
	const scanHistory: TopicScan[] = scanRows
		.filter((scan) => scan.stoppedAt === null)
		.map((scan) => ({
			id: scan.id,
			status: scan.status,
			// the run times, iso encoded for the wire
			startedAt: scan.startedAt.toISOString(),
			finishedAt: scan.finishedAt?.toISOString() ?? null,
			stoppedAt: scan.stoppedAt?.toISOString() ?? null,
			// the counts, and the cost in dollars for the owner or an admin
			foundCount: scan.foundCount,
			keptCount: scan.keptCount,
			filteredCount: scan.filteredCount,
			costDollars: isAdmin || isOwner ? Number(scan.cost) : null,
			error: scan.error,
		}))

	// this user's own subscription state. the count itself reads the denormalised column, the same figure the
	// feed and the profile show, so no page can disagree with another
	const isSubscribed = userId ? (await loadDirectSubscription(userId, topic.id))?.isActive === true : false

	// the owner-only extras: the invite list and the manual scan quota
	const inviteRows = isOwner
		? await db.select({ email: topicInvites.email }).from(topicInvites).where(eq(topicInvites.topicId, topic.id))
		: []
	const canScan = await isAllowed(userId, "scan:request", topic)
	const manualScansRemaining = userId ? await scansRemaining(userId, canScan) : null
	// only someone who may scan needs their spend checked, and only show their own spend
	const isSpendExhausted = userId && canScan ? await isMonthlySpendExhausted(userId) : false

	// the topic owner's username, avatar and profile page id
	const [ownerRow] = await db
		.select({ userId: users.id, username: users.username, avatarSource: users.avatarSource })
		.from(users)
		.where(eq(users.id, topic.ownerId))

	// the latest succeeded scan feeds the schedule section, mirroring the homepage feed
	const lastSucceededScan = toLastSucceededScan(scanHistory)
	// the topic's own note, which is the latest successful scan's recap.
	const [latestNote] = lastSucceededScan
		? await db.select({ scanSummary: scans.scanSummary }).from(scans).where(eq(scans.id, lastSucceededScan.id))
		: []
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
		owner: ownerRow
			? { userId: ownerRow.userId, username: ownerRow.username, avatarSource: ownerRow.avatarSource }
			: null,
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
		subscriberCount: topic.subscriberCount,
		// the schedule details
		createdAt: topic.createdAt.toISOString(),
		lastScanAt: lastSucceededScan?.startedAt ?? null,
		lastScanDurationMs,
		monthCostDollars,
		scanSummary: latestNote?.scanSummary ?? null,
		// everything connected to the topic
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
	// the deduped invitees, shared by the insert inside the transaction and the invitation emails after it
	const invitees = [...new Set(payload.invitees)]
	const podcastNames = await toPodcastNames(payload.sources)
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

		// insert the invitees
		if (invitees.length > 0) {
			await transaction.insert(topicInvites).values(invitees.map((email) => ({ topicId: topic.id, email })))
		}

		// insert the new sources. a create payload never includes kept ids
		const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((source) => toNewSourceRow(topic.id, source, podcastNames)))
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

	// email the invitations without holding up the topic created response
	startInviteEmails({ id: topicId, name, ownerId: userId }, invitees)

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

	// check if an address was already invited, read before the save so only the newly added invitees get an invitation email
	const existingInviteRows = await db
		.select({ email: topicInvites.email })
		.from(topicInvites)
		.where(eq(topicInvites.topicId, topicId))
	const existingInvites = new Set(existingInviteRows.map((row) => row.email))

	// one transaction covers the fields and both reconciled invitee and source lists,
	// so a failure partway never leaves the topic with a partial edit
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxResults } = payload
	// the deduped invitees, shared by the reconcile inside the transaction and the invitation emails after it
	const invitees = [...new Set(payload.invitees)]
	const podcastNames = await toPodcastNames(payload.sources)
	await db.transaction(async (transaction) => {
		// write the editable topic fields
		await transaction
			.update(topics)
			.set({
				name,
				prompt,
				tags,
				frequency,
				scheduledTime,
				scheduledDayOfWeek,
				visibility,
				maxResults,
			})
			.where(eq(topics.id, topicId))

		// only a public topic can be featured, so changing the visibility from public drops it from the featured topics
		if (visibility !== "public") {
			await releaseFeatureOrder(topicId, transaction)
		}

		// reconcile invitees: drop the removed emails. the payload already trimmed and lowercased them
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

		// insert the newly added sources. the flatMap narrows the union to the members with source kind and source config
		const newSources = payload.sources.flatMap((source) => ("id" in source ? [] : [source]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((source) => toNewSourceRow(topicId, source, podcastNames)))
		}
	})

	// screen whatever this edit added with llm-guard, now that the rows are committed
	startPendingSourceScreens(topicId)

	// email only the newly added invitees, so re-saving a topic does not re-emails its list.
	// the inviter named is the topic's owner, since an admin's edit invites on the owner's behalf
	startInviteEmails(
		{ id: topicId, name, ownerId: topic.ownerId },
		invitees.filter((email) => !existingInvites.has(email)),
	)

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
function toNewSourceRow(
	topicId: string,
	source: NewTopicSource,
	podcastNames: Map<string, string>,
): typeof sources.$inferInsert {
	// a podcast Source keeps the show's name beside its id, so it reads by name instead of by number
	const podcastId = source.config.podcastId
	const podcastName = typeof podcastId === "string" ? podcastNames.get(podcastId) : undefined
	return {
		topicId,
		kind: source.sourceKind,
		config: podcastName ? { ...source.config, name: podcastName } : source.config,
		status: source.sourceKind === "url" ? "pending" : "ready",
	}
}

// the show names for the podcast Sources this payload adds, read before the write so no request runs inside a transaction.
// a name that will not resolve is left out, and the ingester stores it on the first scan instead
async function toPodcastNames(payloadSources: UpdateTopicPayload["sources"]): Promise<Map<string, string>> {
	// the ids this payload adds without a name of their own. a kept Source keeps whatever name it was saved with,
	// and a suggested one arrives already named, so only a hand-typed id needs the lookup
	const podcastIds = payloadSources.flatMap((source) =>
		"id" in source ||
		source.sourceKind !== "podcast" ||
		typeof source.config.podcastId !== "string" ||
		typeof source.config.name === "string"
			? []
			: [source.config.podcastId],
	)
	if (podcastIds.length === 0) {
		return new Map()
	}

	// look every show up at once. iTunes being unreachable costs a name, never the save
	const podcasts = await Promise.all(podcastIds.map((podcastId) => lookupPodcast(podcastId).catch(() => null)))
	return new Map(podcasts.flatMap((podcast) => (podcast ? [[podcast.podcastId, podcast.name] as const] : [])))
}

// start the invitation emails without holding up the save that added them
function startInviteEmails(topic: { id: string; name: string; ownerId: string }, invitees: string[]): void {
	sendTopicInviteEmails(topic, invitees).catch((error) => {
		console.error(`could not send topic invitations for topic ${topic.id}`, error)
		reportError(error, "email", { emailKind: "topic-invite", topicId: topic.id })
	})
}

// email each newly invited address its invitation, naming the owner and linking to the topic page.
// the topic page's gate walks a signed-out invitee through login or signup and back to the topic.
async function sendTopicInviteEmails(
	topic: { id: string; name: string; ownerId: string },
	invitees: string[],
): Promise<void> {
	// nobody new means no email, and with no app url there is no link to invite anyone to
	const appUrl = Bun.env.BETTER_AUTH_URL?.replace(/\/$/, "")
	if (invitees.length === 0 || !appUrl) {
		return
	}

	// the inviter is the topic's owner, named by username like everywhere else the app shows them
	const [owner] = await db.select({ username: users.username }).from(users).where(eq(users.id, topic.ownerId))
	if (!owner) {
		return
	}

	// one email per newly invited address, each naming the address the invitation is tied to.
	// src marks the arrival for analytics: the gate forwards it as the signup cta for analytics tracking.
	const topicUrl = `${appUrl}/topics/${topic.id}?src=invite-email`
	// one invitee's failure is logged and left behind, so the rest of the list still gets invited
	for (const inviteeEmail of invitees) {
		const emailProps = { inviterUsername: owner.username, topicName: topic.name, inviteeEmail, topicUrl, appUrl }
		try {
			const isAccepted = await sendEmail({
				to: inviteeEmail,
				subject: toTopicInviteSubject(emailProps),
				emailContent: await renderTopicInviteEmail(emailProps),
				plainTextContent: await renderTopicInviteEmailText(emailProps),
				emailKind: "topic-invite",
			})
			await createTopicEmailSend({ topicId: topic.id, emailKind: "topic-invite", recipientUserId: null, isAccepted })
		} catch (error) {
			console.error(`could not invite ${inviteeEmail} to topic ${topic.id}`, error)
			reportError(error, "email", { emailKind: "topic-invite", topicId: topic.id })
		}
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

// the topic routes: create, source suggestions, read, update, and delete
export const topicsRoute = new Hono<AppEnv>()
	.post("/topics", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a topic for the current user within the topic cap and the daily topic limit
		const createTopicResult = await createTopic(userId, context.req.valid("json"), toAnalyticsProperties(context))
		if (createTopicResult.status === "created") {
			return context.json({ id: createTopicResult.id })
		}

		// a full topic cap and a full daily topic limit both reject, but only the second can name its number
		return createTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: createTopicResult.limit }, 429)
			: context.json({ error: "quota exhausted" }, 429)
	})
	.post("/topics/suggest-sources", zValidator("json", suggestSourcesPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// propose sources from the topic's own text. suggesting is not scanning, so it draws on no quota
		const { name, prompt, attachmentContext, excludeSources, limit } = context.req.valid("json")
		return context.json({ sources: await suggestSources({ name, prompt, attachmentContext, excludeSources, limit }) })
	})
	.get("/topics/:id", async (context) => {
		// the topic detail payload, gated by visibility. a signed-out visitor may only view a public topic
		const topicPayload = await loadTopicPayload(currentUser(context), context.req.param("id"))
		if (topicPayload) {
			return context.json(topicPayload)
		}
		// a topic that exists but is gated responds with how it is gated.
		// a topic id that matches nothing responds with nothing at all
		const gatedTopic = await toGatedTopic(context.req.param("id"))
		return gatedTopic
			? context.json({ error: "forbidden", gatedVisibility: gatedTopic.visibility, topicName: gatedTopic.name }, 403)
			: context.json({ error: "not found" }, 404)
	})
	.patch("/topics/:id", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// save the edit topic's fields and reconcile the invitee and source lists. owner or admin only.
		const updateTopicResult = await updateTopic(
			userId,
			context.req.param("id"),
			context.req.valid("json"),
			toAnalyticsProperties(context),
		)
		if (updateTopicResult.status === "saved") {
			return context.json({ ok: true })
		}

		// a daily frequency past the plan's limit is a quota rejection, not an authorization one
		return updateTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: updateTopicResult.limit }, 429)
			: context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id", async (context) => {
		// reject a signed-out caller
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete the topic and everything attached to it. owner or admin only.
		const isTopicDeleted = await deleteTopic(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isTopicDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
