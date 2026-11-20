import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test"
import { TOPIC_MEMORY_FINDING_LIMIT } from "@carlnotes/contracts/topicMemoryWork"
import { db } from "@carlnotes/db"
import { loadRankedTopicMemories } from "@carlnotes/db/rankedTopicMemories"
import { scans } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { loadMemberTopicMemoriesPage, loadTopicMemoriesPage } from "@carlnotes/db/topicMemories"
import { saveTopicMemoryFeedback } from "@carlnotes/db/topicMemoryFeedback"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { checkTopicMemoryJournal } from "./topicMemoryJournalSmokeChecks"
import { checkTopicMemoryRatings } from "./topicMemoryRatingSmokeChecks"
import { checkTopicMemoryRepairs } from "./topicMemoryRepairSmokeChecks"
import { reviewTopicMemoryReplacements } from "./topicMemoryReplacements"
import { checkTopicMemorySearch } from "./topicMemorySearchSmokeChecks"
import {
	insertBrew,
	loadMemories,
	readDecisionCosines,
	signal,
	vector,
	withTopic,
	writeTopicMemory,
} from "./topicMemorySmokeFixtures"
import { checkTopicMemoryUpdates } from "./topicMemoryUpdateSmokeChecks"
import { saveTopicMemoryUpdates } from "./topicMemoryWrites"

beforeAll(async () => {
	// fail before any write if the configured database is not disposable
	const {
		rows: [fixture],
	} = await db.execute<{ database: string; pgvector: string | null }>(sql`
		select current_database() as database,
			(select extversion from pg_extension where extname = 'vector') as pgvector
	`)
	if (!fixture?.database.startsWith("journal_test_") || !fixture.pgvector) {
		throw new Error("Use a migrated disposable journal_test_* Postgres database with pgvector")
	}
	console.log(`Postgres database ${fixture.database}, pgvector ${fixture.pgvector}`)
})

afterAll(async () => {
	await db.$client.end()
})

checkTopicMemorySearch()
checkTopicMemoryJournal()
checkTopicMemoryRatings()
checkTopicMemoryRepairs()
checkTopicMemoryUpdates()

test("exact facts combine and reactivate while different values remain active", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const older = await insertBrew(topicId, 3)
		const newer = await insertBrew(topicId, 4)
		const latest = await insertBrew(topicId, 5)
		const key = { subject: "Cafe", claimType: "price", factDate: "2026-10-01", value: "$10" } as const

		// equal keys combine even though the vectors are orthogonal
		await writeTopicMemory(first, "The coffee costs ten dollars.", vector(1), key)
		const [previous] = await loadMemories(topicId)
		if (!previous) {
			throw new Error("The original topic memory is missing")
		}
		// retire the first topic memory, then write the same key from the second Scan
		await db.update(topicMemories).set({ status: "outdated" }).where(eq(topicMemories.id, previous.id))
		await writeTopicMemory(second, "A coffee costs $10.", vector(0), key)
		const combined = await loadMemories(topicId)
		expect(combined).toHaveLength(2)
		expect(combined).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: previous.id, status: "active", findingIds: [first.findingId, second.findingId] }),
				expect.objectContaining({
					status: "outdated",
					replacedById: previous.id,
					text: "A coffee costs $10.",
					findingIds: [second.findingId],
				}),
			]),
		)
		expect(await readDecisionCosines(second.scanId)).toMatchObject([
			{ kind: "merge", source: "exact", cosine: 0, candidateText: "A coffee costs $10." },
		])
		// replaying the same wording and evidence under a new format does not create a second pair
		await db.update(scans).set({ topicMemoriesFormatVersion: 0 }).where(eq(scans.id, second.scanId))
		await writeTopicMemory(second, "A coffee costs $10.", vector(0), key)
		expect(await readDecisionCosines(second.scanId)).toHaveLength(1)

		await saveTopicMemoryFeedback({
			topicId,
			userId: ownerId,
			topicMemoryId: previous.id,
			feedback: { rating: "up", note: "Verified." },
		})

		// different values stay active even when an older brew supplies them later
		await writeTopicMemory(newer, "A coffee costs $12.", vector(1), { ...key, value: "$12" })
		await writeTopicMemory(older, "A coffee costs $11.", vector(1), { ...key, value: "$11" })
		const rows = await loadMemories(topicId)
		const current = rows.find(({ value }) => value === "$12")
		// the newer value is active, one row was replaced, and neither Scan recorded a decision
		expect(current?.status).toBe("active")
		expect(rows.filter(({ status }) => status === "active")).toHaveLength(3)
		expect(rows.filter(({ replacedById }) => replacedById !== null)).toHaveLength(1)
		expect(await readDecisionCosines(newer.scanId)).toEqual([])
		expect(await readDecisionCosines(older.scanId)).toEqual([])
		expect(await db.select().from(topicMemoryFeedback)).toEqual(
			expect.arrayContaining([expect.objectContaining({ topicMemoryId: previous.id, note: "Verified." })]),
		)

		// rejected wording stays blocked, independent of the replacement key or vector
		if (!current) {
			throw new Error("The replacement topic memory is missing")
		}
		await saveTopicMemoryFeedback({ topicId, userId: ownerId, topicMemoryId: current.id, feedback: { rating: "down" } })
		await writeTopicMemory(latest, "A COFFEE costs $12.", vector(0), key)
		expect(await loadMemories(topicId)).toHaveLength(4)
	})
})

