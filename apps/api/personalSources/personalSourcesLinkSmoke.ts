// live queue fixtures cover leases, cross-Source outcomes, deletion, and deadline reads
import { db } from "@carlnotes/db"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import {
	claimPersonalSourcesLinks,
	considerPersonalSourcesLink,
	loadClaimedPersonalSourcesLinks,
} from "@carlnotes/db/personalSourcesLinkQueue"
import { countWaitingPersonalSourcesLinks, receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import {
	personalSourceEntries,
	personalSourcesLinks,
	topicPersonalSourceContexts,
} from "@carlnotes/db/schema/personalSources"
import { scans } from "@carlnotes/db/schema/scans"
import { users } from "@carlnotes/db/schema/users"
import { encryptPrivateText } from "@carlnotes/server/privateText"
import { and, eq, sql } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Exercises durable link claims and outcomes against disposable development rows.
 */
export async function checkPersonalSourcesLinkQueue(): Promise<void> {
	// two concrete Sources contribute the same canonical URL and keep one distinct waiting count
	const topic = await seedPersonalSourcesTopic("link-queue")
	const administrator = await seedPersonalSourcesTopic("link-queue-admin")
	await db.update(users).set({ role: "admin" }).where(eq(users.id, administrator.userId))
	const first = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, "queue-a", "queue-a"))
	const second = await receivePersonalSourceEntry(personalSourcesSmokeDelivery(topic, "queue-b", "queue-b"))
	if (first.status !== "accepted" || second.status !== "accepted") {
		throw new Error("Queue fixture was refused")
	}
	const entries = await db
		.select({ id: personalSourceEntries.id, sourceId: personalSourceEntries.sourceId })
		.from(personalSourceEntries)
		.where(eq(personalSourceEntries.topicId, topic.topicId))
	const [scanA, scanB] = await db
		.insert(scans)
		.values(
			[topic.userId, administrator.userId].map((ownerId) => ({
				topicId: topic.topicId,
				ownerId,
				status: "running" as const,
			})),
		)
		.returning({ id: scans.id })
	if (!scanA || !scanB || !entries[0] || !entries[1]) {
		throw new Error("Queue fixture rows missing")
	}
	checkPersonalSources(
		"duplicate Personal sources links count once",
		(await db.transaction((transaction) =>
			countWaitingPersonalSourcesLinks(transaction, { topicId: topic.topicId, userId: topic.userId }),
		)) === 1,
	)
	checkPersonalSources(
		"pending context leaves links queued",
		(await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanA.id })).length === 0,
	)
	await settleQueueContext(topic.topicId)
	for (const entry of entries) {
		await claimPersonalSourcesLinks({ sourceId: entry.sourceId, scanId: scanA.id })
	}
	// read each sender classification from encrypted payloads without changing public Resource data
	for (const [senderKind, expectedBonus] of [
		["agent", 0.1],
		["import", 0.1],
		["personal_forward", 0.1],
		["newsletter", 0.05],
		["unknown", 0.05],
	] as const) {
		const payload = { ...personalSourcesSmokeDelivery(topic, "classification").payload, senderKind }
		await db
			.update(personalSourceEntries)
			.set({ encryptedPayload: encryptPrivateText(JSON.stringify(payload)) })
			.where(eq(personalSourceEntries.id, entries[0].id))
		const candidates = await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanA.id })
		checkPersonalSources(
			`${senderKind} contribution has the expected personal-source score bonus`,
			candidates[0]?.personalSourceScoreBonus === expectedBonus,
		)
	}

	checkPersonalSources(
		"live leases prevent another Scan from taking unfinished links",
		(await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanB.id })).length === 0,
	)
	checkPersonalSources(
		"same-Scan retry reloads its claims",
		(await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanA.id })).length === 1,
	)

	// worker death leaves unfinished work recoverable, and a completed outcome settles every duplicate
	await db
		.update(personalSourcesLinks)
		.set({ claimExpiresAt: sql`clock_timestamp() - interval '1 second'` })
		.where(eq(personalSourcesLinks.scanId, scanA.id))
	checkPersonalSources(
		"a non-owner admin Scan recovers unfinished Personal sources links",
		(await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanB.id })).length === 1,
	)
	await db.update(scans).set({ status: "failed" }).where(eq(scans.id, scanA.id))
	checkPersonalSources(
		"stopped or failed Scan releases unfinished links",
		(await claimPersonalSourcesLinks({ sourceId: entries[1].sourceId, scanId: scanB.id })).length === 1,
	)
	await considerPersonalSourcesLink({ topicId: topic.topicId, scanId: scanB.id, url: "https://example.com/coffee" })
	checkPersonalSources(
		"one durable outcome settles cross-Source duplicates",
		(await db.transaction((transaction) =>
			countWaitingPersonalSourcesLinks(transaction, { topicId: topic.topicId, userId: topic.userId }),
		)) === 0,
	)
	checkPersonalSources(
		"considered links never return on an ingester retry",
		(await claimPersonalSourcesLinks({ sourceId: entries[0].sourceId, scanId: scanB.id })).length === 0,
	)

	// deletion during a claim removes both candidate and provenance without reviving delivery
	const receipt = personalSourcesSmokeDelivery(topic, "delete-claim", "queue-a")
	receipt.payload.links = ["https://example.com/deletion"]
	receipt.payload.senderKind = "personal_forward"
	const accepted = await receivePersonalSourceEntry(receipt)
	if (accepted.status !== "accepted") {
		throw new Error("Deletion queue fixture was refused")
	}
	const [entry] = await db
		.select({ sourceId: personalSourceEntries.sourceId })
		.from(personalSourceEntries)
		.where(eq(personalSourceEntries.id, accepted.entryId))
	if (!entry) {
		throw new Error("Deletion queue fixture missing")
	}
	await settleQueueContext(topic.topicId)
	await db.update(users).set({ role: "user" }).where(eq(users.id, administrator.userId))
	checkPersonalSources(
		"a Scan whose non-owner initiator lost admin authority cannot claim links",
		(await claimPersonalSourcesLinks({ sourceId: entry.sourceId, scanId: scanB.id })).length === 0,
	)
	await db.update(users).set({ role: "admin" }).where(eq(users.id, administrator.userId))
	await claimPersonalSourcesLinks({ sourceId: entry.sourceId, scanId: scanB.id })
	checkPersonalSources(
		"personal-forward provenance is Topic-local",
		(await loadClaimedPersonalSourcesLinks({ topicId: topic.topicId, scanId: scanB.id }))[0]
			?.personalSourceScoreBonus === 0.1,
	)
	await deletePersonalSourceEntry({ ...topic, entryId: accepted.entryId })
	await considerPersonalSourcesLink({ topicId: topic.topicId, scanId: scanB.id, url: receipt.payload.links[0] ?? "" })
	checkPersonalSources(
		"deletion during a claim removes its candidate and provenance",
		(await loadClaimedPersonalSourcesLinks({ topicId: topic.topicId, scanId: scanB.id })).length === 0,
	)

	// old retained entries still contribute queued links
	const retainedReceipt = personalSourcesSmokeDelivery(topic, "retained-claim", "queue-a")
	retainedReceipt.payload.links = ["https://example.com/retained"]
	const retained = await receivePersonalSourceEntry(retainedReceipt)
	if (retained.status !== "accepted") {
		throw new Error("Retention queue fixture was refused")
	}
	await settleQueueContext(topic.topicId)
	await claimPersonalSourcesLinks({ sourceId: entry.sourceId, scanId: scanB.id })
	await db
		.update(personalSourceEntries)
		.set({ receivedAt: sql`now() - interval '365 days'` })
		.where(and(eq(personalSourceEntries.id, retained.entryId), eq(personalSourceEntries.topicId, topic.topicId)))
	checkPersonalSources(
		"old retained claims remain available until explicit deletion",
		(await loadClaimedPersonalSourcesLinks({ topicId: topic.topicId, scanId: scanB.id })).length === 1,
	)
}

// queue-only smoke uses a synthetic settled summary and makes no model call
async function settleQueueContext(topicId: string): Promise<void> {
	await db
		.update(topicPersonalSourceContexts)
		.set({
			state: "ready",
			processedRevision: sql`${topicPersonalSourceContexts.revision}`,
			encryptedContext: encryptPrivateText("Synthetic coffee context"),
		})
		.where(eq(topicPersonalSourceContexts.topicId, topicId))
}
