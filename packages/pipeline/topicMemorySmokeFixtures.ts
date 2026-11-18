import { db } from "@carlnotes/db"
import { EMBED_DIMENSIONS, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryDecisions } from "@carlnotes/db/schema/topicMemories"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq, inArray } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

export const signal = new AbortController().signal
const resourceIdsByTopic = new Map<string, string[]>()

export type Brew = { topicId: string; ownerId: string; scanId: string; findingId: string }

// fixed model proposal and vector, with real eligibility and persistence
export async function writeTopicMemory(
	{ topicId, scanId, findingId }: Brew,
	text: string,
	embedding: number[],
	key: Pick<EmbeddedTopicMemoryWrite, "subject" | "claimType" | "value" | "factDate"> = {
		subject: "Coffee",
		claimType: "other",
		value: text,
		factDate: null,
	},
): Promise<void> {
	const write: EmbeddedTopicMemoryWrite = {
		...key,
		text,
		importance: 0.8,
		findingIds: [findingId],
		embedding,
		kind: "fact",
		person: null,
		operation: "add",
	}
	await saveTopicMemoryUpdates({ scanId, topicId, writes: [write], signal })
}

export async function withTopic(check: (topic: { topicId: string; ownerId: string }) => Promise<void>): Promise<void> {
	const ownerId = await insertUser()
	const topicId = crypto.randomUUID()
	const resourceIds: string[] = []
	resourceIdsByTopic.set(topicId, resourceIds)
	try {
		await db
			.insert(topics)
			.values({ id: topicId, ownerId, name: "Journal integration fixture", prompt: "Coffee", visibility: "private" })
		await check({ topicId, ownerId })
	} finally {
		await db.delete(topics).where(eq(topics.id, topicId))
		await db.delete(users).where(eq(users.id, ownerId))
		resourceIdsByTopic.delete(topicId)
		if (resourceIds.length) {
			await db.delete(resources).where(inArray(resources.id, resourceIds))
		}
	}
}

export async function insertUser(role: "admin" | "user" = "user"): Promise<string> {
	const id = crypto.randomUUID()
	const username = `jt${id.replaceAll("-", "").slice(0, 12)}`
	await db
		.insert(users)
		.values({ id, name: "Journal fixture", username, usernameNormalized: username, email: `${id}@example.test`, role })
	return id
}

export async function insertBrew(topicId: string, index: number, url?: string): Promise<Brew> {
	const [topic] = await db.select({ ownerId: topics.ownerId }).from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error("The brew fixture has no Topic")
	}

	// each brew references a different real public Finding
	const scanId = crypto.randomUUID()
	const resourceId = crypto.randomUUID()
	const findingId = crypto.randomUUID()
	const { ownerId } = topic
	await db
		.insert(scans)
		.values({ id: scanId, topicId, ownerId, status: "succeeded", startedAt: new Date(Date.UTC(2026, 10, index)) })
	await db.insert(resources).values({
		id: resourceId,
		kind: "read",
		url: url ?? `https://example.test/journal-integration/${topicId}/${scanId}`,
	})
	resourceIdsByTopic.get(topicId)?.push(resourceId)
	await db.insert(findings).values({ id: findingId, topicId, scanId, resourceId, relevanceScore: 0.9 })
	return { topicId, ownerId, scanId, findingId }
}

export function vector(cosine: number): number[] {
	return [cosine, Math.sqrt(1 - cosine ** 2), ...Array<number>(EMBED_DIMENSIONS - 2).fill(0)]
}

export async function loadMemories(topicId: string): Promise<(typeof topicMemories.$inferSelect)[]> {
	return db.select().from(topicMemories).where(eq(topicMemories.topicId, topicId))
}

export async function readDecisionCosines(scanId: string): Promise<(typeof topicMemoryDecisions.$inferSelect)[]> {
	return db.select().from(topicMemoryDecisions).where(eq(topicMemoryDecisions.scanId, scanId))
}
