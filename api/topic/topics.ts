// the topic logic for the api routes
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { appUrl } from "@shared/appUrl"
import type { TopicDraft, TopicResponse, UpdateTopicPayload } from "@shared/contracts"
import { suggestSourcesPayload, updateTopicPayload } from "@shared/contracts"
import { reportError, traceRequestStage } from "@shared/monitoring"
import { toTopicPath } from "@shared/seo"
import { toSourceSummary, toSourceValue } from "@shared/sources"
import { and, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { db } from "../../db"
import { incrementDaySuggestionCount } from "../../db/quotas"
import { cacheJson } from "../../db/redis"
import { attachments, chatRoomAttachments, invites, scans, sources, subscriptions, topics } from "../../db/schema"
import {
	deleteAttachment,
	deleteTopicPodcastEpisodeAudio,
	loadOrProvisionUserLiteLLMKey,
	notifyIndexNow,
	suggestSources,
} from "../../worker"
import { isAllowed } from "../authorization"
import { deleteChatAttachments } from "../chat/attachments"
import { loadTopicChatMentions } from "../chat/mentions"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { startInviteEmails } from "../invite/emails"
import { checkTopicInvitees } from "../invite/userInvites"
import { loadTopicPodcast } from "../podcast/helpers"
import { releaseFeatureOrder } from "./featuring"
import { newTopicFindingCount } from "./findings"
import {
	authorizeNewDailyTopic,
	type DailyFrequencyRejection,
	loadTeamTopicOptions,
	loadTopicAccessAndFindings,
	loadTopicOwner,
	startFirstScan,
	startPendingSourceScreens,
	toDailyFrequencyPaused,
	toFeaturedTopics,
	toInviteAndScanFields,
	toInviteTopic,
	toLastTopicScanFields,
	toNewSourceRow,
	toPodcastNames,
	toScanHistory,
	toScheduledTimeLabel,
	toTeamFields,
} from "./helpers"
import { loadDirectSubscription } from "./permissions"
import { type PromptVersionOrigin, savePromptVersion } from "./promptVersions"
import { startOfUtcMonth } from "./quotas"

// the query flag that marks a topic page request as a poll reload
const topicPageQuery = z.object({ poll: z.literal("1").optional() })

// how long Redis caches a topic page for poll reloads
const TOPIC_PAGE_POLL_TTL_MS = 2000

// the outcome of a topic creation request
type CreateTopicResult =
	| { status: "created"; id: string }
	| { status: "quota" }
	| DailyFrequencyRejection
	| InviteeRejection

// the outcome of a topic edit
export type UpdateTopicResult =
	| { status: "saved" }
	| { status: "forbidden" }
	| { status: "missing" }
	| DailyFrequencyRejection
	| InviteeRejection

// a save stopped by its invitee list: a recipient who is not accepting invites, or the sender's invite limit
type InviteeRejection = { status: "inviteeRejected"; email: string } | { status: "inviteLimit" }

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
		// whether a daily frequency is paused, what the user may do on the topic, and the podcast
		isDailyFrequencyPaused,
		canRate,
		canEdit,
		{ podcast, podcastEpisodeByScanId },
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
		]),
	)

	// every later scan reads the generated context, so the owner and admins see it to edit it, and nobody else does
	const canSeeOwnerDetails = isAdmin || isTopicOwner
	const attachmentRows = rawAttachmentRows.map((attachment) => ({
		...attachment,
		context: canSeeOwnerDetails ? attachment.context : null,
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
		findings: topicFindings,
		invites: inviteRows,
		manualScansRemaining,
		manualScanLimit,
		isSpendExhausted,
		...teamFields,
		isOnTeam: topic.teamId !== null,
		...(await toFeaturedTopics(topic.featureOrder, isAdmin)),
	}
}

// the attachment rows that a topic page lists
async function loadTopicAttachmentRows(
	topicId: string,
): Promise<Pick<typeof attachments.$inferSelect, "id" | "filename" | "sourceUrl" | "status" | "context">[]> {
	return db
		.select({
			id: attachments.id,
			filename: attachments.filename,
			sourceUrl: attachments.sourceUrl,
			status: attachments.status,
			context: attachments.context,
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

/**
 * Tells IndexNow the urls a save changed: a topic's url if it turns public, its old url if it stops being public,
 * and both if a rename moves a public topic.
 */
export function notifyIndexNowOfTopicChange({
	savedTopic,
	previousTopic,
}: {
	savedTopic: { id: string; name: string; visibility: (typeof topics.$inferSelect)["visibility"] }
	previousTopic: { name: string; visibility: (typeof topics.$inferSelect)["visibility"] } | null
}): void {
	// the topic's indexed path after the save and before it. only a public topic's page is indexed
	const topicPath = savedTopic.visibility === "public" ? toTopicPath(savedTopic) : null
	const previousTopicPath =
		previousTopic?.visibility === "public" ? toTopicPath({ id: savedTopic.id, name: previousTopic.name }) : null
	if (topicPath === previousTopicPath) {
		return
	}
	// send the path that appeared and the path that went away
	const changedPaths = [topicPath, previousTopicPath].filter((changedPath) => changedPath !== null)
	void notifyIndexNow(changedPaths.map((changedPath) => `${appUrl()}${changedPath}`))
}

// the editor's topic fields, and whether the new topic's podcast is on. left out, the podcast starts on
type CreateTopicPayload = UpdateTopicPayload & Pick<TopicDraft, "isPodcastEnabled">

/**
 * Creates a topic for the user with its invites and sources, enforcing the topic limit.
 */
export async function createTopic(
	userId: string,
	payload: CreateTopicPayload,
	analyticsProperties: AnalyticsProperties,
	// where the first prompt version is saved from. the editor unless a topic tool says otherwise
	origin: PromptVersionOrigin = "editor",
): Promise<CreateTopicResult> {
	// enforce the topic limit and user role before writing anything.
	if (!(await isAllowed(userId, "topic:create"))) {
		return { status: "quota" }
	}

	// check if a topic asking for a daily frequency can fit under the plan's daily topic limit
	const dailyFrequency = await authorizeNewDailyTopic(userId, payload)
	if (dailyFrequency) {
		return dailyFrequency
	}

	// one transaction writes the topic and everything hanging off it
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxTopicFindings } = payload
	// the deduped invite emails, shared by the insert inside the transaction and the emails after it
	const inviteEmails = [...new Set(payload.inviteEmails)]
	// each invitee resolves to an account and passes their invite-access setting before anything writes
	const inviteeCheck = await checkTopicInvitees(userId, null, inviteEmails)
	if (inviteeCheck.status !== "ok") {
		return inviteeCheck
	}
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
				maxTopicFindings,
				isPodcastEnabled: payload.isPodcastEnabled,
			})
			.returning()
		if (!topic) {
			throw new Error("failed to create topic")
		}

		// save the first prompt version
		await savePromptVersion(transaction, { topicId: topic.id, prompt, userId, origin })

		// the owner subscribes to their own topic, so its deliveries reach them like any other subscriber
		await transaction.insert(subscriptions).values({ topicId: topic.id, subscriberUserId: userId })

		// insert the invites, each with the account its address resolved to
		if (inviteEmails.length > 0) {
			await transaction.insert(invites).values(
				inviteEmails.map((email) => ({
					topicId: topic.id,
					email,
					invitedUserId: inviteeCheck.invitedUserIdByEmail.get(email) ?? null,
					invitedByUserId: userId,
				})),
			)
		}

		// insert the new sources. a create payload never includes kept ids
		const newSources = payload.sources.flatMap((topicSource) => ("id" in topicSource ? [] : [topicSource]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((topicSource) => toNewSourceRow(topic.id, topicSource, podcastNames)))
		}

		// open the first scan as running, so the new topic page shows a scan already under way
		const [firstScan] = await transaction.insert(scans).values({ topicId: topic.id, ownerId: userId }).returning()
		return { topicId: topic.id, firstScan }
	})

	// screen the url Sources that this topic was created with, then start the first Scan,
	// or mark the first Scan failed if the owner's key budget is spent
	startFirstScan(topicId, firstScan, userId).catch((error) => {
		console.error(`could not start first scan for topic ${topicId}`, error)
		reportError(error, "first-scan", { topicId, userId })
	})

	// email the invitations without delaying the topic created response
	startInviteEmails({ id: topicId, name, ownerId: userId }, inviteEmails)

	// tell IndexNow about a public topic that was created
	notifyIndexNowOfTopicChange({ savedTopic: { id: topicId, name, visibility }, previousTopic: null })

	// track the topic creation event
	trackEvent("topic_created", userId, { ...analyticsProperties, topicId, origin })
	return { status: "created", id: topicId }
}

