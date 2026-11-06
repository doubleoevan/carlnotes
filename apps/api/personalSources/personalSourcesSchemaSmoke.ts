// actual PostgreSQL constraints reject cross-owner rows, duplicate identities, and plaintext persistence
import { db } from "@carlnotes/db"
import { readPersonalSourcesAllowance } from "@carlnotes/db/personalSourcesQuota"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import {
	personalSourceEntries,
	personalSourcesDailyCounts,
	personalSourcesDeliveries,
	personalSourcesEmailConfirmations,
	personalSourcesEmailReplies,
	topicPersonalSourceContexts,
} from "@carlnotes/db/schema/personalSources"
import { sources, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { eq } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Exercises the database constraints themselves, without relying on application validation.
 */
export async function checkPersonalSourcesSchema(): Promise<void> {
	const owner = await seedPersonalSourcesTopic("constraints")
	const other = await seedPersonalSourcesTopic("constraints-other")
	const result = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(owner, "constraints"))
	if (result.status !== "accepted") {
		throw new Error("Constraint fixture was not accepted")
	}
	const [entry] = await db.select().from(personalSourceEntries).where(eq(personalSourceEntries.id, result.entryId))
	if (!entry) {
		throw new Error("Missing constraint entry")
	}
	const { id: _entryId, ...entryColumns } = entry
	checkPersonalSources(
		"entry Source and Topic must agree",
		(await rejectedCode(() => db.insert(personalSourceEntries).values({ ...entryColumns, topicId: other.topicId }))) ===
			"23503",
	)
	checkPersonalSources(
		"entry sender must have their own Topic context",
		(await rejectedCode(() => db.insert(personalSourceEntries).values({ ...entryColumns, userId: other.userId }))) ===
			"23503",
	)
	checkPersonalSources(
		"old encrypted sends have no retention deadline",
		(await rejectedCode(() =>
			db.insert(personalSourceEntries).values({ ...entryColumns, receivedAt: new Date(0) }),
		)) === null,
	)

	checkPersonalSources(
		"plaintext entry persistence fails",
		(await rejectedCode(() =>
			db.insert(personalSourceEntries).values({ ...entryColumns, encryptedPayload: "not ciphertext" }),
		)) === "23514",
	)
	checkPersonalSources(
		"plaintext derived context persistence fails",
		(await rejectedCode(() =>
			db
				.update(topicPersonalSourceContexts)
				.set({ encryptedContext: "not ciphertext" })
				.where(eq(topicPersonalSourceContexts.topicId, owner.topicId)),
		)) === "23514",
	)
	checkPersonalSources(
		"Topic ownership transfers without transferring private entries",
		(await rejectedCode(() => db.update(topics).set({ ownerId: other.userId }).where(eq(topics.id, owner.topicId)))) ===
			null,
	)
	checkPersonalSources(
		"concrete Source identity is unique within a Topic",
		(await rejectedCode(() =>
			db.insert(sources).values({
				topicId: owner.topicId,
				kind: "ai_agent",
				config: {},
				personalSourcesUserId: owner.userId,
				personalSourcesIdentity: "oauth:agent-a",
			}),
		)) === "23505",
	)
	const [delivery] = await db
		.select()
		.from(personalSourcesDeliveries)
		.where(eq(personalSourcesDeliveries.entryId, result.entryId))
	if (!delivery) {
		throw new Error("Missing delivery fixture")
	}
	const { id: _deliveryId, ...deliveryColumns } = delivery
	checkPersonalSources(
		"delivery retry identity is unique",
		(await rejectedCode(() => db.insert(personalSourcesDeliveries).values(deliveryColumns))) === "23505",
	)
}

/**
 * Checks transaction rollback and UTC rollover without touching another account's counters.
 */
