// saving a topic: the create with its default Sources and invites, and the update with its changed-field events

import type { TopicDraft, UpdateTopicPayload } from "@carlnotes/contracts/topicPayloads"
import { type DbTransaction, db } from "@carlnotes/db"
import { assertPersonalSourcesConverted, lockPersonalSourcesTopic } from "@carlnotes/db/personalSourcesLocks"
import { invites } from "@carlnotes/db/schema/invites"
import { scans } from "@carlnotes/db/schema/scans"
import { sources, subscriptions, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { addViewer } from "@carlnotes/db/viewerCounts"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { toUserViewerElement } from "@carlnotes/server/viewerElements"
import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm"
import { isAllowed, topicsRemaining } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { startInviteEmails } from "../invite/emails"
import { checkTopicInvitees } from "../invite/userInvites"
import { releaseFeatureOrder } from "./featuring"
import { clearVisitorTopicCaches } from "./feedCaches"
import { type PromptVersionOrigin, savePromptVersion } from "./promptVersions"
import {
	attachDraftTeam,
	authorizeNewDailyTopic,
	type DailyFrequencyRejection,
	startFirstScan,
	startPendingSourceScreens,
	toNewSourceRow,
	toPodcastNames,
} from "./saveHelpers"
import { type ObjectionableRejection, type TermsOutdatedRejection, toTopicSaveRejection } from "./saveTopicGate"
import { reconcileTopicSources } from "./saveTopicSources"
import {
	claimTopicDraftConfirmation,
	readUsedTopicDraft,
	type TopicDraftConfirmationRecord,
} from "./topicDraftConfirmationRecords"

import { notifyIndexNowOfTopicChange, saveTopicVectorsOnVisibilityChange } from "./topicIndexing"

export { saveTopicVectorsReportingFailure } from "./topicIndexing"
export { notifyIndexNowOfTopicChange, saveTopicVectorsOnVisibilityChange }

// both creation and editing enforce the same frequency, invitation, and content checks
type TopicSaveRejection = DailyFrequencyRejection | InviteeRejection | ObjectionableRejection | TermsOutdatedRejection

// the outcome of a topic creation request
type CreateTopicResult =
	| { status: "created"; id: string; team?: Awaited<ReturnType<typeof attachDraftTeam>> | null }
	| { status: "confirmationUsed" }
	| { status: "quota" }
	| TopicSaveRejection

// the outcome of a topic edit
export type UpdateTopicResult =
	| { status: "saved" }
	| { status: "forbidden" }
	| { status: "missing" }
	| TopicSaveRejection

// a save stopped by its invitee list: a recipient who is not accepting invites, or the sender's invite limit
type InviteeRejection = { status: "inviteeRejected"; email: string } | { status: "inviteLimit" }

// the editor's topic fields, and whether the new topic's podcast is on. left out, the podcast starts on
type CreateTopicPayload = UpdateTopicPayload & Pick<TopicDraft, "isPodcastEnabled"> & { draftTeamId?: string }

/**
 * Creates a topic for the user with its invites and sources, enforcing the topic limit.
 */
export async function createTopic(
	userId: string,
	payload: CreateTopicPayload,
	analyticsProperties: AnalyticsProperties,
	// where the first prompt version is saved from. the editor unless a topic tool says otherwise
	origin: PromptVersionOrigin = "editor",
	confirmationRecord?: TopicDraftConfirmationRecord,
): Promise<CreateTopicResult> {
	// a successful retry returns its owned Topic even after the original creation filled the owner's quota
	const existing = confirmationRecord && (await readUsedTopicDraft(db, userId, confirmationRecord))
	if (existing) {
		return existing
	}
	// enforce the topic limit and user role before writing anything.
	if (!(await isAllowed(userId, "topic:create"))) {
		return (confirmationRecord && (await readUsedTopicDraft(db, userId, confirmationRecord))) || { status: "quota" }
	}

	// check if a topic asking for a daily frequency can fit under the plan's daily topic limit
	const dailyFrequency = await authorizeNewDailyTopic(userId, payload)
	if (dailyFrequency) {
		return dailyFrequency
	}

	// a topic other people read is checked before anything is written
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxTopicFindings } = payload
	const topicSaveRejection = await toTopicSaveRejection({
		name,
		prompt,
		tags,
		visibility,
		subjectId: userId,
		userId,
	})
	if (topicSaveRejection) {
		return topicSaveRejection
	}

	// one transaction writes the topic and everything hanging off it
	// the deduped invite emails, shared by the insert inside the transaction and the emails after it
	const inviteEmails = [...new Set(payload.inviteEmails)]
	// each invitee resolves to an account and passes their invite-access setting before anything writes
	const inviteeCheck = await checkTopicInvitees(userId, null, inviteEmails)
	if (inviteeCheck.status !== "ok") {
		return inviteeCheck
	}
	const podcastNames = await toPodcastNames(payload.sources)
	const created = await db.transaction(async (transaction) => {
		// authorize distinct drafts against the same owner slot, and replay identical confirmations before checking limits
		const rejection = await guardTopicCreation(transaction, userId, payload, confirmationRecord)
		if (rejection) {
			return rejection
		}
		// consume the preview atomically with every write. Only one caller starts the new Topic's first Scan.
		const id = crypto.randomUUID()
		const used = confirmationRecord && (await claimTopicDraftConfirmation(transaction, userId, confirmationRecord, id))
		if (used) {
			return used
		}
		// insert the topic row owned by the user
		const [topic] = await transaction
			.insert(topics)
			.values({
				id,
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
		const team = payload.draftTeamId ? await attachDraftTeam(transaction, userId, payload.draftTeamId, topic.id) : null
		return { topicId: topic.id, firstScan, team }
	})
	if ("status" in created) {
		return created
	}
	const { topicId, firstScan } = created

	// screen the url Sources that this topic was created with, then start the first Scan,
	// or mark the first Scan failed if the owner's key budget is spent
	startFirstScan(topicId, firstScan, userId).catch((error) => {
		console.error(`could not start first scan for topic ${topicId}`, error)
		reportError(error, "first-scan", { topicId, userId })
	})

	// count the owner as the topic's first viewer
	void addViewer({ kind: "topic", id: topicId }, toUserViewerElement(userId))

	// email the invitations without delaying the topic created response
	startInviteEmails({ id: topicId, name, ownerId: userId }, inviteEmails)

	// tell IndexNow about a public topic that was created
	notifyIndexNowOfTopicChange({ savedTopic: { id: topicId, name, visibility }, previousTopic: null })

	// track the topic creation event
	trackEvent("topic_created", userId, { ...analyticsProperties, topicId, origin })
	return { status: "created", id: topicId, team: created.team }
}

// every creator uses this lock, including browser and signed draft requests racing for the final plan slot
async function guardTopicCreation(
	transaction: DbTransaction,
	userId: string,
	payload: CreateTopicPayload,
	confirmationRecord?: TopicDraftConfirmationRecord,
): Promise<CreateTopicResult | null> {
	await transaction.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("no key update")
	// a retried confirmation returns the Topic it already created
	const existing = confirmationRecord && (await readUsedTopicDraft(transaction, userId, confirmationRecord))
	if (existing) {
		return existing
	}
	// a new Topic needs a Topic left on the plan
	if ((await topicsRemaining(userId, transaction)) <= 0) {
		return { status: "quota" }
	}
	return authorizeNewDailyTopic(userId, payload, undefined, transaction)
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

	// a topic other people read is checked before anything is written, including the edit that opens a private one
	const { name, prompt, tags, frequency, scheduledTime, scheduledDayOfWeek, visibility, maxTopicFindings } = payload
	const topicSaveRejection = await toTopicSaveRejection({
		name,
		prompt,
		tags,
		visibility,
		subjectId: topicId,
		userId,
		isTextChanged:
			topic.visibility === "private" ||
			name !== topic.name ||
			prompt !== topic.prompt ||
			tags.join("\n") !== topic.tags.join("\n"),
	})
	if (topicSaveRejection) {
		return topicSaveRejection
	}

	// one transaction covers the fields and both reconciled invitee and source lists
	const newSources = payload.sources.flatMap((topicSource) => ("id" in topicSource ? [] : [topicSource]))
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
	// whether the visibility change released the topic's feature order inside the transaction
	let isFeatureOrderReleased = false
	const removedSourceKinds = await db.transaction(async (transaction) => {
		// serialize confirmation with publication and invitation reconciliation
		await lockPersonalSourcesTopic(transaction, topicId)
		if (visibility !== "private" || inviteeCheck.newInvites.length > 0 || inviteeCheck.reinvitedEmails.length > 0) {
			await assertPersonalSourcesConverted(transaction, topicId)
		}
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
			isFeatureOrderReleased = await releaseFeatureOrder(topicId, transaction)
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

		return reconcileTopicSources({ transaction, topicId, payloadSources: payload.sources, podcastNames })
	})

	// drop the topic's cached visitor copies
	await clearVisitorTopicCaches({ topicId, visibility, previousVisibility: topic.visibility, isFeatureOrderReleased })

	// check whatever url Sources this edit added, now that the rows are committed
	startPendingSourceScreens(topicId)

	// tell IndexNow if the save made the topic public or changed its url, and save its vectors again if its visibility
	// changed
	notifyIndexNowOfTopicChange({ savedTopic: { id: topicId, name, visibility }, previousTopic: topic })
	await saveTopicVectorsOnVisibilityChange({ topicId, visibility, previousVisibility: topic.visibility })

	// email only the newly added invites. a re-invited decliner counts as newly invited
	startInviteEmails({ id: topicId, name, ownerId: topic.ownerId }, [
		...inviteeCheck.newInvites,
		...inviteeCheck.reinvitedEmails,
	])

	// record who saved the topic, whether the owner saved it, and the names of the fields that changed
	const topicProperties = { ...analyticsProperties, topicId, isTopicPublic: visibility === "public" }
	trackEvent("topic_updated", userId, {
		...topicProperties,
		isTopicOwner: topic.ownerId === userId,
		changedFields: toChangedTopicFieldNames(topic, payload).join(","),
	})

	// report each source the save added and each one it removed, by its kind
	for (const newSource of newSources) {
		trackEvent("source_added", userId, { ...topicProperties, sourceType: newSource.sourceKind, origin: "editor" })
	}
	for (const removedSourceKind of removedSourceKinds) {
		trackEvent("source_removed", userId, { ...topicProperties, sourceType: removedSourceKind, origin: "editor" })
	}
	return { status: "saved" }
}

// the names of the payload's fields that differ from the row. the row's time has seconds the payload's does not
function toChangedTopicFieldNames(topic: typeof topics.$inferSelect, payload: UpdateTopicPayload): string[] {
	const payloadFields = {
		name: payload.name,
		prompt: payload.prompt,
		tags: payload.tags.join("\n"),
		frequency: payload.frequency,
		scheduledTime: payload.scheduledTime,
		scheduledDayOfWeek: payload.scheduledDayOfWeek,
		visibility: payload.visibility,
		maxTopicFindings: payload.maxTopicFindings,
	}
	const rowFields = { ...topic, tags: topic.tags.join("\n"), scheduledTime: topic.scheduledTime.slice(0, 5) }
	return Object.entries(payloadFields)
		.filter(([field, value]) => rowFields[field as keyof typeof payloadFields] !== value)
		.map(([field]) => field)
}
