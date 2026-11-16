// proves the note and thumb save together against Postgres and reopen through the same API
import { afterAll, expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { findingFeedback, findings, resources, scans } from "@carlnotes/db/schema/scans"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq, sql } from "drizzle-orm"
import { TEST_ANALYTICS_PROPERTIES } from "../analyticsTestFixtures"
import { loadFindingRatingNote, setRating } from "./findingFeedback"

afterAll(async () => {
	await db.$client.end()
})

test("the Finding's up and down notes reopen with their rating, and clearing removes the note", async () => {
	const {
		rows: [database],
	} = await db.execute<{ name: string }>(sql`select current_database() as name`)
	if (!database?.name.startsWith("journal_test_")) {
		throw new Error("Use migrated disposable journal_test_* Postgres")
	}

	// give two separate accounts the same real Finding without sharing their note
	const ownerId = crypto.randomUUID()
	const strangerId = crypto.randomUUID()
	const topicId = crypto.randomUUID()
	const resourceId = crypto.randomUUID()
	const scanId = crypto.randomUUID()
	const findingId = crypto.randomUUID()
	for (const id of [ownerId, strangerId]) {
		const username = `j${id.replaceAll("-", "").slice(0, 13)}`
		await db
			.insert(users)
			.values({ id, name: "Finding note fixture", email: `${id}@example.test`, username, usernameNormalized: username })
	}
	try {
		await db
			.insert(topics)
			.values({ id: topicId, ownerId, name: "Finding feedback fixture", prompt: "Coffee", visibility: "private" })
		await db.insert(scans).values({ id: scanId, topicId, ownerId, status: "succeeded" })
		await db
			.insert(resources)
			.values({ id: resourceId, kind: "read", url: `https://example.test/finding-rating/${findingId}` })
		await db.insert(findings).values({ id: findingId, topicId, resourceId, scanId, relevanceScore: 0.9 })

		// an existing legacy note still loads for its rater
		await db.insert(findingFeedback).values({ findingId, topicId, userId: ownerId, feedback: "Legacy note" })
		expect(await setRating(ownerId, findingId, "up", TEST_ANALYTICS_PROPERTIES)).toBe(true)
		expect(await loadFindingRatingNote(ownerId, findingId)).toEqual({ note: "Legacy note" })

		// reread the saved fields from Postgres and load the private note on each rating
		for (const rating of ["up", "down"] as const) {
			const note = `Example note with ${rating}`
			expect(await setRating(ownerId, findingId, rating, TEST_ANALYTICS_PROPERTIES, note)).toBe(true)
			const [row] = await db
				.select({ rating: findings.rating, note: findings.ratingNote })
				.from(findings)
				.where(eq(findings.id, findingId))
			expect(row).toEqual({ rating, note })
			expect(await loadFindingRatingNote(ownerId, findingId)).toEqual({ note })
			expect(await loadFindingRatingNote(strangerId, findingId)).toBeNull()
		}
		// a vote change while the note is unread keeps it. an explicitly cleared vote removes it for future ratings
		expect(await setRating(ownerId, findingId, "up", TEST_ANALYTICS_PROPERTIES)).toBe(true)
		expect(await loadFindingRatingNote(ownerId, findingId)).toEqual({ note: "Example note with down" })
		expect(await setRating(ownerId, findingId, null, TEST_ANALYTICS_PROPERTIES)).toBe(true)
		expect(await loadFindingRatingNote(ownerId, findingId)).toEqual({ note: null })
		expect(await setRating(ownerId, findingId, "down", TEST_ANALYTICS_PROPERTIES)).toBe(true)
		expect(await loadFindingRatingNote(ownerId, findingId)).toEqual({ note: null })
	} finally {
		await db.delete(topics).where(eq(topics.id, topicId))
		await db.delete(users).where(eq(users.id, ownerId))
		await db.delete(users).where(eq(users.id, strangerId))
		await db.delete(resources).where(eq(resources.id, resourceId))
	}
})