/**
 * Applies the edit modal's saved fields and reconciles the invitee and source lists. owner or admin only.
 */
export async function updateTopic(
	userId: string,
	topicId: string,
	payload: UpdateTopicPayload,
	analyticsProperties: AnalyticsProperties,
): Promise<UpdateTopicResult> {
	// a topic the user cannot see reads as a missing one, so a private topic's existence stays hidden
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
		return { status: "missing" }
	}
	if (!(await isAllowed(userId, "topic:edit", topic))) {
		return { status: "forbidden" }
	}

	// an edit moving the topic onto a daily frequency takes a slot from the owner who funds its scans
	const dailyFrequency = await authorizeNewDailyTopic(topic.ownerId, payload, topic.frequency)
	if (dailyFrequency) {
		return dailyFrequency
	}

	// one transaction covers the fields and both reconciled invitee and source lists
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxTopicFindings } = payload
	// only the owner manages invites, so a team editor's save leaves the invite list untouched
	const mayReconcileInvites = await isAllowed(userId, "topic:invite", topic)
	// the deduped invite emails, shared by the reconcile inside the transaction and the emails after it
	const inviteEmails = mayReconcileInvites ? [...new Set(payload.inviteEmails)] : []
	// each fresh invitee resolves to an account and passes their invite-access setting before anything writes
	const inviteeCheck = mayReconcileInvites
		? await checkTopicInvitees(userId, topicId, inviteEmails)
		: {
				status: "ok" as const,
				invitedUserIdByEmail: new Map<string, string | null>(),
				newInvites: [],
				reinvitedEmails: [],
			}
	if (inviteeCheck.status !== "ok") {
		return inviteeCheck
	}
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
				maxTopicFindings,
			})
			.where(eq(topics.id, topicId))

		// save a prompt version when the prompt changed
		await savePromptVersion(transaction, { topicId, prompt, userId, origin: "editor", previousPrompt: topic.prompt })

		// only a public topic can be featured, so changing the visibility from public drops it from the featured topics
		if (visibility !== "public") {
			await releaseFeatureOrder(topicId, transaction)
		}

		// drop the removed emails. only invites naming an address are reconciled, and a declined row stays for reputation
		if (mayReconcileInvites) {
			const emailInvites = and(eq(invites.topicId, topicId), isNotNull(invites.email), isNull(invites.declinedAt))
			const staleInviteFilter =
				inviteEmails.length > 0 ? and(emailInvites, notInArray(invites.email, inviteEmails)) : emailInvites
			await transaction.delete(invites).where(staleInviteFilter)
		}

		// an explicitly re-invited decliner becomes pending again: declinedAt clears and invitedAt moves to now
		if (inviteeCheck.reinvitedEmails.length > 0) {
			await transaction
				.update(invites)
				.set({ declinedAt: null, invitedAt: new Date() })
				.where(and(eq(invites.topicId, topicId), inArray(invites.email, inviteeCheck.reinvitedEmails)))
		}

		// insert the newly invited emails, each with the account its address resolved to
		if (inviteeCheck.newInvites.length > 0) {
			await transaction
				.insert(invites)
				.values(
					inviteeCheck.newInvites.map((email) => ({
						topicId,
						email,
						invitedUserId: inviteeCheck.invitedUserIdByEmail.get(email) ?? null,
						invitedByUserId: userId,
					})),
				)
				.onConflictDoNothing()
		}

		// reconcile sources: keep the rows the payload names by id, delete the rest, insert the ones without an id
		const keptSourceIds = payload.sources.flatMap((topicSource) => ("id" in topicSource ? [topicSource.id] : []))
		const staleSourceFilter =
			keptSourceIds.length > 0
				? and(eq(sources.topicId, topicId), notInArray(sources.id, keptSourceIds))
				: eq(sources.topicId, topicId)
		await transaction.delete(sources).where(staleSourceFilter)

		// insert the newly added sources. the flatMap narrows the union to the members with source kind and source config
		const newSources = payload.sources.flatMap((topicSource) => ("id" in topicSource ? [] : [topicSource]))
		if (newSources.length > 0) {
			await transaction
				.insert(sources)
				.values(newSources.map((topicSource) => toNewSourceRow(topicId, topicSource, podcastNames)))
		}
	})

	// screen whatever this edit added with llm-guard, now that the rows are committed
	startPendingSourceScreens(topicId)

	// tell IndexNow if the save made the topic public or changed its url
	notifyIndexNowOfTopicChange({ savedTopic: { id: topicId, name, visibility }, previousTopic: topic })

	// email only the newly added invites. a re-invited decliner counts as newly invited
	startInviteEmails({ id: topicId, name, ownerId: topic.ownerId }, [
		...inviteeCheck.newInvites,
		...inviteeCheck.reinvitedEmails,
	])

	// record who saved the topic. an admin may edit a topic they do not own so flag if it was not saved by the owner
	trackEvent("topic_updated", userId, { ...analyticsProperties, topicId, isTopicOwner: topic.ownerId === userId })
	return { status: "saved" }
}