export async function checkPersonalSourcesConfirmationRollback(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("rollback", "free")
	const allowance = await readPersonalSourcesAllowance({ userId: topic.userId })
	const previousDay = new Date(Date.parse(`${allowance.day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
	await db
		.insert(personalSourcesDailyCounts)
		.values({ userId: topic.userId, day: previousDay, kind: "send", acceptedCount: 5 })
	checkPersonalSources(
		"the previous UTC day's quota does not consume today's pool",
		(await readPersonalSourcesAllowance({ userId: topic.userId })).isAvailable,
	)
	const invalidConfirmation = { ...personalSourcesSmokeDelivery(topic, "rollback"), omittedLinkCount: -1 }
	checkPersonalSources(
		"a persistence constraint failure rolls back acceptance",
		(await rejectedCode(() => receivePersonalSourceEntry(invalidConfirmation))) === "23514",
	)
	checkPersonalSources(
		"failed persistence leaves no Source or activation",
		(await db.select().from(sources).where(eq(sources.topicId, topic.topicId))).length === 0 &&
			(
				await db
					.select()
					.from(topicPersonalSourceContexts)
					.where(eq(topicPersonalSourceContexts.topicId, topic.topicId))
			).length === 0,
	)
	checkPersonalSources(
		"failed persistence consumes no accepted allowance",
		(
			await db.select().from(personalSourcesDailyCounts).where(eq(personalSourcesDailyCounts.userId, topic.userId))
		).every((counter) => counter.day === previousDay),
	)
}

/**
 * Proves parent deletion erases private content while preserving delivery replay protection.
 */
export async function checkPersonalSourcesParentDeletion(): Promise<void> {
	for (const parent of ["topic", "account"] as const) {
		const topic = await seedPersonalSourcesTopic(`delete-${parent}`)
		const result = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, "parent"))
		if (result.status !== "accepted") {
			throw new Error("Deletion fixture was not accepted")
		}
		// give the entry an email confirmation
		const [confirmation] = await db
			.insert(personalSourcesEmailConfirmations)
			.values({ userId: topic.userId, emailId: `${topic.topicId}-email`, outcome: "filed" })
			.returning({ id: personalSourcesEmailConfirmations.id })
		if (!confirmation) {
			throw new Error("Missing email deletion confirmation")
		}
		await db.insert(personalSourcesEmailReplies).values({
			confirmationId: confirmation.id,
			userId: topic.userId,
			entryId: result.entryId,
			encryptedPayload: encryptPrivateText("synthetic-reply"),
		})

		if (parent === "topic") {
			await db.delete(topics).where(eq(topics.id, topic.topicId))
		} else {
			await db.delete(users).where(eq(users.id, topic.userId))
		}
		checkPersonalSources(
			`${parent} deletion cascades private entries and reply snapshots but keeps replay identity`,
			(await db.select().from(personalSourceEntries).where(eq(personalSourceEntries.id, result.entryId))).length ===
				0 &&
				(
					await db
						.select()
						.from(personalSourcesEmailReplies)
						.where(eq(personalSourcesEmailReplies.confirmationId, confirmation.id))
				).length === 0 &&
				// the email confirmation stays as the replay identity
				(
					await db
						.select()
						.from(personalSourcesEmailConfirmations)
						.where(eq(personalSourcesEmailConfirmations.id, confirmation.id))
				).length === 1,
		)
		await db.delete(personalSourcesEmailConfirmations).where(eq(personalSourcesEmailConfirmations.id, confirmation.id))

		checkPersonalSources(
			`${parent} deletion cannot be undone by a confirmation retry`,
			(await receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, "parent"))).status !== "accepted",
		)
	}
}

// each statement's failure is isolated by its own transaction, and only its SQLSTATE is inspected
async function rejectedCode(write: () => Promise<unknown>): Promise<string | null> {
	try {
		await write()
		return null
	} catch (error) {
		const cause = error instanceof Error && error.cause ? error.cause : error
		return (cause as { code?: string } | null)?.code ?? "unknown"
	}
}
