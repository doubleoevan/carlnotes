// disposable development accounts isolate personal sources acceptance checks from real reader content
import type { Plan } from "@carlnotes/contracts/plans"
import { db } from "@carlnotes/db"
import type { ReceivePersonalSourceEntryOptions } from "@carlnotes/db/personalSourcesReceive"
import { personalSourcesEmailReceipts } from "@carlnotes/db/schema/personalSources"
import { scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { inArray } from "drizzle-orm"

// every row belongs to one of these accounts and disappears in the final cleanup
const runId = `personalSources-smoke-${crypto.randomUUID()}`
const createdUserIds: string[] = []
export type PersonalSourcesSmokeTopic = { userId: string; topicId: string }

/**
 * Fails a smoke assertion without logging private request or provider content.
 */
export function checkPersonalSources(label: string, condition: boolean): void {
	if (!condition) {
		throw new Error(`FAIL ${label}`)
	}
	console.log(`PASS ${label}`)
}

/**
 * Creates one isolated account and personal Topic for the live development fixture.
 */
export async function seedPersonalSourcesTopic(
	label: string,
	plan: Plan = "premium",
	lastScan?: Date,
): Promise<PersonalSourcesSmokeTopic> {
	const userId = `${runId}-${label}`
	const topicId = `${userId}-topic`
	createdUserIds.push(userId)
	await db.insert(users).values({
		id: userId,
		name: "Personal sources smoke",
		email: `${userId}@carlnotes.test`,
		username: userId,
		usernameNormalized: userId,
		emailVerified: true,
		plan,
	})
	await db.transaction(async (transaction) => {
		await transaction.insert(topics).values({
			id: topicId,
			ownerId: userId,
			name: "Personal sources smoke",
			prompt: "Coffee equipment",
			visibility: "private",
		})
		// the scheduled sweep must see the recent fixture Scan as soon as it can see a manual-brew test Topic
		if (lastScan) {
			await transaction
				.insert(scans)
				.values({ topicId, ownerId: userId, status: "succeeded", startedAt: lastScan, finishedAt: lastScan })
		}
	})
	return { userId, topicId }
}

/**
 * Builds a synthetic authenticated-adapter delivery with no reader data or external fetches.
 */
export function personalSourcesSmokeDelivery(
	topic: PersonalSourcesSmokeTopic,
	requestId: string,
	sender = "agent-a",
): ReceivePersonalSourceEntryOptions & { origin: "send" } {
	return {
		...topic,
		senderIdentity: `oauth:${sender}`,
		requestId,
		origin: "send",
		config: { delivery: "oauth", clientId: sender, appDomain: "example.com" },
		payload: {
			title: "Coffee test",
			text: "Synthetic private personal sources smoke canary",
			sender: "example.com",
			senderKind: "agent",
			links: ["https://example.com/coffee"],
			chatUrl: null,
		},
		authorizeSender: async () => true,
	}
}

/**
 * Removes every account seeded by this run and the dependent personal sources rows through their cascades.
 */
export async function cleanUpPersonalSourcesSmoke(shouldKeepFixtures = false): Promise<void> {
	if (shouldKeepFixtures) {
		console.log("Retained development smoke accounts:", createdUserIds.join(", "))
		return
	}
	if (createdUserIds.length > 0) {
		await db.delete(personalSourcesEmailReceipts).where(inArray(personalSourcesEmailReceipts.userId, createdUserIds))
		await db.delete(users).where(inArray(users.id, createdUserIds))
	}
}
