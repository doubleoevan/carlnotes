// real database checks exercise manual forwarding metadata without contacting a mail provider
import { db } from "@carlnotes/db"
import {
	finishPersonalSourcesEmailConfirmation,
	isPersonalSourcesEmailSenderCurrent,
	loadPendingPersonalSourcesEmailIds,
	loadPersonalSourcesEmailChoices,
	loadPersonalSourcesEmailDestination,
	queuePersonalSourcesEmailEvent,
	retirePersonalSourcesEmailChoices,
	savePersonalSourcesEmailChoices,
	savePersonalSourcesEmailReply,
	startPersonalSourcesEmailAttempt,
	toPersonalSourcesSenderDigest,
} from "@carlnotes/db/personalSourcesEmailConfirmations"
import { loadPersonalSourcesEmailSetup } from "@carlnotes/db/personalSourcesEmailSetup"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import {
	personalSourceEntries,
	personalSourcesEmailChoices,
	personalSourcesEmailConfirmations,
	personalSourcesEmailReplies,
} from "@carlnotes/db/schema/personalSources"
import { sources } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { readPersonalSourcesEmailAddress } from "@carlnotes/server/personalSourcesSettings"
import { decryptPrivateText } from "@carlnotes/server/privateText"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { count, eq, sql } from "drizzle-orm"
import { checkPersonalSourcesEmailFiling } from "./personalSourcesEmailFilingSmoke"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Exercises durable shared-address handoff, reply cleanup, and the shared accepted-send ceiling.
 */
export async function checkPersonalSourcesEmailPersistence(): Promise<void> {
	const restoreSettings = saveEnvSettings(["PERSONAL_SOURCES_RECEIVING_ENABLED", "PERSONAL_SOURCES_EMAIL_ENABLED"])
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	Bun.env.PERSONAL_SOURCES_EMAIL_ENABLED = "true"
	// run the email checks
	try {
		await checkEmailConfirmationLifecycle()
		await checkUnregisteredEmailConfirmation()
		await checkEmailChoiceMetadata()
		await checkPersonalSourcesEmailFiling()
	} finally {
		// restore the settings even if a check throws
		restoreSettings()
	}
}

// an unregistered address gets one guidance confirmation, independent of any user account
async function checkUnregisteredEmailConfirmation(): Promise<void> {
	const emailId = crypto.randomUUID()
	const event = {
		type: "email.received" as const,
		data: { email_id: emailId, from: `${emailId}@carlnotes.test`, to: [readPersonalSourcesEmailAddress()] },
	}
	const [id] = await queuePersonalSourcesEmailEvent(event)
	if (!id) {
		throw new Error("Account guidance confirmation missing")
	}
	try {
		const destination = await loadPersonalSourcesEmailDestination(id)
		checkPersonalSources(
			"an unregistered sender queues only account guidance",
			destination?.owner === null &&
				destination.confirmation.outcome === "account_required" &&
				destination.reply === null,
		)
		await finishPersonalSourcesEmailConfirmation({ confirmationId: id, state: "replied" })
		checkPersonalSources(
			"an unregistered delivery cannot replay its reply",
			(await queuePersonalSourcesEmailEvent(event)).length === 0,
		)
	} finally {
		await db.delete(personalSourcesEmailConfirmations).where(eq(personalSourcesEmailConfirmations.id, id))
	}
}

