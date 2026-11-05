// development persistence checks prove stale private summaries cannot survive deletion
import { PERSONAL_SOURCES_CONTEXT_INPUT_CHARS } from "@carlnotes/contracts/personalSources"
import { db } from "@carlnotes/db"
import {
	commitPersonalSourcesContext,
	failPersonalSourcesContext,
	loadPersonalSourcesContextSnapshot,
	type PersonalSourcesContextSnapshot,
	readPersonalSourcesContext,
	startPersonalSourcesSummarySpend,
} from "@carlnotes/db/personalSourcesContext"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { receivePersonalSourceEntry } from "@carlnotes/db/personalSourcesReceive"
import { monthlySpendDollars, toSpendCents } from "@carlnotes/db/quotas"
import {
	personalSourceEntries,
	personalSourcesSummarySpends,
	topicPersonalSourceContexts,
} from "@carlnotes/db/schema/personalSources"
import { topics } from "@carlnotes/db/schema/topics"
import { count, eq, sql } from "drizzle-orm"
import {
	checkPersonalSources,
	personalSourcesSmokeDelivery,
	seedPersonalSourcesTopic,
} from "./personalSourcesSmokeFixtures"

/**
 * Checks bounded allocation, stale-result rejection, encrypted commits, empty revisions, and owner billing.
 */
export async function checkPersonalSourcesContext(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("context")
	for (const label of ["first", "second"]) {
		const delivery = personalSourcesSmokeDelivery(topic, label)
		await receivePersonalSourceEntry({
			...delivery,
			origin: "import",
			config: { delivery: "import", provider: "transcript" },
			payload: { ...delivery.payload, senderKind: "import", text: `${label}-canary ${"bounded text ".repeat(10_000)}` },
		})
	}
	const snapshot = await loadPersonalSourcesContextSnapshot(topic.topicId)
	if (!snapshot) {
		throw new Error("Context smoke snapshot missing")
	}
	checkPersonalSources(
		"long imports get bounded fair excerpts and incomplete coverage",
		snapshot.entries.length + snapshot.topic.length <= PERSONAL_SOURCES_CONTEXT_INPUT_CHARS &&
			snapshot.hasIncompleteCoverage &&
			snapshot.entries.includes("first-canary") &&
			snapshot.entries.includes("second-canary"),
	)
	checkPersonalSources("missing model keys never fall back to a public key", snapshot.litellmApiKey === null)
	await checkTransferredOwner(snapshot)
	const committed = await commitPersonalSourcesContext({
		snapshot,
		context: "Synthetic private derived canary",
		cost: 0,
	})
	checkPersonalSources(
		"a current revision commits readable private context",
		committed &&
			(await readPersonalSourcesContext({ topicId: topic.topicId, userId: topic.userId })) ===
				"Synthetic private derived canary",
	)
	const [storedContext] = await db
		.select()
		.from(topicPersonalSourceContexts)
		.where(eq(topicPersonalSourceContexts.topicId, topic.topicId))
	checkPersonalSources(
		"derived context persists encrypted and settled revisions skip rewrites",
		Boolean(storedContext?.encryptedContext?.startsWith("enc1:")) &&
			(await loadPersonalSourcesContextSnapshot(topic.topicId)) === null,
	)

	// invalidate before allowing an old model response to finish
	const entryId = snapshot.entryIds[0]
	if (!entryId) {
		throw new Error("Context smoke entry missing")
	}
	await deletePersonalSourceEntry({ ...topic, entryId })
	checkPersonalSources(
		"deletion immediately removes usable derived context",
		(await readPersonalSourcesContext({ topicId: topic.topicId, userId: topic.userId })) === null,
	)
	checkPersonalSources(
		"a late model result cannot restore deleted text",
		!(await commitPersonalSourcesContext({ snapshot, context: "Stale deleted text", cost: 0 })),
	)
	await checkRetentionAndBilling(topic)
}

// Transfer an isolated fixture between accounts while the former owner has an outstanding snapshot.
async function checkTransferredOwner(snapshot: PersonalSourcesContextSnapshot): Promise<void> {
	const replacement = await seedPersonalSourcesTopic("replacement-owner")
	await db.update(topics).set({ ownerId: replacement.userId }).where(eq(topics.id, snapshot.topicId))
	try {
		// Neither starting work nor marking a failed attempt may affect a transferred Topic.
		const spend = await startPersonalSourcesSummarySpend(snapshot, 0.01)
		const marked = await failPersonalSourcesContext({ ...snapshot, state: "budget" })
		const [attempts] = await db
			.select({ count: count() })
			.from(personalSourcesSummarySpends)
			.where(eq(personalSourcesSummarySpends.topicId, snapshot.topicId))
		checkPersonalSources(
			"an ownership transfer blocks the former owner's spend and failure state",
			spend === null && !marked && attempts?.count === 0,
		)
	} finally {
		await db.update(topics).set({ ownerId: snapshot.billingUserId }).where(eq(topics.id, snapshot.topicId))
	}
}

// retained context stays readable and billing is independent of reuse by later Scans
async function checkRetentionAndBilling(topic: { userId: string; topicId: string }): Promise<void> {
	const snapshot = await loadPersonalSourcesContextSnapshot(topic.topicId)
	if (!snapshot) {
		throw new Error("Rebuild snapshot missing")
	}
	await commitPersonalSourcesContext({ snapshot, context: "Current remaining text", cost: 0 })
	await db
		.update(personalSourceEntries)
		.set({ receivedAt: sql`clock_timestamp() - interval '365 days'` })
		.where(eq(personalSourceEntries.topicId, topic.topicId))
	checkPersonalSources(
		"old retained entries keep their settled private context",
		(await readPersonalSourcesContext({ topicId: topic.topicId, userId: topic.userId })) === "Current remaining text",
	)
	const remainingEntryId = snapshot.entryIds[0]
	if (remainingEntryId) {
		await deletePersonalSourceEntry({ ...topic, entryId: remainingEntryId })
	}
	const emptySnapshot = await loadPersonalSourcesContextSnapshot(topic.topicId)
	checkPersonalSources(
		"empty Personal sources clear context without a model call",
		Boolean(
			emptySnapshot &&
				emptySnapshot.entries === "" &&
				(await commitPersonalSourcesContext({ snapshot: emptySnapshot, context: "", cost: 0 })),
		),
	)
	await db
		.insert(personalSourcesSummarySpends)
		.values({ ...topic, revision: snapshot.revision, state: "succeeded", cost: 0.02 })
	const spend = await monthlySpendDollars(topic.userId)
	checkPersonalSources(
		"summarization costs count once in the owner's monthly budget",
		spend.personalSourcesDollars === 0.02 && toSpendCents(spend) === 2,
	)
}
