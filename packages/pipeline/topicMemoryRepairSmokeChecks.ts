import { expect, mock, spyOn, test } from "bun:test"
import { db } from "@carlnotes/db"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topicMemories, topicMemoryFeedback } from "@carlnotes/db/schema/topicMemories"
import { users } from "@carlnotes/db/schema/users"
import { loadRankedTopicMemories } from "@carlnotes/db/topicMemories"
import * as models from "@carlnotes/models/models"
import type { LanguageModel } from "ai"
import * as ai from "ai"
import { eq, sql } from "drizzle-orm"
import type { EmbeddedTopicMemoryWrite } from "./applyTopicMemoryWrite"
import { repairTopicMemoryClaims } from "./repairTopicMemoryClaims"
import { loadTopicMemoryFindingEvidence } from "./topicMemoryEvidence"
import {
	type Brew,
	insertBrew,
	insertUser,
	loadMemories,
	signal,
	vector,
	withTopic,
	writeTopicMemory,
} from "./topicMemorySmokeFixtures"

// Register these cases inside the disposable database suite.
export function checkTopicMemoryRepairs(): void {
	test("rewrite evidence keeps the matching caption when the draft paraphrases it", async () => {
		await withTopic(async ({ topicId }) => {
			const { findingId } = await insertBrew(topicId, 1)
			const caption = "Mara Diaz and Hana Li attended the gallery opening on March 4, 2026."
			await db
				.update(resources)
				.set({ content: null, snippet: `${"Unrelated caption. ".repeat(110)}${caption}` })
				.where(
					eq(resources.id, sql`(select ${findings.resourceId} from ${findings} where ${findings.id} = ${findingId})`),
				)
			const evidence = await loadTopicMemoryFindingEvidence(topicId, [findingId], db, "Attends alongside Hana Li.")
			expect(evidence.get(findingId)?.articleContext).toContain(caption)
			expect(evidence.get(findingId)?.articleContext?.length).toBeLessThanOrEqual(1400)
		})
	})

	test.each(["split", "blocked child", "same survivor"] as const)(
		"repair handles %s without losing feedback",
		async (result) => {
			await withTopic(async ({ topicId, ownerId }) => {
				const opening = await insertBrew(topicId, 1)
				const award = await insertBrew(topicId, 2)
				const raterId = await insertUser()
				try {
					const openingKey = { subject: "Cafe", claimType: "launch", value: "opened", factDate: null } as const
					const openingText = "The cafe opened."
					const awardText = "The cafe won an award."
					await seedTopicMemorySplitTarget({ result, opening, award, openingKey, openingText, awardText, raterId })

					// create the original claim with its before-and-after Scans and its two ratings
					const [original] = await db
						.insert(topicMemories)
						.values({
							topicId,
							kind: "fact",
							text: "The cafe opened and won an award.",
							isAtomic: true,
							importance: 0.8,
							embedding: vector(1),
							embeddingModel: "before-claim-checks",
							firstScanId: opening.scanId,
							lastSeenScanId: award.scanId,
							findingIds: [opening.findingId, award.findingId],
						})
						.returning({ id: topicMemories.id })
					if (!original) {
						throw new Error("The original topic memory is missing")
					}
					const correction = "The award was a silver medal."
					await db.insert(topicMemoryFeedback).values([
						{ topicMemoryId: original.id, userId: ownerId, rating: "down", note: correction },
						{ topicMemoryId: original.id, userId: raterId, rating: "up", note: "Keep this." },
					])

					// provide only model outputs. source authorization, embeddings storage, and feedback writes use Postgres
					const orderedOwners = [ownerId, raterId].sort()
					const output = (value: unknown): Awaited<ReturnType<typeof ai.generateText>> =>
						({ output: value, usage: {} }) as Awaited<ReturnType<typeof ai.generateText>>
					spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
					spyOn(models, "embedVectors").mockResolvedValue([vector(1), vector(0.1)])
					spyOn(ai, "generateText")
						.mockResolvedValueOnce(
							output({
								claims: [
									{
										text: openingText,
										...openingKey,
										person: null,
										sourceFindingIndexes: [0],
										feedbackIndexes: [],
									},
									{
										text: awardText,
										...openingKey,
										...(result === "same survivor" ? {} : { claimType: "other", value: "won an award" }),
										person: null,
										sourceFindingIndexes: [1],
										feedbackIndexes: [orderedOwners.indexOf(ownerId)],
									},
								],
							}),
						)
						.mockResolvedValueOnce(
							output({
								claims: [
									{ index: 0, verdict: "single" },
									{ index: 1, verdict: "single" },
								],
							}),
						)

					// a rejected child or a repeated survivor must roll back all writes for this split
					const repaired = result === "split"
					expect(
						await repairTopicMemoryClaims({ litellmApiKey: "fixture", signal, compoundIds: [original.id] }),
					).toMatchObject({
						split: Number(repaired),
						queued: Number(!repaired),
						deferred: 0,
					})
					await checkSplitFeedback({
						ownerId,
						raterId,
						topicId,
						result,
						originalId: original.id,
						awardText,
						correction,
						findingIds: [opening.findingId, award.findingId],
					})
				} finally {
					mock.restore()
					await db.delete(users).where(eq(users.id, raterId))
				}
			})
		},
	)

	async function seedTopicMemorySplitTarget({
		result,
		opening,
		award,
		openingKey,
		openingText,
		awardText,
		raterId,
	}: {
		result: "split" | "blocked child" | "same survivor"
		opening: Brew
		award: Brew
		openingKey: Pick<EmbeddedTopicMemoryWrite, "subject" | "claimType" | "value" | "factDate">
		openingText: string
		awardText: string
		raterId: string
	}): Promise<void> {
		if (result === "blocked child") {
			await writeTopicMemory(award, awardText, vector(0.1))
			await db.update(topicMemories).set({ status: "rejected" }).where(eq(topicMemories.topicId, award.topicId))
			return
		}
		if (result !== "split") {
			return
		}

		// the existing correction is older than the original's conflicting vote
		await writeTopicMemory(opening, openingText, vector(1), openingKey)
		const [existing] = await loadMemories(opening.topicId)
		if (!existing) {
			throw new Error("The opening claim is missing")
		}
		await db.insert(topicMemoryFeedback).values({
			topicMemoryId: existing.id,
			userId: raterId,
			rating: "down",
			note: "It opened in May.",
			updatedAt: new Date(0),
		})
	}

	test.each(["provider failure", "rejected split", "nonclaim"] as const)(
		"repair preserves sources and feedback after %s",
		async (result) => {
			await withTopic(async ({ topicId, ownerId }) => {
				const brew = await insertBrew(topicId, 1)
				const text = "The cafe opened and won an award."
				await writeTopicMemory(brew, text, vector(1))
				const [original] = await loadMemories(topicId)
				if (!original) {
					throw new Error("The original topic memory is missing")
				}
				// a correction remains attached to the original when the repair cannot replace it
				await db
					.insert(topicMemoryFeedback)
					.values({ topicMemoryId: original.id, userId: ownerId, rating: "down", note: "The award was silver." })
				spyOn(models, "cheapModel").mockReturnValue({} as LanguageModel)
				const generate = spyOn(ai, "generateText")
				if (result === "provider failure") {
					generate.mockRejectedValue(new Error("Unavailable"))
				} else {
					generate.mockResolvedValue({ output: { claims: [] }, usage: {} } as Awaited<
						ReturnType<typeof ai.generateText>
					>)
				}
				try {
					const retired = result === "nonclaim"
					const counts = await repairTopicMemoryClaims({
						litellmApiKey: "fixture",
						signal,
						auditedVerdicts: { [original.id]: retired ? "nonclaim" : "compound" },
					})
					expect(counts).toMatchObject({ retired: Number(retired), queued: Number(!retired), deferred: 0 })
					expect(await loadMemories(topicId)).toMatchObject([
						{
							id: original.id,
							text,
							findingIds: [brew.findingId],
							status: retired ? "outdated" : "active",
							needsReview: !retired,
						},
					])
					expect(await loadRankedTopicMemories({ topicId })).toEqual([])
					expect(
						await db.select().from(topicMemoryFeedback).where(eq(topicMemoryFeedback.topicMemoryId, original.id)),
					).toMatchObject([{ rating: "down", note: "The award was silver." }])
				} finally {
					mock.restore()
				}
			})
		},
	)
}