// choice requests store encrypted Topic metadata and disappear with their sender
async function checkEmailChoiceMetadata(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("email-choices")
	const from = `${topic.userId}@carlnotes.test`
	const [confirmationId] = await queuePersonalSourcesEmailEvent({
		type: "email.received",
		data: { email_id: crypto.randomUUID(), from, to: [readPersonalSourcesEmailAddress()] },
	})
	if (!confirmationId) {
		throw new Error("Choice confirmation missing")
	}
	const choices = [{ id: topic.topicId, name: "Coffee", url: `https://carlnotes.com/topics/${topic.topicId}` }]
	await db.transaction((transaction) =>
		savePersonalSourcesEmailChoices(transaction, {
			confirmationId,
			userId: topic.userId,
			topics: choices,
			messageId: "<original@carlnotes.test>",
		}),
	)
	const [stored] = await db
		.select()
		.from(personalSourcesEmailChoices)
		.where(eq(personalSourcesEmailChoices.confirmationId, confirmationId))
	checkPersonalSources(
		"choice storage contains only ordered encrypted Topic IDs",
		!!stored &&
			JSON.stringify(JSON.parse(decryptPrivateText(stored.encryptedTopics) ?? "null")) ===
				JSON.stringify([topic.topicId]),
	)
	const owned = await loadPersonalSourcesEmailChoices({
		requestId: confirmationId,
		userId: topic.userId,
		senderDigest: toPersonalSourcesSenderDigest(from),
	})
	checkPersonalSources("sender can resolve their original provider reference", owned?.topics[0]?.id === topic.topicId)
	// a late retry cannot undo a delivered clarification
	await finishPersonalSourcesEmailConfirmation({ confirmationId, state: "replied" })
	await finishPersonalSourcesEmailConfirmation({ confirmationId, state: "refused" })
	checkPersonalSources(
		"duplicate completion preserves the delivered choices",
		!!(await loadPersonalSourcesEmailChoices({
			requestId: confirmationId,
			userId: topic.userId,
			senderDigest: toPersonalSourcesSenderDigest(from),
		})),
	)
	checkPersonalSources(
		"foreign account cannot read or select choices",
		(await loadPersonalSourcesEmailChoices({
			requestId: confirmationId,
			userId: "foreign",
			senderDigest: toPersonalSourcesSenderDigest(from),
		})) === null,
	)
	checkPersonalSources(
		"changed account email invalidates choices",
		(await loadPersonalSourcesEmailChoices({
			requestId: confirmationId,
			userId: topic.userId,
			senderDigest: "changed",
		})) === null,
	)
	// after selection only the provider replay identity remains
	await db.transaction((transaction) => retirePersonalSourcesEmailChoices(transaction, confirmationId))
	const [retired] = await db
		.select()
		.from(personalSourcesEmailConfirmations)
		.where(eq(personalSourcesEmailConfirmations.id, confirmationId))
	checkPersonalSources(
		"a completed choice releases its sender binding",
		retired?.state === "replied" && retired.senderDigest === null,
	)
	const [unanswered] = await queuePersonalSourcesEmailEvent({
		type: "email.received",
		data: { email_id: crypto.randomUUID(), from, to: [readPersonalSourcesEmailAddress()] },
	})
	if (!unanswered) {
		throw new Error("Unanswered choice fixture missing")
	}
	await db.transaction((transaction) =>
		savePersonalSourcesEmailChoices(transaction, {
			confirmationId: unanswered,
			userId: topic.userId,
			topics: choices,
			messageId: "<unanswered@carlnotes.test>",
		}),
	)
	await db.delete(users).where(eq(users.id, topic.userId))
	checkPersonalSources(
		"account deletion removes private Topic choices",
		(
			await db
				.select()
				.from(personalSourcesEmailChoices)
				.where(eq(personalSourcesEmailChoices.confirmationId, unanswered))
		).length === 0,
	)
}

