// real development transactions verify permanent, quota-free, atomic imports and durable retry behavior
import { normalizePersonalSourcesConversation } from "@carlnotes/contracts/personalSourcesImportText"
import type { PersonalSourcesImportPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { db } from "@carlnotes/db"
import { importPersonalSourcesConversations } from "@carlnotes/db/personalSourcesImports"
import { deletePersonalSourceEntry } from "@carlnotes/db/personalSourcesLifecycle"
import { personalSourceEntries, personalSourcesDailyCounts } from "@carlnotes/db/schema/personalSources"
import { sources } from "@carlnotes/db/schema/topics"
import { eq } from "drizzle-orm"
import { checkPersonalSources, seedPersonalSourcesTopic } from "./personalSourcesSmokeFixtures"

/**
 * Checks selected import persistence, cross-batch retries, removed entries, and transaction rollback.
 */
export async function checkPersonalSourcesImports(): Promise<void> {
	const originalReceiving = Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED
	Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = "true"
	try {
		await checkImportedConversations()
	} finally {
		Bun.env.PERSONAL_SOURCES_RECEIVING_ENABLED = originalReceiving
	}
}

// the free account has no assistant grants and can still import selected transcripts
async function checkImportedConversations(): Promise<void> {
	const topic = await seedPersonalSourcesTopic("imports", "free")
	const conversations = ["first", "second"].map((conversationId) =>
		normalizePersonalSourcesConversation({
			conversationId,
			title: conversationId,
			text: `Synthetic selected transcript ${conversationId}: https://example.com/${conversationId}`,
		}),
	)
	const payload: PersonalSourcesImportPayload = { requestId: "batch-a", provider: "chatgpt", conversations }
	const imported = await importPersonalSourcesConversations({ ...topic, payload })
	checkPersonalSources(
		"free accounts import selected conversations without a connected agent",
		imported.status === "accepted" && imported.entryIds.length === 2,
	)
	const entries = await db.select().from(personalSourceEntries).where(eq(personalSourceEntries.topicId, topic.topicId))
	checkPersonalSources(
		"imports persist encrypted with no expiry",
		entries.length === 2 &&
			entries.every((entry) => entry.origin === "import" && entry.encryptedPayload.startsWith("enc1:")),
	)
	const counts = await db
		.select()
		.from(personalSourcesDailyCounts)
		.where(eq(personalSourcesDailyCounts.userId, topic.userId))
	checkPersonalSources("imports consume neither daily send nor email allowance", counts.length === 0)
	const retried = await importPersonalSourcesConversations({ ...topic, payload: { ...payload, requestId: "batch-b" } })
	checkPersonalSources(
		"content fingerprints deduplicate a new import batch",
		JSON.stringify(retried) === JSON.stringify(imported),
	)

	// changed content under one batch id conflicts, preserving the original selection
	const mismatch = await importPersonalSourcesConversations({
		...topic,
		payload: { ...payload, conversations: conversations.slice(0, 1) },
	})
	checkPersonalSources(
		"a reused batch id cannot silently change its selection",
		mismatch.status === "conflict" && mismatch.reason === "retry_mismatch",
	)
	const firstEntry = entries[0]
	if (!firstEntry) {
		throw new Error("Import smoke entry missing")
	}
	await deletePersonalSourceEntry({ ...topic, entryId: firstEntry.id })
	const newConversation = normalizePersonalSourcesConversation({
		conversationId: "new",
		title: "New",
		text: "Synthetic new transcript",
	})
	const rollback = await importPersonalSourcesConversations({
		...topic,
		payload: { ...payload, requestId: "batch-c", conversations: [newConversation, ...conversations] },
	})
	checkPersonalSources(
		"a removed conversation cannot be restored through a batch retry",
		rollback.status === "conflict" && rollback.reason === "removed",
	)
	const remainingEntries = await db
		.select({ id: personalSourceEntries.id })
		.from(personalSourceEntries)
		.where(eq(personalSourceEntries.topicId, topic.topicId))
	checkPersonalSources(
		"one refused conversation rolls back earlier new entries in the batch",
		remainingEntries.length === 1,
	)
	const topicSources = await db.select().from(sources).where(eq(sources.topicId, topic.topicId))
	checkPersonalSources(
		"imports reuse one concrete provider Source",
		topicSources.length === 1 && topicSources[0]?.personalSourcesIdentity === "import:chatgpt",
	)
}