test("The Marsh founding and its Monday series stay active on the same founding key", async () => {
	await withTopic(async ({ topicId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const key = { subject: "The Marsh", claimType: "founding", factDate: "1989-01-01" } as const
		await writeTopicMemory(first, "The Marsh performance space was founded in San Francisco in 1989.", vector(1), {
			...key,
			value: "founded in san francisco",
		})
		await writeTopicMemory(
			second,
			"Stephanie Weisman started The Marsh's Monday night series at the Hotel Utah.",
			vector(1),
			{
				...key,
				value: "monday series at the hotel utah",
			},
		)
		expect((await loadMemories(topicId)).map(({ status }) => status)).toEqual(["active", "active"])
		expect(await readDecisionCosines(second.scanId)).toEqual([])
	})
})

test.each(["confirmed", "declined", "stale", "tied"] as const)(
	"a %s model review controls an edition-specific runtime replacement",
	async (review) => {
		await withTopic(async ({ topicId }) => {
			// two Scans, and a runtime claim that the second Scan corrects
			const first = await insertBrew(topicId, 1)
			const second = await insertBrew(topicId, 2)
			const key = { subject: "Festival cut", claimType: "runtime", factDate: "2026-10-01" } as const
			const earlier = "The original festival cut ran 92 minutes."
			const newer = "The corrected runtime of the original festival cut was 92 minutes and 15 seconds."
			await writeTopicMemory(first, earlier, vector(1), { ...key, value: "92 minutes" })
			// a tied review has both Scans start at the same moment
			if (review === "tied") {
				await db
					.update(scans)
					.set({ startedAt: sql`(select started_at from ${scans} where ${scans.id} = ${first.scanId})` })
					.where(eq(scans.id, second.scanId))
			}
			// the second Scan's start, which the replacement review reads
			const [scan] = await db.select({ startedAt: scans.startedAt }).from(scans).where(eq(scans.id, second.scanId))
			if (!scan) {
				throw new Error("The second brew is missing")
			}
			const write: EmbeddedTopicMemoryWrite = {
				...key,
				operation: "add",
				kind: "fact",
				text: newer,
				value: "92 minutes and 15 seconds",
				person: null,
				importance: 0.8,
				embedding: vector(1),
				findingIds: [second.findingId],
			}

			// stub only the paid model. nomination, locking, and both writes use real Postgres
			spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
			const generate = spyOn(ai, "generateText").mockResolvedValue({
				output: { confirmedIndexes: review === "declined" ? [] : [0] },
				usage: {},
			} as Awaited<ReturnType<typeof ai.generateText>>)
			try {
				const replacements = await reviewTopicMemoryReplacements({
					topicId,
					scanStartedAt: scan.startedAt,
					writes: [write],
					signal,
					litellmApiKey: "fixture",
				})
				// a tied pair asks no model, and any other review reads both wordings with their dates
				if (review === "tied") {
					expect(generate).not.toHaveBeenCalled()
				} else {
					const prompt = generate.mock.calls[0]?.[0].prompt
					expect(prompt).toContain(earlier)
					expect(prompt).toContain(newer)
					expect(String(prompt).match(/"factDate":"2026-10-01"/g)).toHaveLength(2)
				}
				// a stale review finds the earlier wording changed before the save
				if (review === "stale") {
					await db
						.update(topicMemories)
						.set({ text: "The original festival cut's runtime was reported as 92 minutes." })
						.where(eq(topicMemories.topicId, topicId))
				}
				// only a confirmed review replaces the earlier wording, and it records one decision
				await saveTopicMemoryUpdates({ topicId, scanId: second.scanId, writes: [write], signal, replacements })
				const rows = await loadMemories(topicId)
				expect(rows.filter(({ status }) => status === "active")).toHaveLength(review === "confirmed" ? 1 : 2)
				const decisions = await readDecisionCosines(second.scanId)
				expect(decisions).toHaveLength(review === "confirmed" ? 1 : 0)
				expect(decisions).toMatchObject(
					review === "confirmed"
						? [{ kind: "replace", source: "model", candidateText: newer, matchText: earlier }]
						: [],
				)
			} finally {
				mock.restore()
			}
		})
	},
)

test("equal undated claims preserve the combined row in history", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		// compare exact structured keys even when both event dates are unknown
		const key = { subject: "Cafe", claimType: "launch", factDate: null, value: "opened" } as const
		await writeTopicMemory(first, "The cafe opened.", vector(1), key)
		await writeTopicMemory(second, "The cafe opened for customers.", vector(0.95), key)
		expect(await loadMemories(topicId)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ text: "The cafe opened.", status: "active" }),
				expect.objectContaining({
					text: "The cafe opened for customers.",
					status: "outdated",
					replacedById: expect.any(String),
				}),
			]),
		)
		expect(await readDecisionCosines(second.scanId)).toMatchObject([{ kind: "merge", source: "exact" }])

		// all readers share the active representative
		const journal = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
		expect(journal.items).toHaveLength(1)
		expect(journal.items[0]?.text).toBe("The cafe opened.")
		expect((await loadMemberTopicMemoriesPage({ topicId, userId: ownerId, page: 1 }))?.page).toEqual(journal)
		expect(await loadRankedTopicMemories({ topicId })).toMatchObject([{ text: "The cafe opened." }])
	})
})