/**
 * Deletes a topic and everything it includes. Only allowed by an owner or admin.
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

	// best-effort delete of the stored attachment objects before their rows cascade away, both the topic's own
	const attachmentRows = await db
		.select({ objectKey: attachments.objectKey })
		.from(attachments)
		.where(eq(attachments.topicId, topicId))
	await Promise.all(attachmentRows.map((attachmentRow) => deleteAttachment(attachmentRow.objectKey)))
	await deleteChatAttachments(topicId)

	// the chat room's shared files leave object storage too. a pending upload has no object yet
	const roomAttachmentRows = await db
		.select({ objectKey: chatRoomAttachments.objectKey })
		.from(chatRoomAttachments)
		.where(eq(chatRoomAttachments.topicId, topicId))
	await Promise.all(
		roomAttachmentRows.map((attachmentRow) =>
			attachmentRow.objectKey ? deleteAttachment(attachmentRow.objectKey) : undefined,
		),
	)

	// delete the podcast episodes' audio from object storage, with any chapter audio that a render left behind
	await deleteTopicPodcastEpisodeAudio(topicId)

	// the delete cascades to sources, findings, invites, and subscriptions.
	// a scan and a podcast episode keep their rows with a null topic
	await db.transaction(async (transaction) => {
		await releaseFeatureOrder(topicId, transaction)
		await transaction.delete(topics).where(eq(topics.id, topicId))
	})

	// a deleted public topic's url is gone, so notify IndexNow to drop it
	if (topic.visibility === "public") {
		void notifyIndexNow([`${appUrl()}${toTopicPath(topic)}`])
	}

	// record who deleted the topic. the row is gone, so this event is the only account of who deleted it
	trackEvent("topic_deleted", userId, { ...analyticsProperties, topicId, isTopicOwner: topic.ownerId === userId })
	return true
}

// the topic routes: create, source suggestions, read, update, and delete
export const topicsRoute = new Hono<AppEnv>()
	.post("/topics", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// create a topic for the current user within the topic limit and the daily topic limit
		const createTopicResult = await createTopic(userId, context.req.valid("json"), toAnalyticsProperties(context))
		if (createTopicResult.status === "created") {
			return context.json({ id: createTopicResult.id })
		}

		// each rejection is named: a rejecting invitee, a spent invite limit, or a topic quota
		if (createTopicResult.status === "inviteeRejected") {
			return context.json({ error: "invitee-not-accepting", email: createTopicResult.email }, 409)
		}
		if (createTopicResult.status === "inviteLimit") {
			return context.json({ error: "daily invite limit reached" }, 429)
		}
		// a full topic limit and a full daily topic limit both reject, but only the second can name its number
		return createTopicResult.status === "dailyFrequency"
			? context.json({ error: "daily topic limit reached", dailyTopicLimit: createTopicResult.limit }, 429)
			: context.json({ error: "quota exhausted" }, 429)
	})
	.post("/topics/suggest-sources", zValidator("json", suggestSourcesPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// the suggestion's model call bills to the user's own LiteLLM key, created first if the user has none
		const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId)

		// suggesting is not scanning, so it draws on its own daily limit instead of the scan quota
		if (!(await incrementDaySuggestionCount(userId))) {
			return context.json({ error: "daily suggestion limit reached" }, 429)
		}
		// propose sources from the topic's own text
		const { name, prompt, attachmentContext, excludeSources, limit } = context.req.valid("json")
		const suggestedSources = await suggestSources({
			name,
			prompt,
			attachmentContext,
			excludeSources,
			limit,
			litellmApiKey,
		})
		return context.json({ sources: suggestedSources })
	})
	.get("/topics/addable", async (context) => {
		// the topics a signed-in user may bring to a team, in the order the picker shows them
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		return context.json({ topics: await loadTeamTopicOptions(userId, context.req.query("excludeTeam")) })
	})
	.get("/topics/:id", zValidator("query", topicPageQuery), async (context) => {
		// the topic detail payload's traced loader, gated by visibility. a signed-out visitor may only view a public topic
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const loadTracedTopicPage = (): Promise<TopicResponse | null> =>
			traceRequestStage("topic_page.load", () => loadTopicPage(userId, topicId))

		// serve a poll reload from a short Redis cache per user and topic, and any other request from the database
		const isPoll = context.req.valid("query").poll === "1"
		const topicPage = isPoll
			? await cacheJson({
					key: `topic-page:${userId ?? "visitor"}:${topicId}`,
					ttlMs: TOPIC_PAGE_POLL_TTL_MS,
					load: loadTracedTopicPage,
				})
			: await loadTracedTopicPage()
		if (topicPage) {
			return context.json(topicPage)
		}
		// an invite topic responds with how it is gated
		const inviteTopic = await toInviteTopic(context.req.param("id"))
		return inviteTopic
			? context.json({ error: "forbidden", gatedVisibility: "invite", topicName: inviteTopic.name }, 403)
			: context.json({ error: "not found" }, 404)
	})
	.patch("/topics/:id", zValidator("json", updateTopicPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// save the edited topic's fields and reconcile the invitee and source lists. owner or admin only.
		const updateTopicResult = await updateTopic(
			userId,
			context.req.param("id"),
			context.req.valid("json"),
			toAnalyticsProperties(context),
		)
		if (updateTopicResult.status === "saved") {
			return context.json({ ok: true })
		}

		// a daily frequency past the plan's limit is a quota rejection
		if (updateTopicResult.status === "dailyFrequency") {
			return context.json({ error: "daily topic limit reached", dailyTopicLimit: updateTopicResult.limit }, 429)
		}
		// a rejected invitee is returned with its email, and a spent invite limit is returned with its error
		if (updateTopicResult.status === "inviteeRejected") {
			return context.json({ error: "invitee-not-accepting", email: updateTopicResult.email }, 409)
		}
		if (updateTopicResult.status === "inviteLimit") {
			return context.json({ error: "daily invite limit reached" }, 429)
		}
		// a topic the user cannot see reads as one that does not exist
		return updateTopicResult.status === "missing"
			? context.json({ error: "not found" }, 404)
			: context.json({ error: "forbidden" }, 403)
	})
	.delete("/topics/:id", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// delete the topic and everything attached to it. owner or admin only.
		const isTopicDeleted = await deleteTopic(userId, context.req.param("id"), toAnalyticsProperties(context))
		return isTopicDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
