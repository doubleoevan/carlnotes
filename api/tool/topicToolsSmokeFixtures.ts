// the topic tools smoke's fixtures: the run's ids, the check that counts failures, the seeded rows, and their cleanup
import type { UpdateTopicPayload } from "@shared/topicPayloads"
import { count, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { scans } from "../../db/schema/scans"
import { sources, topicPromptVersions, topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { deleteUserLiteLLMKey } from "../../worker"

// one id per run, and every fixture id derives from it. two runs at once never collide
export const runId = `tools-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const ownerId = `${runId}-owner`
export const otherUserId = `${runId}-other-user`
export const topicId = `${runId}-topic`
export const otherTopicId = `${runId}-other`

// each check reports its own line, and one failure fails the run
export let failureCount = 0
/** Prints one line for a pass, or the detail for a failure, which fails the run. */
export function check(label: string, isTestPassing: boolean, detail?: unknown): void {
	// print one line for a pass, and the detail for a failure
	if (isTestPassing) {
		console.log(`  ok  ${label}`)
		return
	}
	failureCount += 1
	console.error(`FAIL  ${label}`, detail ?? "")
}

// one account, named by its own id
function toUserRow(id: string): typeof users.$inferInsert {
	return { id, name: id, email: `${id}@example.com`, username: id, usernameNormalized: id }
}

/** Returns how many versions the topic holds now. */
export async function versionCount(): Promise<number> {
	const [countRow] = await db
		.select({ count: count() })
		.from(topicPromptVersions)
		.where(eq(topicPromptVersions.topicId, topicId))
	return countRow?.count ?? 0
}
/** Returns how many scans the topic holds now. */
export async function scanCount(): Promise<number> {
	const [countRow] = await db.select({ count: count() }).from(scans).where(eq(scans.topicId, topicId))
	return countRow?.count ?? 0
}

/** Seeds the owner, another user, a weekly topic with one succeeded scan, and a second topic holding one source. */
export async function seed(): Promise<string> {
	await db.insert(users).values([toUserRow(ownerId), toUserRow(otherUserId)])
	await db.insert(topics).values([
		{
			id: topicId,
			ownerId,
			name: `${runId} topic`,
			prompt: "the first prompt",
			visibility: "public",
			frequency: "weekly" as const,
		},
		{ id: otherTopicId, ownerId, name: `${runId} other`, prompt: "another", visibility: "private" },
	])
	await db.insert(scans).values({ topicId, ownerId, status: "succeeded", cost: "0.20" })

	// insert the other topic's source and return its id
	const [otherTopicSource] = await db
		.insert(sources)
		.values({ topicId: otherTopicId, kind: "rss", config: { url: "https://other.test/feed" }, status: "ready" })
		.returning({ id: sources.id })
	return otherTopicSource?.id ?? ""
}

/**
 * Deletes the LiteLLM key that the created topic's first scan may have created for the owner, then both users.
 * Every other fixture row cascades from the users.
 */
export async function cleanUp(): Promise<void> {
	await deleteUserLiteLLMKey(ownerId)
	await db.delete(users).where(inArray(users.id, [ownerId, otherUserId]))
}

/** Returns what the editor's save sends, with the prompt as given and no invites or sources. */
export function toEditorPayload(prompt: string): UpdateTopicPayload {
	return {
		name: `${runId} topic`,
		prompt,
		tags: [],
		frequency: "weekly" as const,
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday" as const,
		visibility: "public" as const,
		maxTopicFindings: 10,
		inviteEmails: [],
		sources: [],
	}
}