test("compatible dates combine without letting an undated observation bridge conflicts", async () => {
	await withTopic(async ({ topicId, ownerId }) => {
		// a narrower date upgrades the representative while a different month stays independent
		const dates = ["2025", "2025-07", "2025-07", "2025-08", null]
		for (const [index, factDate] of dates.entries()) {
			const brew = await insertBrew(topicId, index + 1)
			await writeTopicMemory(brew, "The cafe opened for customers.", vector(1), {
				subject: "Cafe",
				claimType: "launch",
				value: "opened",
				factDate,
			})
			// only the narrower date is a new statement. the same wording and date again adds its evidence alone
			expect(await readDecisionCosines(brew.scanId)).toHaveLength(index === 1 ? 1 : 0)
		}
		const rows = await loadMemories(topicId)
		expect(rows.filter(({ status }) => status === "active").map(({ factDate }) => factDate)).toEqual(
			expect.arrayContaining(["2025-07", "2025-08", null]),
		)
		expect(rows.filter(({ replacedById }) => replacedById !== null)).toHaveLength(1)
		const page = await loadTopicMemoriesPage({ topicId, userId: ownerId, page: 1 })
		expect(page.items).toHaveLength(2)
		expect(page.items.map(({ factDate }) => factDate)).toContain("2025-08")
	})
})

test("a restated topic memory with new evidence archives no copy and keeps its newest Finding ids", async () => {
	await withTopic(async ({ topicId }) => {
		// the same wording and key from two Scans is one row with both Findings and no outdated copy
		const first = await insertBrew(topicId, 1)
		const second = await insertBrew(topicId, 2)
		const third = await insertBrew(topicId, 3)
		const key = { subject: "Cafe", claimType: "price", factDate: "2026-10-01", value: "$10" } as const
		await writeTopicMemory(first, "A coffee costs $10.", vector(1), key)
		await writeTopicMemory(second, "A coffee costs $10.", vector(1), key)
		// one row holds both Findings, and the second Scan recorded no decision
		const [restated, ...copies] = await loadMemories(topicId)
		expect(copies).toEqual([])
		expect(restated).toMatchObject({ status: "active", findingIds: [first.findingId, second.findingId] })
		expect(await readDecisionCosines(second.scanId)).toEqual([])

		// a row at its Finding limit drops its oldest id as a third Scan adds one
		const fullFindingIds = Array.from({ length: TOPIC_MEMORY_FINDING_LIMIT }, (_, index) => `older-${index}`)
		await db.update(topicMemories).set({ findingIds: fullFindingIds }).where(eq(topicMemories.topicId, topicId))
		await writeTopicMemory(third, "A coffee costs $10.", vector(1), key)
		// the row keeps as many ids as the limit allows, without its oldest and with the newest
		const [trimmed] = await loadMemories(topicId)
		expect(trimmed?.findingIds).toHaveLength(TOPIC_MEMORY_FINDING_LIMIT)
		expect(trimmed?.findingIds[0]).toBe("older-1")
		expect(trimmed?.findingIds.at(-1)).toBe(third.findingId)
	})
})
