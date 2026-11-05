import { PERSONAL_SOURCES_DAILY_SEND_LIMIT } from "@carlnotes/contracts/personalSources"
import { db } from "@carlnotes/db"
import { readPersonalSourcesAllowance } from "@carlnotes/db/personalSourcesQuota"
import { receivePersonalSourcesSend } from "@carlnotes/db/personalSourcesSend"
import { personalSourceEntries, personalSourcesDailyCounts } from "@carlnotes/db/schema/personalSources"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { count, eq, sql } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/** Checks shared email quota, concurrent Scan locks, and atomic multi-Topic filing. */
export async function checkPersonalSourcesEmailFiling(): Promise<void> {
	await checkEmailQuotaPersistence()
	await checkEmailDuringScan()
	await checkEmailLargeBatch()
}

// an open Scan holds foreign-key references to both the Topic and the sender
async function checkEmailDuringScan(): Promise<void> {
	const owner = await seedPersonalSourcesTopic("email-during-scan")
	await db.transaction(async (scanTransaction) => {
		// keep the Scan's references locked while a separate connection files the email
		await scanTransaction.insert(scans).values({ topicId: owner.topicId, ownerId: owner.userId, status: "running" })
		const receipt = await db.transaction(async (filingTransaction) => {
			// fail promptly if receipt ever requests an exclusive key lock again
			await filingTransaction.execute(sql`set local lock_timeout = '3s'`)
			return receivePersonalSourcesSend(
				{
					...personalSourcesSmokeDelivery(owner, "email-during-scan"),
					topicIds: [owner.topicId],
					origin: "email",
					senderIdentity: "email",
					config: {},
				},
				filingTransaction,
			)
		})
		checkPersonalSources("email files while a Scan references its Topic and sender", receipt.status === "accepted")
	})
}

// existing AI and email counts share the same locked reservation, even across multiple destinations
async function checkEmailQuotaPersistence(): Promise<void> {
	// Plus receives email and retains both origin rows from before the shared ceiling
	const topic = await seedPersonalSourcesTopic("email-quota", "plus")
	const secondId = `${topic.topicId}-second`
	await db.insert(topics).values({
		id: secondId,
		ownerId: topic.userId,
		name: "Second email destination",
		prompt: "Coffee equipment",
		visibility: "public",
	})
	const topicIds = [topic.topicId, secondId]
	const allowance = await readPersonalSourcesAllowance({ userId: topic.userId })
	await db.insert(personalSourcesDailyCounts).values([
		{ userId: topic.userId, day: allowance.day, kind: "send", acceptedCount: 100 },
		{ userId: topic.userId, day: allowance.day, kind: "email", acceptedCount: PERSONAL_SOURCES_DAILY_SEND_LIMIT - 102 },
	])
	const emailDelivery = {
		...personalSourcesSmokeDelivery(topic, "email-accepted"),
		origin: "email" as const,
		topicIds,
		senderIdentity: "email",
		config: {},
	}
	checkPersonalSources(
		"Plus accepts email with existing AI and email usage",
		(await receivePersonalSourcesSend(emailDelivery)).status === "accepted",
	)

	// concurrent arrivals in either channel compete for the final shared slot
	const deliveries = Array.from({ length: 4 }, (_, i) =>
		i % 2 === 0
			? { ...emailDelivery, requestId: `email-race-${i}` }
			: { ...personalSourcesSmokeDelivery(topic, `send-race-${i}`), topicIds },
	)
	const received = await Promise.all(deliveries.map((delivery) => receivePersonalSourcesSend(delivery)))
	checkPersonalSources(
		"mixed AI and email arrivals accept exactly one final send at the shared 200 ceiling",
		received.filter(({ status }) => status === "accepted").length === 1 &&
			received.filter(({ status }) => status === "quota").length === 3,
	)
	checkPersonalSources(
		"the shared allowance is exhausted",
		!(await readPersonalSourcesAllowance({ userId: topic.userId })).isAvailable,
	)
	checkPersonalSources(
		"accepted email retry does not consume quota again",
		(await receivePersonalSourcesSend(emailDelivery)).status === "accepted",
	)

	// each delivery stores both Topic copies but increments its origin only once
	const [entries] = await db
		.select({ count: count() })
		.from(personalSourceEntries)
		.where(eq(personalSourceEntries.userId, topic.userId))
	const counts = await db
		.select()
		.from(personalSourcesDailyCounts)
		.where(eq(personalSourcesDailyCounts.userId, topic.userId))
	checkPersonalSources("two accepted sends create four entries across both Topics", entries?.count === 4)
	checkPersonalSources(
		"existing origin rows total 200 without resetting usage",
		counts.length === 2 &&
			counts.reduce((total, row) => total + row.acceptedCount, 0) === PERSONAL_SOURCES_DAILY_SEND_LIMIT,
	)
}

// automatic routing files every clear destination, including more than a card can select
async function checkEmailLargeBatch(): Promise<void> {
	// seed a complete editable set under one disposable account
	const owner = await seedPersonalSourcesTopic("email-large-batch")
	const additionalIds = Array.from({ length: 20 }, (_, index) => `${owner.topicId}-${index}`)
	await db.insert(topics).values(
		additionalIds.map((id) => ({
			id,
			ownerId: owner.userId,
			name: "Email destination",
			prompt: "Coffee equipment",
			visibility: "public" as const,
		})),
	)
	const topicIds = [owner.topicId, ...additionalIds]
	const delivery = {
		...personalSourcesSmokeDelivery(owner, "email-many"),
		topicIds,
		origin: "email" as const,
		senderIdentity: "email",
		config: {},
	}

	// an inner refusal must roll back its entries while the outer transaction remains usable
	await db.transaction(async (transaction) => {
		const refused = await receivePersonalSourcesSend(
			{ ...delivery, topicIds: [...topicIds, "zz-missing"] },
			transaction,
		)
		checkPersonalSources("nested email batch refuses a missing final Topic", refused.status === "not_found")
		const [entries] = await transaction
			.select({ count: count() })
			.from(personalSourceEntries)
			.where(eq(personalSourceEntries.userId, owner.userId))
		const [charges] = await transaction
			.select({ count: count() })
			.from(personalSourcesDailyCounts)
			.where(eq(personalSourcesDailyCounts.userId, owner.userId))
		checkPersonalSources(
			"savepoint rolls back every email entry and charge while keeping the outer transaction usable",
			entries?.count === 0 && charges?.count === 0,
		)
	})

	// a complete filing and its reordered replay share one accepted-email charge
	const accepted = await receivePersonalSourcesSend(delivery)
	const replay = await receivePersonalSourcesSend({ ...delivery, topicIds: [...topicIds].reverse() })
	checkPersonalSources(
		"email files every clear match beyond the MCP view selection limit",
		accepted.status === "accepted" && accepted.receipts?.length === 21,
	)
	checkPersonalSources(
		"large email replay returns the original complete filing",
		JSON.stringify(accepted) === JSON.stringify(replay),
	)
	const [usage] = await db
		.select()
		.from(personalSourcesDailyCounts)
		.where(eq(personalSourcesDailyCounts.userId, owner.userId))
	checkPersonalSources("twenty-one email destinations count once", usage?.acceptedCount === 1 && usage.kind === "email")
}
