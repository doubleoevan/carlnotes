// verify durable Topic-local bonuses against real Finding inserts and re-scores

import type { PersonalSourceScoreBonus } from "@carlnotes/contracts/sourceScoring"
import { db } from "@carlnotes/db"
import { findings, resources, scans } from "@carlnotes/db/schema/scans"
import { loadResourcesToReview } from "@carlnotes/pipeline/review/filter"
import { upsertFinding } from "@carlnotes/pipeline/review/saveFinding"
import { eq } from "drizzle-orm"
import { checkPersonalSources, seedPersonalSourcesTopic } from "./personalSourcesSmokeFixtures"

/**
 * Proves source bonuses persist without stacking, leaking between Topics, or replacing model scores.
 */
export async function checkPersonalSourcesScoreBonus(): Promise<void> {
	// isolate the shared Resource and two independent Topics from retained review fixtures
	const topic = await seedPersonalSourcesTopic("source-bonus")
	const otherTopic = await seedPersonalSourcesTopic("source-bonus-other")
	const [resource] = await db
		.insert(resources)
		.values({ url: `https://example.com/${topic.topicId}`, kind: "read" })
		.returning()
	const [scan] = await db.insert(scans).values({ topicId: topic.topicId, ownerId: topic.userId }).returning()
	if (!resource || !scan) {
		throw new Error("Missing source bonus fixture")
	}

	try {
		// test the insert branch independently from the repeated-review branch
		for (const bonus of [0.05, 0.1] as const) {
			const inserted = await upsertFinding({
				scan,
				topicId: topic.topicId,
				resource,
				score: 0.6,
				relevanceExplanation: "A page-grounded explanation.",
				topicContextHash: "insert",
				isFromCustomSource: true,
				personalSourceScoreBonus: bonus,
			})
			checkPersonalSources(
				`new Finding receives only the ${bonus === 0.1 ? "full" : "half"} personal bonus`,
				inserted.isNew && Math.abs(inserted.relevanceScore - (0.6 + bonus)) < 0.000001,
			)
			await db.delete(findings).where(eq(findings.topicId, topic.topicId))
		}

		// each review starts with the model's fresh score and retains the strongest earlier source contribution
		const cases: {
			label: string
			score: number
			bonus: PersonalSourceScoreBonus
			custom: boolean
			expected: number
			storedBonus: PersonalSourceScoreBonus
		}[] = [
			{
				label: "custom-only Findings retain the existing bonus",
				score: 0.6,
				bonus: 0,
				custom: true,
				expected: 0.65,
				storedBonus: 0,
			},
			{
				label: "newsletter or automatic provenance gets half without stacking the custom bonus",
				score: 0.6,
				bonus: 0.05,
				custom: true,
				expected: 0.65,
				storedBonus: 0.05,
			},
			{
				label: "a half bonus survives a re-score without its Source",
				score: 0.5,
				bonus: 0,
				custom: false,
				expected: 0.55,
				storedBonus: 0.05,
			},
			{
				label: "a direct personal contribution upgrades to the full bonus only",
				score: 0.6,
				bonus: 0.1,
				custom: true,
				expected: 0.7,
				storedBonus: 0.1,
			},
			{
				label: "a full bonus survives re-score without accumulating another bonus",
				score: 0.4,
				bonus: 0,
				custom: false,
				expected: 0.5,
				storedBonus: 0.1,
			},
			{
				label: "a later newsletter cannot reduce a direct contribution",
				score: 0.6,
				bonus: 0.05,
				custom: false,
				expected: 0.7,
				storedBonus: 0.1,
			},
			{
				label: "personal bonus clamps the final score to one",
				score: 0.98,
				bonus: 0.1,
				custom: true,
				expected: 1,
				storedBonus: 0.1,
			},
		]
		for (const fixture of cases) {
			const saved = await upsertFinding({
				scan,
				topicId: topic.topicId,
				resource,
				score: fixture.score,
				relevanceExplanation: "The linked page compares evaluation methods.",
				topicContextHash: "bonus-context",
				isFromCustomSource: fixture.custom,
				personalSourceScoreBonus: fixture.bonus,
			})
			const [finding] = await db.select().from(findings).where(eq(findings.topicId, topic.topicId))
			checkPersonalSources(
				fixture.label,
				Math.abs(saved.relevanceScore - fixture.expected) < 0.000001 &&
					finding?.personalSourceScoreBonus === fixture.storedBonus,
			)
			checkPersonalSources(
				"source bonus preserves the model's relevance explanation",
				finding?.relevanceExplanation === "The linked page compares evaluation methods.",
			)
		}

		// a new personal contribution cannot be lost to the unchanged-context optimization
		await db.update(findings).set({ personalSourceScoreBonus: 0 }).where(eq(findings.topicId, topic.topicId))
		const reviewOptions = {
			topicId: topic.topicId,
			discoveredResources: [resource],
			topicContextHash: "bonus-context",
			personalSourceScoreBonuses: new Map([[resource.url, 0.1 as const]]),
		}
		checkPersonalSources(
			"new personal provenance re-reviews an already scored custom link",
			(await loadResourcesToReview(reviewOptions)).length === 1,
		)
		await db.update(findings).set({ rating: "down" }).where(eq(findings.topicId, topic.topicId))
		checkPersonalSources(
			"personal provenance cannot bypass a thumbs-down rating",
			(await loadResourcesToReview(reviewOptions)).length === 0,
		)

		// another Topic's Finding starts without any private source ranking signal
		const [otherScan] = await db
			.insert(scans)
			.values({ topicId: otherTopic.topicId, ownerId: otherTopic.userId })
			.returning()
		if (!otherScan) {
			throw new Error("Missing independent Topic scan")
		}
		const otherFinding = await upsertFinding({
			scan: otherScan,
			topicId: otherTopic.topicId,
			resource,
			score: 0.6,
			relevanceExplanation: "An independent page review.",
			topicContextHash: "other",
			isFromCustomSource: false,
		})
		checkPersonalSources(
			"another Topic gets no personal-source bonus for the shared URL",
			Math.abs(otherFinding.relevanceScore - 0.6) < 0.000001,
		)
	} finally {
		// remove only this synthetic Resource and its dependent Findings
		await db.delete(resources).where(eq(resources.id, resource.id))
	}
}