// Verify that a successful split routes the ratings and an incomplete split preserves the original.
async function checkSplitFeedback({
	ownerId,
	raterId,
	topicId,
	result,
	originalId,
	awardText,
	correction,
	findingIds,
}: {
	ownerId: string
	raterId: string
	topicId: string
	result: "split" | "blocked child" | "same survivor"
	originalId: string
	awardText: string
	correction: string
	findingIds: string[]
}): Promise<void> {
	const rows = await loadMemories(topicId)
	const active = rows.filter(({ status }) => status === "active")
	const votes = [
		{ userId: raterId, rating: "up" as const, note: "Keep this." },
		{ userId: ownerId, rating: "down" as const, note: correction },
	]
	const readVotes = (id: string) =>
		db
			.select({
				userId: topicMemoryFeedback.userId,
				rating: topicMemoryFeedback.rating,
				note: topicMemoryFeedback.note,
			})
			.from(topicMemoryFeedback)
			.where(eq(topicMemoryFeedback.topicMemoryId, id))
			.orderBy(topicMemoryFeedback.note)
	if (result !== "split") {
		expect(rows).toHaveLength(result === "blocked child" ? 2 : 1)
		expect(active).toMatchObject([{ id: originalId, needsReview: true }])
		expect(await readVotes(originalId)).toEqual(votes)
		return
	}

	// each child keeps applicable votes and a previously entered correction stays on its claim
	expect(rows.find(({ id }) => id === originalId)?.status).toBe("outdated")
	expect(active.flatMap(({ findingIds }) => findingIds).sort()).toEqual(findingIds.sort())
	for (const row of active) {
		expect(await readVotes(row.id)).toEqual(
			row.text === awardText ? votes : [{ userId: raterId, rating: "down", note: "It opened in May." }],
		)
	}
}