// shared-address deduplication is independent of a Source's lifetime and never stores an unmatched body
async function checkEmailConfirmationLifecycle(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("shared-email")
	const from = `${topic.userId}@carlnotes.test`
	await db.insert(sources).values(
		Array.from({ length: 10 }, (_, i) => ({
			topicId: topic.topicId,
			kind: "url" as const,
			config: { url: `https://example.org/${i}` },
			status: "ready" as const,
		})),
	)
	checkPersonalSources(
		"email setup accepts the editor and refuses an unrelated account",
		(await loadPersonalSourcesEmailSetup(topic))?.canReceive === true &&
			(await loadPersonalSourcesEmailSetup({ ...topic, userId: "another-owner" })) === null,
	)
	const event = {
		type: "email.received" as const,
		data: { email_id: crypto.randomUUID(), from, to: [readPersonalSourcesEmailAddress()] },
	}
	checkPersonalSources(
		"other mailboxes are ignored before durable work",
		(await queuePersonalSourcesEmailEvent({ ...event, data: { ...event.data, to: ["other@inbox.carlnotes.com"] } }))
			.length === 0,
	)
	const ids = (await Promise.all([0, 1, 2].map(() => queuePersonalSourcesEmailEvent(event)))).flat()
	const id = ids[0]
	if (!id) {
		throw new Error("Shared email confirmation missing")
	}
	// three racing deliveries store one confirmation, and its work survives a restart
	checkPersonalSources("duplicate shared-address handoff stores one global confirmation", ids.length === 1)
	checkPersonalSources("acknowledged work survives restart", (await loadPendingPersonalSourcesEmailIds()).includes(id))
	checkPersonalSources(
		"confirmation binds current account email before provider fetch",
		(await loadPersonalSourcesEmailDestination(id))?.owner?.id === topic.userId,
	)
	await startPersonalSourcesEmailAttempt(id)
	const result = await db.transaction(async (transaction) => {
		const accepted = await receivePersonalSourceEntry(
			{
				...personalSourcesSmokeDelivery(topic, event.data.email_id),
				origin: "email",
				senderIdentity: "email",
				config: {},
				authorizeSender: (locked) =>
					isPersonalSourcesEmailSenderCurrent(locked, topic.userId, toPersonalSourcesSenderDigest(from)),
			},
			transaction,
		)
		if (accepted.status === "accepted") {
			await savePersonalSourcesEmailReply(
				transaction,
				id,
				{
					kind: "filed",
					topics: [{ name: accepted.topic.name, url: accepted.topic.url, entryId: accepted.entryId }],
				},
				accepted.entryId,
			)
		}
		return accepted
	})
	const [sourceCount] = await db.select({ count: count() }).from(sources).where(eq(sources.topicId, topic.topicId))
	checkPersonalSources(
		"first accepted email succeeds at ten fetched Sources",
		result.status === "accepted" && sourceCount?.count === 11,
	)
	const pending = await loadPersonalSourcesEmailDestination(id)
	checkPersonalSources(
		"filing and encrypted reply commit together",
		pending?.confirmation.outcome === "filed" && !!pending.reply?.encryptedPayload.startsWith("enc1:"),
	)
	await db
		.update(personalSourcesEmailConfirmations)
		.set({ nextAttemptAt: sql`clock_timestamp() - interval '1 second'` })
		.where(eq(personalSourcesEmailConfirmations.id, id))
	checkPersonalSources(
		"worker-loss processing leases become recoverable",
		(await loadPendingPersonalSourcesEmailIds()).includes(id),
	)
	if (result.status === "accepted") {
		await db.delete(personalSourceEntries).where(eq(personalSourceEntries.id, result.entryId))
	}
	checkPersonalSources(
		"item deletion immediately erases its private reply snapshot",
		(await db.select().from(personalSourcesEmailReplies).where(eq(personalSourcesEmailReplies.confirmationId, id)))
			.length === 0,
	)
	await finishPersonalSourcesEmailConfirmation({ confirmationId: id, state: "refused" })
	checkPersonalSources(
		"deleted item replay cannot recreate a delivery",
		(await queuePersonalSourcesEmailEvent(event)).length === 0,
	)

	// changes to the account mailbox revoke queued work before any reply can be redirected
	const [secondId] = await queuePersonalSourcesEmailEvent({
		...event,
		data: { ...event.data, email_id: crypto.randomUUID() },
	})
	await db.update(users).set({ emailVerified: false }).where(eq(users.id, topic.userId))
	checkPersonalSources(
		"loss of verification revokes a confirmation before filing or delivering a private reply",
		!!secondId &&
			(await loadPersonalSourcesEmailDestination(secondId)) === null &&
			!(await db.transaction((transaction) =>
				isPersonalSourcesEmailSenderCurrent(transaction, topic.userId, toPersonalSourcesSenderDigest(from)),
			)),
	)
	const [unverified] = await queuePersonalSourcesEmailEvent({
		...event,
		data: { ...event.data, email_id: crypto.randomUUID() },
	})
	if (!unverified) {
		throw new Error("Unverified address fixture missing")
	}
	const guidance = await loadPersonalSourcesEmailDestination(unverified)
	checkPersonalSources(
		"an unverified account cannot intercept authentic mail",
		guidance?.owner === null && guidance.confirmation.outcome === "account_required",
	)
	await db.delete(personalSourcesEmailConfirmations).where(eq(personalSourcesEmailConfirmations.id, unverified))
	await db
		.update(users)
		.set({ email: `changed-${from}`, emailVerified: true })
		.where(eq(users.id, topic.userId))
	checkPersonalSources(
		"account email changes invalidate pending work",
		!!secondId && (await loadPersonalSourcesEmailDestination(secondId)) === null,
	)
}
